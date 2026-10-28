begin;
alter table public.integration_credentials add column refresh_lease uuid,add column refresh_until timestamptz;
create function public.claim_integration_refresh(p_connection uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare credential public.integration_credentials;
begin
  perform 1 from public.integration_connections where id=p_connection and status<>'disconnected' for update;
  if not found then raise exception 'Integration disconnected'; end if;
  update public.integration_credentials set refresh_lease=gen_random_uuid(),refresh_until=now()+interval '45 seconds'
    where connection_id=p_connection and (refresh_until is null or refresh_until<=now()) returning * into credential;
  if credential.connection_id is null then return null; end if;
  return jsonb_build_object('lease',credential.refresh_lease,'ciphertext',credential.ciphertext);
end $$;
create function public.finish_integration_refresh(p_connection uuid,p_lease uuid,p_ciphertext text) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.integration_connections where id=p_connection and status<>'disconnected' for update;
  if not found then raise exception 'Integration disconnected'; end if;
  update public.integration_credentials set ciphertext=coalesce(p_ciphertext,ciphertext),refresh_lease=null,refresh_until=null,updated_at=now()
    where connection_id=p_connection and refresh_lease=p_lease and refresh_until>now();
  if not found then raise exception 'Credential lease expired'; end if;
end $$;
revoke all on function public.claim_integration_refresh(uuid),public.finish_integration_refresh(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.claim_integration_refresh(uuid),public.finish_integration_refresh(uuid,uuid,text) to service_role;
commit;
