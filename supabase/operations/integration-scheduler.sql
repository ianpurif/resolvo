-- Hosted Supabase operator setup, separate from portable application migrations.
-- Store the endpoint and signing secret in Vault, then schedule the dispatcher.
begin;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Managed pg_net grants may expose queued headers to database roles. Never put
-- the reusable Vault signing key in that queue: send a single-use HMAC instead.

create table if not exists private.integration_worker_dispatches (
  request_id bigint primary key,
  created_at timestamptz not null default now()
);
alter table private.integration_worker_dispatches enable row level security;
revoke all on private.integration_worker_dispatches from public,anon,authenticated,service_role;

create or replace function private.dispatch_integration_sync(p_force boolean default false)
returns bigint language plpgsql security definer set search_path='' as $$
declare endpoint text; signing_secret text; request_id bigint; issued_at text; nonce text; signature text;
begin
  perform pg_advisory_xact_lock(hashtextextended('resolvo-integration-dispatch',0));
  -- A prior HTTP call can still be indexing. Leases protect content; this also
  -- avoids paying for redundant invocations while that call is in flight.
  if exists(select 1 from private.integration_worker_dispatches d
    left join net._http_response r on r.id=d.request_id
    where d.created_at>now()-interval '125 seconds' and r.id is null) then return null; end if;
  if not p_force and not exists(select 1 from public.integration_file_gc) and not exists(
    select 1 from public.integration_connections c
    join public.organization_members m on m.organization_id=c.organization_id and m.user_id=c.created_by
    join public.organizations o on o.id=c.organization_id and not o.is_archived
    where c.status in ('connected','error') and c.next_sync_at<=now()
      and (c.lease_until is null or c.lease_until<=now())
      and not exists(select 1 from public.integration_tasks t where t.connection_id=c.id and not t.done and t.attempts>=6)
  ) then return null; end if;
  select decrypted_secret into endpoint from vault.decrypted_secrets where name='resolvo_integration_worker_url';
  select decrypted_secret into signing_secret from vault.decrypted_secrets where name='resolvo_integration_worker_secret';
  if endpoint is null or endpoint !~ '^https://[A-Za-z0-9.-]+/api/integrations/worker$'
    or signing_secret is null or char_length(signing_secret)<32 then raise exception 'Configure the hosted integration scheduler Vault secrets'; end if;
  issued_at:=floor(extract(epoch from clock_timestamp()))::bigint::text;
  nonce:=gen_random_uuid()::text;
  signature:=encode(extensions.hmac('POST'||chr(10)||'/api/integrations/worker'||chr(10)||issued_at||chr(10)||nonce,signing_secret,'sha256'),'hex');
  select net.http_post(url:=endpoint,headers:=jsonb_build_object('Content-Type','application/json',
    'X-Resolvo-Worker-Timestamp',issued_at,'X-Resolvo-Worker-Nonce',nonce,'X-Resolvo-Worker-Signature',signature),
    body:='{}'::jsonb,timeout_milliseconds:=115000) into request_id;
  insert into private.integration_worker_dispatches(request_id) values(request_id);
  delete from private.integration_worker_dispatches where created_at<now()-interval '7 days';
  return request_id;
end $$;
revoke all on function private.dispatch_integration_sync(boolean) from public,anon,authenticated,service_role;

create or replace function public.integration_scheduler_status() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'active',coalesce((select active from cron.job where jobname='resolvo-integration-sync' limit 1),false),
    'schedule',(select schedule from cron.job where jobname='resolvo-integration-sync' limit 1),
    'lastRun',(select jsonb_build_object('status',r.status,'startedAt',r.start_time,'finishedAt',r.end_time)
      from cron.job_run_details r join cron.job j on j.jobid=r.jobid where j.jobname='resolvo-integration-sync' order by r.runid desc limit 1),
    'lastDispatch',(select created_at from private.integration_worker_dispatches order by created_at desc limit 1),
    'lastHttp',(select jsonb_build_object('status',r.status_code,'timedOut',r.timed_out,'error',left(r.error_msg,180),'dispatchedAt',d.created_at)
      from private.integration_worker_dispatches d join net._http_response r on r.id=d.request_id order by d.created_at desc limit 1)
  );
$$;
revoke all on function public.integration_scheduler_status() from public,anon,authenticated,service_role;
grant execute on function public.integration_scheduler_status() to service_role;
commit;
