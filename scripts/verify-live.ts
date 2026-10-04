import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { configuration } from "../lib/config";
import { runSupportAgent } from "../lib/ai/graph";
import { database, checkDatabaseError } from "../lib/supabase/server";
import type { ChatMessage } from "../types";

// Uses real providers. Scenario 4 intentionally creates ONE real demo ticket.
async function main() {
  const config = configuration();
  if (!config.ready) throw new Error(`Configure these variables first: ${config.missing.join(", ")}`);
  const cases = [
    { question: "What is your return policy?", required: ["searchKnowledge"], citation: true },
    { question: "Where is ORD-1002?", required: ["getOrder"], citation: false },
    { question: "Can I return ORD-1025?", required: ["getOrder", "searchKnowledge"], citation: true },
    { question: "My order ORD-1003 arrived damaged. Create a ticket.", required: ["getOrder", "createTicket"], citation: false },
    { question: "What is your lunar delivery insurance policy?", required: ["searchKnowledge"], citation: false },
  ];
  for (const [index, scenario] of cases.entries()) {
    const used = new Set<string>();
    const requestId = randomUUID();
    const message: ChatMessage = { id: randomUUID(), conversation_id: randomUUID(), role: "user", content: scenario.question, sources: [], created_at: new Date().toISOString() };
    const result = await runSupportAgent([message], requestId, [{ handleToolStart(_tool, _input, _id, _parent, _tags, _metadata, name) { if (name) used.add(name); } }]);
    for (const name of scenario.required) assert.ok(used.has(name), `Scenario ${index + 1} did not call ${name}`);
    if (scenario.citation) assert.ok(result.sources.length > 0, `Scenario ${index + 1} returned no citation`);
    if (index === 1) assert.match(result.content, /NS-784109235/, "Expected seeded tracking number");
    if (index === 2) assert.match(result.content, /30|thirty/i, "Expected retrieved return window");
    if (index === 3) {
      const ticket = await database().from("tickets").select("ticket_number,order_number").eq("idempotency_key", requestId).single();
      checkDatabaseError(ticket.error, "verify ticket persistence");
      assert.equal(ticket.data?.order_number, "ORD-1003");
      assert.ok(result.content.includes(ticket.data!.ticket_number), "Answer must confirm the persisted ticket number");
    }
    if (index === 4) { assert.equal(result.sources.length, 0, "Unknown policy must not have a fabricated citation"); assert.match(result.content, /couldn.t|cannot|can.t|not (?:find|found|available)|don.t have|no (?:information|specific)/i); }
    console.log(`PASS scenario ${index + 1}: ${[...used].join(" + ")}`);
    console.log(result.content);
  }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Live verification failed."); process.exitCode = 1; });
