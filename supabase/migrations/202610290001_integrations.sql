-- Connector metadata is tenant scoped; credentials and work queues are server-only.
begin;
create table public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null,
  provider text not null check(provider ~ '^[a-z][a-z0-9_-]{0,79}$'),
  name text not null check(char_length(name) between 1 and 160),
  config jsonb not null default '{}',
  visibility text not null default 'private' check(visibility in ('private','workspace')),
  status text not null default 'connected' check(status in ('connected','error','reauth','disconnected')),
  sync_interval_minutes integer not null default 60 check(sync_interval_minutes between 15 and 1440),
  next_sync_at timestamptz not null default now(),
  last_sync_at timestamptz,
  last_error text,
  generation uuid,
  lease uuid,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  unique(id,organization_id),
  foreign key(organization_id,created_by) references public.organization_members(organization_id,user_id) on delete cascade
);
create index integration_sync_due on public.integration_connections(next_sync_at) where status in ('connected','error');
create table public.integration_credentials (
  connection_id uuid primary key references public.integration_connections(id) on delete cascade,
  ciphertext text not null,
  updated_at timestamptz not null default now()
);
create table public.integration_oauth_states (
  state_hash text primary key,
  organization_id uuid not null,
  user_id uuid not null,
  ciphertext text not null,
  expires_at timestamptz not null,
  foreign key(organization_id,user_id) references public.organization_members(organization_id,user_id) on delete cascade
);
create table public.integration_selections (
  connection_id uuid not null,
  organization_id uuid not null,
  external_id text not null check(char_length(external_id) between 1 and 2048),
  name text not null,
  kind text not null check(kind in ('container','document')),
  primary key(connection_id,external_id),
  foreign key(connection_id,organization_id) references public.integration_connections(id,organization_id) on delete cascade
);
create table public.integration_items (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null,
  organization_id uuid not null,
  external_id text not null,
  name text not null,
  source_url text,
  remote_version text,
  content_hash text,
  document_id uuid,
  seen_generation uuid,
  access_until timestamptz not null default now(),
  last_error text,
  updated_at timestamptz not null default now(),
  unique(connection_id,external_id),
  unique(document_id),
  foreign key(connection_id,organization_id) references public.integration_connections(id,organization_id) on delete cascade,
  foreign key(document_id,organization_id) references public.documents(id,organization_id) on delete set null (document_id)
);
create table public.integration_tasks (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null,
  organization_id uuid not null,
  generation uuid not null,
  task_key text not null,
  payload jsonb not null,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  done boolean not null default false,
  created_at timestamptz not null default now(),
  unique(connection_id,generation,task_key),
  foreign key(connection_id,organization_id) references public.integration_connections(id,organization_id) on delete cascade
);
create index integration_tasks_pending on public.integration_tasks(connection_id,next_attempt_at,created_at) where not done;
-- Deletion cleanup survives an interrupted request and never contains file bytes.
create table public.integration_file_gc (
  path text primary key,
  created_at timestamptz not null default now()
);

alter table public.documents add column integration_connection_id uuid;
alter table public.documents add foreign key(integration_connection_id,organization_id)
  references public.integration_connections(id,organization_id) on delete cascade;
alter table public.data_sources add column integration_connection_id uuid;
alter table public.data_sources add foreign key(integration_connection_id,organization_id)
  references public.integration_connections(id,organization_id) on delete cascade;

do $$ declare tbl text; begin
  foreach tbl in array array['integration_connections','integration_credentials','integration_oauth_states',
    'integration_selections','integration_items','integration_tasks','integration_file_gc'] loop
    execute format('alter table public.%I enable row level security',tbl);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',tbl);
    execute format('grant select,insert,update,delete on public.%I to service_role',tbl);
  end loop;
end $$;
grant select on public.integration_connections,public.integration_selections,public.integration_items to authenticated;
create policy integration_owner_read on public.integration_connections for select to authenticated
  using(organization_id=(select private.current_organization_id()) and created_by=(select auth.uid()));
create policy integration_selection_read on public.integration_selections for select to authenticated
  using(organization_id=(select private.current_organization_id()) and exists(select 1 from public.integration_connections c where c.id=connection_id));
create policy integration_item_read on public.integration_items for select to authenticated
  using(organization_id=(select private.current_organization_id()) and exists(select 1 from public.integration_connections c where c.id=connection_id));

create function private.can_read_integration(p_connection uuid,p_document uuid default null) returns boolean
language sql stable security definer set search_path='' as $$
  select p_connection is null or exists(
    select 1 from public.integration_connections c
    where c.id=p_connection and c.organization_id=(select private.current_organization_id())
      and c.status in ('connected','error')
      and (c.created_by=(select auth.uid()) or c.visibility='workspace')
      and (p_document is null or exists(select 1 from public.integration_items i
        where i.connection_id=c.id and i.document_id=p_document and i.access_until>now()))
  );
$$;
revoke all on function private.can_read_integration(uuid,uuid) from public,anon,service_role;
grant execute on function private.can_read_integration(uuid,uuid) to authenticated;
create policy integration_document_read on public.documents as restrictive for select to authenticated
  using(private.can_read_integration(integration_connection_id,id));
create policy integration_source_read on public.data_sources as restrictive for select to authenticated
  using(private.can_read_integration(integration_connection_id));
create policy integration_chunk_read on public.document_chunks as restrictive for select to authenticated
  using(exists(select 1 from public.documents d where d.id=document_id and d.organization_id=document_chunks.organization_id));
create policy integration_job_read on public.document_index_jobs as restrictive for select to authenticated
  using(exists(select 1 from public.documents d where d.id=document_id and d.organization_id=document_index_jobs.organization_id));
create policy integration_vector_read on public.document_index_vectors as restrictive for select to authenticated
  using(exists(select 1 from public.document_index_jobs j where j.revision=document_index_vectors.revision));
-- Browser JWTs cannot manufacture connector provenance or edit connector copies.
do $$ declare tbl text; begin
  foreach tbl in array array['documents','data_sources'] loop
    execute format('create policy integration_write_insert on public.%I as restrictive for insert to authenticated with check(integration_connection_id is null)',tbl);
    execute format('create policy integration_write_update on public.%I as restrictive for update to authenticated using(integration_connection_id is null) with check(integration_connection_id is null)',tbl);
    execute format('create policy integration_write_delete on public.%I as restrictive for delete to authenticated using(integration_connection_id is null)',tbl);
  end loop;
end $$;
do $$ declare tbl text; begin
  foreach tbl in array array['document_chunks','document_index_jobs'] loop
    execute format('create policy integration_index_insert on public.%I as restrictive for insert to authenticated with check(exists(select 1 from public.documents d where d.id=document_id and d.integration_connection_id is null))',tbl);
    execute format('create policy integration_index_update on public.%I as restrictive for update to authenticated using(exists(select 1 from public.documents d where d.id=document_id and d.integration_connection_id is null)) with check(exists(select 1 from public.documents d where d.id=document_id and d.integration_connection_id is null))',tbl);
    execute format('create policy integration_index_delete on public.%I as restrictive for delete to authenticated using(exists(select 1 from public.documents d where d.id=document_id and d.integration_connection_id is null))',tbl);
  end loop;
end $$;
-- Restrict files independently of API routes, including known/guessed paths.
create function private.can_read_integration_file(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select not exists(select 1 from public.integration_file_gc where path=p_path) and not exists(select 1 from public.documents d where d.id::text=split_part(p_path,'/',4)
    and d.integration_connection_id is not null
    and not private.can_read_integration(d.integration_connection_id,d.id));
$$;
revoke all on function private.can_read_integration_file(text) from public,anon,service_role;
grant execute on function private.can_read_integration_file(text) to authenticated;
create policy integration_file_read on storage.objects as restrictive for select to authenticated
  using(bucket_id<>'support-documents' or private.can_read_integration_file(name));

create function private.queue_integration_file_cleanup() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if OLD.integration_connection_id is not null then
    insert into public.integration_file_gc(path) values(OLD.file_path) on conflict do nothing;
    insert into public.integration_file_gc(path) select file_path from public.document_index_jobs
      where document_id=OLD.id and organization_id=OLD.organization_id on conflict do nothing;
  end if;
  return OLD;
end $$;
revoke all on function private.queue_integration_file_cleanup() from public,anon,authenticated,service_role;
create trigger integration_file_cleanup before delete on public.documents for each row execute function private.queue_integration_file_cleanup();
commit;
