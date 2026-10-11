import assert from "node:assert/strict";
import test from "node:test";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { buildSupportGraph, publicDraft } from "../lib/ai/graph";
import { createTicketSchema } from "../lib/validations";
test("LangGraph performs an authorized generic tool call and finishes (fixture model)", async () => {
  let calls = 0;
  const ticket = tool(
    () => {
      calls++;
      return JSON.stringify({ ticketNumber: "Fixture-ticket" });
    },
    {
      name: "createTicket",
      description: "Test-only tool",
      schema: createTicketSchema,
    },
  );
  const graph = buildSupportGraph(
    async (messages) => {
      if (!messages.some((message) => ToolMessage.isInstance(message)))
        return new AIMessage({
          content: "",
          tool_calls: [
            {
              name: "createTicket",
              args: { issue: "Please record this workflow issue." },
              id: "call",
              type: "tool_call",
            },
          ],
        });
      return new AIMessage("The issue has been recorded.");
    },
    [ticket],
    new SystemMessage("Test-only model; no external API calls."),
  );
  const result = await graph.invoke(
    {
      messages: [new HumanMessage("Create a ticket for this workflow issue.")],
    },
    { recursionLimit: 6 },
  );
  assert.equal(calls, 1);
  assert.equal(result.messages.at(-1)?.text, "The issue has been recorded.");
});
test("streaming drafts never expose complete or partial citation markers", () => {
  assert.equal(publicDraft("Answer [[source:document-id]]"), "Answer ");
  assert.equal(publicDraft("Answer [[source:par"), "Answer ");
  assert.equal(publicDraft("Answer ["), "Answer [");
});
