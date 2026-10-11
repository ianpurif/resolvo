import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ragImplementationHash } from "./rag-version";
import type { Source } from "../types";

type Variant = "baseline" | "improved";
type RecordReview = { run: string; corpus: string; caseId: string; variant: Variant;
  correctComplete: boolean[]; citationSupport: (boolean | null)[]; falseRefusal: boolean[]; unsupportedClaim: boolean[]; note: string;
  equivalentPreviouslyReviewed?: ({ run: string; repeat: number; projectionSha256: string } | null)[] };
type Result = { corpus: string; split: string; caseId: string; question: string; variant: Variant; repeat: number;
  expected: { unanswerable?: boolean }; supports: { documentId: string; quote: string }[];
  candidates: { document_id?: string; metadata?: { documentId?: string }; content: string }[];
  evidence: { content: string; source: { id: string } }[];
  evidenceRecall: number; vectorOnlyEvidenceRecall: number | null; reciprocalRank: number;
  retrievalMs: number; generationMs: number; contextCharacters: number; error: string | null;
  answer: { content: string; sources: Source[]; diagnostics?: { firstDraftMs?: number; citationRepairAttempts?: number } } | null;
  providerResponses: string[] };
type Usage = { prompt_tokens?: number; completion_tokens?: number };
const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
function evidenceProjectionHash(row: Result) {
  return createHash("sha256").update(JSON.stringify({ corpus: row.corpus, caseId: row.caseId, variant: row.variant,
    question: row.question, expected: row.expected, error: row.error,
    answer: row.answer && { content: row.answer.content, sources: row.answer.sources.map(({ title, excerpt, chunkIndex, startOffset, endOffset, section }) => ({ title, excerpt, chunkIndex, startOffset, endOffset, section })) } })).digest("hex");
}
function percentile(values: number[], p: number) {
  return [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * p) - 1)] ?? null;
}
function candidateRecall(row: Result, k: number) {
  const hits = row.candidates.slice(0, k);
  return row.supports.filter((gold) => hits.some((hit) => (hit.document_id ?? hit.metadata?.documentId) === gold.documentId
    && normalize(hit.content).includes(normalize(gold.quote)))).length / row.supports.length;
}

async function main() {
  const audit = JSON.parse(await readFile("docs/evaluation/source-review.json", "utf8")) as {
    reviewer: string; limits: string[]; runs: Record<string, { resultsSha256: string; implementationHash: string }>;
    records: RecordReview[] };
  const records = new Map(audit.records.map((r) => [JSON.stringify([r.run, r.corpus, r.caseId, r.variant]), r]));
  assert.equal(records.size, audit.records.length, "Duplicate manual reviews");
  for (const record of audit.records) {
    assert.ok(record.variant === "baseline" || record.variant === "improved");
    for (const values of [record.correctComplete, record.falseRefusal, record.unsupportedClaim])
      assert.ok(values.length === 2 && values.every((value) => typeof value === "boolean"), "Invalid reviewed status");
    assert.ok(record.citationSupport.length === 2 && record.citationSupport.every((value) => value === null || typeof value === "boolean"));
  }
  const implementationHash = await ragImplementationHash();
  const priorResults = new Map<string, Result>();
  if (audit.records.some((r) => r.equivalentPreviouslyReviewed?.some(Boolean))) {
    const priorAudit = JSON.parse(await readFile("docs/evaluation/initial-source-review.json", "utf8")) as { runs: Record<string, { resultsSha256: string }> };
    for (const [run, expected] of Object.entries(priorAudit.runs)) {
      assert.match(run, /^[a-z0-9-]+$/);
      const bytes = await readFile(resolve(".local/rag-evaluation", run, "results.json"));
      assert.equal(createHash("sha256").update(bytes).digest("hex"), expected.resultsSha256, "Previously reviewed artifact changed");
      for (const row of JSON.parse(bytes.toString()) as Result[])
        priorResults.set(JSON.stringify([run, row.corpus, row.caseId, row.variant, row.repeat]), row);
    }
  }
  const seen = new Set<string>();
  const results: (Result & { run: string; usage: Usage[] })[] = [];
  for (const [run, expected] of Object.entries(audit.runs)) {
    assert.match(run, /^[a-z0-9-]+$/);
    const directory = resolve(".local/rag-evaluation", run);
    const bytes = await readFile(resolve(directory, "results.json"));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expected.resultsSha256, "Result artifact changed");
    const summary = JSON.parse(await readFile(resolve(directory, "summary.json"), "utf8"));
    assert.equal(summary.implementationHash, expected.implementationHash);
    assert.equal(implementationHash, expected.implementationHash, "Production implementation changed since evaluation");
    for (const row of JSON.parse(bytes.toString()) as Result[]) {
      const review = records.get(JSON.stringify([run, row.corpus, row.caseId, row.variant]));
      assert.ok(review, "Every result needs a source-backed review");
      for (const values of [review.correctComplete, review.citationSupport, review.falseRefusal, review.unsupportedClaim]) assert.equal(values.length, 2);
      assert.ok(row.repeat === 0 || row.repeat === 1);
      const equivalent = review.equivalentPreviouslyReviewed?.[row.repeat];
      if (equivalent) {
        const prior = priorResults.get(JSON.stringify([equivalent.run, row.corpus, row.caseId, row.variant, equivalent.repeat]));
        assert.ok(prior, "Missing previously inspected response");
        assert.equal(evidenceProjectionHash(prior), equivalent.projectionSha256);
        assert.equal(evidenceProjectionHash(row), equivalent.projectionSha256, "Answer or displayed evidence changed; a fresh review is required");
      }
      const key = JSON.stringify([run, row.corpus, row.caseId, row.variant, row.repeat]);
      assert.ok(!seen.has(key), "Duplicate result repetition"); seen.add(key);
      assert.equal(review.citationSupport[row.repeat] === null, !row.answer?.sources.length, "Citation denominator mismatch");
      assert.ok(!row.error || !review.correctComplete[row.repeat], "Rejected answers cannot pass correctness");
      assert.ok(!row.error || !review.falseRefusal[row.repeat], "A rejected generation is not a returned false refusal");
      assert.ok(row.expected.unanswerable || row.supports.length > 0, "An answerable key needs verifiable source spans");
      const usage: Usage[] = [];
      for (const file of row.providerResponses) {
        assert.match(file, /^provider-response-[a-f0-9-]+\.json$/);
        const raw = JSON.parse(await readFile(resolve(directory, file), "utf8"));
        if (raw.usage) usage.push(raw.usage);
      }
      results.push({ ...row, run, usage });
    }
  }
  assert.equal(results.length, records.size * 2, "Missing repetitions or surplus review records");
  function aggregate(rows: typeof results) {
    const unique = rows.filter((r) => r.repeat === 0), answerable = unique.filter((r) => !r.expected.unanswerable);
    const lookup = (r: Result & { run: string }) => records.get(JSON.stringify([r.run, r.corpus, r.caseId, r.variant]))!;
    const count = (predicate: (r: typeof results[number], review: RecordReview) => boolean) => rows.filter((r) => predicate(r, lookup(r))).length;
    const cited = count((r, a) => a.citationSupport[r.repeat] !== null);
    const supported = count((r, a) => a.citationSupport[r.repeat] === true);
    const correct = count((r, a) => a.correctComplete[r.repeat]);
    const costs = rows.map((r) => r.usage.reduce((n, u) => n + ((u.prompt_tokens ?? 0) * 0.3 + (u.completion_tokens ?? 0) * 1.2) / 1e6, 0));
    const withProvider = rows.filter((r) => r.providerResponses.length > 0);
    return { cases: unique.length, responses: rows.length, answerableCases: answerable.length,
      correctComplete: correct, correctnessRate: correct / rows.length,
      casesCorrectInBothRepeats: unique.filter((r) => lookup(r).correctComplete.every(Boolean)).length,
      repeatedCorrectnessAgreement: unique.filter((r) => lookup(r).correctComplete[0] === lookup(r).correctComplete[1]).length,
      citedResponses: cited, allCitedClaimsSupported: supported, citationSupportRate: cited ? supported / cited : null,
      correctAndGrounded: count((r, a) => a.correctComplete[r.repeat] && a.citationSupport[r.repeat] !== false),
      falseRefusals: count((r, a) => a.falseRefusal[r.repeat]),
      falseRefusalRate: count((r, a) => a.falseRefusal[r.repeat]) / (answerable.length * 2),
      unanswerableResponses: count((r) => Boolean(r.expected.unanswerable)),
      unanswerableCorrect: count((r, a) => Boolean(r.expected.unanswerable && a.correctComplete[r.repeat])),
      unsupportedClaims: count((r, a) => a.unsupportedClaim[r.repeat]),
      errors: rows.filter((r) => r.error).length,
      meanSelectedEvidenceRecall: mean(answerable.map((r) => r.evidenceRecall)),
      selectedEvidenceMrr: mean(answerable.map((r) => r.reciprocalRank)),
      candidateRecallAtK: Object.fromEntries([4, 8, 12].map((k) => [k, mean(answerable.map((r) => candidateRecall(r, k)))])),
      vectorOnlySelectedEvidenceRecall: mean(answerable.filter((r) => r.vectorOnlyEvidenceRecall !== null).map((r) => r.vectorOnlyEvidenceRecall!)),
      latency: { warmRetrievalP50Ms: percentile(unique.map((r) => r.retrievalMs), 0.5), warmRetrievalP95Ms: percentile(unique.map((r) => r.retrievalMs), 0.95),
        generationWithProviderP50Ms: percentile(withProvider.map((r) => r.generationMs), 0.5), generationWithProviderP95Ms: percentile(withProvider.map((r) => r.generationMs), 0.95),
        warmRetrievalAndAnswerP50Ms: percentile(rows.map((r) => r.retrievalMs + r.generationMs), 0.5), warmRetrievalAndAnswerP95Ms: percentile(rows.map((r) => r.retrievalMs + r.generationMs), 0.95),
        firstCitedDraftP50Ms: percentile(rows.flatMap((r) => r.answer?.diagnostics?.firstDraftMs == null ? [] : [r.answer.diagnostics.firstDraftMs]), 0.5) },
      conditionalCitationRepairs: rows.filter((r) => r.answer?.diagnostics?.citationRepairAttempts).length,
      meanContextCharacters: mean(unique.map((r) => r.contextCharacters)),
      generationPeakTokenPriceUpperUsd: costs.reduce((a, b) => a + b, 0), meanGenerationPeakUpperUsd: mean(costs) };
  }
  const bySplit: Record<string, ReturnType<typeof aggregate>> = {}, byCorpus: typeof bySplit = {};
  for (const split of [...new Set(results.map((r) => r.split))]) for (const variant of ["baseline", "improved"])
    bySplit[`${split}/${variant}`] = aggregate(results.filter((r) => r.split === split && r.variant === variant));
  for (const corpus of [...new Set(results.map((r) => r.corpus))]) for (const variant of ["baseline", "improved"])
    byCorpus[`${corpus}/${variant}`] = aggregate(results.filter((r) => r.corpus === corpus && r.variant === variant));
  const paraphrasePairs: Record<string, unknown> = {};
  if (results.some((row) => row.split === "paraphrase")) {
    const freeze = JSON.parse(await readFile("tests/evaluation/paraphrase-freeze.json", "utf8")) as { hashes: Record<string, string>; pairs: { corpus: string; original: string; paraphrase: string }[] };
    assert.equal(createHash("sha256").update(await readFile("tests/evaluation/paraphrase.json")).digest("hex"), freeze.hashes["paraphrase.json"]);
    for (const variant of ["baseline", "improved"] as const) {
      const paired = freeze.pairs.map((pair) => {
        const original = results.filter((r) => r.corpus === pair.corpus && r.caseId === pair.original && r.variant === variant);
        const paraphrase = results.filter((r) => r.corpus === pair.corpus && r.caseId === pair.paraphrase && r.variant === variant);
        assert.equal(original.length, 2); assert.equal(paraphrase.length, 2);
        const reviewed = (r: typeof results[number]) => records.get(JSON.stringify([r.run, r.corpus, r.caseId, r.variant]))!;
        return { corpus: pair.corpus, original: pair.original, paraphrase: pair.paraphrase,
          originalCorrect: original.sort((a,b) => a.repeat-b.repeat).map((r) => reviewed(r).correctComplete[r.repeat]),
          paraphraseCorrect: paraphrase.sort((a,b) => a.repeat-b.repeat).map((r) => reviewed(r).correctComplete[r.repeat]),
          allCorrectAndGrounded: [...original, ...paraphrase].every((r) => reviewed(r).correctComplete[r.repeat] && reviewed(r).citationSupport[r.repeat] !== false),
          allRequiredEvidenceSelected: [...original, ...paraphrase].every((r) => r.evidenceRecall === 1) };
      });
      paraphrasePairs[variant] = { pairs: paired.length,
        bothWordingsCorrectInBothRepeats: paired.filter((p) => [...p.originalCorrect, ...p.paraphraseCorrect].every(Boolean)).length,
        perRepeatCorrectnessAgreement: paired.reduce((n,p) => n+p.originalCorrect.filter((value,i) => value === p.paraphraseCorrect[i]).length,0),
        comparisonSamples: paired.length * 2,
        bothWordingsGroundedInBothRepeats: paired.filter((p) => p.allCorrectAndGrounded).length,
        pairsWithAllRequiredEvidence: paired.filter((p) => p.allRequiredEvidenceSelected).length, records: paired };
    }
  }
  const output = { version: 2, reviewer: audit.reviewer, runs: audit.runs, limits: audit.limits, bySplit, byCorpus, paraphrasePairs,
    overall: Object.fromEntries((["baseline", "improved"] as const).map((v) => [v, aggregate(results.filter((r) => r.variant === v && r.split !== "paraphrase"))])),
    allEvaluated: Object.fromEntries((["baseline", "improved"] as const).map((v) => [v, aggregate(results.filter((r) => r.variant === v))])),
    metricNotes: ["Source review is manual and model-assisted; alias screening is not a correctness score.",
      "Citation support is answer-level: every cited substantive claim must be supported by its displayed excerpt. Uncited uncertainty-only responses are excluded from this denominator.",
      "Correctness includes explicit unanswerable cases; incorrect refusals and rejected outputs fail. Grounded correctness additionally requires semantic citation support.",
      "Overall excludes supplemental paraphrases to avoid inflating the primary benchmark with correlated question pairs. Paraphrase and all-evaluated aggregates are separate.",
      "Unsupported secondary source-scope claims are recorded even when the requested answer is a correct refusal. Continuous ranges must not include sections absent from the selected/cited excerpts.",
      "Recall uses original exact normalized source spans plus document identity. Candidate recall is distinct from coverage of selected context. MRR identifies the first supporting selected passage.",
      "All retrieval vectors were prewarmed. Latency excludes cold query embedding, remote database/auth/persistence and browser delivery. Provider generation measurements include conditional repair.",
      "Peak token prices are conservative estimates, not an invoice. Unknown or aborted requests remain reserved in the shared budget ledger."] };
  await writeFile("docs/evaluation/results.json", JSON.stringify(output, null, 2) + "\n");
  console.log(JSON.stringify({ bySplit, overall: output.overall, paraphrasePairs }));
}
void main().catch((error) => { console.error(error instanceof Error ? error.message : "Review summary failed"); process.exitCode = 1; });
