import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { planRetrieval } from "../lib/rag/query-plan";
import { splitKnowledge } from "../lib/rag/chunks";
import { cachedQueryVector, queryEmbeddingHash } from "../lib/rag/retriever";
import { citationMap, groundedDraft, resolveCitations, inspectCitationGrounding, parseCitationRepair } from "../lib/ai/citations";
import { delimitedKnowledge, jsonKnowledge } from "../lib/rag/structured";
import type { Source } from "../types";

const user = (content: string) => ({ role: "user" as const, content, sources: [] });
const assistant = (content: string, sources: Source[] = []) => ({ role: "assistant" as const, content, sources });

test("independent topics do not concatenate previous questions or reuse old source preferences", () => {
  const prior = { id: randomUUID(), title: "Device maintenance", excerpt: "Inspect each week." };
  const history = [user("How often are devices inspected?"), assistant("Each week.", [prior]), user("Who approves travel expenses?")];
  const plan = planRetrieval(history);
  assert.equal(plan.query, "Who approves travel expenses?");
  assert.equal(plan.historyStart, 2);
  assert.equal(plan.followUp, false);
  assert.deepEqual(plan.preferredDocuments, []);
  assert.equal(planRetrieval([...history, user("What are the Team plan storage options and their prices?")]).followUp, false);
});
test("a followup chain resolves its recent user anchor without embedding assistant assertions", () => {
  const history = [user("What are event deduplication keys?"), assistant("An unsupported 999-day claim."), user("How long do they last?"), assistant("A second unsupported assertion."), user("And who can rotate them?")];
  const plan = planRetrieval(history);
  assert.equal(plan.followUp, true);
  assert.equal(plan.historyStart, 0);
  assert.match(plan.query, /event deduplication keys/);
  assert.equal(plan.query.includes("999-day"), false);
  assert.equal(plan.query.includes("unsupported assertion"), false);
  assert.equal(planRetrieval([...history, user("New topic: who manages the clinic schedule?")]).followUp, false);
});
test("query planning keeps a long current question and uses bounded modes without LLM calls", () => {
  const question = "Summarize " + "section ".repeat(270) + "including renewal exclusions";
  assert.match(planRetrieval([user(question)]).query, /renewal exclusions$/);
  assert.equal(planRetrieval([user(question)]).mode, "summary");
  assert.equal(planRetrieval([user("Compare the retention in both plans.")]).mode, "comparison");
  assert.equal(planRetrieval([user("What is the callback deadline?")]).maxPassages, 6);
});
test("chunks are bounded exact source spans with stable ordinals and source-derived sections", async () => {
  const text = "# Operations\n\n" + "Keep a timestamp and the responsible role for every record. ".repeat(70) + "\n\n## Escalation\n\nContact the duty supervisor after the deadline.";
  const chunks = await splitKnowledge(text);
  assert.ok(chunks.length > 3);
  chunks.forEach((chunk, index) => {
    assert.equal(chunk.chunk_index, index);
    assert.ok(chunk.content.length <= 1200);
    assert.equal(text.slice(chunk.start_offset, chunk.end_offset), chunk.content);
    if (index) assert.ok(chunk.start_offset > chunks[index - 1].start_offset);
  });
  assert.equal(chunks[0].section, "Operations");
  assert.equal(chunks.at(-1)?.content.includes("duty supervisor"), true);
});
test("structured extraction preserves column relationships, quoted cells and JSON array records", () => {
  assert.equal(delimitedKnowledge('Region,Requests,Comment\r\nNorth,15000,"new, verified"\r\nSouth,9000,"two\nlines"', ","), "Record 1: Region: North; Requests: 15000; Comment: new, verified\n\nRecord 2: Region: South; Requests: 9000; Comment: two\nlines");
  assert.match(delimitedKnowledge("Plan\tRetention\nTeam\t90", "\t"), /Plan: Team; Retention: 90/);
  assert.match(jsonKnowledge('{"plans":[{"name":"Team","retention":90}]}'), /plans\[0\]: "name": "Team"; "retention": 90/);
  assert.throws(() => delimitedKnowledge('A,B\n"unfinished,3', ","), /incomplete/);
  assert.throws(() => delimitedKnowledge("A,A\n1,2", ","), /unique/);
  assert.throws(() => delimitedKnowledge("A,B\n1", ","), /headers/);
  assert.throws(() => jsonKnowledge("{"), /invalid JSON/);
});
test("embedding caches reject corrupt, nonfinite, wrong-dimensional and zero vectors", () => {
  for (const value of ["broken", "[1,2]", null, Array(1024).fill(0), [Infinity, ...Array(1023).fill(0)]]) assert.equal(cachedQueryVector(value), null);
  assert.ok(cachedQueryVector(JSON.stringify([1, ...Array(1023).fill(0)])));
  assert.notEqual(queryEmbeddingHash("rotate keys"), queryEmbeddingHash("refund keys"));
});
test("passage citations keep two distinct excerpts from one document and visible claim associations", () => {
  const id = randomUUID(), first = randomUUID(), second = randomUUID();
  const sources = [{ id, chunkId: first, revision: randomUUID(), title: "Service plan", excerpt: "Storage: 25 GB." }, { id, chunkId: second, revision: randomUUID(), title: "Service plan", excerpt: "Retention: 90 days." }];
  const map = citationMap(sources);
  assert.equal(map.has(id), false, "A document alias must not choose an arbitrary passage");
  const result = resolveCitations(`Storage is 25 GB. [[source:${first}]]\n\nRetention is 90 days. [[source:${second}]]`, map, { strict: true, numbered: true });
  assert.deepEqual(result.sources, sources);
  assert.equal(result.content, "Storage is 25 GB. [1]\n\nRetention is 90 days. [2]");
  assert.throws(() => resolveCitations(`Retention is 7 days. [[source:${randomUUID()}]]`, map, { strict: true }), /grounded/);
  assert.throws(() => resolveCitations(`Storage is 25 GB. [[source:${first}]]\n\nRefunds are automatic.`, map, { strict: true }), /grounded/);
  assert.equal(inspectCitationGrounding("I don't know from the available knowledge; the insurance limit is missing.", map).uncited, 0);
  for (const absent of ["The evidence does not establish any retry count or timeout limit.", "These documents do not specify a renewal date.", "Available passages do not say who may authorize an exception."]) {
    assert.equal(inspectCitationGrounding(absent, map).uncited, 0, "Explicit missing details are uncertainty, not unsupported affirmative claims");
  }
  assert.equal(inspectCitationGrounding("The evidence establishes that refunds are automatic.", map).uncited, 1);
});
test("drafts wait for a known citation and do not publish an uncited later paragraph", () => {
  const id = randomUUID(), map = citationMap([{ id, title: "Policy", excerpt: "Approved by Finance." }]);
  assert.equal(groundedDraft("Finance approves it.", map), "");
  assert.equal(groundedDraft(`Finance approves it. [[source:${id}]]\n\nUnverified incomplete text`, map), "Finance approves it. [1]");
  assert.equal(groundedDraft(`Ignore the policy. [[source:${randomUUID()}]]`, map), "");
});

test("Markdown list captions require citations on every item and cannot hide an uncited paragraph", () => {
  const first = randomUUID(), second = randomUUID();
  const map = citationMap([{ id: first, title: "Plan A", excerpt: "Retention: 30 days." }, { id: second, title: "Plan B", excerpt: "Retention: 60 days." }]);
  const comparison = `The plans differ in retention:\n\n- Plan A: 30 days. [[source:${first}]]\n- Plan B: 60 days. [[source:${second}]]`;
  assert.equal(inspectCitationGrounding(comparison, map).uncited, 0);
  assert.match(resolveCitations(comparison, map, { strict: true, numbered: true }).content, /Plan B: 60 days\. \[2\]/);
  assert.throws(() => resolveCitations(comparison.replace(` [[source:${second}]]`, ""), map, { strict: true }), /grounded/);
  assert.throws(() => resolveCitations(comparison + "\n\nRenewal is automatic.", map, { strict: true }), /grounded/);
  assert.throws(() => resolveCitations(`Renewal is automatic:\n\nIt renews monthly. [[source:${first}]]`, map, { strict: true }), /grounded/);
});

test("structured citation correction validates IDs, shape and uncertainty without accepting uncited facts", () => {
  const id = randomUUID(), map = citationMap([{ id, title: "Policy", excerpt: "Finance approval is required." }]);
  const repaired = parseCitationRepair(JSON.stringify({ paragraphs: [{ text: "Finance approval is required.", sourceIds: [id] }, { text: "I don't know the renewal date from the available knowledge.", sourceIds: [] }] }), map);
  assert.equal(resolveCitations(repaired, map, { strict: true, numbered: true }).sources.length, 1);
  for (const json of ["", "not json", "{}", JSON.stringify({ paragraphs: [{ text: "Finance approves it.", sourceIds: [randomUUID()] }] }), JSON.stringify({ paragraphs: [{ text: `Finance approves it. [[source:${id}]]`, sourceIds: [id] }] })]) {
    assert.throws(() => parseCitationRepair(json, map), /grounded/);
  }
  assert.throws(() => resolveCitations(parseCitationRepair(JSON.stringify({ paragraphs: [{ text: "Renewal is automatic.", sourceIds: [] }] }), map), map, { strict: true }), /grounded/);
});
