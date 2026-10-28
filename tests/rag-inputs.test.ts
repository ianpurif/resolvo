import assert from "node:assert/strict";
import test from "node:test";
import { readBoundedJson } from "../lib/bounded-json";
import { AppError } from "../lib/config";
import { createClient, type User } from "@supabase/supabase-js";
import { retrieveForPlan } from "../lib/rag/retriever";
import { planRetrieval } from "../lib/rag/query-plan";
import { randomUUID } from "node:crypto";
import type { TenantContext } from "../lib/auth";
import type { ChatMessage } from "../types";
import { runSupportAgent } from "../lib/ai/graph";

test("chat JSON rejects oversized/chunked bodies, invalid UTF-8, misleading lengths and unsupported types", async () => {
  const request = (body: string, headers: Record<string, string> = {}) => new Request("http://fixture/api/chat", { method: "POST", body, headers: { "Content-Type": "application/json", ...headers } });
  assert.deepEqual(await readBoundedJson(request('{"message":"Hi"}')), { message: "Hi" });
  await assert.rejects(readBoundedJson(request("x".repeat(24577))), (e: unknown) => e instanceof AppError && e.status === 413);
  await assert.rejects(readBoundedJson(request("{}", { "Content-Length": "24577" })), /too large/);
  await assert.rejects(readBoundedJson(request("{}", { "Content-Length": "3" })), /incomplete/);
  await assert.rejects(readBoundedJson(request("{}", { "Content-Type": "text/plain" })), /JSON/);
  await assert.rejects(readBoundedJson(new Request("http://fixture", { method: "POST", body: new Uint8Array([255]), headers: { "Content-Type": "application/json" } })), /invalid JSON/);
});
test("a cancelled retrieval makes no database/provider requests", async (t) => {
  const spy = t.mock.method(globalThis, "fetch", () => { throw new Error("No network expected"); });
  const ctx: TenantContext = { db: createClient("https://fixture.supabase.co", "sb_publishable_fixture"), user: {} as User, role: "owner",
    organization: { id: randomUUID(), name: "Fixture", industry: "Other", created_at: "" } };
  await assert.rejects(retrieveForPlan(ctx, planRetrieval([{ role: "user", content: "Who approves changes?", sources: [] }]), AbortSignal.abort()), /abort/i);
  assert.equal(spy.mock.callCount(), 0);
});
test("provider capacity exhaustion degrades to authorized lexical search instead of claiming knowledge is missing", async (t) => {
  const old = { ...process.env };
  Object.assign(process.env, { SUPABASE_URL: "https://fixture.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "fixture-service", VOYAGE_API_KEY: "fixture-voyage" });
  const organization = randomUUID(), document = randomUUID();
  const reply = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
  let searches = 0;
  let noHits = false;
  t.mock.method(globalThis, "fetch", async (input: string | Request | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    assert.equal(url.hostname, "fixture.supabase.co");
    if (url.pathname.endsWith("query_embeddings")) return reply(null);
    if (url.pathname.endsWith("reserve_voyage_request")) return reply({ granted: false, wait_ms: 90000 });
    if (url.pathname.endsWith("knowledge_passage_context")) return reply([]);
    if (url.pathname.endsWith("knowledge_source_metadata")) return reply([{ id: document, source_url: null, platform: "uploads" }]);
    assert.ok(url.pathname.endsWith("search_knowledge"));
    assert.equal(JSON.parse(String(init?.body)).p_query_embedding, null);
    searches++;
    if (noHits) return reply([]);
    return reply([{ id: randomUUID(), document_id: document, organization_id: organization, index_revision: randomUUID(), title: "Approval policy",
      content: "The department lead approves changes.", chunk_index: 0, start_offset: 0, end_offset: 36, section: null,
      similarity: null, lexical_score: 1, score: 0.02 }]);
  });
  try {
    const ctx: TenantContext = { db: createClient("https://fixture.supabase.co", "sb_publishable_fixture"), user: {} as User, role: "owner",
      organization: { id: organization, name: "Fixture", industry: "Other", created_at: "" } };
    const result = await retrieveForPlan(ctx, planRetrieval([{ role: "user", content: "Who approves changes?", sources: [] }]));
    assert.equal(result.coverage.degraded, true);
    assert.equal(result.evidence[0].source.id, document);
    assert.equal(searches, 1);
    noHits = true;
    const history: ChatMessage[] = [{ id: randomUUID(), organization_id: organization, conversation_id: randomUUID(), created_at: "", role: "user", content: "Who approves changes?", sources: [] }];
    const answer = await runSupportAgent(ctx, history, randomUUID(), () => {}, AbortSignal.timeout(10000));
    assert.deepEqual(answer.sources, []);
    assert.match(answer.content, /Semantic search is temporarily unavailable/);
    assert.match(answer.content, /does not establish that the information is missing/);
    assert.equal(searches, 2, "An empty degraded search returns uncertainty without a generation request");
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in old)) delete process.env[key];
    Object.assign(process.env, old);
  }
});
