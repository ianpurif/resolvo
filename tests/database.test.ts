import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
const embedding = JSON.stringify([1, ...Array(1023).fill(0)]);
async function initialize() {
  const db = new PGlite({ extensions: { vector } });
  await db.exec(`create schema extensions;create schema storage;create schema auth;
 create role anon;create role authenticated;create role service_role bypassrls;
 alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
 alter default privileges in schema public grant all on functions to anon,authenticated,service_role;
 create table auth.users(id uuid primary key,email text);
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 grant usage on schema auth to authenticated,anon,service_role;grant execute on function auth.uid(),auth.jwt() to authenticated,anon,service_role;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;grant usage on schema storage to authenticated;
 grant select,insert,update,delete on storage.objects to authenticated;`);
  for (const file of [
    "202610040001_initial.sql",
    "202610050001_voyage_embeddings.sql",
  ])
    await db.exec(await readFile("supabase/migrations/" + file, "utf8"));
  return db;
}
async function asUser(db: PGlite, user: string, provider = "google") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: user,
      role: "authenticated",
      app_metadata: { provider },
    }),
  ]);
  await db.exec("set role authenticated");
}
async function startDocument(
  db: PGlite,
  org: string,
  name: string,
  kind = "file",
) {
  const id = randomUUID();
  const revision = randomUUID();
  const path = `organizations/${org}/documents/${id}/${revision}/knowledge.txt`;
  await db.query(
    "insert into storage.objects(bucket_id,name) values('support-documents',$1)",
    [path],
  );
  await db.query(
    "select begin_document_index($1,$2,$3,$4,null,$5,'text/plain',100,false)",
    [id, revision, name, kind, path],
  );
  return { id, revision, path };
}
async function commit(
  db: PGlite,
  doc: { id: string; revision: string; path: string },
  content: string,
) {
  return db.query(
    "select commit_document_index($1,$2,$3,$4,'Knowledge','text/plain',100,$5,null)",
    [
      doc.id,
      doc.revision,
      JSON.stringify([{ content, embedding: JSON.parse(embedding) }]),
      doc.path,
      "a".repeat(64),
    ],
  );
}

test("actual migrations enforce tenant RLS, scoped vector search, private paths, resource FKs and atomic replacement", async () => {
  const db = await initialize();
  try {
    const oldId = randomUUID();
    await db.query(
      "insert into documents(id,name,file_path,mime_type,size_bytes,status) values($1,'Historical private file','old/private.txt','text/plain',100,'ready')",
      [oldId],
    );
    await db.exec(
      "create policy historical_broad_storage on storage.objects for all to authenticated using(true) with check(true)",
    );
    await db.exec(
      await readFile(
        "supabase/migrations/202610050002_tenant_workspaces.sql",
        "utf8",
      ),
    );
    const a = randomUUID();
    const b = randomUUID();
    await db.query(
      "insert into auth.users(id,email) values($1,'a@fixture.invalid'),($2,'b@fixture.invalid')",
      [a, b],
    );
    await asUser(db, a);
    const orgA = (
      await db.query<{ id: string }>(
        "select create_workspace('Fixture hospital','Healthcare') as id",
      )
    ).rows[0].id;
    assert.equal(
      (
        await db.query<{ id: string }>(
          "select create_workspace('Another name','Other') as id",
        )
      ).rows[0].id,
      orgA,
      "Onboarding is idempotent",
    );
    assert.equal(
      (await db.query("select * from documents where id=$1", [oldId])).rows
        .length,
      0,
      "Unowned historical data is not assigned to the first user",
    );
    for (const table of [
      "organizations",
      "organization_members",
      "data_sources",
      "query_embeddings",
      "documents",
      "document_chunks",
      "messages",
      "conversations",
      "tickets",
      "chat_requests",
    ]) {
      await assert.rejects(
        db.exec(`truncate public.${table} cascade`),
        /permission denied/,
        table + " cannot bypass RLS with TRUNCATE",
      );
    }
    const docA = await startDocument(db, orgA, "Clinical workflow");
    await commit(db, docA, "Company A: clinical workflow one.");
    const requestA = randomUUID();
    const convA = (
      await db.query<{ data: { conversationId: string } }>(
        "select begin_chat_request($1,null,'Workflow question') as data",
        [requestA],
      )
    ).rows[0].data.conversationId;
    await db.query("select finish_chat_request($1,'Company A answer.','[]')", [
      requestA,
    ]);
    await db.query(
      "insert into tickets(organization_id,customer_email,issue,idempotency_key) values($1,'a@fixture.invalid','Clinical workflow issue',$2)",
      [orgA, requestA],
    );
    await asUser(db, b);
    const orgB = (
      await db.query<{ id: string }>(
        "select create_workspace('Fixture transport','Logistics') as id",
      )
    ).rows[0].id;
    const docB = await startDocument(db, orgB, "Dispatch workflow");
    await commit(db, docB, "Company B: confidential dispatch instructions.");
    const matchesB = await db.query<{ content: string }>(
      "select * from match_document_chunks($1,5,'{}')",
      [embedding],
    );
    assert.deepEqual(
      matchesB.rows.map((row) => row.content),
      ["Company B: confidential dispatch instructions."],
    );
    for (const table of [
      "documents",
      "document_chunks",
      "data_sources",
      "conversations",
      "messages",
      "tickets",
      "chat_requests",
    ]) {
      assert.equal(
        (
          await db.query(`select * from ${table} where organization_id=$1`, [
            orgA,
          ])
        ).rows.length,
        0,
        table + " hides another tenant",
      );
    }
    assert.equal(
      (
        await db.query("delete from documents where id=$1 returning id", [
          docA.id,
        ])
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.query(
        "insert into data_sources(organization_id,name,kind) values($1,'Unauthorized','manual')",
        [orgA],
      ),
      /row-level security/,
    );
    await assert.rejects(
      db.query(
        "insert into organization_members(organization_id,user_id,role) values($1,$2,'owner')",
        [orgA, b],
      ),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select begin_chat_request($1,$2,'Cross-tenant conversation')", [
        randomUUID(),
        convA,
      ]),
      /not found/,
    );
    assert.equal(
      (
        await db.query("select * from storage.objects where name=$1", [
          docA.path,
        ])
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.query(
        "insert into storage.objects(bucket_id,name) values('support-documents',$1)",
        [docA.path],
      ),
      /row-level security/,
    );
    await assert.rejects(
      db.query(
        "insert into document_chunks(organization_id,content,embedding,metadata,index_revision) values($1,'Forged reference',$2,$3,$4)",
        [
          orgB,
          embedding,
          JSON.stringify({ documentId: docA.id, organizationId: orgB }),
          docB.revision,
        ],
      ),
      /foreign key/,
    );
    await asUser(db, a);
    const matchesA = await db.query<{ content: string }>(
      "select * from match_document_chunks($1,5,'{}')",
      [embedding],
    );
    assert.deepEqual(
      matchesA.rows.map((row) => row.content),
      ["Company A: clinical workflow one."],
    );
    assert.equal(
      (
        await db.query("select * from match_document_chunks($1,5,$2)", [
          embedding,
          JSON.stringify({ organizationId: orgB }),
        ])
      ).rows.length,
      0,
    );
    const next = { ...docA, revision: randomUUID(), path: "" };
    next.path = `organizations/${orgA}/documents/${docA.id}/${next.revision}/updated.txt`;
    await db.query(
      "select begin_document_index($1,$2,'Updated workflow','file',null,$3,'text/plain',100,true)",
      [next.id, next.revision, next.path],
    );
    assert.deepEqual(
      (
        await db.query<{ content: string }>(
          "select * from match_document_chunks($1,4,'{}')",
          [embedding],
        )
      ).rows.map((row) => row.content),
      ["Company A: clinical workflow one."],
      "The previous revision stays searchable during indexing",
    );
    await commit(db, next, "Company A: updated clinical workflow two.");
    const updated = await db.query<{ content: string }>(
      "select * from match_document_chunks($1,4,'{}')",
      [embedding],
    );
    assert.deepEqual(
      updated.rows.map((row) => row.content),
      ["Company A: updated clinical workflow two."],
    );
    assert.equal(
      (
        await db.query("select * from document_chunks where document_id=$1", [
          docA.id,
        ])
      ).rows.length,
      1,
      "No stale duplicate vectors",
    );
    await assert.rejects(
      commit(db, docA, "Stale concurrent result."),
      /conflict/,
    );
    const failedRevision = randomUUID();
    const failedPath = `organizations/${orgA}/documents/${docA.id}/${failedRevision}/failed.txt`;
    await db.query(
      "select begin_document_index($1,$2,'Failed replacement','file',null,$3,'text/plain',100,true)",
      [docA.id, failedRevision, failedPath],
    );
    await assert.rejects(
      db.query(
        "select commit_document_index($1,$2,$3,$4,'Invalid','text/plain',100,$5,null)",
        [
          docA.id,
          failedRevision,
          JSON.stringify([
            { content: "Wrong dimensions", embedding: Array(1536).fill(1) },
          ]),
          failedPath,
          "b".repeat(64),
        ],
      ),
      /1024 dimensions/,
    );
    await db.query(
      "select fail_document_index($1,$2,'Provider temporarily unavailable')",
      [docA.id, failedRevision],
    );
    assert.deepEqual(
      (
        await db.query<{ content: string }>(
          "select * from match_document_chunks($1,4,'{}')",
          [embedding],
        )
      ).rows.map((row) => row.content),
      ["Company A: updated clinical workflow two."],
      "Failed replacement retains the last successful version",
    );
    const replay = await db.query<{ result: { message: { content: string } } }>(
      "select begin_chat_request($1,null,'Workflow question') as result",
      [requestA],
    );
    assert.equal(replay.rows[0].result.message.content, "Company A answer.");
    await db.query(
      "insert into query_embeddings(organization_id,query_hash,model,embedding,created_at) select $1,lpad(n::text,64,'0'),'voyage-4-lite',$2,now()-n*interval '1 second' from generate_series(1,513) n",
      [orgA, embedding],
    );
    await db.query("select cache_query_embedding($1,$2)", [
      "f".repeat(64),
      embedding,
    ]);
    assert.equal(
      (
        await db.query<{ count: number }>(
          "select count(*)::int as count from query_embeddings",
        )
      ).rows[0].count,
      512,
      "Query cache stays bounded per tenant",
    );
    await asUser(db, b);
    assert.equal(
      (
        await db.query(
          "select * from query_embeddings where organization_id=$1",
          [orgA],
        )
      ).rows.length,
      0,
      "Query vectors are tenant private",
    );
    await asUser(db, a, "email");
    assert.equal(
      (await db.query("select * from documents")).rows.length,
      0,
      "Non-Google identities have no tenant access",
    );
    await assert.rejects(
      db.query("select create_workspace('Unauthorized provider','Other')"),
      /Authentication/,
    );
    await db.exec("reset role;set role anon");
    await assert.rejects(
      db.query("select * from documents"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select * from match_document_chunks($1,4,'{}')", [embedding]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
