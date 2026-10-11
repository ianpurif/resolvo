import assert from "node:assert/strict";
import test from "node:test";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { embeddings } from "../lib/rag/embeddings";
import {
  tokenCounts,
  selectEmbeddingBatch,
  embeddingBackoff,
  retryAfterMilliseconds,
  retryableEmbeddingFailure,
} from "../lib/rag/embedding-policy";

test("missing Voyage credentials fail before any provider request", () => {
  const previous = process.env.VOYAGE_API_KEY;
  process.env.VOYAGE_API_KEY = " ";
  try {
    assert.throws(() => embeddings("document"), /Connect Voyage AI/);
    assert.throws(() => embeddings("query"), /Connect Voyage AI/);
  } finally {
    if (previous === undefined) delete process.env.VOYAGE_API_KEY;
    else process.env.VOYAGE_API_KEY = previous;
  }
});

test("official tokenizer plans bounded batches for large English, Unicode and code sources", async () => {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1200,
    chunkOverlap: 200,
  });
  for (const text of [
    "Managers approve changes and support answers questions. "
      .repeat(6000)
      .slice(0, 250000),
    "公司知识应当可以可靠地索引和检索。🌏 ".repeat(2000),
    "function respond(input: string) { return input.trim(); }\n".repeat(700),
  ]) {
    const texts = await splitter.splitText(text);
    const counts = await tokenCounts(texts);
    const chunks = texts.map((content, i) => ({
      content,
      token_count: counts[i],
    }));
    let offset = 0;
    while (offset < chunks.length) {
      const batch = selectEmbeddingBatch(chunks.slice(offset), 4500);
      assert.ok(batch.chunks.length > 0 && batch.chunks.length <= 128);
      assert.ok(batch.tokens <= 4500);
      offset += batch.chunks.length;
    }
    assert.equal(offset, chunks.length, "all chunks appear exactly once");
  }
});

test("exponential backoff respects provider hints, dates and deterministic jitter", () => {
  assert.equal(embeddingBackoff(0, 429, 0, 0), 60000);
  assert.equal(embeddingBackoff(1, 429, 0, 0), 120000);
  assert.equal(embeddingBackoff(2, 429, 0, 0), 240000);
  assert.equal(embeddingBackoff(3, 429, 0, 0), 300000);
  assert.equal(embeddingBackoff(1, 500, 0, 0.5), 2500);
  assert.equal(embeddingBackoff(0, 429, 900000, 0), 900000);
  assert.equal(
    retryAfterMilliseconds(new Headers({ "Retry-After": "90" })),
    90000,
  );
  assert.equal(
    retryAfterMilliseconds(new Headers({ "retry-after-ms": "1234" })),
    1234,
  );
  const now = Date.parse("2026-10-09T00:00:00Z");
  assert.equal(
    retryAfterMilliseconds(
      new Headers({ "Retry-After": "Fri, 09 Oct 2026 00:01:00 GMT" }),
      now,
    ),
    60000,
  );
});

test("billing-related temporary limits retry, invalid keys and depleted credits do not", () => {
  assert.equal(
    retryableEmbeddingFailure(
      429,
      "No payment method; reduced rate limits of 3 RPM and 10K TPM",
    ),
    true,
  );
  assert.equal(
    retryableEmbeddingFailure(
      429,
      "Rate limit reached; will reset at the next minute",
    ),
    true,
  );
  for (const status of [400, 401, 403, 422])
    assert.equal(retryableEmbeddingFailure(status), false);
  assert.equal(
    retryableEmbeddingFailure(429, "Insufficient_quota: out of credits"),
    false,
  );
  assert.equal(retryableEmbeddingFailure(503), true);
  assert.equal(retryableEmbeddingFailure(undefined), true);
});
