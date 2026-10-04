import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

test("actual migrations and seed execute in PostgreSQL with pgvector; constraints, RLS, retrieval, and retries work", async () => {
  const db = new PGlite({ extensions: { vector } });
  try {
    // Supabase supplies these roles and Storage tables. This fixture supplies their schema only.
    await db.exec(`create schema extensions; create schema storage;
      create role anon; create role authenticated; create role service_role bypassrls;
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);`);
    await db.exec(await readFile(resolve("supabase/migrations/202610040001_initial.sql"), "utf8"));
    await db.exec(await readFile(resolve("supabase/migrations/202610050001_voyage_embeddings.sql"), "utf8"));
    const seed = await readFile(resolve("supabase/seed.sql"), "utf8");
    await db.exec(seed); await db.exec(seed);
    assert.equal((await db.query<{ total: number }>("select count(*)::int as total from orders")).rows[0].total, 5);

    const docId = randomUUID();
    const embedding = JSON.stringify([1, ...Array.from({ length: 1023 }, () => 0)]);
    const metadata = { documentId: docId, title: "Return Policy", source: "return-policy.md" };
    await db.query("insert into documents(id,name,file_path,mime_type,size_bytes) values($1,'Return Policy','test/policy.md','text/markdown',100)", [docId]);
    await db.query("insert into document_chunks(content,embedding,metadata) values('Return within 30 days',$1,$2)", [embedding, JSON.stringify(metadata)]);
    assert.equal((await db.query("select * from match_document_chunks($1, 5, '{}')", [embedding])).rows.length, 0, "Unfinished ingestion must be invisible");
    await db.query("update documents set status = 'ready' where id = $1", [docId]);
    const matches = await db.query<{ content: string; metadata: typeof metadata; similarity: number }>("select * from match_document_chunks($1, 5, '{}')", [embedding]);
    assert.equal(matches.rows[0].metadata.title, "Return Policy");
    assert.equal(matches.rows[0].metadata.documentId, docId);
    assert.ok(matches.rows[0].similarity > 0.99);
    await assert.rejects(db.query("insert into document_chunks(content,embedding,metadata) values('wrong dimensions','[1,0]',$1)", [JSON.stringify(metadata)]));
    await assert.rejects(db.query("insert into document_chunks(content,embedding,metadata) values('legacy dimensions',$1,$2)", [JSON.stringify(Array(1536).fill(1)), JSON.stringify(metadata)]), /expected 1024 dimensions/);
    await db.query("delete from documents where id=$1", [docId]);
    assert.equal((await db.query("select * from document_chunks")).rows.length, 0, "Deleting a document must delete its vectors");

    const requestId = randomUUID();
    const started = await db.query<{ result: { conversationId: string } }>("select begin_chat_request($1,null,'Where is ORD-1002?') as result", [requestId]);
    const conversationId = started.rows[0].result.conversationId;
    await assert.rejects(db.query("select begin_chat_request($1,$2,'Another question')", [randomUUID(), conversationId]), /in progress/);
    await db.query("update chat_requests set status='failed' where id=$1", [requestId]);
    await db.query("select begin_chat_request($1,$2,'Where is ORD-1002?')", [requestId, conversationId]);
    const completed = await db.query<{ result: unknown }>("select finish_chat_request($1,'It has shipped.','[]') as result", [requestId]);
    const replay = await db.query<{ result: unknown }>("select begin_chat_request($1,null,'Where is ORD-1002?') as result", [requestId]);
    assert.deepEqual(replay.rows[0].result, completed.rows[0].result);
    assert.equal((await db.query("select * from messages where request_id=$1", [requestId])).rows.length, 2, "Retry must not duplicate messages");
    await assert.rejects(db.query("select begin_chat_request($1,null,'A different message')", [requestId]), /mismatch/);

    await db.query("insert into tickets(order_number,customer_email,issue,idempotency_key) values('ORD-1003','taylor@example.com','The order arrived damaged',$1)", [requestId]);
    const ticket = await db.query<{ ticket_number: string }>("select ticket_number from tickets where idempotency_key=$1", [requestId]);
    assert.equal(ticket.rows[0].ticket_number, "SUP-1024");
    await assert.rejects(db.query("insert into tickets(customer_email,issue,idempotency_key) values('taylor@example.com','Duplicate damaged order',$1)", [requestId]), /unique/);
    await assert.rejects(db.query("insert into tickets(order_number,customer_email,issue,idempotency_key) values('ORD-9999','taylor@example.com','Unknown order damaged',$1)", [randomUUID()]), /foreign key/);
    await db.exec("set role anon");
    await assert.rejects(db.query("select * from orders"), /permission denied/);
    await assert.rejects(db.query("select begin_chat_request($1,null,'Hello')", [randomUUID()]), /permission denied/);
    await assert.rejects(db.query("select * from match_document_chunks($1,5,'{}')", [embedding]), /permission denied/);
    await db.exec("reset role");
  } finally { await db.close(); }
});

test("Voyage upgrade removes incompatible vectors while retaining originals and business history", async () => {
  const db = new PGlite({ extensions: { vector } });
  try {
    await db.exec(`create schema extensions; create schema storage;
      create role anon; create role authenticated; create role service_role bypassrls;
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);`);
    await db.exec(await readFile(resolve("supabase/migrations/202610040001_initial.sql"), "utf8"));
    await db.exec(await readFile(resolve("supabase/seed.sql"), "utf8"));
    const docId = randomUUID();
    const pendingId = randomUUID();
    await db.query("insert into documents(id,name,file_path,mime_type,size_bytes,status,chunk_count) values($1,'Policy','original/policy.md','text/markdown',100,'ready',1),($2,'Pending','original/pending.txt','text/plain',100,'processing',0)", [docId, pendingId]);
    await db.query("insert into document_chunks(content,embedding,metadata) values('Legacy policy',$1,$2)", [JSON.stringify(Array(1536).fill(1)), JSON.stringify({ documentId: docId, title: "Policy", source: "policy.md" })]);
    const requestId = randomUUID();
    await db.query("select begin_chat_request($1,null,'Where is ORD-1002?')", [requestId]);
    await db.query("select finish_chat_request($1,'Historical answer.','[]')", [requestId]);
    await db.query("insert into tickets(order_number,customer_email,issue,idempotency_key) values('ORD-1003','taylor@example.com','Historical damaged order',$1)", [requestId]);

    await db.exec(await readFile(resolve("supabase/migrations/202610050001_voyage_embeddings.sql"), "utf8"));
    const documents = await db.query<{ id: string; file_path: string; status: string; chunk_count: number; error_message: string }>("select * from documents");
    assert.equal(documents.rows.length, 2);
    assert.equal(documents.rows.find((row) => row.id === docId)?.file_path, "original/policy.md");
    for (const document of documents.rows) {
      assert.equal(document.status, "failed");
      assert.equal(document.chunk_count, 0);
      assert.match(document.error_message, /voyage-4-lite/);
    }
    const counts = await db.query<{ chunks: number; orders: number; tickets: number; conversations: number; messages: number; requests: number; buckets: number }>(`select
      (select count(*)::int from document_chunks) as chunks, (select count(*)::int from orders) as orders,
      (select count(*)::int from tickets) as tickets, (select count(*)::int from conversations) as conversations,
      (select count(*)::int from messages) as messages, (select count(*)::int from chat_requests) as requests,
      (select count(*)::int from storage.buckets) as buckets`);
    assert.deepEqual(counts.rows[0], { chunks: 0, orders: 5, tickets: 1, conversations: 1, messages: 2, requests: 1, buckets: 1 });
    const permissions = await db.query<{ anon: boolean; authenticated: boolean; service: boolean }>(`select
      has_function_privilege('anon','public.match_document_chunks(extensions.vector,integer,jsonb)','execute') as anon,
      has_function_privilege('authenticated','public.match_document_chunks(extensions.vector,integer,jsonb)','execute') as authenticated,
      has_function_privilege('service_role','public.match_document_chunks(extensions.vector,integer,jsonb)','execute') as service`);
    assert.deepEqual(permissions.rows[0], { anon: false, authenticated: false, service: true });
  } finally { await db.close(); }
});
