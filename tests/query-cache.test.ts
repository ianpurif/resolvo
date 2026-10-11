import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient, type User } from "@supabase/supabase-js";
import { tenantDatabase, asUser } from "./helpers/database";
import { readQueryEmbedding, storeQueryEmbedding } from "../lib/rag/query-cache";
import type { TenantContext } from "../lib/auth";

test("members and owners cannot poison or inspect the server query cache; trusted vectors remain tenant scoped and bounded", async () => {
  const db = await tenantDatabase("202610110002_grounded_hybrid_retrieval.sql");
  try {
    const owner = randomUUID(), member = randomUUID(), otherOwner = randomUUID();
    await db.query("insert into auth.users(id) values($1),($2),($3)", [owner, member, otherOwner]);
    await asUser(db, owner);
    const orgA = (await db.query<{ id: string }>("select create_workspace('Cache isolation A','Other') as id")).rows[0].id;
    await asUser(db, otherOwner);
    const orgB = (await db.query<{ id: string }>("select create_workspace('Cache isolation B','Other') as id")).rows[0].id;
    await db.exec("reset role");
    await db.query("insert into organization_members(organization_id,user_id,role) values($1,$2,'member')", [orgA, member]);
    const first = JSON.stringify([1, ...Array(1023).fill(0)]), second = JSON.stringify([0, 1, ...Array(1022).fill(0)]), hash = "a".repeat(64);
    await asUser(db, owner);
    await db.query("select cache_query_embedding($1,$2)", [hash, first]);
    await asUser(db, member);
    await db.query("select cache_query_embedding($1,$2)", [hash, second]);
    await db.query("update query_embeddings set created_at=now()+interval '1 day' where query_hash=$1", [hash]);
    assert.equal((await db.query<{ embedding: string }>("select embedding::text from query_embeddings where query_hash=$1", [hash])).rows[0].embedding, second, "Reproduces member overwriting another user's cached query");
    await db.exec("reset role");
    await db.exec(await readFile("supabase/migrations/202610110003_server_only_query_cache.sql", "utf8"));
    assert.equal((await db.query("select * from query_embeddings where server_verified")).rows.length, 0);
    await db.exec("set role service_role");
    await db.query("select store_query_embedding($1,$2,$3)", [orgA, hash, first]);
    await db.query("select store_query_embedding($1,$2,$3)", [orgB, hash, second]);
    for (const id of [owner, member, otherOwner]) {
      await asUser(db, id);
      for (const sql of ["select * from query_embeddings", "delete from query_embeddings", "update query_embeddings set server_verified=true"]) await assert.rejects(db.query(sql), /permission denied/);
      await assert.rejects(db.query("select cache_query_embedding($1,$2)", [hash, second]), /permission denied/);
      await assert.rejects(db.query("select store_query_embedding($1,$2,$3)", [orgA, hash, second]), /permission denied/);
      await assert.rejects(db.query("insert into query_embeddings(organization_id,query_hash,model,embedding,server_verified) values($1,$2,'voyage-4-lite',$3,true)", [orgA, hash, second]), /permission denied/);
    }
    await db.exec("reset role;set role anon");
    await assert.rejects(db.query("select store_query_embedding($1,$2,$3)", [orgA, hash, second]), /permission denied/);
    await db.exec("reset role;set role service_role");
    for (const [org, expected] of [[orgA, first], [orgB, second]]) {
      const row = (await db.query<{ embedding: string; server_verified: boolean }>("select embedding::text,server_verified from query_embeddings where organization_id=$1 and query_hash=$2", [org, hash])).rows[0];
      assert.equal(row.embedding, expected);
      assert.equal(row.server_verified, true);
    }
    for (const [org, key, value] of [[orgA, "x".repeat(64), first], [randomUUID(), hash, first], [orgA, hash, JSON.stringify(Array(1024).fill(0))], [orgA, hash, "[1,2]"]])
      await assert.rejects(db.query("select store_query_embedding($1,$2,$3)", [org, key, value]), /Invalid|dimensions/);
    await db.query("insert into query_embeddings(organization_id,query_hash,model,embedding,created_at,server_verified) select $1,lpad(n::text,64,'0'),'voyage-4-lite',$2,now()-n*interval '1 second',true from generate_series(1,513) n", [orgA, first]);
    await db.query("insert into query_embeddings(organization_id,query_hash,model,embedding,created_at) values($1,$2,'voyage-4-lite',$3,now()+interval '1 day'),($1,$4,'voyage-4-lite',$3,now()-interval '8 days')", [orgA, "c".repeat(64), second, "d".repeat(64)]);
    await db.query("select store_query_embedding($1,$2,$3)", [orgA, "f".repeat(64), first]);
    const counts = (await db.query<{ verified: number; expired: number }>("select count(*) filter(where server_verified)::int as verified,count(*) filter(where created_at<now()-interval '7 days')::int as expired from query_embeddings where organization_id=$1", [orgA])).rows[0];
    assert.deepEqual(counts, { verified: 512, expired: 0 });
    assert.equal((await db.query("select * from query_embeddings where organization_id=$1 and query_hash=$2 and server_verified", [orgA, "f".repeat(64)])).rows.length, 1);
    assert.equal((await db.query("select * from query_embeddings where organization_id=$1", [orgB])).rows.length, 1);
  } finally { await db.close(); }
});

test("the privileged cache transport uses the authenticated server organization, verified rows and expiry filters", async (t) => {
  const previous = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  Object.assign(process.env, { SUPABASE_URL: "https://fixture.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "fixture-service" });
  const org = randomUUID(), vector = [1, ...Array(1023).fill(0)], hash = "b".repeat(64);
  const context: TenantContext = { db: createClient("https://fixture.supabase.co", "fixture-public"), user: {} as User, role: "member",
    organization: { id: org, name: "Fixture", industry: "Other", created_at: "" } };
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    assert.equal(new Headers(init?.headers).get("apikey"), "fixture-service");
    calls.push(url.pathname);
    if (url.pathname.endsWith("query_embeddings")) {
      assert.equal(url.searchParams.get("organization_id"), "eq." + org);
      assert.equal(url.searchParams.get("query_hash"), "eq." + hash);
      assert.equal(url.searchParams.get("server_verified"), "eq.true");
      assert.match(url.searchParams.get("created_at")!, /^gt\./);
      return new Response(JSON.stringify({ embedding: JSON.stringify(vector) }), { headers: { "Content-Type": "application/json" } });
    }
    assert.ok(url.pathname.endsWith("store_query_embedding"));
    assert.deepEqual(JSON.parse(String(init?.body)), { p_organization_id: org, p_hash: hash, p_embedding: vector });
    return new Response("null", { headers: { "Content-Type": "application/json" } });
  });
  try {
    assert.deepEqual(await readQueryEmbedding(context, hash, AbortSignal.timeout(5000)), vector);
    await storeQueryEmbedding(context, hash, vector, AbortSignal.timeout(5000));
    await assert.rejects(storeQueryEmbedding(context, hash, Array(1024).fill(0), AbortSignal.timeout(5000)), /Invalid query/);
    assert.equal(calls.length, 2);
  } finally {
    if (previous.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.key;
  }
});
