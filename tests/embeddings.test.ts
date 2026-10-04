import assert from "node:assert/strict";
import test from "node:test";
import type { CreateVoyageEmbeddingRequest } from "@langchain/mongodb";
import { embeddings } from "../lib/rag/embeddings";
import { ingestDocument, reindexDocument } from "../lib/rag/ingest";
import { retrieveKnowledge } from "../lib/rag/retriever";
import { configuration } from "../lib/config";
import type { KnowledgeDocument } from "../types";

test("actual ingestion, re-indexing and retrieval use Voyage document/query embeddings and Supabase (mocked HTTP)", async (t) => {
  const previous = { voyage: process.env.VOYAGE_API_KEY, url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.VOYAGE_API_KEY = "fixture-voyage-key";
  process.env.SUPABASE_URL = "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-supabase-key";
  const calls: CreateVoyageEmbeddingRequest[] = [];
  let document: KnowledgeDocument;
  let chunks: { id: string; content: string; embedding: number[]; metadata: { documentId: string; title: string; source: string } }[] = [];
  let uploads = 0;
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const method = init?.method ?? "GET";
    if (url.origin === "https://api.voyageai.com") {
      assert.equal(url.pathname, "/v1/embeddings");
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer fixture-voyage-key");
      const request = JSON.parse(String(init?.body)) as CreateVoyageEmbeddingRequest;
      calls.push(request);
      const texts = Array.isArray(request.input) ? request.input : [request.input];
      return json({ data: texts.map((_, index) => ({ index, embedding: [1, ...Array(1023).fill(0)] })) });
    }
    assert.equal(url.origin, "https://fixture.supabase.co", "Unexpected provider call");
    if (url.pathname.startsWith("/storage/v1/object/") && method === "POST") {
      uploads++;
      return json({ Key: url.pathname });
    }
    if (url.pathname === "/rest/v1/documents") {
      const body = JSON.parse(String(init?.body)) as Partial<KnowledgeDocument>;
      if (method === "POST") {
        document = { ...body, status: "processing", chunk_count: 0, error_message: null, created_at: new Date().toISOString() } as KnowledgeDocument;
      } else {
        assert.equal(method, "PATCH");
        assert.equal(url.searchParams.get("id"), `eq.${document.id}`);
        Object.assign(document, body);
      }
      return json(document);
    }
    if (url.pathname === "/rest/v1/document_chunks") {
      if (method === "DELETE") { chunks = []; return new Response(null, { status: 204 }); }
      assert.equal(method, "POST");
      chunks = JSON.parse(String(init?.body)) as typeof chunks;
      assert.ok(chunks.every((chunk) => chunk.embedding.length === 1024));
      return json(chunks);
    }
    assert.equal(url.pathname, "/rest/v1/rpc/match_document_chunks");
    const request = JSON.parse(String(init?.body)) as { query_embedding: number[]; match_count: number };
    assert.equal(request.query_embedding.length, 1024);
    assert.equal(request.match_count, 5);
    return json(chunks.map((chunk) => ({ ...chunk, similarity: 1 })));
  });
  try {
    const file = new File(["# Return Policy\n\nReturns are allowed within 30 days after delivery."], "return-policy.md", { type: "text/markdown" });
    const indexed = await ingestDocument(file);
    assert.equal(indexed.status, "ready");
    assert.equal(indexed.chunk_count, 1);
    const results = await retrieveKnowledge("How long do I have to return my order?");
    assert.equal(results[0].source.id, indexed.id);
    assert.equal(results[0].source.title, "Return Policy");
    document!.status = "failed";
    const rebuilt = await reindexDocument(document!, file);
    assert.equal(rebuilt.id, indexed.id);
    assert.equal(rebuilt.file_path, indexed.file_path);
    assert.equal(rebuilt.status, "ready");
    assert.equal(rebuilt.error_message, null);
    assert.equal(uploads, 1, "Re-indexing retains the original Storage file");
    assert.deepEqual(calls.map((call) => call.input_type), ["document", "query", "document"]);
    for (const call of calls) {
      assert.equal(call.model, "voyage-4-lite");
      assert.equal(call.output_dimension, 1024);
      assert.equal(call.output_dtype, "float");
      assert.equal(call.truncation, false);
    }
  } finally {
    for (const [name, value] of Object.entries({ VOYAGE_API_KEY: previous.voyage, SUPABASE_URL: previous.url, SUPABASE_SERVICE_ROLE_KEY: previous.key })) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

test("missing Voyage credentials fail closed before making embedding requests", (t) => {
  const previous = process.env.VOYAGE_API_KEY;
  process.env.VOYAGE_API_KEY = " ";
  const fetch = t.mock.method(globalThis, "fetch", () => { throw new Error("Unexpected network request"); });
  try {
    assert.ok(configuration().missing.includes("VOYAGE_API_KEY"));
    assert.throws(() => embeddings("document"), /Connect Voyage AI/);
    assert.throws(() => embeddings("query"), /Connect Voyage AI/);
    assert.equal(fetch.mock.callCount(), 0);
  } finally {
    if (previous === undefined) delete process.env.VOYAGE_API_KEY; else process.env.VOYAGE_API_KEY = previous;
  }
});
