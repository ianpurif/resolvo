import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { answerFromEvidence } from "../lib/ai/graph";
import { planRetrieval } from "../lib/rag/query-plan";
import type { ChatMessage } from "../types";

test("citation recovery is bounded, retains evidence, emits no uncited draft and never registers tools", async (t) => {
  const before = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "fixture-deepseek";
  const passage = randomUUID(), document = randomUUID();
  const history = [{ id: randomUUID(), conversation_id: randomUUID(), organization_id: randomUUID(), role: "user", sources: [], created_at: "", content: "Who approves the request?" }] as ChatMessage[];
  let calls = 0, scenario = "repaired";
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(new URL(input instanceof Request ? input.url : input).hostname, "api.deepseek.com");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.tools, undefined);
    assert.match(body.messages[0].content, /Finance approves the request/);
    const repairing = calls++ > 0;
    if (repairing) {
      assert.equal(body.response_format.type, "json_object");
      assert.equal(body.stream, false);
      assert.match(body.messages[0].content, /failed citation placement validation/);
      return new Response(JSON.stringify({ id: "fixture", object: "chat.completion", created: 0, model: "deepseek-flash", choices: [{ index: 0, finish_reason: "stop",
        message: { role: "assistant", content: JSON.stringify({ paragraphs: [{ text: "Finance approves the request.", sourceIds: scenario === "repaired" ? [passage] : [] }] }) } }] }),
      { headers: { "Content-Type": "application/json" } });
    }
    let content = `Finance approves the request.\n\nThe policy states this. [[source:${passage}]]`;
    if (scenario === "unknown") content = `Finance approves the request. [[source:${randomUUID()}]]`;
    return new Response("data: " + JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 0, model: "deepseek-flash",
      choices: [{ index: 0, delta: { content }, finish_reason: "stop" }] }) + "\n\ndata: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
  });
  const execute = (drafts: string[]) => answerFromEvidence("Synthetic workspace", history, planRetrieval(history),
    [{ citationId: passage, content: "Finance approves the request.", source: { id: document, chunkId: passage, title: "Approval policy", excerpt: "Finance approves the request." } }],
    { selectedPassages: 1, selectedDocuments: 1, availablePassages: null, availableDocuments: null, partial: false, degraded: false },
    [], (text) => drafts.push(text), AbortSignal.timeout(10000));
  try {
    const drafts: string[] = [];
    const answer = await execute(drafts);
    assert.equal(calls, 2);
    assert.equal(answer.diagnostics.citationRepairAttempts, 1);
    assert.equal(answer.content, "Finance approves the request. [1]");
    assert.ok(drafts.every((draft) => draft === "" || draft === answer.content));
    scenario = "still-uncited"; calls = 0;
    await assert.rejects(execute([]), /could not be verified/);
    assert.equal(calls, 2, "Never loop repairs indefinitely");
    scenario = "unknown"; calls = 0;
    await assert.rejects(execute([]), /could not be verified/);
    assert.equal(calls, 1, "Unknown provenance fails without a rewrite");
  } finally {
    if (before === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = before;
  }
});
