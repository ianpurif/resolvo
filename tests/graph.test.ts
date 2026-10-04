import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { buildSupportGraph } from "../lib/ai/graph";
import { searchKnowledgeTool } from "../lib/ai/tools/search-knowledge";
import { getOrderTool } from "../lib/ai/tools/get-order";
import { createTicketTool } from "../lib/ai/tools/create-ticket";
import { getOrderSchema, searchKnowledgeSchema, createTicketSchema } from "../lib/validations";

test("production tools have exactly the requested names", () => {
  const orders = new Map();
  const tools = [searchKnowledgeTool(new Map()), getOrderTool(orders), createTicketTool(randomUUID(), orders)];
  assert.deepEqual(tools.map((item) => item.name), ["searchKnowledge", "getOrder", "createTicket"]);
});

test("ticket tool asks for prerequisites instead of inventing an order or contact", async () => {
  const ticket = createTicketTool(randomUUID(), new Map());
  const unverified = await ticket.invoke({ orderNumber: "ORD-1003", issue: "The order arrived damaged" });
  assert.match(String(unverified), /verify this order first/);
  const noContact = await ticket.invoke({ issue: "Customer needs help with a damaged item" });
  assert.match(String(noContact), /email address/);
});

test("real LangGraph loops through multiple tools and stops on the final answer (fixture model)", async () => {
  const called: string[] = [];
  const tools = [
    tool(() => { called.push("getOrder"); return "Delivered 12 days ago"; }, { name: "getOrder", description: "Fixture order", schema: getOrderSchema }),
    tool(() => { called.push("searchKnowledge"); return "Returns within 30 days"; }, { name: "searchKnowledge", description: "Fixture retrieval", schema: searchKnowledgeSchema }),
    tool(() => { called.push("createTicket"); return "SUP-1024"; }, { name: "createTicket", description: "Fixture write", schema: createTicketSchema }),
  ];
  let turn = 0;
  const graph = buildSupportGraph(async (messages) => {
    const observations = messages.filter((message) => ToolMessage.isInstance(message));
    if (turn++ === 0) return new AIMessage({ content: "", tool_calls: [{ name: "getOrder", args: { orderNumber: "ORD-1025" }, id: "call-1", type: "tool_call" }, { name: "searchKnowledge", args: { query: "return policy" }, id: "call-2", type: "tool_call" }] });
    assert.equal(observations.length, turn === 2 ? 2 : 3);
    if (turn === 2) return new AIMessage({ content: "", tool_calls: [{ name: "createTicket", args: { orderNumber: "ORD-1025", issue: "Customer requested a return" }, id: "call-3", type: "tool_call" }] });
    return new AIMessage("Your return request is recorded as SUP-1024.");
  }, tools, new SystemMessage("Fixture system message"));
  const result = await graph.invoke({ messages: [new HumanMessage("Request a return for ORD-1025 and create a ticket.")] }, { recursionLimit: 12 });
  assert.deepEqual(called, ["getOrder", "searchKnowledge", "createTicket"]);
  assert.equal(result.messages.at(-1)?.text, "Your return request is recorded as SUP-1024.");
});
