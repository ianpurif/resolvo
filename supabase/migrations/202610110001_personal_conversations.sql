-- Personal chat history within the existing company boundary. No records are
-- reassigned or removed; knowledge and tickets remain company resources.
begin;
create index conversations_personal_updated_idx
  on public.conversations(organization_id,created_by,updated_at desc,id);
alter table public.chat_requests add unique(id,conversation_id,organization_id);
alter table public.messages add foreign key(request_id,conversation_id,organization_id)
  references public.chat_requests(id,conversation_id,organization_id) on delete cascade;

create policy conversation_owner_boundary on public.conversations as restrictive
  for all to authenticated
  using(created_by=(select auth.uid()))
  with check(created_by=(select auth.uid()));
create policy message_owner_boundary on public.messages as restrictive
  for all to authenticated
  using(exists(select 1 from public.conversations c
    where c.id=conversation_id and c.organization_id=messages.organization_id and c.created_by=(select auth.uid())))
  with check(exists(select 1 from public.conversations c
    where c.id=conversation_id and c.organization_id=messages.organization_id and c.created_by=(select auth.uid())));
create policy request_owner_boundary on public.chat_requests as restrictive
  for all to authenticated
  using(exists(select 1 from public.conversations c
    where c.id=conversation_id and c.organization_id=chat_requests.organization_id and c.created_by=(select auth.uid())))
  with check(exists(select 1 from public.conversations c
    where c.id=conversation_id and c.organization_id=chat_requests.organization_id and c.created_by=(select auth.uid())));

-- Keep short-lived rate accounting separate from deletable conversation records.
-- These events contain no message text or user identity and are inaccessible
-- directly to application roles. Seed the current window on existing databases.
create table private.chat_request_rate_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index chat_request_rate_events_window_idx
  on private.chat_request_rate_events(organization_id,created_at);
alter table private.chat_request_rate_events enable row level security;
revoke all on private.chat_request_rate_events from public,anon,authenticated,service_role;
insert into private.chat_request_rate_events(organization_id,created_at)
  select organization_id,created_at from public.chat_requests
  where created_at>now()-interval '1 minute';

-- Count all company requests without exposing other members' history.
create function private.workspace_chat_request_count() returns bigint
language sql stable security definer set search_path='' as $$
  select count(*) from private.chat_request_rate_events
  where organization_id=private.current_organization_id()
    and created_at>now()-interval '1 minute';
$$;
revoke all on function private.workspace_chat_request_count() from public,anon,service_role;
grant execute on function private.workspace_chat_request_count() to authenticated;

create function private.reserve_chat_request() returns void
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_organization_id();
begin
 if org is null then raise exception 'Authentication required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text,1));
 delete from private.chat_request_rate_events
   where organization_id=org and created_at<=now()-interval '1 minute';
 if (select count(*) from private.chat_request_rate_events where organization_id=org)>=30
 then raise exception 'Request limit reached'; end if;
 insert into private.chat_request_rate_events(organization_id) values(org);
end $$;
revoke all on function private.reserve_chat_request() from public,anon,service_role;
grant execute on function private.reserve_chat_request() to authenticated;

create or replace function public.begin_chat_request(p_id uuid,p_conversation_id uuid,p_content text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare org uuid:=private.current_organization_id(); existing public.chat_requests; conv uuid;
begin
 if org is null then raise exception 'Authentication required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text,1));
 select * into existing from public.chat_requests where id=p_id and organization_id=org for update;
 if found then
   if existing.content<>p_content or (p_conversation_id is not null and p_conversation_id<>existing.conversation_id) then raise exception 'Request mismatch'; end if;
   if existing.status='completed' then return existing.response; end if;
   if existing.status='processing' and existing.updated_at>now()-interval '3 minutes' then raise exception 'Request in progress'; end if;
   conv:=existing.conversation_id;
 else
   perform private.reserve_chat_request();
   conv:=p_conversation_id;
   if conv is null then
     insert into public.conversations(organization_id,created_by,customer_identifier,title)
     values(org,auth.uid(),'Workspace member',left(p_content,80)) returning id into conv;
   elsif not exists(select 1 from public.conversations where id=conv and organization_id=org and created_by=auth.uid()) then raise exception 'Conversation not found'; end if;
 end if;
 perform 1 from public.conversations where id=conv and organization_id=org for update;
 if exists(select 1 from public.chat_requests where organization_id=org and conversation_id=conv and id<>p_id and status='processing' and updated_at>now()-interval '3 minutes') then raise exception 'Conversation in progress'; end if;
 insert into public.chat_requests(id,organization_id,conversation_id,content) values(p_id,org,conv,p_content)
 on conflict(id) do update set status='processing',updated_at=now() where public.chat_requests.organization_id=org;
 insert into public.messages(organization_id,conversation_id,request_id,role,content) values(org,conv,p_id,'user',p_content)
 on conflict(request_id,role) do nothing;
 return jsonb_build_object('conversationId',conv);
end $$;

create function public.manage_conversation(p_id uuid,p_title text default null,p_delete boolean default false)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare org uuid:=private.current_organization_id(); conv public.conversations;
begin
 if org is null then raise exception 'Authentication required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text,1));
 select * into conv from public.conversations
   where id=p_id and organization_id=org and created_by=auth.uid() for update;
 if not found then raise exception 'Conversation not found'; end if;
 if p_delete then
   if exists(select 1 from public.chat_requests where conversation_id=p_id
     and organization_id=org and status='processing' and updated_at>now()-interval '3 minutes')
   then raise exception 'Conversation in progress'; end if;
   delete from public.conversations where id=p_id and organization_id=org;
   return jsonb_build_object('deleted',true);
 end if;
 if p_title is null or char_length(btrim(p_title)) not between 1 and 120 then raise exception 'Invalid conversation title'; end if;
 update public.conversations set title=btrim(p_title)
   where id=p_id and organization_id=org returning * into conv;
 return to_jsonb(conv);
end $$;
revoke all on function public.manage_conversation(uuid,text,boolean) from public,anon,service_role;
grant execute on function public.manage_conversation(uuid,text,boolean) to authenticated;
commit;
