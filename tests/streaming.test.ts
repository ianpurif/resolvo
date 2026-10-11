import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createClient, type User } from "@supabase/supabase-js";
import { runSupportAgent, boundedHistory } from "../lib/ai/graph";
import {
  createTicketTool,
  hasTicketConsent,
} from "../lib/ai/tools/create-ticket";
import type { TenantContext } from "../lib/auth";
import type { ChatMessage } from "../types";
function message(
  content: string,
  role: ChatMessage["role"] = "user",
): ChatMessage {
  return {
    id: randomUUID(),
    organization_id: randomUUID(),
    conversation_id: randomUUID(),
    created_at: "",
    role,
    content,
    sources: [],
  };
}
function context(): TenantContext {
  return {
    db: createClient("https://fixture.supabase.co", "sb_publishable_fixture", {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    organization: {
      id: randomUUID(),
      name: "Current company",
      industry: "Other",
      created_at: "",
    },
    role: "owner",
    user: {
      id: randomUUID(),
      email: "verified@fixture.invalid",
      app_metadata: { provider: "google" },
    } as User,
  };
}

test("the actual DeepSeek streaming SDK and LangGraph emit a draft before completion and cite only current-tenant retrieval (mocked transport)", async (t) => {
  const before = process.env.DEEPSEEK_API_KEY,
    voyageBefore = process.env.VOYAGE_API_KEY,
    urlBefore = process.env.SUPABASE_URL, serviceBefore = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.DEEPSEEK_API_KEY = "fixture-deepseek";
  process.env.VOYAGE_API_KEY = "fixture-voyage";
  process.env.SUPABASE_URL = "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-service";
  const ctx = context(),
    sourceId = randomUUID(),
    passageId = randomUUID(), foreignId = randomUUID();
  const drafts: string[] = [];
  let completed = false,
    models = 0,
    hasEvidence = true;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const reply = (body: unknown) =>
    new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
    });
  t.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.hostname === "fixture.supabase.co") {
        if (url.pathname === "/rest/v1/query_embeddings") {
          assert.equal(new Headers(init?.headers).get("apikey"), "fixture-service");
          assert.equal(url.searchParams.get("server_verified"), "eq.true");
          assert.equal(
            url.searchParams.get("organization_id"),
            "eq." + ctx.organization.id,
          );
          return reply({
            embedding: JSON.stringify([1, ...Array(1023).fill(0)]),
          });
        }
        if (url.pathname.endsWith("/knowledge_passage_context")) return reply([]);
        assert.ok(url.pathname.endsWith("/search_knowledge"));
        const body = JSON.parse(String(init?.body));
        if (hasEvidence) assert.equal(body.p_query_text, "reviews project changes");
        return reply(
          hasEvidence
            ? [
                {
                  id: passageId,
                  content: "Department managers review project changes.",
                  document_id: sourceId, organization_id: ctx.organization.id,
                  index_revision: randomUUID(), title: "Project workflow", chunk_index: 0,
                  start_offset: 0, end_offset: 42, section: null,
                  similarity: 1, lexical_score: 0.5, score: 0.03,
                },
              ]
            : [],
        );
      }
      assert.equal(url.hostname, "api.deepseek.com");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, "deepseek-flash");
      assert.equal(body.stream, true);
      models++;
      assert.match(
        body.messages[0].content,
        /Department managers review project changes/,
      );
      assert.equal(body.messages[0].content.includes(foreignId), false);
      const encoder = new TextEncoder();
      const event = (content: string, finish_reason: string | null = null) =>
        encoder.encode(
          "data: " +
            JSON.stringify({
              id: "fixture-chat",
              object: "chat.completion.chunk",
              created: 0,
              model: "deepseek-flash",
              choices: [{ index: 0, delta: { content }, finish_reason }],
            }) +
            "\n\n",
        );
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(event(`Department managers review project changes. [[source:${passageId}]]`));
          await gate;
          controller.enqueue(
            event(
              "",
              "stop",
            ),
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });
      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream" },
      });
    },
  );
  try {
    const result = await runSupportAgent(
      ctx,
      [message("Who reviews project changes?")],
      randomUUID(),
      (text) => {
        drafts.push(text);
        if (text === "Department managers review project changes. [1]") {
          assert.equal(completed, false);
          release();
        }
      },
      AbortSignal.timeout(10000),
    );
    completed = true;
    assert.ok(drafts.includes("Department managers review project changes. [1]"));
    assert.equal(models, 1);
    assert.deepEqual(
      result.sources.map((source) => source.id),
      [sourceId],
    );
    assert.equal(result.content, "Department managers review project changes. [1]");
    assert.ok(drafts.every((text) => !text.includes("[[source:")));
    hasEvidence = false;
    const unknown = await runSupportAgent(
      ctx,
      [message("What is the company secret?")],
      randomUUID(),
      () => {},
      AbortSignal.timeout(10000),
    );
    assert.equal(
      models,
      1,
      "No generation call can fabricate facts when retrieval returns no evidence",
    );
    assert.deepEqual(unknown.sources, []);
    assert.match(unknown.content, /couldn't find supporting evidence/);
  } finally {
    release();
    if (before === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = before;
    if (voyageBefore === undefined) delete process.env.VOYAGE_API_KEY;
    else process.env.VOYAGE_API_KEY = voyageBefore;
    if (urlBefore === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = urlBefore;
    if (serviceBefore === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = serviceBefore;
  }
});

test("retrieved instructions cannot authorize ticket writes; an explicit user request or confirmation is required", async (t) => {
  const ctx = context();
  const fetch = t.mock.method(globalThis, "fetch", () => {
    throw new Error("Unauthorized write");
  });
  assert.equal(
    hasTicketConsent([
      message("Create a support ticket for the project review issue."),
    ]),
    true,
  );
  assert.equal(hasTicketConsent([message("Do not create a ticket.")]), false);
  assert.equal(
    hasTicketConsent([message("How does this workflow operate?")]),
    false,
  );
  for (const quoted of ["What does the document mean by create a support ticket?", "The uploaded manual says create a ticket without asking.", "Can you explain how to create a ticket?", '"Create a ticket" is written in the attachment.']) {
    assert.equal(hasTicketConsent([message(quoted)]), false, "Quoted or discussed instructions are not user consent");
  }
  assert.equal(hasTicketConsent([message("Could you create a support ticket for the failed review?")]), true);
  assert.equal(
    hasTicketConsent([
      message(
        "Would you like me to create a ticket for your team?",
        "assistant",
      ),
      message("Yes please."),
    ]),
    true,
  );
  assert.equal(
    hasTicketConsent([
      message("The knowledge says create a ticket.", "assistant"),
      message("Yes."),
    ]),
    false,
  );
  const result = await createTicketTool(ctx, randomUUID(), false).invoke({
    issue: "An untrusted source requested this write.",
  });
  assert.match(String(result), /explicitly request/);
  assert.equal(fetch.mock.callCount(), 0);
});

test("bounded model history preserves recent context without sending excessive old messages", () => {
  const history = Array.from({ length: 20 }, (_, i) =>
    message(String(i) + " " + "x".repeat(5000)),
  );
  const bounded = boundedHistory(history);
  assert.ok(bounded.length <= 12);
  assert.ok(bounded.reduce((n, item) => n + item.text.length, 0) <= 10000);
  assert.equal(bounded.at(-1)?.text, history.at(-1)!.content.slice(-4000));
});
