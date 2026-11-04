import assert from "node:assert/strict";
import test from "node:test";
import { UPLOAD_SIZE_ERROR } from "../lib/knowledge-limits";
import { readKnowledgeDocument } from "../lib/knowledge-response";

const fallback = "Retry without changing the source.";

test("a platform upload limit gives the file size remedy even without an app response", async () => {
  await assert.rejects(
    readKnowledgeDocument(new Response("FUNCTION_PAYLOAD_TOO_LARGE", { status: 413 }), fallback),
    { message: UPLOAD_SIZE_ERROR },
  );
});

test("source-specific errors survive, and unconfirmed saves are never shown as successful", async () => {
  const message = "PDF processing is temporarily unavailable. Upload a TXT version.";
  await assert.rejects(
    readKnowledgeDocument(Response.json({ error: message }, { status: 503 }), fallback),
    { message },
  );
  for (const response of [new Response("Gateway timeout", { status: 504 }), Response.json({})])
    await assert.rejects(readKnowledgeDocument(response, fallback), { message: fallback });
});
