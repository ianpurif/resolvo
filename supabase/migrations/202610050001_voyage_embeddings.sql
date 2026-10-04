-- Run AFTER the initial migration, including on an existing workspace.
-- Embeddings from different models cannot be resized or compared. Only derived
-- chunks are removed; original documents, Storage files, orders, tickets and
-- conversation history are retained. Rebuild with `npm run reindex:knowledge`.
begin;

lock table public.documents, public.document_chunks in access exclusive mode;
drop function public.match_document_chunks(extensions.vector, integer, jsonb);
drop index public.document_chunks_embedding_idx;

delete from public.document_chunks;
update public.documents
set status = 'failed', chunk_count = 0,
    error_message = 'Re-index required: embedding model is now voyage-4-lite (1024 dimensions).'
where status in ('ready', 'processing');

alter table public.document_chunks
  alter column embedding type extensions.vector(1024);
create index document_chunks_embedding_idx on public.document_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

create function public.match_document_chunks(
  query_embedding extensions.vector(1024),
  match_count integer default 5,
  filter jsonb default '{}'::jsonb
) returns table (id uuid, content text, metadata jsonb, similarity double precision)
language sql stable set search_path = public, extensions as $$
  select c.id, c.content, c.metadata, 1 - (c.embedding <=> query_embedding) as similarity
  from public.document_chunks c
  join public.documents d on d.id = c.document_id
  where d.status = 'ready' and c.metadata @> filter
  order by c.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 6);
$$;

revoke execute on function public.match_document_chunks(extensions.vector, integer, jsonb) from public, anon, authenticated;
grant execute on function public.match_document_chunks(extensions.vector, integer, jsonb) to service_role;

commit;
