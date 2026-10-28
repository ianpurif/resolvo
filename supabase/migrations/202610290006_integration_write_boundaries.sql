-- Connector copies may only be changed by the leased synchronization bridge.
begin;
create policy integration_vector_insert on public.document_index_vectors as restrictive for insert to authenticated
  with check(exists(select 1 from public.document_index_jobs j join public.documents d on d.id=j.document_id
    where j.revision=document_index_vectors.revision and d.integration_connection_id is null));
create policy integration_vector_update on public.document_index_vectors as restrictive for update to authenticated
  using(exists(select 1 from public.document_index_jobs j join public.documents d on d.id=j.document_id
    where j.revision=document_index_vectors.revision and d.integration_connection_id is null))
  with check(exists(select 1 from public.document_index_jobs j join public.documents d on d.id=j.document_id
    where j.revision=document_index_vectors.revision and d.integration_connection_id is null));
create policy integration_vector_delete on public.document_index_vectors as restrictive for delete to authenticated
  using(exists(select 1 from public.document_index_jobs j join public.documents d on d.id=j.document_id
    where j.revision=document_index_vectors.revision and d.integration_connection_id is null));

create function private.can_write_integration_file(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select not exists(select 1 from public.integration_file_gc where path=p_path)
    and not exists(select 1 from public.documents d where d.id::text=split_part(p_path,'/',4) and d.integration_connection_id is not null);
$$;
revoke all on function private.can_write_integration_file(text) from public,anon,service_role;
grant execute on function private.can_write_integration_file(text) to authenticated;
create policy integration_file_insert on storage.objects as restrictive for insert to authenticated
  with check(bucket_id<>'support-documents' or private.can_write_integration_file(name));
create policy integration_file_update on storage.objects as restrictive for update to authenticated
  using(bucket_id<>'support-documents' or private.can_write_integration_file(name))
  with check(bucket_id<>'support-documents' or private.can_write_integration_file(name));
create policy integration_file_delete on storage.objects as restrictive for delete to authenticated
  using(bucket_id<>'support-documents' or private.can_write_integration_file(name));
commit;
