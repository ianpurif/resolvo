begin;
create function private.integration_platform(p_connection uuid) returns text
language sql stable security definer set search_path='' as $$
  select case when p_connection is null then 'uploads' else
    (select c.provider from public.integration_connections c where c.id=p_connection
      and private.can_read_integration(c.id)) end;
$$;
revoke all on function private.integration_platform(uuid) from public,anon,service_role;
grant execute on function private.integration_platform(uuid) to authenticated;
drop function public.search_knowledge(text,extensions.vector,integer);
create function public.search_knowledge(p_query_text text,p_query_embedding extensions.vector(1024) default null,p_match_count integer default 24,p_document_ids uuid[] default null,p_platforms text[] default null)
returns table(id uuid,document_id uuid,organization_id uuid,index_revision uuid,title text,content text,
  chunk_index integer,start_offset integer,end_offset integer,section text,similarity double precision,lexical_score real,score double precision)
language sql stable security invoker set search_path=public,extensions as $$
  with parameters as (
    select (replace(plainto_tsquery('english',left(p_query_text,6000))::text,' & ',' | ')::tsquery
      || replace(plainto_tsquery('simple',left(p_query_text,6000))::text,' & ',' | ')::tsquery) as q
  ), authorized as materialized (
    -- Exact vector ranking over an explicitly materialized tenant subset. A
    -- global ANN index never decides which tenants enter this candidate set.
    select c.*,d.name as document_title from public.document_chunks c join public.documents d
      on d.id=c.document_id and d.organization_id=c.organization_id
    where c.organization_id=(select private.current_organization_id())
      and d.organization_id=(select private.current_organization_id())
      and (p_document_ids is null or d.id=any(p_document_ids))
      and (p_platforms is null or private.integration_platform(d.integration_connection_id)=any(p_platforms))
      and d.status in ('ready','processing') and d.chunk_count>0
      and c.index_revision=d.active_revision
  ), semantic_limited as (
    select a.id,1-(a.embedding <=> p_query_embedding) as similarity,
      a.embedding <=> p_query_embedding as distance,a.document_id,a.chunk_index
    from authorized a where p_query_embedding is not null
    order by a.embedding <=> p_query_embedding,a.document_id,a.chunk_index nulls last,a.id limit least(greatest(p_match_count,1),48)
  ), semantic_candidates as (
    select s.id,s.similarity,row_number() over(order by s.distance,s.document_id,s.chunk_index nulls last,s.id) as rank from semantic_limited s
  ), lexical_limited as (
    -- Query the indexed table directly so the GIN index remains usable. Both
    -- membership and active-revision checks precede lexical ranking as well.
    select c.id,ts_rank_cd(c.search_tsv,p.q) as lexical_score,c.document_id,c.chunk_index
    from public.document_chunks c join public.documents d
      on d.id=c.document_id and d.organization_id=c.organization_id cross join parameters p
    where c.organization_id=(select private.current_organization_id())
      and d.organization_id=(select private.current_organization_id())
      and (p_document_ids is null or d.id=any(p_document_ids))
      and (p_platforms is null or private.integration_platform(d.integration_connection_id)=any(p_platforms))
      and d.status in ('ready','processing') and d.chunk_count>0
      and c.index_revision=d.active_revision and c.search_tsv @@ p.q
    order by lexical_score desc,c.document_id,c.chunk_index nulls last,c.id limit least(greatest(p_match_count,1),48)
  ), lexical_candidates as (
    select l.id,l.lexical_score,row_number() over(order by l.lexical_score desc,l.document_id,l.chunk_index nulls last,l.id) as rank from lexical_limited l
  ), fused as materialized (
    select coalesce(s.id,l.id) as id,s.similarity,coalesce(l.lexical_score,0) as lexical_score,
      coalesce(1.0/(60+s.rank),0)+coalesce(1.0/(60+l.rank),0) as score
    from semantic_candidates s full outer join lexical_candidates l on l.id=s.id
  ) select a.id,a.document_id,a.organization_id,a.index_revision,a.document_title,a.content,
      a.chunk_index,a.start_offset,a.end_offset,a.section,f.similarity,f.lexical_score,f.score
    from fused f join authorized a on a.id=f.id
    order by f.score desc,a.document_id,a.chunk_index nulls last,a.id limit least(greatest(p_match_count,1),48);
$$;


revoke all on function public.search_knowledge(text,extensions.vector,integer,uuid[],text[]) from public,anon,service_role;
grant execute on function public.search_knowledge(text,extensions.vector,integer,uuid[],text[]) to authenticated;
create function public.knowledge_source_metadata(p_ids uuid[] default null,p_platforms text[] default null,p_offset integer default 0,p_limit integer default 100)
returns table(id uuid,title text,source_url text,platform text,chunk_count integer)
language sql stable security invoker set search_path='' as $$
  select d.id,d.name,s.locator,private.integration_platform(d.integration_connection_id),d.chunk_count
  from public.documents d join public.data_sources s on s.id=d.data_source_id and s.organization_id=d.organization_id
  where d.organization_id=(select private.current_organization_id()) and d.chunk_count>0 and d.status in ('ready','processing')
    and (p_ids is null or d.id=any(p_ids))
    and (p_platforms is null or private.integration_platform(d.integration_connection_id)=any(p_platforms))
  order by d.name,d.id offset greatest(p_offset,0) limit least(greatest(p_limit,1),101);
$$;
revoke all on function public.knowledge_source_metadata(uuid[],text[],integer,integer) from public,anon,service_role;
grant execute on function public.knowledge_source_metadata(uuid[],text[],integer,integer) to authenticated;
alter table public.chat_requests add column knowledge_filter jsonb not null default '{}';
create function public.begin_filtered_chat_request(p_id uuid,p_conversation_id uuid,p_content text,p_filter jsonb default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare org uuid:=private.current_organization_id(); existing public.chat_requests; result jsonb; selected jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(org::text,1));
  select * into existing from public.chat_requests where id=p_id and organization_id=org;
  selected:=coalesce(p_filter,existing.knowledge_filter,'{}');
  if jsonb_typeof(selected)<>'object' then raise exception 'Invalid knowledge filter'; end if;
  if existing.id is not null and existing.knowledge_filter<>selected then raise exception 'Request mismatch'; end if;
  result:=public.begin_chat_request(p_id,p_conversation_id,p_content);
  update public.chat_requests set knowledge_filter=selected where id=p_id and organization_id=org;
  return result||jsonb_build_object('filter',selected);
end $$;
revoke all on function public.begin_filtered_chat_request(uuid,uuid,text,jsonb) from public,anon,service_role;
grant execute on function public.begin_filtered_chat_request(uuid,uuid,text,jsonb) to authenticated;
commit;
