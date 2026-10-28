begin;
-- All functions in this migration are exclusively callable with the server key.
create function public.create_integration(p_organization uuid,p_user uuid,p_id uuid,p_provider text,p_name text,p_config jsonb,p_visibility text,p_ciphertext text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.organization_members m join public.organizations o on o.id=m.organization_id
    where m.organization_id=p_organization and m.user_id=p_user and not o.is_archived
      and (p_visibility='private' or m.role='owner')) then raise exception 'Integration access denied'; end if;
  insert into public.integration_connections(id,organization_id,created_by,provider,name,config,visibility)
    values(p_id,p_organization,p_user,p_provider,p_name,p_config,p_visibility);
  insert into public.integration_credentials(connection_id,ciphertext) values(p_id,p_ciphertext);
end $$;

create function public.configure_integration(p_connection uuid,p_organization uuid,p_user uuid,p_action text,p_data jsonb default '{}')
returns void language plpgsql security definer set search_path='' as $$
declare c public.integration_connections; entry jsonb;
begin
  select * into c from public.integration_connections where id=p_connection and organization_id=p_organization and created_by=p_user for update;
  if c.id is null or not exists(select 1 from public.organization_members where organization_id=c.organization_id and user_id=p_user)
    then raise exception 'Integration not found'; end if;
  if p_action='disconnect' then
    update public.integration_connections set status='disconnected',generation=null,lease=null,lease_until=null,last_error=null where id=c.id;
    delete from public.integration_credentials where connection_id=c.id;
    delete from public.integration_tasks where connection_id=c.id;
    delete from public.integration_selections where connection_id=c.id;
    delete from public.data_sources where integration_connection_id=c.id;
    delete from public.integration_items where connection_id=c.id;
    return;
  end if;
  if c.status='disconnected' then raise exception 'Reconnect this account'; end if;
  if p_action='selections' then
    if jsonb_typeof(p_data->'items') is distinct from 'array' then raise exception 'Invalid selection'; end if;
    delete from public.integration_selections where connection_id=c.id;
    for entry in select * from jsonb_array_elements(p_data->'items') loop
      insert into public.integration_selections(connection_id,organization_id,external_id,name,kind)
        values(c.id,c.organization_id,entry->>'id',left(entry->>'name',160),entry->>'kind') on conflict do nothing;
    end loop;
    -- Changed scope cancels older workers before they can publish. Retain hashes
    -- and checkpoints for selected items, but hide old scope until revalidated.
    update public.integration_items set access_until=now() where connection_id=c.id;
    delete from public.integration_tasks where connection_id=c.id;
    update public.integration_connections set generation=null,lease=null,lease_until=null,next_sync_at=now(),last_error=null where id=c.id;
  elsif p_action='sync' then
    update public.integration_tasks set attempts=0,next_attempt_at=now() where connection_id=c.id and not done;
    update public.integration_connections set next_sync_at=now(),last_error=null where id=c.id;
  elsif p_action='settings' then
    if p_data->>'visibility'='workspace' and not exists(select 1 from public.organization_members where organization_id=c.organization_id and user_id=p_user and role='owner')
      then raise exception 'Only workspace owners may share knowledge'; end if;
    update public.integration_connections set visibility=coalesce(p_data->>'visibility',visibility),
      sync_interval_minutes=coalesce((p_data->>'interval')::integer,sync_interval_minutes) where id=c.id;
  else raise exception 'Invalid integration action'; end if;
end $$;

create function public.claim_integration(p_connection uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.integration_connections; task public.integration_tasks; gen uuid; token uuid:=gen_random_uuid();
begin
  select * into c from public.integration_connections x where x.status in ('connected','error')
    and (p_connection is null or x.id=p_connection) and x.next_sync_at<=now()
    and (x.lease_until is null or x.lease_until<=now())
    and exists(select 1 from public.organization_members m join public.organizations o on o.id=m.organization_id
      where m.organization_id=x.organization_id and m.user_id=x.created_by and not o.is_archived)
    and not exists(select 1 from public.integration_tasks t where t.connection_id=x.id and not t.done and t.attempts>=6)
    order by x.next_sync_at,x.id for update skip locked limit 1;
  if c.id is null then return null; end if;
  gen:=coalesce(c.generation,gen_random_uuid());
  if c.generation is null then
    delete from public.integration_tasks where connection_id=c.id;
    insert into public.integration_tasks(connection_id,organization_id,generation,task_key,payload)
      select c.id,c.organization_id,gen,'source:'||md5(external_id),jsonb_build_object('type',case when kind='container' then 'list' else 'read' end,'id',external_id,'name',name)
      from public.integration_selections where connection_id=c.id;
  end if;
  select * into task from public.integration_tasks where connection_id=c.id and generation=gen and not done and next_attempt_at<=now()
    order by case when payload->>'type'='index' then 0 else 1 end,created_at,id limit 1;
  if task.id is null then
    if not exists(select 1 from public.integration_tasks where connection_id=c.id and generation=gen and not done) then
      -- Sweep only after a complete successful traversal, never after a partial page.
      delete from public.data_sources s using public.documents d,public.integration_items i
        where i.connection_id=c.id and i.seen_generation is distinct from gen and d.id=i.document_id and s.id=d.data_source_id;
      delete from public.integration_items where connection_id=c.id and seen_generation is distinct from gen;
      update public.integration_connections set generation=null,last_sync_at=now(),next_sync_at=now()+sync_interval_minutes*interval '1 minute',
        status='connected',last_error=null,lease=null,lease_until=null where id=c.id;
    else
      update public.integration_connections set generation=gen,next_sync_at=(select min(next_attempt_at) from public.integration_tasks where connection_id=c.id and not done) where id=c.id;
    end if;
    return null;
  end if;
  update public.integration_connections set generation=gen,lease=token,lease_until=now()+interval '90 seconds' where id=c.id returning * into c;
  return jsonb_build_object('connection',to_jsonb(c),'task',to_jsonb(task));
end $$;

create function public.integration_step(p_connection uuid,p_lease uuid,p_task uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.integration_connections; task public.integration_tasks; i public.integration_items;
  entry jsonb; result jsonb; document jsonb; docid uuid; saved_claims text:=current_setting('request.jwt.claims',true);
begin
  select * into c from public.integration_connections where id=p_connection for update;
  if c.id is null or c.status not in ('connected','error') or c.lease is distinct from p_lease or p_lease is null or c.lease_until<=clock_timestamp()
    or not exists(select 1 from public.organization_members where organization_id=c.organization_id and user_id=c.created_by)
    then raise exception 'Integration lease expired'; end if;
  select * into task from public.integration_tasks where id=p_task and connection_id=c.id and generation=c.generation and not done for update;
  if task.id is null then raise exception 'Integration task expired'; end if;
  -- Existing ingestion functions resolve the connection creator's organization.
  -- This definer bridge checks a leased task and never accepts an arbitrary actor.
  perform set_config('request.jwt.claims',jsonb_build_object('sub',c.created_by,'app_metadata',jsonb_build_object('provider','google'))::text,true);
  select * into i from public.integration_items where connection_id=c.id and external_id=task.payload->>'id';
  if p_action='listed' then
    for entry in select * from jsonb_array_elements(p_data->'tasks') loop
      insert into public.integration_tasks(connection_id,organization_id,generation,task_key,payload)
        values(c.id,c.organization_id,c.generation,entry->>'key',entry->'payload') on conflict do nothing;
    end loop;
    update public.integration_tasks set done=true where id=task.id;
  elsif p_action='unchanged' then
    if i.document_id is null then raise exception 'No published source'; end if;
    update public.integration_items set seen_generation=c.generation,access_until=now()+interval '24 hours',
      remote_version=p_data->>'version',name=left(p_data->>'name',160),source_url=p_data->>'url',last_error=null,updated_at=now() where id=i.id;
    update public.documents set name=left(p_data->>'name',160) where id=i.document_id and organization_id=c.organization_id;
    update public.data_sources set name=left(p_data->>'name',160),locator=p_data->>'url' where id=(select data_source_id from public.documents where id=i.document_id);
    update public.integration_tasks set done=true where id=task.id;
  elsif p_action='prepare' then
    if i.id is null then
      insert into public.integration_items(id,connection_id,organization_id,external_id,name)
        values((p_data->>'itemId')::uuid,c.id,c.organization_id,task.payload->>'id',left(p_data->>'name',160)) returning * into i;
    end if;
    docid:=coalesce(i.document_id,i.id);
    if exists(select 1 from public.document_index_jobs where document_id=docid and revision<>(p_data->>'revision')::uuid) then
      insert into public.integration_file_gc(path) select file_path from public.document_index_jobs where document_id=docid on conflict do nothing;
      delete from public.document_index_jobs where document_id=docid;
      update public.documents set indexing_token=null,status=case when chunk_count>0 then 'ready' else 'failed' end where id=docid;
    end if;
    result:=public.start_document_index_job(docid,(p_data->>'revision')::uuid,left(p_data->>'name',160),'manual',p_data->>'url',
      p_data->>'path','text/markdown',(p_data->>'size')::integer,i.document_id is not null,p_data->>'hash',p_data->'manifest');
    update public.documents set integration_connection_id=c.id where id=docid and organization_id=c.organization_id;
    update public.data_sources set integration_connection_id=c.id where id=(result->>'data_source_id')::uuid and organization_id=c.organization_id;
    update public.integration_items set document_id=docid,seen_generation=c.generation where id=i.id;
    update public.integration_tasks set payload=payload||jsonb_build_object('type','index','meta',p_data-'manifest'-'path'-'size'),next_attempt_at=now() where id=task.id;
  elsif p_action='claim-index' then
    if i.document_id is null then raise exception 'Missing index document'; end if;
    perform public.resume_document_index_job(i.document_id);
    result:=public.claim_document_index_batch(i.document_id,p_lease);
    perform set_config('request.jwt.claims',coalesce(saved_claims,''),true);
    return result;
  elsif p_action='checkpoint' then
    result:=public.checkpoint_document_index_batch(i.document_id,p_lease,(p_data->>'offset')::integer,p_data->'vectors');
    if result->>'retired_file' is not null then insert into public.integration_file_gc(path) values(result->>'retired_file') on conflict do nothing; end if;
    document:=result->'document';
    if document->>'status'='ready' and document->>'indexing_token' is null then
      update public.integration_items set content_hash=task.payload->'meta'->>'hash',remote_version=task.payload->'meta'->>'version',
        name=left(task.payload->'meta'->>'name',160),source_url=task.payload->'meta'->>'url',seen_generation=c.generation,
        access_until=now()+interval '24 hours',last_error=null,updated_at=now() where id=i.id;
      update public.integration_tasks set done=true where id=task.id;
    end if;
  elsif p_action='index-published' then
    if not exists(select 1 from public.documents where id=i.document_id and status='ready' and indexing_token is null) then raise exception 'Index incomplete'; end if;
    update public.integration_items set content_hash=task.payload->'meta'->>'hash',remote_version=task.payload->'meta'->>'version',
      name=left(task.payload->'meta'->>'name',160),source_url=task.payload->'meta'->>'url',seen_generation=c.generation,
      access_until=now()+interval '24 hours',last_error=null,updated_at=now() where id=i.id;
    update public.integration_tasks set done=true where id=task.id;
  elsif p_action='defer-index' then
    result:=public.defer_document_index_batch(i.document_id,p_lease,(p_data->>'delay')::integer,p_data->>'error',false,false);
    update public.integration_tasks set next_attempt_at=now()+(p_data->>'delay')::integer*interval '1 millisecond' where id=task.id;
  elsif p_action='missing' then
    delete from public.data_sources where id=(select data_source_id from public.documents where id=i.document_id and organization_id=c.organization_id);
    delete from public.integration_items where id=i.id;
    update public.integration_tasks set done=true where id=task.id;
  elsif p_action='error' then
    if i.document_id is not null then
      update public.document_index_jobs set lease=null,lease_until=null where document_id=i.document_id and lease=p_lease;
    end if;
    update public.integration_tasks set attempts=attempts+1,next_attempt_at=now()+greatest(1,(p_data->>'delay')::integer)*interval '1 second' where id=task.id;
    update public.integration_connections set status=case when (p_data->>'reauth')::boolean then 'reauth' else 'error' end,last_error=left(p_data->>'error',300) where id=c.id;
    update public.integration_items set last_error=left(p_data->>'error',300) where id=i.id;
  elsif p_action='wait' then
    update public.integration_tasks set next_attempt_at=now()+greatest(1,(p_data->>'delay')::integer)*interval '1 second' where id=task.id;
  else raise exception 'Invalid integration step'; end if;
  update public.integration_connections set lease=null,lease_until=null,next_sync_at=now() where id=c.id;
  perform set_config('request.jwt.claims',coalesce(saved_claims,''),true);
  return coalesce(result,'{}'::jsonb);
end $$;

create function public.save_integration_credential(p_connection uuid,p_ciphertext text) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.integration_connections where id=p_connection and status<>'disconnected' for update;
  if not found then raise exception 'Integration disconnected'; end if;
  update public.integration_credentials set ciphertext=p_ciphertext,updated_at=now() where connection_id=p_connection;
end $$;

revoke all on function public.create_integration(uuid,uuid,uuid,text,text,jsonb,text,text),
  public.configure_integration(uuid,uuid,uuid,text,jsonb),public.claim_integration(uuid),
  public.integration_step(uuid,uuid,uuid,text,jsonb),public.save_integration_credential(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.create_integration(uuid,uuid,uuid,text,text,jsonb,text,text),
  public.configure_integration(uuid,uuid,uuid,text,jsonb),public.claim_integration(uuid),
  public.integration_step(uuid,uuid,uuid,text,jsonb),public.save_integration_credential(uuid,text) to service_role;
commit;
