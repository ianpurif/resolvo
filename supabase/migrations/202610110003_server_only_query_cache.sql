-- Derived query vectors must not be writable through a member's browser JWT.
-- Existing rows were client-writable; retain them but never read them as trusted.
begin;
alter table public.query_embeddings add column server_verified boolean not null default false;
create index query_embeddings_verified_expiry_idx
  on public.query_embeddings(organization_id,created_at desc) where server_verified;
revoke all on public.query_embeddings from public,anon,authenticated;
grant select,insert,update,delete on public.query_embeddings to service_role;
grant usage on schema extensions to service_role;
revoke all on function public.cache_query_embedding(text,extensions.vector)
  from public,anon,authenticated,service_role;

create function public.store_query_embedding(
  p_organization_id uuid,p_hash text,p_embedding extensions.vector(1024)
) returns void language plpgsql security invoker set search_path=public,extensions as $$
begin
  if p_organization_id is null or not exists(
    select 1 from public.organizations where id=p_organization_id and not is_archived
  ) then raise exception 'Invalid cache organization'; end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or p_embedding is null
    or vector_dims(p_embedding)<>1024 or vector_norm(p_embedding)=0
  then raise exception 'Invalid query embedding'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text,2));
  insert into public.query_embeddings(organization_id,query_hash,model,embedding,server_verified)
    values(p_organization_id,p_hash,'voyage-4-lite',p_embedding,true)
    on conflict(organization_id,query_hash,model) do update
      set embedding=excluded.embedding,created_at=now(),server_verified=true;
  delete from public.query_embeddings where organization_id=p_organization_id and server_verified
    and query_hash in (
      select query_hash from public.query_embeddings where organization_id=p_organization_id and server_verified
      order by created_at desc,query_hash offset 512
    );
  delete from public.query_embeddings where organization_id=p_organization_id and created_at<now()-interval '7 days';
end $$;
revoke all on function public.store_query_embedding(uuid,text,extensions.vector)
  from public,anon,authenticated;
grant execute on function public.store_query_embedding(uuid,text,extensions.vector) to service_role;
commit;
