-- Additive, tenant-scoped search and passage provenance. Existing sources and
-- active revisions remain intact. Re-index legacy sources to obtain offsets.
begin;

update storage.buckets set allowed_mime_types=array['application/pdf','text/plain','text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/csv','text/tab-separated-values','application/json']
where id='support-documents';

alter table public.documents add column index_policy_version integer not null default 1;
alter table public.document_chunks
  add column chunk_index integer check(chunk_index between 0 and 499),
  add column start_offset integer check(start_offset>=0),
  add column end_offset integer,
  add column section text,
  add column search_tsv tsvector generated always as (
    to_tsvector('english'::regconfig,coalesce(metadata->>'title','')||' '||content)
    || to_tsvector('simple'::regconfig,coalesce(metadata->>'title','')||' '||content)
  ) stored,
  add constraint chunk_offsets_valid check(end_offset is null or (start_offset is not null and end_offset>start_offset));
create index document_chunks_fts_idx on public.document_chunks using gin(search_tsv);
create index document_chunks_order_idx on public.document_chunks(organization_id,document_id,index_revision,chunk_index);

create function private.is_workspace_owner() returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.organization_members
    where organization_id=(select private.current_organization_id())
      and user_id=(select auth.uid()) and role='owner');
$$;
revoke all on function private.is_workspace_owner() from public,anon,service_role;
grant execute on function private.is_workspace_owner() to authenticated;

-- Restrictive policies compose with existing tenant policies. Knowledge remains
-- readable by members; only owners can modify the corpus or index checkpoints.
do $$ declare tbl text; begin
  foreach tbl in array array['data_sources','documents','document_chunks','document_index_jobs','document_index_vectors'] loop
    execute format('create policy knowledge_owner_insert on public.%I as restrictive for insert to authenticated with check((select private.is_workspace_owner()))',tbl);
    execute format('create policy knowledge_owner_update on public.%I as restrictive for update to authenticated using((select private.is_workspace_owner())) with check((select private.is_workspace_owner()))',tbl);
    execute format('create policy knowledge_owner_delete on public.%I as restrictive for delete to authenticated using((select private.is_workspace_owner()))',tbl);
  end loop;
end $$;
create policy knowledge_file_owner_insert on storage.objects as restrictive for insert to authenticated
  with check(bucket_id<>'support-documents' or (select private.is_workspace_owner()));
create policy knowledge_file_owner_delete on storage.objects as restrictive for delete to authenticated
  using(bucket_id<>'support-documents' or (select private.is_workspace_owner()));
create policy knowledge_file_owner_update on storage.objects as restrictive for update to authenticated
  using(bucket_id<>'support-documents' or (select private.is_workspace_owner()))
  with check(bucket_id<>'support-documents' or (select private.is_workspace_owner()));

create or replace function public.checkpoint_document_index_batch(p_id uuid,p_lease uuid,p_offset integer,p_vectors jsonb) returns jsonb
language plpgsql security invoker set search_path=public,extensions as $$
declare org uuid := private.current_organization_id(); job public.document_index_jobs; doc public.documents;
  n integer; total integer; item jsonb; i integer; retired text;
begin
  select * into job from public.document_index_jobs where document_id=p_id and organization_id=org for update;
  select * into doc from public.documents where id=p_id and organization_id=org for update;
  if doc.id is null then raise exception 'Document not found'; end if;
  if job.document_id is null then return jsonb_build_object('document',to_jsonb(doc)); end if;
  if p_offset<job.completed then return jsonb_build_object('document',to_jsonb(doc)); end if;
  if p_lease is null or job.lease is distinct from p_lease or job.lease_until<=clock_timestamp()
    or doc.indexing_token is distinct from job.revision or p_offset<>job.completed
    then raise exception 'Indexing conflict'; end if;
  if jsonb_typeof(p_vectors) is distinct from 'array' then raise exception 'Invalid batch'; end if;
  n:=jsonb_array_length(p_vectors); total:=jsonb_array_length(job.manifest);
  if n not between 1 and 128 or p_offset+n>total then raise exception 'Invalid batch'; end if;
  for i in 0..n-1 loop
    item:=p_vectors->i;
    if jsonb_typeof(item) is distinct from 'array' or jsonb_array_length(item)<>1024 then raise exception 'Invalid vector dimension'; end if;
    if vector_norm(item::text::extensions.vector(1024))=0 then raise exception 'Invalid zero vector'; end if;
    insert into public.document_index_vectors(revision,organization_id,chunk_index,embedding)
      values(job.revision,org,p_offset+i,item::text::extensions.vector(1024));
  end loop;
  update public.document_index_jobs set completed=p_offset+n,attempts=0,lease=null,lease_until=null,next_attempt_at=now()
    where document_id=p_id and organization_id=org;
  if p_offset+n=total then
    if (select count(*) from public.document_index_vectors where revision=job.revision and organization_id=org)<>total then raise exception 'Incomplete index'; end if;
    retired:=case when doc.file_path<>job.file_path then doc.file_path end;
    delete from public.document_chunks where document_id=p_id and organization_id=org;
    insert into public.document_chunks(organization_id,content,embedding,metadata,index_revision,chunk_index,start_offset,end_offset,section)
      select org,job.manifest->v.chunk_index->>'content',v.embedding,
        jsonb_build_object('documentId',p_id,'organizationId',org,'title',job.name,'source',job.name),job.revision,
        v.chunk_index,(job.manifest->v.chunk_index->>'start_offset')::integer,
        (job.manifest->v.chunk_index->>'end_offset')::integer,left(job.manifest->v.chunk_index->>'section',160)
      from public.document_index_vectors v where v.revision=job.revision and v.organization_id=org order by v.chunk_index;
    update public.documents set active_revision=job.revision,indexing_token=null,status='ready',chunk_count=total,
      file_path=job.file_path,name=job.name,mime_type=job.mime_type,size_bytes=job.size_bytes,content_hash=job.content_hash,
      index_policy_version=case when job.manifest->0 ? 'start_offset' then 2 else 1 end,
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

create function public.search_knowledge(p_query_text text,p_query_embedding extensions.vector(1024) default null,p_match_count integer default 24)
returns table(id uuid,document_id uuid,organization_id uuid,index_revision uuid,title text,content text,
  chunk_index integer,start_offset integer,end_offset integer,section text,similarity double precision,lexical_score real,score double precision)
language sql stable security invoker set search_path=public,extensions as $$
  with parameters as (
    select (replace(plainto_tsquery('english',left(p_query_text,6000))::text,' & ',' | ')::tsquery
      || replace(plainto_tsquery('simple',left(p_query_text,6000))::text,' & ',' | ')::tsquery) as q
  ), authorized as materialized (
    -- Exact vector ranking over an explicitly materialized tenant subset. A
    -- global ANN index never decides which tenants enter this candidate set.
    select c.*,d.name as document_title from public.document_chunks c join public.documents d
      on d.id=c.document_id and d.organization_id=c.organization_id
    where c.organization_id=(select private.current_organization_id())
      and d.organization_id=(select private.current_organization_id())
      and d.status in ('ready','processing') and d.chunk_count>0
      and c.index_revision=d.active_revision
  ), semantic_limited as (
    select a.id,1-(a.embedding <=> p_query_embedding) as similarity,
      a.embedding <=> p_query_embedding as distance,a.document_id,a.chunk_index
    from authorized a where p_query_embedding is not null
    order by a.embedding <=> p_query_embedding,a.document_id,a.chunk_index nulls last,a.id limit least(greatest(p_match_count,1),48)
  ), semantic_candidates as (
    select s.id,s.similarity,row_number() over(order by s.distance,s.document_id,s.chunk_index nulls last,s.id) as rank from semantic_limited s
  ), lexical_limited as (
    -- Query the indexed table directly so the GIN index remains usable. Both
    -- membership and active-revision checks precede lexical ranking as well.
    select c.id,ts_rank_cd(c.search_tsv,p.q) as lexical_score,c.document_id,c.chunk_index
    from public.document_chunks c join public.documents d
      on d.id=c.document_id and d.organization_id=c.organization_id cross join parameters p
    where c.organization_id=(select private.current_organization_id())
      and d.organization_id=(select private.current_organization_id())
      and d.status in ('ready','processing') and d.chunk_count>0
      and c.index_revision=d.active_revision and c.search_tsv @@ p.q
    order by lexical_score desc,c.document_id,c.chunk_index nulls last,c.id limit least(greatest(p_match_count,1),48)
  ), lexical_candidates as (
    select l.id,l.lexical_score,row_number() over(order by l.lexical_score desc,l.document_id,l.chunk_index nulls last,l.id) as rank from lexical_limited l
  ), fused as materialized (
    select coalesce(s.id,l.id) as id,s.similarity,coalesce(l.lexical_score,0) as lexical_score,
      coalesce(1.0/(60+s.rank),0)+coalesce(1.0/(60+l.rank),0) as score
    from semantic_candidates s full outer join lexical_candidates l on l.id=s.id
  ) select a.id,a.document_id,a.organization_id,a.index_revision,a.document_title,a.content,
      a.chunk_index,a.start_offset,a.end_offset,a.section,f.similarity,f.lexical_score,f.score
    from fused f join authorized a on a.id=f.id
    order by f.score desc,a.document_id,a.chunk_index nulls last,a.id limit least(greatest(p_match_count,1),48);
$$;

create function public.knowledge_passage_context(p_passage_ids uuid[])
returns table(id uuid,document_id uuid,organization_id uuid,index_revision uuid,title text,content text,
  chunk_index integer,start_offset integer,end_offset integer,section text,similarity double precision,lexical_score real,score double precision)
language sql stable security invoker set search_path=public,extensions as $$
  with anchors as (
    select c.document_id,c.index_revision,c.chunk_index from public.document_chunks c join public.documents d
      on d.id=c.document_id and d.organization_id=c.organization_id
    where c.id=any(p_passage_ids[1:8]) and c.organization_id=(select private.current_organization_id())
      and d.organization_id=(select private.current_organization_id())
      and c.index_revision=d.active_revision and d.status in ('ready','processing') and d.chunk_count>0
  ) select distinct c.id,c.document_id,c.organization_id,c.index_revision,d.name,c.content,
      c.chunk_index,c.start_offset,c.end_offset,c.section,null::double precision,0::real,0::double precision
    from public.document_chunks c join public.documents d
      on d.id=c.document_id and d.organization_id=c.organization_id
    join anchors a on a.document_id=c.document_id and a.index_revision=c.index_revision
      and abs(c.chunk_index-a.chunk_index)<=1
    where c.organization_id=(select private.current_organization_id())
      and d.organization_id=(select private.current_organization_id())
      and c.index_revision=d.active_revision and d.status in ('ready','processing') and d.chunk_count>0
    order by document_id,chunk_index,id limit 24;
$$;

create function public.knowledge_overview(p_document_ids uuid[] default null,p_count integer default 12)
returns table(id uuid,document_id uuid,organization_id uuid,index_revision uuid,title text,content text,
  chunk_index integer,start_offset integer,end_offset integer,section text,similarity double precision,lexical_score real,score double precision)
language sql stable security invoker set search_path=public,extensions as $$
  with documents_in_scope as (
    select d.id,d.organization_id,d.active_revision,d.name from public.documents d
    where d.organization_id=(select private.current_organization_id()) and d.status in ('ready','processing')
      and d.chunk_count>0 and (p_document_ids is null or d.id=any(p_document_ids[1:8]))
    order by d.name,d.id limit 8
  ), numbered as (
    select c.*,d.name as document_title,row_number() over(partition by c.document_id order by c.chunk_index nulls last,c.id) as pos,
      count(*) over(partition by c.document_id) as total
    from public.document_chunks c join documents_in_scope d on d.id=c.document_id and d.organization_id=c.organization_id
    where c.organization_id=(select private.current_organization_id()) and c.index_revision=d.active_revision
  ), sampled as (
    -- Stratified source coverage, never the highest-scoring paragraph repeated.
    select n.*,row_number() over(partition by n.document_id order by n.pos) as sample_round
    from numbered n where n.total<=4 or n.pos in (1,ceil(n.total/3.0)::bigint,ceil(n.total*2/3.0)::bigint,n.total)
  ) select s.id,s.document_id,s.organization_id,s.index_revision,s.document_title,s.content,
      s.chunk_index,s.start_offset,s.end_offset,s.section,null::double precision,0::real,0::double precision
    from sampled s order by s.sample_round,s.document_title,s.pos limit least(greatest(p_count,1),24);
$$;

revoke all on function public.search_knowledge(text,extensions.vector,integer),public.knowledge_passage_context(uuid[]),public.knowledge_overview(uuid[],integer) from public,anon,service_role;
grant execute on function public.search_knowledge(text,extensions.vector,integer),public.knowledge_passage_context(uuid[]),public.knowledge_overview(uuid[],integer) to authenticated;

-- Audit contains identifiers/action/timestamps only, never document content.
create table private.knowledge_audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  actor_id uuid,
  document_id uuid not null,
  revision uuid,
  action text not null check(action in ('created','published','deleted')),
  created_at timestamptz not null default now()
);
create index knowledge_audit_events_org_time on private.knowledge_audit_events(organization_id,created_at);
alter table private.knowledge_audit_events enable row level security;
revoke all on private.knowledge_audit_events from public,anon,authenticated,service_role;
create function private.audit_knowledge_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if TG_OP='DELETE' then
    insert into private.knowledge_audit_events(organization_id,actor_id,document_id,revision,action)
      values(OLD.organization_id,auth.uid(),OLD.id,OLD.active_revision,'deleted');
    return OLD;
  elsif TG_OP='INSERT' then
    insert into private.knowledge_audit_events(organization_id,actor_id,document_id,revision,action)
      values(NEW.organization_id,auth.uid(),NEW.id,NEW.active_revision,'created');
  elsif NEW.active_revision is distinct from OLD.active_revision then
    insert into private.knowledge_audit_events(organization_id,actor_id,document_id,revision,action)
      values(NEW.organization_id,auth.uid(),NEW.id,NEW.active_revision,'published');
  end if;
  return NEW;
end $$;
revoke all on function private.audit_knowledge_change() from public,anon,authenticated,service_role;
create trigger audit_knowledge_change after insert or update or delete on public.documents
  for each row execute function private.audit_knowledge_change();

commit;
