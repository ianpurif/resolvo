-- Durable, tenant-scoped indexing checkpoints and a server-only Voyage budget.
-- Apply after 202610050002_tenant_workspaces.sql. Existing sources are preserved.
begin;

alter table public.documents
  add column index_total integer not null default 0,
  add column index_completed integer not null default 0,
  add column index_next_attempt_at timestamptz;

create table public.document_index_jobs (
  document_id uuid primary key,
  organization_id uuid not null,
  revision uuid not null unique,
  model text not null check(model='voyage-4-lite'),
  manifest jsonb not null check(jsonb_array_length(manifest) between 1 and 500),
  file_path text not null,
  name text not null check(char_length(name) between 1 and 160),
  mime_type text not null,
  size_bytes integer not null check(size_bytes between 1 and 4194304),
  content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'),
  locator text,
  completed integer not null default 0 check(completed>=0),
  attempts integer not null default 0 check(attempts between 0 and 6),
  status text not null default 'processing' check(status in ('processing','failed')),
  next_attempt_at timestamptz not null default now(),
  lease uuid,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  foreign key(document_id,organization_id) references public.documents(id,organization_id) on delete cascade,
  unique(revision,organization_id)
);
create table public.document_index_vectors (
  revision uuid not null,
  organization_id uuid not null,
  chunk_index integer not null check(chunk_index between 0 and 499),
  embedding extensions.vector(1024) not null,
  primary key(revision,chunk_index),
  foreign key(revision,organization_id) references public.document_index_jobs(revision,organization_id) on delete cascade
);

do $$ declare tbl text; begin
  foreach tbl in array array['document_index_jobs','document_index_vectors'] loop
    execute format('alter table public.%I enable row level security',tbl);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',tbl);
    execute format('grant select,insert,update,delete on public.%I to authenticated',tbl);
    execute format('grant select on public.%I to service_role',tbl);
    execute format('create policy tenant_boundary on public.%I for all to authenticated using(organization_id=(select private.current_organization_id())) with check(organization_id=(select private.current_organization_id()))',tbl);
  end loop;
end $$;

create function public.start_document_index_job(
  p_id uuid,p_revision uuid,p_name text,p_kind text,p_locator text,p_file_path text,
  p_mime text,p_size integer,p_replace boolean,p_hash text,p_manifest jsonb
) returns jsonb language plpgsql security invoker set search_path=public,extensions as $$
declare org uuid := private.current_organization_id(); doc public.documents; item jsonb; existing public.document_index_jobs;
begin
  if org is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,1));
  select * into existing from public.document_index_jobs where document_id=p_id and organization_id=org;
  if found then
    if existing.revision=p_revision and existing.content_hash=p_hash then
      select * into doc from public.documents where id=p_id and organization_id=org;
      return to_jsonb(doc);
    end if;
    raise exception 'Indexing in progress: resume the saved revision';
  end if;
  if jsonb_typeof(p_manifest)<>'array' or jsonb_array_length(p_manifest) not between 1 and 500 then raise exception 'Invalid chunks'; end if;
  for item in select * from jsonb_array_elements(p_manifest) loop
    if coalesce(char_length(item->>'content'),0) not between 1 and 1200
      or coalesce((item->>'token_count')::integer,0) not between 1 and 8000 then raise exception 'Invalid chunk'; end if;
  end loop;
  perform pg_advisory_xact_lock(hashtextextended(org::text,0));
  if (select count(*) from public.document_index_jobs where organization_id=org and status='processing')>=2 then
    raise exception 'Indexing capacity reached';
  end if;
  perform public.begin_document_index(p_id,p_revision,p_name,p_kind,p_locator,p_file_path,p_mime,p_size,p_replace);
  insert into public.document_index_jobs(document_id,organization_id,revision,model,manifest,file_path,name,mime_type,size_bytes,content_hash,locator)
    values(p_id,org,p_revision,'voyage-4-lite',p_manifest,p_file_path,p_name,p_mime,p_size,p_hash,p_locator);
  update public.documents set index_total=jsonb_array_length(p_manifest),index_completed=0,index_next_attempt_at=now(),
    indexing_token=p_revision,status='processing',error_message=null,updated_at=now()
    where id=p_id and organization_id=org returning * into doc;
  return to_jsonb(doc);
end $$;

create function public.claim_document_index_batch(p_id uuid,p_lease uuid) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare org uuid := private.current_organization_id(); job public.document_index_jobs; doc public.documents;
begin
  select * into job from public.document_index_jobs where document_id=p_id and organization_id=org for update;
  select * into doc from public.documents where id=p_id and organization_id=org;
  if doc.id is null then raise exception 'Document not found'; end if;
  if job.document_id is null then return jsonb_build_object('claimed',false,'document',to_jsonb(doc)); end if;
  if doc.indexing_token is distinct from job.revision then raise exception 'Indexing conflict'; end if;
  if job.status='failed' or job.next_attempt_at>now() or job.lease_until>now() then
    return jsonb_build_object('claimed',false,'document',to_jsonb(doc));
  end if;
  update public.document_index_jobs set lease=p_lease,lease_until=now()+interval '60 seconds'
    where document_id=p_id and organization_id=org returning * into job;
  update public.documents set updated_at=now(),index_next_attempt_at=job.lease_until
    where id=p_id and organization_id=org returning * into doc;
  return jsonb_build_object('claimed',true,'job',to_jsonb(job),'document',to_jsonb(doc));
end $$;

create function public.checkpoint_document_index_batch(p_id uuid,p_lease uuid,p_offset integer,p_vectors jsonb) returns jsonb
language plpgsql security invoker set search_path=public,extensions as $$
declare org uuid := private.current_organization_id(); job public.document_index_jobs; doc public.documents;
  n integer; total integer; item jsonb; i integer; retired text;
begin
  select * into job from public.document_index_jobs where document_id=p_id and organization_id=org for update;
  select * into doc from public.documents where id=p_id and organization_id=org for update;
  if doc.id is null then raise exception 'Document not found'; end if;
  -- A replay after a committed batch (including the final batch) is harmless.
  if job.document_id is null then return jsonb_build_object('document',to_jsonb(doc)); end if;
  if p_offset<job.completed then return jsonb_build_object('document',to_jsonb(doc)); end if;
  if job.lease is distinct from p_lease or doc.indexing_token is distinct from job.revision
    or p_offset<>job.completed then raise exception 'Indexing conflict'; end if;
  n:=jsonb_array_length(p_vectors); total:=jsonb_array_length(job.manifest);
  if n not between 1 and 128 or p_offset+n>total then raise exception 'Invalid batch'; end if;
  for i in 0..n-1 loop
    item:=p_vectors->i;
    if jsonb_array_length(item)<>1024 then raise exception 'Invalid vector dimension'; end if;
    insert into public.document_index_vectors(revision,organization_id,chunk_index,embedding)
      values(job.revision,org,p_offset+i,item::text::extensions.vector(1024));
  end loop;
  update public.document_index_jobs set completed=p_offset+n,attempts=0,lease=null,lease_until=null,next_attempt_at=now()
    where document_id=p_id and organization_id=org;
  if p_offset+n=total then
    if (select count(*) from public.document_index_vectors where revision=job.revision and organization_id=org)<>total then raise exception 'Incomplete index'; end if;
    retired:=case when doc.file_path<>job.file_path then doc.file_path end;
    delete from public.document_chunks where document_id=p_id and organization_id=org;
    insert into public.document_chunks(organization_id,content,embedding,metadata,index_revision)
      select org,job.manifest->v.chunk_index->>'content',v.embedding,
        jsonb_build_object('documentId',p_id,'organizationId',org,'title',job.name,'source',job.name),job.revision
      from public.document_index_vectors v where v.revision=job.revision and v.organization_id=org order by v.chunk_index;
    update public.documents set active_revision=job.revision,indexing_token=null,status='ready',chunk_count=total,
      file_path=job.file_path,name=job.name,mime_type=job.mime_type,size_bytes=job.size_bytes,content_hash=job.content_hash,
      index_completed=total,index_total=total,index_next_attempt_at=null,error_message=null,updated_at=now()
      where id=p_id and organization_id=org returning * into doc;
    update public.data_sources set name=job.name,locator=job.locator,last_indexed_at=now(),last_error=null
      where id=doc.data_source_id and organization_id=org;
    delete from public.document_index_jobs where document_id=p_id and organization_id=org;
  else
    update public.documents set index_completed=p_offset+n,index_next_attempt_at=now(),error_message=null,updated_at=now()
      where id=p_id and organization_id=org returning * into doc;
  end if;
  return jsonb_build_object('document',to_jsonb(doc),'retired_file',retired);
end $$;

create function public.defer_document_index_batch(p_id uuid,p_lease uuid,p_delay_ms integer,p_message text,p_failure boolean,p_terminal boolean)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare org uuid := private.current_organization_id(); job public.document_index_jobs; doc public.documents; failed boolean;
begin
  select * into job from public.document_index_jobs where document_id=p_id and organization_id=org for update;
  if job.lease is distinct from p_lease then raise exception 'Indexing conflict'; end if;
  failed:=p_terminal or (p_failure and job.attempts>=5);
  update public.document_index_jobs set attempts=least(6,attempts+case when p_failure then 1 else 0 end),
    status=case when failed then 'failed' else 'processing' end,
    lease=null,lease_until=null,next_attempt_at=now()+greatest(p_delay_ms,1000)*interval '1 millisecond'
    where document_id=p_id and organization_id=org;
  update public.documents set status=case when failed then case when chunk_count>0 then 'ready' else 'failed' end else 'processing' end,
    error_message=case when failed then left(p_message,240) else null end,
    index_next_attempt_at=case when failed then null else now()+greatest(p_delay_ms,1000)*interval '1 millisecond' end,updated_at=now()
    where id=p_id and organization_id=org and indexing_token=job.revision returning * into doc;
  update public.data_sources set last_error=case when failed then left(p_message,240) else null end
    where id=doc.data_source_id and organization_id=org;
  return to_jsonb(doc);
end $$;

create function public.resume_document_index_job(p_id uuid) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare org uuid := private.current_organization_id(); job public.document_index_jobs; doc public.documents;
begin
  select * into job from public.document_index_jobs where document_id=p_id and organization_id=org for update;
  if job.status='failed' then
    update public.document_index_jobs set status='processing',attempts=0,next_attempt_at=now(),lease=null,lease_until=null
      where document_id=p_id and organization_id=org;
    update public.documents set status='processing',error_message=null,index_next_attempt_at=now(),updated_at=now()
      where id=p_id and organization_id=org;
  end if;
  select * into doc from public.documents where id=p_id and organization_id=org;
  if doc.id is null then raise exception 'Document not found'; end if;
  return to_jsonb(doc);
end $$;

revoke all on function public.start_document_index_job(uuid,uuid,text,text,text,text,text,integer,boolean,text,jsonb),
  public.claim_document_index_batch(uuid,uuid),public.checkpoint_document_index_batch(uuid,uuid,integer,jsonb),
  public.defer_document_index_batch(uuid,uuid,integer,text,boolean,boolean),public.resume_document_index_job(uuid)
  from public,anon,service_role;
grant execute on function public.start_document_index_job(uuid,uuid,text,text,text,text,text,integer,boolean,text,jsonb),
  public.claim_document_index_batch(uuid,uuid),public.checkpoint_document_index_batch(uuid,uuid,integer,jsonb),
  public.defer_document_index_batch(uuid,uuid,integer,text,boolean,boolean),public.resume_document_index_job(uuid) to authenticated;

-- All application instances and document/query embeddings share one sliding
-- window. Only the server service key may reserve or reconcile this budget.
create table private.voyage_rate_state (
  scope text primary key,
  next_request_at timestamptz not null default now(),
  cooldown_until timestamptz not null default now()
);
create table private.voyage_requests (
  id uuid primary key default gen_random_uuid(),
  scope text not null references private.voyage_rate_state(scope),
  tokens integer not null,
  created_at timestamptz not null default now()
);
create index voyage_requests_window on private.voyage_requests(scope,created_at);
revoke all on private.voyage_rate_state,private.voyage_requests from public,anon,authenticated,service_role;

create function public.reserve_voyage_request(p_tokens integer,p_rpm integer,p_tpm integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare state private.voyage_rate_state; reservation uuid; oldest timestamptz; requests integer; tokens bigint; available timestamptz;
begin
  if p_tokens<1 or p_tokens>p_tpm or p_rpm<1 or p_tpm<1 then raise exception 'Invalid provider budget'; end if;
  insert into private.voyage_rate_state(scope) values('voyage-4-lite') on conflict do nothing;
  select * into state from private.voyage_rate_state where scope='voyage-4-lite' for update;
  delete from private.voyage_requests where created_at<=clock_timestamp()-interval '61 seconds';
  select count(*),coalesce(sum(r.tokens),0),min(created_at) into requests,tokens,oldest
    from private.voyage_requests r where scope='voyage-4-lite';
  available:=greatest(state.next_request_at,state.cooldown_until,clock_timestamp());
  if requests>=p_rpm or tokens+p_tokens>p_tpm then available:=greatest(available,oldest+interval '61 seconds'); end if;
  if available>clock_timestamp() then
    return jsonb_build_object('granted',false,'wait_ms',greatest(1000,ceil(extract(epoch from available-clock_timestamp())*1000)));
  end if;
  insert into private.voyage_requests(scope,tokens) values('voyage-4-lite',p_tokens) returning id into reservation;
  update private.voyage_rate_state set next_request_at=clock_timestamp()+(61000.0/p_rpm)*interval '1 millisecond' where scope='voyage-4-lite';
  return jsonb_build_object('granted',true,'reservation',reservation);
end $$;

create function public.settle_voyage_request(p_id uuid,p_tokens integer,p_cooldown_ms integer) returns void
language plpgsql security definer set search_path='' as $$
begin
  -- Take locks in the same order as reserve, including when a slow request's
  -- reservation has already expired from the rolling window.
  perform 1 from private.voyage_rate_state where scope='voyage-4-lite' for update;
  if p_tokens is not null and p_tokens>=0 then update private.voyage_requests set tokens=p_tokens where id=p_id; end if;
  if p_cooldown_ms>0 then
    update private.voyage_rate_state set cooldown_until=greatest(cooldown_until,clock_timestamp()+p_cooldown_ms*interval '1 millisecond') where scope='voyage-4-lite';
  end if;
end $$;
revoke all on function public.reserve_voyage_request(integer,integer,integer),public.settle_voyage_request(uuid,integer,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.reserve_voyage_request(integer,integer,integer),public.settle_voyage_request(uuid,integer,integer) to service_role;

commit;
