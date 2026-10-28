begin;
create table public.integration_webhook_events (
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  event_hash text not null,created_at timestamptz not null default now(),primary key(connection_id,event_hash)
);
alter table public.integration_webhook_events enable row level security;
revoke all on public.integration_webhook_events from public,anon,authenticated,service_role;
create function public.wake_integration(p_connection uuid,p_event text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_event !~ '^[0-9a-f]{64}$' then raise exception 'Invalid event'; end if;
  perform 1 from public.integration_connections where id=p_connection and status in ('connected','error') for update;
  if not found then return; end if;
  delete from public.integration_webhook_events where connection_id=p_connection and created_at<now()-interval '7 days';
  insert into public.integration_webhook_events(connection_id,event_hash) values(p_connection,p_event) on conflict do nothing;
  if found then update public.integration_connections set next_sync_at=least(next_sync_at,now()) where id=p_connection; end if;
end $$;
revoke all on function public.wake_integration(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.wake_integration(uuid,text) to service_role;
commit;
