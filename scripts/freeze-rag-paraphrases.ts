import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import type { EvaluationCorpus } from "./freeze-rag-evaluation";

// Supplemental post-implementation verification on known development sources.
// It is not an unseen knowledge-base benchmark and must not inform tuning.
const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
async function main() {
  const directory = "tests/evaluation/", manifest = JSON.parse(await readFile(directory + "freeze.json", "utf8"));
  const bytes = await readFile(directory + "development.json");
  assert.equal(hash(bytes), manifest.hashes["development.json"]);
  const development = JSON.parse(bytes.toString()) as EvaluationCorpus[];
  const replacements: Record<string, Record<string, string>> = {
    "development-engineering": {
      duplicate: "If an event request repeats the same idempotency key but changes the payload, which status does the API return?",
      retry: "How should retries differ for a temporary service-unavailable response (503) versus a validation failure (422)?",
    },
    "development-operations": {
      approval: "Who must sign off before booking international travel priced at 650 euros?",
      expense: "After returning from business travel, what is the deadline for handing in the receipts?",
    },
    "development-finance": {
      count: "Give the North area's request count for the second quarter of 2026.",
      rate: "For North in quarter two of 2026, what percentage of requests failed, calculated according to the reporting rule?",
    },
  };
  const corpora = development.map(corpus => ({ ...corpus, id: corpus.id.replace("development-", "paraphrases-"), split: "paraphrase",
    cases: Object.entries(replacements[corpus.id]).flatMap(([id, question]) => {
      const source = corpus.cases.find(item => item.id === id); assert.ok(source);
      return [{ ...source, id: id + "-original" }, { ...source, id: id + "-paraphrase", question }];
    }) }));
  const dataset = JSON.stringify(corpora, null, 2) + "\n";
  const frozen = { version: 1, frozenAt: new Date().toISOString(), purpose: "Equivalent-wording verification after production implementation was fixed; sources and original keys are known development data. No prompt or ranking tuning.",
    hashes: { "paraphrase.json": hash(dataset), "development.json": manifest.hashes["development.json"], "tests/the_next_level_novella.txt": manifest.hashes["tests/the_next_level_novella.txt"] },
    pairs: corpora.flatMap(corpus => corpus.cases.filter(item => item.id.endsWith("-original")).map(item => ({ corpus: corpus.id, original: item.id, paraphrase: item.id.replace(/-original$/, "-paraphrase") }))) };
  // Create-only writes preserve both the original freeze and this supplement.
  await writeFile(directory + "paraphrase.json", dataset, { flag: "wx" });
  await writeFile(directory + "paraphrase-freeze.json", JSON.stringify(frozen, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ pairs: frozen.pairs.length, questions: corpora.reduce((n, corpus) => n + corpus.cases.length, 0), hashes: frozen.hashes }));
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "Freeze failed"); process.exitCode = 1; });
