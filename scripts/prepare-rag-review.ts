import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Source } from "../types";

type Row = { corpus: string; split: string; caseId: string; variant: string; repeat: number; question: string;
  expected: { unanswerable?: boolean; facts: string[][] }; supports: { quote: string; documentId: string }[];
  evidence: { content: string; source: Source }[]; answer: { content: string; sources: Source[]; rawContent?: string } | null; error: string | null;
  providerResponses?: string[] };
async function main() {
  const name = process.argv[2];
  assert.ok(name && /^[a-z0-9-]+$/.test(name), "Provide an evaluation run name");
  const directory = resolve(".local/rag-evaluation", name);
  const bytes = await readFile(resolve(directory, "results.json"));
  const rows: Row[] = JSON.parse(bytes.toString());
  const parts = ["# Source-backed review material", `\nRun: ${name}. Results SHA-256: ${createHash("sha256").update(bytes).digest("hex")}.`,
    "\nThis is review material, not an automatic correctness score. Inspect source facts, conditions, arithmetic, completeness and the actual displayed citation excerpts. Baseline raw markers bind claims to document IDs; improved numbers bind claims to the listed passages. Gold spans verify factual keys separately from citation support. Identical repeated answers are grouped, with every repetition retained in results.json."];
  const seen = new Set<string>();
  for (const row of rows) {
    const key = JSON.stringify([row.corpus, row.caseId, row.variant, row.answer, row.error]);
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(`\n## ${row.corpus}/${row.caseId} — ${row.variant}, repeat ${row.repeat}`, `\nQuestion: ${row.question}`,
      `\nUnanswerable key: ${Boolean(row.expected.unanswerable)}. Expected fact groups (screening only): ${JSON.stringify(row.expected.facts)}.`,
      "\nGold source spans:", ...row.supports.map((span) => `\n> ${span.quote}\n\nDocument: ${span.documentId}`),
      `\nFinal answer:\n\n${row.answer?.content ?? row.error ?? "NOT RUN"}`);
    if (row.answer?.rawContent) parts.push(`\nRaw citation markers:\n\n${row.answer.rawContent}`);
    if (row.answer?.sources.length) parts.push("\nActual displayed sources:", ...row.answer.sources.map((source, i) =>
      `\n[${i + 1}] ${source.title} (${source.chunkId ?? source.id}):\n\n> ${source.excerpt.replace(/\n/g, "\n> ")}`));
    if (row.error) for (const file of row.providerResponses ?? []) {
      const raw = JSON.parse(await readFile(resolve(directory, file), "utf8"));
      parts.push(`\nRejected provider draft (${file}):\n\n${raw.content}`);
    }
  }
  const path = resolve(directory, "review.md");
  await writeFile(path, parts.join("\n") + "\n");
  console.log(JSON.stringify({ path, responses: rows.length, uniqueReviews: seen.size, isCorrectnessScore: false }));
}
void main().catch((error) => { console.error(error instanceof Error ? error.message : "Review material failed"); process.exitCode = 1; });
