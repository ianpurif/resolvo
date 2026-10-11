import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

async function database() {
  const db = new PGlite({ extensions: { vector } });
  await db.exec(`create schema extensions;create schema storage;create schema auth;
    create role anon;create role authenticated;create role service_role bypassrls;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges in schema public grant all on functions to anon,authenticated,service_role;
    create table auth.users(id uuid primary key,email text);
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    grant usage on schema auth to authenticated,anon,service_role;
    grant execute on function auth.uid(),auth.jwt() to authenticated,anon,service_role;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select,insert,update,delete on storage.objects to authenticated;`);
  for (const file of [
    "202610040001_initial.sql",
    "202610050001_voyage_embeddings.sql",
    "202610050002_tenant_workspaces.sql",
    "202610090001_resumable_indexing.sql",
  ])
    await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  return db;
}
async function user(db: PGlite, id: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: id,
      role: "authenticated",
      app_metadata: { provider: "google" },
    }),
  ]);
  await db.exec("set role authenticated");
}
const vectors = JSON.stringify([
  Array.from({ length: 1024 }, (_, i) => (i === 0 ? 1 : 0)),
]);

test("durable SQL batches resume without duplication, isolate tenants and publish replacements atomically", async () => {
  const db = await database();
  try {
    const a = randomUUID(),
      b = randomUUID();
    await db.query(
      "insert into auth.users(id,email) values($1,'a@example.invalid'),($2,'b@example.invalid')",
      [a, b],
    );
    await user(db, a);
    const org = (
      await db.query<{ id: string }>(
        "select create_workspace('Company A','Other') as id",
      )
    ).rows[0].id;
    const id = randomUUID(),
      revision = randomUUID();
    const path = `organizations/${org}/documents/${id}/${revision}/knowledge.md`;
    const manifest = JSON.stringify([
      { content: "Knowledge one", token_count: 20 },
      { content: "Knowledge two", token_count: 20 },
    ]);
    const start = () =>
      db.query(
        "select start_document_index_job($1,$2,'Knowledge','manual',null,$3,'text/markdown',100,false,$4,$5)",
        [id, revision, path, "a".repeat(64), manifest],
      );
    await start();
    await start();
    assert.equal(
      (await db.query("select * from data_sources")).rows.length,
      1,
      "same save creates one source",
    );
    const lease = randomUUID();
    await db.query("select claim_document_index_batch($1,$2)", [id, lease]);
    await db.query("select checkpoint_document_index_batch($1,$2,0,$3)", [
      id,
      lease,
      vectors,
    ]);
    await db.query("select checkpoint_document_index_batch($1,$2,0,$3)", [
      id,
      lease,
      vectors,
    ]);
    assert.equal(
      (await db.query("select * from document_index_vectors")).rows.length,
      1,
    );
    assert.equal(
      (
        await db.query("select * from match_document_chunks($1,4,'{}')", [
          JSON.parse(vectors)[0].toString().replace(/^/, "[") + "]",
        ])
      ).rows.length,
      0,
      "partial vectors are not searchable",
    );
    const retryLease = randomUUID();
    await db.query("select claim_document_index_batch($1,$2)", [
      id,
      retryLease,
    ]);
    await db.query(
      "select defer_document_index_batch($1,$2,60000,'Temporary rate limit',true,false)",
      [id, retryLease],
    );
    assert.equal(
      (
        await db.query<{ completed: number }>(
          "select completed from document_index_jobs",
        )
      ).rows[0].completed,
      1,
    );
    await user(db, b);
    await db.query("select create_workspace('Company B','Other')");
    assert.equal(
      (await db.query("select * from document_index_jobs")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from document_index_vectors")).rows.length,
      0,
    );
    await assert.rejects(
      db.query("select claim_document_index_batch($1,$2)", [id, randomUUID()]),
      /Document not found/,
    );
    await assert.rejects(
      db.query("select reserve_voyage_request(100,3,10000)"),
      /permission denied/,
    );
    await user(db, a);
    // Terminal failure retains the original/checkpoint; explicit resume resets
    // retries rather than creating another document or embedding saved chunks.
    for (let attempt = 2; attempt <= 6; attempt++) {
      await db.exec("reset role");
      await db.query(
        "update document_index_jobs set next_attempt_at=now() where document_id=$1",
        [id],
      );
      await user(db, a);
      const failedLease = randomUUID();
      await db.query("select claim_document_index_batch($1,$2)", [
        id,
        failedLease,
      ]);
      await db.query(
        "select defer_document_index_batch($1,$2,60000,'Temporary limit',true,false)",
        [id, failedLease],
      );
      const state = (
        await db.query<{ status: string; attempts: number }>(
          "select status,attempts from document_index_jobs",
        )
      ).rows[0];
      assert.equal(state.attempts, attempt);
      assert.equal(state.status, attempt === 6 ? "failed" : "processing");
    }
    await db.query("select resume_document_index_job($1)", [id]);
    const lastLease = randomUUID();
    await db.query("select claim_document_index_batch($1,$2)", [id, lastLease]);
    await db.query("select checkpoint_document_index_batch($1,$2,1,$3)", [
      id,
      lastLease,
      vectors,
    ]);
    await db.query("select checkpoint_document_index_batch($1,$2,1,$3)", [
      id,
      lastLease,
      vectors,
    ]);
    assert.equal(
      (await db.query("select * from document_chunks")).rows.length,
      2,
    );
    assert.equal(
      (await db.query("select * from document_index_vectors")).rows.length,
      0,
    );
    const replacement = randomUUID(),
      replacementPath = `organizations/${org}/documents/${id}/${replacement}/knowledge.md`;
    await db.query(
      "select start_document_index_job($1,$2,'Knowledge','manual',null,$3,'text/markdown',100,true,$4,$5)",
      [
        id,
        replacement,
        replacementPath,
        "b".repeat(64),
        JSON.stringify([{ content: "Replacement knowledge", token_count: 20 }]),
      ],
    );
    assert.deepEqual(
      (
        await db.query<{ content: string }>(
          "select content from match_document_chunks($1,4,'{}')",
          [JSON.stringify(JSON.parse(vectors)[0])],
        )
      ).rows.map((r) => r.content),
      ["Knowledge one", "Knowledge two"],
    );
    const replacementLease = randomUUID();
    await db.query("select claim_document_index_batch($1,$2)", [
      id,
      replacementLease,
    ]);
    await db.query(
      "select defer_document_index_batch($1,$2,1000,'Invalid key',true,true)",
      [id, replacementLease],
    );
    const retained = (
      await db.query<{ status: string; file_path: string }>(
        "select status,file_path from documents",
      )
    ).rows[0];
    assert.equal(retained.status, "ready");
    assert.equal(retained.file_path, path);
    assert.equal(
      (await db.query("select * from document_chunks")).rows.length,
      2,
    );
    await db.query("select resume_document_index_job($1)", [id]);
    const resumedLease = randomUUID();
    await db.query("select claim_document_index_batch($1,$2)", [
      id,
      resumedLease,
    ]);
    await db.query("select checkpoint_document_index_batch($1,$2,0,$3)", [
      id,
      resumedLease,
      vectors,
    ]);
    assert.equal(
      (await db.query("select * from document_chunks")).rows.length,
      1,
    );
    assert.equal(
      (await db.query<{ file_path: string }>("select file_path from documents"))
        .rows[0].file_path,
      replacementPath,
    );
    await db.exec("reset role;set role anon");
    await assert.rejects(
      db.query("select * from document_index_jobs"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select reserve_voyage_request(100,3,10000)"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});

test("server-only SQL budget coordinates pacing, token reservations and provider cooldown", async () => {
  const db = await database();
  try {
    await db.exec("set role service_role");
    const reserve = async (tokens: number) =>
      (
        await db.query<{
          result: { granted: boolean; reservation: string; wait_ms: number };
        }>("select reserve_voyage_request($1,3,10000) as result", [tokens])
      ).rows[0].result;
    const first = await reserve(4500);
    assert.equal(first.granted, true);
    const second = await reserve(4500);
    assert.equal(second.granted, false);
    assert.ok(second.wait_ms > 19_000);
    await db.query("select settle_voyage_request($1,4000,120000)", [
      first.reservation,
    ]);
    const cooldown = await reserve(4500);
    assert.equal(cooldown.granted, false);
    assert.ok(cooldown.wait_ms > 119_000);
    await assert.rejects(reserve(10001), /Invalid provider budget/);
    await assert.rejects(
      db.query("select * from private.voyage_requests"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
