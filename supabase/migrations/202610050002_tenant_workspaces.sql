-- Apply after the two existing migrations. Existing unowned records are archived,
-- never assigned to a new customer. No production data is deleted.
begin;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  industry text not null default 'Other' check (char_length(industry) between 2 and 80),
  created_by uuid references auth.users(id),
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  primary key (organization_id,user_id)
);
create index organization_members_user_idx on public.organization_members(user_id,organization_id);
create function private.current_organization_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select m.organization_id from public.organization_members m
  join public.organizations o on o.id=m.organization_id
  where m.user_id=(select auth.uid()) and not o.is_archived
    and (select auth.jwt()->'app_metadata'->>'provider')='google';
$$;
revoke all on function private.current_organization_id() from public, anon;
grant execute on function private.current_organization_id() to authenticated, service_role;

-- Resolve ownership for all historical rows without making them available to any login.
do $$
declare archived uuid; tbl text;
begin
  if exists(select 1 from public.documents) or exists(select 1 from public.conversations)
     or exists(select 1 from public.tickets) then
    insert into public.organizations(name,industry,is_archived)
      values('Archived unowned records','Other',true) returning id into archived;
  end if;
  foreach tbl in array array['documents','document_chunks','conversations','messages','tickets','chat_requests'] loop
    execute format('alter table public.%I add column organization_id uuid references public.organizations(id)',tbl);
    execute format('update public.%I set organization_id=$1',tbl) using archived;
    execute format('alter table public.%I alter column organization_id set not null',tbl);
    execute format('alter table public.%I add unique(id,organization_id)',tbl);
    execute format('create index %I on public.%I(organization_id,created_at desc)',tbl||'_tenant_created_idx',tbl);
  end loop;
end $$;

create table public.data_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  kind text not null check (kind in ('file','website','manual')),
  locator text,
  last_indexed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique(id,organization_id)
);
create index data_sources_tenant_idx on public.data_sources(organization_id,created_at desc);
insert into public.data_sources(id,organization_id,name,kind,last_indexed_at)
select id,organization_id,name,'file',case when status='ready' then created_at end from public.documents;

alter table public.documents
  add column data_source_id uuid,
  add column active_revision uuid not null default gen_random_uuid(),
  add column indexing_token uuid,
  add column content_hash text,
  add column updated_at timestamptz not null default now();
update public.documents set data_source_id=id;
alter table public.documents alter column data_source_id set not null;
alter table public.documents add foreign key(data_source_id,organization_id)
  references public.data_sources(id,organization_id) on delete cascade;
alter table public.documents add constraint tenant_file_path check (
  file_path ~ ('^organizations/'||organization_id::text||'/documents/[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$')
) not valid;
alter table public.document_chunks add column index_revision uuid;
update public.document_chunks c set index_revision=d.active_revision from public.documents d where c.document_id=d.id;
alter table public.document_chunks alter column index_revision set not null;
alter table public.document_chunks add foreign key(document_id,organization_id)
  references public.documents(id,organization_id) on delete cascade;
create index document_chunks_tenant_document_idx on public.document_chunks(organization_id,document_id,index_revision);

alter table public.conversations add column created_by uuid references auth.users(id);
alter table public.messages add foreign key(conversation_id,organization_id)
  references public.conversations(id,organization_id) on delete cascade;
alter table public.messages add foreign key(request_id,organization_id)
  references public.chat_requests(id,organization_id) on delete cascade;
alter table public.chat_requests add foreign key(conversation_id,organization_id)
  references public.conversations(id,organization_id) on delete cascade;
-- Preserve legacy ticket/order associations before removing the industry-specific column.
create table private.legacy_ticket_links as
  select id as ticket_id,organization_id,order_number from public.tickets where order_number is not null;
alter table private.legacy_ticket_links enable row level security;
revoke all on private.legacy_ticket_links from anon,authenticated,service_role;
alter table public.tickets drop column order_number;
alter table public.tickets drop constraint tickets_idempotency_key_key;
alter table public.tickets add unique(organization_id,idempotency_key);
alter table public.tickets add column created_by uuid references auth.users(id);
alter table public.tickets alter column ticket_number set default ('TKT-'||nextval('public.ticket_numbers'));
-- Preserve historical order records outside the exposed API schema.
alter table public.orders set schema private;
revoke all on private.orders from authenticated, anon, service_role;

create table public.query_embeddings (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  query_hash text not null check (char_length(query_hash)=64),
  model text not null check (model='voyage-4-lite'),
  embedding extensions.vector(1024) not null,
  created_at timestamptz not null default now(),
  primary key(organization_id,query_hash,model)
);
create index query_embeddings_expiry_idx on public.query_embeddings(organization_id,created_at);

create function public.cache_query_embedding(p_hash text,p_embedding extensions.vector(1024)) returns void
language plpgsql security invoker set search_path=public,extensions as $$
declare org uuid:=private.current_organization_id();
begin
 if org is null then raise exception 'Authentication required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text,2));
 insert into public.query_embeddings(organization_id,query_hash,model,embedding)
 values(org,p_hash,'voyage-4-lite',p_embedding)
 on conflict(organization_id,query_hash,model) do update set embedding=excluded.embedding,created_at=now();
 delete from public.query_embeddings where organization_id=org and query_hash in (
  select query_hash from public.query_embeddings where organization_id=org order by created_at desc offset 512
 );
 delete from public.query_embeddings where organization_id=org and created_at<now()-interval '7 days';
end $$;
revoke all on function public.cache_query_embedding(text,extensions.vector) from public,anon,service_role;
grant execute on function public.cache_query_embedding(text,extensions.vector) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.data_sources enable row level security;
alter table public.query_embeddings enable row level security;
create policy organization_read on public.organizations for select to authenticated
  using(id=(select private.current_organization_id()));
create policy membership_read on public.organization_members for select to authenticated
  using(organization_id=(select private.current_organization_id()));
revoke all on public.organizations, public.organization_members from anon, authenticated;
grant select on public.organizations, public.organization_members to authenticated;
grant select on public.organizations, public.organization_members, public.data_sources, public.query_embeddings to service_role;

do $$
declare tbl text;
begin
 foreach tbl in array array['documents','document_chunks','conversations','messages','tickets','chat_requests','data_sources','query_embeddings'] loop
   execute format('alter table public.%I enable row level security',tbl);
   execute format('create policy tenant_select on public.%I for select to authenticated using(organization_id=(select private.current_organization_id()))',tbl);
   execute format('create policy tenant_insert on public.%I for insert to authenticated with check(organization_id=(select private.current_organization_id()))',tbl);
   execute format('create policy tenant_update on public.%I for update to authenticated using(organization_id=(select private.current_organization_id())) with check(organization_id=(select private.current_organization_id()))',tbl);
   execute format('create policy tenant_delete on public.%I for delete to authenticated using(organization_id=(select private.current_organization_id()))',tbl);
   -- Supabase may grant ALL by default. RLS does not protect TRUNCATE.
   execute format('revoke all on public.%I from anon, authenticated',tbl);
   execute format('grant select,insert,update,delete on public.%I to authenticated',tbl);
 end loop;
end $$;
grant usage,select on public.ticket_numbers to authenticated;
grant usage on schema extensions to authenticated;

create function public.create_workspace(p_name text,p_industry text) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid; uid uuid := auth.uid();
begin
 if uid is null or (auth.jwt()->'app_metadata'->>'provider') is distinct from 'google' then raise exception 'Authentication required'; end if;
 if char_length(trim(p_name)) not between 2 and 120 or char_length(trim(p_industry)) not between 2 and 80 then raise exception 'Invalid workspace'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 select organization_id into org from public.organization_members where user_id=uid;
 if found then return org; end if;
 insert into public.organizations(name,industry,created_by) values(trim(p_name),trim(p_industry),uid) returning id into org;
 insert into public.organization_members(organization_id,user_id,role) values(org,uid,'owner');
 return org;
end $$;
revoke all on function public.create_workspace(text,text) from public,anon;
grant execute on function public.create_workspace(text,text) to authenticated;

drop function public.match_document_chunks(extensions.vector,integer,jsonb);
create function public.match_document_chunks(query_embedding extensions.vector(1024),match_count integer default 4,filter jsonb default '{}')
returns table(id uuid,content text,metadata jsonb,similarity double precision)
language sql stable security invoker set search_path=public,extensions as $$
 select c.id,c.content,c.metadata,1-(c.embedding <=> query_embedding)
 from public.document_chunks c join public.documents d
 on d.id=c.document_id and d.organization_id=c.organization_id
 where c.organization_id=(select private.current_organization_id())
   and d.organization_id=(select private.current_organization_id())
   and d.status in ('ready','processing') and d.chunk_count>0
   and c.index_revision=d.active_revision and c.metadata @> filter
 order by c.embedding <=> query_embedding limit least(greatest(match_count,1),5);
$$;
revoke all on function public.match_document_chunks(extensions.vector,integer,jsonb) from public,anon,service_role;
grant execute on function public.match_document_chunks(extensions.vector,integer,jsonb) to authenticated;

create function public.begin_document_index(
 p_id uuid,p_revision uuid,p_name text,p_kind text,p_locator text,p_file_path text,p_mime text,p_size integer,p_replace boolean
) returns jsonb language plpgsql security invoker set search_path=public,extensions as $$
declare org uuid := private.current_organization_id(); doc public.documents; sid uuid;
begin
 if org is null then raise exception 'Authentication required'; end if;
 if p_file_path !~ ('^organizations/'||org::text||'/documents/'||p_id::text||'/'||p_revision::text||'/[^/]+$') then raise exception 'Invalid file path'; end if;
 if p_kind not in ('file','manual','website') or p_size not between 1 and 4194304 then raise exception 'Invalid source'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text,0));
 if (select count(*) from public.documents where organization_id=org and status='processing' and updated_at>now()-interval '3 minutes')>=2 then raise exception 'Indexing capacity reached'; end if;
 if p_replace then
   select * into doc from public.documents where id=p_id and organization_id=org for update;
   if not found then raise exception 'Document not found'; end if;
   if doc.indexing_token is not null and doc.updated_at>now()-interval '3 minutes' then raise exception 'Indexing in progress'; end if;
   if (select kind from public.data_sources where id=doc.data_source_id and organization_id=org)<>p_kind then raise exception 'Source type mismatch'; end if;
   update public.documents set status='processing',indexing_token=p_revision,error_message=null,updated_at=now() where id=p_id and organization_id=org;
 else
   insert into public.data_sources(organization_id,name,kind,locator) values(org,p_name,p_kind,p_locator) returning id into sid;
   insert into public.documents(id,organization_id,data_source_id,name,file_path,mime_type,size_bytes,indexing_token)
   values(p_id,org,sid,p_name,p_file_path,p_mime,p_size,p_revision) returning * into doc;
 end if;
 return to_jsonb(doc);
end $$;

create function public.commit_document_index(
 p_id uuid,p_revision uuid,p_chunks jsonb,p_file_path text,p_name text,p_mime text,p_size integer,p_hash text,p_locator text
) returns jsonb language plpgsql security invoker set search_path=public,extensions as $$
declare org uuid := private.current_organization_id(); doc public.documents; item jsonb; n integer;
begin
 select * into doc from public.documents where id=p_id and organization_id=org for update;
 if not found or doc.indexing_token is distinct from p_revision then raise exception 'Indexing conflict'; end if;
 if p_file_path !~ ('^organizations/'||org::text||'/documents/'||p_id::text||'/'||p_revision::text||'/[^/]+$') then raise exception 'Invalid file path'; end if;
 n:=jsonb_array_length(p_chunks);
 if n not between 1 and 500 then raise exception 'Invalid chunks'; end if;
 delete from public.document_chunks where organization_id=org and document_id=p_id;
 for item in select * from jsonb_array_elements(p_chunks) loop
  insert into public.document_chunks(organization_id,content,embedding,metadata,index_revision)
  values(org,item->>'content',(item->>'embedding')::extensions.vector(1024),
   jsonb_build_object('documentId',p_id,'organizationId',org,'title',p_name,'source',p_name),p_revision);
 end loop;
 update public.documents set active_revision=p_revision,indexing_token=null,status='ready',chunk_count=n,
  file_path=p_file_path,name=p_name,mime_type=p_mime,size_bytes=p_size,content_hash=p_hash,error_message=null,updated_at=now()
 where id=p_id and organization_id=org returning * into doc;
 update public.data_sources set name=p_name,locator=p_locator,last_indexed_at=now(),last_error=null
 where id=doc.data_source_id and organization_id=org;
 return to_jsonb(doc);
end $$;

create function public.fail_document_index(p_id uuid,p_revision uuid,p_message text) returns void
language plpgsql security invoker set search_path=public as $$
declare org uuid := private.current_organization_id(); sid uuid;
begin
 update public.documents set status=case when chunk_count>0 then 'ready' else 'failed' end,
  indexing_token=null,error_message=left(p_message,240),updated_at=now()
 where id=p_id and organization_id=org and indexing_token=p_revision returning data_source_id into sid;
 update public.data_sources set last_error=left(p_message,240) where id=sid and organization_id=org;
end $$;
revoke all on function public.begin_document_index(uuid,uuid,text,text,text,text,text,integer,boolean) from public,anon,service_role;
revoke all on function public.commit_document_index(uuid,uuid,jsonb,text,text,text,integer,text,text) from public,anon,service_role;
revoke all on function public.fail_document_index(uuid,uuid,text) from public,anon,service_role;
grant execute on function public.begin_document_index(uuid,uuid,text,text,text,text,text,integer,boolean),
 public.commit_document_index(uuid,uuid,jsonb,text,text,text,integer,text,text),
 public.fail_document_index(uuid,uuid,text) to authenticated;

-- Chat RPCs use the caller's verified membership, never a supplied tenant ID.
drop function public.begin_chat_request(uuid,uuid,text);
create function public.begin_chat_request(p_id uuid,p_conversation_id uuid,p_content text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare org uuid:=private.current_organization_id(); existing public.chat_requests; conv uuid;
begin
 if org is null then raise exception 'Authentication required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text,1));
 if (select count(*) from public.chat_requests where organization_id=org and created_at>now()-interval '1 minute')>=30 then raise exception 'Request limit reached'; end if;
 select * into existing from public.chat_requests where id=p_id and organization_id=org for update;
 if found then
   if existing.content<>p_content or (p_conversation_id is not null and p_conversation_id<>existing.conversation_id) then raise exception 'Request mismatch'; end if;
   if existing.status='completed' then return existing.response; end if;
   if existing.status='processing' and existing.updated_at>now()-interval '3 minutes' then raise exception 'Request in progress'; end if;
   conv:=existing.conversation_id;
 else
   conv:=p_conversation_id;
   if conv is null then
     insert into public.conversations(organization_id,created_by,customer_identifier,title)
     values(org,auth.uid(),'Workspace member',left(p_content,80)) returning id into conv;
   elsif not exists(select 1 from public.conversations where id=conv and organization_id=org) then raise exception 'Conversation not found'; end if;
 end if;
 perform 1 from public.conversations where id=conv and organization_id=org for update;
 if exists(select 1 from public.chat_requests where organization_id=org and conversation_id=conv and id<>p_id and status='processing' and updated_at>now()-interval '3 minutes') then raise exception 'Conversation in progress'; end if;
 insert into public.chat_requests(id,organization_id,conversation_id,content) values(p_id,org,conv,p_content)
 on conflict(id) do update set status='processing',updated_at=now() where public.chat_requests.organization_id=org;
 insert into public.messages(organization_id,conversation_id,request_id,role,content) values(org,conv,p_id,'user',p_content)
 on conflict(request_id,role) do nothing;
 return jsonb_build_object('conversationId',conv);
end $$;
drop function public.finish_chat_request(uuid,text,jsonb);
create function public.finish_chat_request(p_id uuid,p_content text,p_sources jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare org uuid:=private.current_organization_id(); conv uuid; msg public.messages; result jsonb;
begin
 select conversation_id into conv from public.chat_requests where id=p_id and organization_id=org for update;
 if not found then raise exception 'Request not found'; end if;
 insert into public.messages(organization_id,conversation_id,request_id,role,content,sources)
 values(org,conv,p_id,'assistant',p_content,p_sources)
 on conflict(request_id,role) do update set content=excluded.content,sources=excluded.sources
 returning * into msg;
 result:=jsonb_build_object('conversationId',conv,'message',to_jsonb(msg));
 update public.chat_requests set status='completed',response=result,updated_at=now() where id=p_id and organization_id=org;
 update public.conversations set updated_at=now() where id=conv and organization_id=org;
 return result;
end $$;
revoke all on function public.begin_chat_request(uuid,uuid,text),public.finish_chat_request(uuid,text,jsonb) from public,anon,service_role;
grant execute on function public.begin_chat_request(uuid,uuid,text),public.finish_chat_request(uuid,text,jsonb) to authenticated;

-- Private files are readable only by verified members of the path's organization.
update storage.buckets set public=false,allowed_mime_types=array['application/pdf','text/plain','text/markdown','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
where id='support-documents';
create policy workspace_files_select on storage.objects for select to authenticated using(
 bucket_id='support-documents' and split_part(name,'/',1)='organizations'
 and split_part(name,'/',2)=(select private.current_organization_id())::text
 and split_part(name,'/',3)='documents');
create policy workspace_files_insert on storage.objects for insert to authenticated with check(
 bucket_id='support-documents' and split_part(name,'/',1)='organizations'
 and split_part(name,'/',2)=(select private.current_organization_id())::text
 and split_part(name,'/',3)='documents');
create policy workspace_files_delete on storage.objects for delete to authenticated using(
 bucket_id='support-documents' and split_part(name,'/',1)='organizations'
 and split_part(name,'/',2)=(select private.current_organization_id())::text
 and split_part(name,'/',3)='documents');
-- A restrictive boundary also blocks any pre-existing broad Storage policy.
create policy workspace_files_boundary on storage.objects as restrictive for all to authenticated
using(bucket_id<>'support-documents' or (
 split_part(name,'/',1)='organizations' and split_part(name,'/',2)=(select private.current_organization_id())::text
 and split_part(name,'/',3)='documents'))
with check(bucket_id<>'support-documents' or (
 split_part(name,'/',1)='organizations' and split_part(name,'/',2)=(select private.current_organization_id())::text
 and split_part(name,'/',3)='documents'));
create policy workspace_files_anon_boundary on storage.objects as restrictive for all to anon
using(bucket_id<>'support-documents') with check(bucket_id<>'support-documents');
commit;
