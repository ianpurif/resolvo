-- Scheduled HTTP requests expose only a short-lived, single-use signature.
begin;
create table private.integration_worker_nonces (
  nonce uuid primary key,
  created_at timestamptz not null default now()
);
alter table private.integration_worker_nonces enable row level security;
revoke all on private.integration_worker_nonces from public,anon,authenticated,service_role;
create function public.consume_integration_worker_nonce(p_nonce uuid,p_issued_at bigint) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_nonce is null or p_issued_at is null or abs(extract(epoch from clock_timestamp())-p_issued_at)>60
    then raise exception 'Worker request expired'; end if;
  insert into private.integration_worker_nonces(nonce) values(p_nonce) on conflict do nothing;
  if not found then raise exception 'Worker request replay'; end if;
  delete from private.integration_worker_nonces where created_at<now()-interval '2 minutes';
end $$;
revoke all on function public.consume_integration_worker_nonce(uuid,bigint) from public,anon,authenticated,service_role;
grant execute on function public.consume_integration_worker_nonce(uuid,bigint) to service_role;
commit;
