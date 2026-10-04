-- Run in a Supabase project's SQL editor, or with `supabase db push`.
create extension if not exists vector with schema extensions;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique check (order_number ~ '^ORD-[0-9]{4,10}$'),
  customer_name text not null,
  customer_email text not null,
  status text not null check (status in ('processing', 'shipped', 'delivered', 'cancelled')),
  tracking_number text,
  estimated_delivery timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create sequence public.ticket_numbers start 1024;
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique default ('SUP-' || nextval('public.ticket_numbers')),
  order_number text references public.orders(order_number) on delete set null,
  customer_email text not null,
  issue text not null check (char_length(issue) between 10 and 2000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  customer_identifier text not null default 'Guest customer',
  title text not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A small request ledger prevents overlapping turns and duplicate effects on retries.
create table public.chat_requests (
  id uuid primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  content text not null,
  status text not null default 'processing' check (status in ('processing', 'failed', 'completed')),
  response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  request_id uuid not null references public.chat_requests(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (request_id, role)
);
create index messages_conversation_idx on public.messages(conversation_id, created_at);
create index chat_requests_conversation_idx on public.chat_requests(conversation_id, status);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  file_path text not null unique,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  chunk_count integer not null default 0,
  status text not null default 'processing' check (status in ('processing', 'ready', 'failed')),
  error_message text,
  created_at timestamptz not null default now()
);

create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  -- SupabaseVectorStore inserts content, embedding, and metadata. Derive the FK from metadata.
  document_id uuid generated always as ((metadata->>'documentId')::uuid) stored not null,
  content text not null,
  embedding extensions.vector(1536) not null,
  metadata jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (document_id) references public.documents(id) on delete cascade
);
create index document_chunks_document_idx on public.document_chunks(document_id);
create index document_chunks_embedding_idx on public.document_chunks using hnsw (embedding extensions.vector_cosine_ops);

create function public.match_document_chunks(
  query_embedding extensions.vector(1536),
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

-- Transactional start: replays a completed result; serializes turns within a conversation.
create function public.begin_chat_request(p_id uuid, p_conversation_id uuid, p_content text)
returns jsonb language plpgsql set search_path = public as $$
declare existing public.chat_requests; conv_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  select * into existing from public.chat_requests where id = p_id;
  if found then
    if existing.content <> p_content or (p_conversation_id is not null and p_conversation_id <> existing.conversation_id) then
      raise exception 'Request mismatch';
    end if;
    if existing.status = 'completed' then return existing.response; end if;
    if existing.status = 'processing' and existing.updated_at > now() - interval '5 minutes' then
      raise exception 'Request in progress';
    end if;
    conv_id := existing.conversation_id;
  else
    conv_id := p_conversation_id;
    if conv_id is null then
      insert into public.conversations(title) values (left(p_content, 80)) returning id into conv_id;
    elsif not exists(select 1 from public.conversations where id = conv_id) then
      raise exception 'Conversation not found';
    end if;
  end if;
  perform 1 from public.conversations where id = conv_id for update;
  if exists(select 1 from public.chat_requests where conversation_id = conv_id and id <> p_id and status = 'processing' and updated_at > now() - interval '5 minutes') then
    raise exception 'Conversation in progress';
  end if;
  insert into public.chat_requests(id, conversation_id, content) values(p_id, conv_id, p_content)
    on conflict (id) do update set status = 'processing', updated_at = now();
  insert into public.messages(conversation_id, request_id, role, content) values(conv_id, p_id, 'user', p_content)
    on conflict (request_id, role) do nothing;
  return jsonb_build_object('conversationId', conv_id);
end;
$$;

create function public.finish_chat_request(p_id uuid, p_content text, p_sources jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare conv_id uuid; result jsonb; msg_id uuid;
begin
  select conversation_id into strict conv_id from public.chat_requests where id = p_id for update;
  insert into public.messages(conversation_id, request_id, role, content, sources)
    values (conv_id, p_id, 'assistant', p_content, p_sources)
    on conflict(request_id, role) do update set content = excluded.content, sources = excluded.sources
    returning id into msg_id;
  result := jsonb_build_object('conversationId', conv_id, 'message', jsonb_build_object(
    'id', msg_id, 'conversation_id', conv_id, 'role', 'assistant', 'content', p_content,
    'sources', p_sources, 'created_at', now()));
  update public.chat_requests set status = 'completed', response = result, updated_at = now() where id = p_id;
  update public.conversations set updated_at = now() where id = conv_id;
  return result;
end;
$$;

-- All data access runs on the server with the service role. No browser policies.
alter table public.orders enable row level security;
alter table public.tickets enable row level security;
alter table public.conversations enable row level security;
alter table public.chat_requests enable row level security;
alter table public.messages enable row level security;
alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;
revoke all on public.orders, public.tickets, public.conversations, public.chat_requests, public.messages, public.documents, public.document_chunks from anon, authenticated;
revoke all on sequence public.ticket_numbers from anon, authenticated;
revoke execute on function public.match_document_chunks(extensions.vector, integer, jsonb) from public, anon, authenticated;
revoke execute on function public.begin_chat_request(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.finish_chat_request(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.match_document_chunks(extensions.vector, integer, jsonb) to service_role;
grant execute on function public.begin_chat_request(uuid, uuid, text) to service_role;
grant execute on function public.finish_chat_request(uuid, text, jsonb) to service_role;
grant all on public.orders, public.tickets, public.conversations, public.chat_requests, public.messages, public.documents, public.document_chunks to service_role;
grant usage, select on sequence public.ticket_numbers to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('support-documents', 'support-documents', false, 4194304, array['application/pdf', 'text/plain', 'text/markdown'])
on conflict (id) do nothing;
