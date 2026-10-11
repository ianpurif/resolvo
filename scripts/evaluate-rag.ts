import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createClient, type User } from "@supabase/supabase-js";
import { startFixtureBackend } from "../tests/browser/fixture-backend";
import { asUser } from "../tests/helpers/database";
import { evaluationDocx, evaluationPdf } from "../tests/helpers/evaluation-files";
import { baselineQuery, baselineEvidence, baselineAnswer } from "../tests/evaluation/baseline";
import { prepareFile, ingestPrepared } from "../lib/rag/ingest";
import { continueIndexing } from "../lib/rag/index-jobs";
import { embeddings } from "../lib/rag/embeddings";
import { tokenCounts } from "../lib/rag/embedding-policy";
import { planRetrieval } from "../lib/rag/query-plan";
import { queryEmbeddingHash, retrieveForPlan } from "../lib/rag/retriever";
import { storeQueryEmbedding } from "../lib/rag/query-cache";
import { answerFromEvidence } from "../lib/ai/graph";
import { missingEvidenceAnswer } from "../lib/ai/grounding";
import { selectEvidence, asEvidence, type SearchHit, type Evidence } from "../lib/rag/evidence";
import type { TenantContext } from "../lib/auth";
import type { ChatMessage, Source } from "../types";
import type { EvaluationCorpus, EvaluationCase } from "./freeze-rag-evaluation";
import { ragImplementationHash } from "./rag-version";
import { EvaluationBudget } from "./evaluation-budget";

const args = process.argv.slice(2);
const option = (key: string, fallback: string) => args.find((arg) => arg.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback;
const live = args.includes("--live");
const cachedEmbeddingsOnly = args.includes("--cached-embeddings-only");
const retrievalOnly = args.includes("--retrieval-only");
assert.ok(!cachedEmbeddingsOnly || live, "Cached provider replay is a live generation evaluation option");
const splits = option("splits", "development").split(",");
const corpusFilter = option("corpora", "").split(",").filter(Boolean);
const repeats = Number(option("repeats", live ? "2" : "1"));
const cap = Number(option("approved-budget-usd", "0"));
const outputName = option("output", `${live ? "live" : "offline"}-${splits.join("-")}`);
const freezeName = option("freeze", "freeze.json");
assert.ok(/^[a-z0-9-]+\.json$/.test(freezeName), "Use a freeze manifest filename under tests/evaluation");
assert.ok(/^[a-z0-9-]+$/.test(outputName), "Use a simple output name");
assert.ok(repeats >= 1 && repeats <= 3 && Number.isInteger(repeats));
if (live && (!args.includes("--approve-external-data") || !(cap > 0 && cap <= 10))) throw new Error("Live evaluation requires explicit provider spending/data approval: --approve-external-data --approved-budget-usd=AMOUNT. Uses frozen evaluation data only; no hosted database writes.");
if (live && (!process.env.VOYAGE_API_KEY || !process.env.DEEPSEEK_API_KEY)) throw new Error("Configure provider credentials locally; never pass keys on the command line.");
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const normalized = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

// Deliberately nonsemantic. Useful for deterministic SQL/selection regressions,
// never evidence that Voyage or DeepSeek achieved factual acceptance criteria.
function surrogateVector(text: string) {
  const vector: number[] = Array(1024).fill(0);
  for (const word of normalized(text).match(/[\p{L}\p{N}_]+/gu) ?? []) {
    const stem = word.length > 4 ? word.replace(/(?:ing|ed|s)$/, "") : word;
    const digest = createHash("sha256").update(stem).digest();
    vector[digest.readUInt16BE(0) % 1024] += 1;
  }
  if (!vector.some(Boolean)) vector[0] = 1;
  return vector;
}
function screening(answer: string, item: EvaluationCase) {
  const text = normalized(answer);
  const refusal = /\b(?:don't know|do not know|don't have|do not have|cannot (?:find|determine|confirm)|not (?:specified|provided)|missing|no (?:relevant|information)|could not be verified)\b/i.test(answer);
  return { answerAliasCoverage: item.facts.length ? item.facts.filter((aliases) => aliases.some((v) => text.includes(normalized(v)))).length / item.facts.length : null,
    falseRefusalScreen: !item.unanswerable && refusal, missingInfoScreen: item.unanswerable ? refusal : null,
    forbiddenOutput: (item.forbidden ?? []).filter((value) => text.includes(normalized(value))),
    semanticCorrectness: "requires independent source-backed review", semanticCitationSupport: "requires independent source-backed review" };
}
function percentile(values: number[], p: number) { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? 0; }

async function main() {
  const implementationHash = await ragImplementationHash();
  const manifest = JSON.parse(await readFile("tests/evaluation/" + freezeName, "utf8"));
  const corpora: EvaluationCorpus[] = [];
  for (const split of splits) {
    assert.ok(["development", "acceptance", "regression", "holdout", "paraphrase"].includes(split));
    const bytes = await readFile(`tests/evaluation/${split}.json`);
    assert.equal(hash(bytes), manifest.hashes[`${split}.json`], "Frozen evaluation changed");
    corpora.push(...JSON.parse(bytes.toString()));
  }
  assert.equal(hash(await readFile("tests/the_next_level_novella.txt")), manifest.hashes["tests/the_next_level_novella.txt"], "Original novella changed");
  if (corpusFilter.length) {
    assert.ok(corpusFilter.every((id) => corpora.some((corpus) => corpus.id === id)), "Unknown corpus filter");
    for (let i = corpora.length - 1; i >= 0; i--) if (!corpusFilter.includes(corpora[i].id)) corpora.splice(i, 1);
  }
  const output = resolve(".local/rag-evaluation", outputName);
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, "run.json"), JSON.stringify({ startedAt: new Date().toISOString(), implementationHash,
    frozenHashes: manifest.hashes, evaluatedCorpora: corpora.map((corpus) => corpus.id), live, retrievalOnly, repeats }, null, 2));
  const budget = live ? await EvaluationBudget.acquire(resolve(".local/rag-evaluation/approved-provider-budget.json"), cap, outputName) : null;
  const backend = await startFixtureBackend(0, "http://127.0.0.1:3999");
  const originalFetch = globalThis.fetch;
  const savedEnvironment = { ...process.env };
  const requests: { provider: string; tokens: number | null; upperBoundUsd: number; status?: number; responseArtifact?: string }[] = [];
  const usageTasks: Promise<void>[] = [];
  let reservedUsd = 0;
  const embeddingCache: Record<string, unknown> = {};
  try { Object.assign(embeddingCache, JSON.parse(await readFile(resolve(output, "embedding-cache.json"), "utf8"))); } catch {}
  Object.assign(process.env, { SUPABASE_URL: backend.origin, SUPABASE_SERVICE_ROLE_KEY: "fixture-service-key",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture", APP_URL: "http://127.0.0.1:3999" });
  if (!live) Object.assign(process.env, { VOYAGE_API_KEY: "fixture-voyage", DEEPSEEK_API_KEY: "fixture-deepseek", VOYAGE_REQUESTS_PER_MINUTE: "100000", VOYAGE_TOKENS_PER_MINUTE: "1000000" });
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.hostname === "api.voyageai.com") {
      const body = JSON.parse(String(init?.body));
      if (!live) return new Response(JSON.stringify({ data: body.input.map((text: string, index: number) => ({ index, embedding: surrogateVector(text) })), usage: { total_tokens: (await tokenCounts(body.input)).reduce((n, v) => n + v, 0) } }), { headers: { "Content-Type": "application/json" } });
      const key = hash(JSON.stringify(body));
      if (embeddingCache[key]) return new Response(JSON.stringify(embeddingCache[key]), { headers: { "Content-Type": "application/json" } });
      if (cachedEmbeddingsOnly) throw new Error("Embedding response not cached; replay makes no new Voyage requests");
      const tokens = (await tokenCounts(body.input)).reduce((n, v) => n + v, 0), upper = tokens * 0.02 / 1_000_000;
      const reservation = await budget!.reserve("voyage-4-lite", upper);
      reservedUsd += upper;
      const response = await originalFetch(input, init), result = await response.clone().json().catch(() => ({}));
      requests.push({ provider: "voyage-4-lite", tokens: result.usage?.total_tokens ?? null, upperBoundUsd: upper, status: response.status });
      if (response.ok && result.usage?.total_tokens != null) await budget!.settle(reservation, result.usage.total_tokens);
      if (response.ok) { embeddingCache[key] = result; await writeFile(resolve(output, "embedding-cache.json"), JSON.stringify(embeddingCache)); }
      return response;
    }
    if (url.hostname === "api.deepseek.com") {
      assert.ok(!retrievalOnly, "Retrieval-only verification must never call generation");
      if (!live) throw new Error("Offline evaluation must never call a generation provider");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, "deepseek-flash");
      // Peak prices verified from official docs 2026-10-11. UTF-8 input bytes
      // bound token counts conservatively; include message framing overhead.
      const inputBound = Buffer.byteLength(JSON.stringify(body.messages)) + 256 * body.messages.length;
      const upper = (inputBound * 0.3 + Number(body.max_tokens ?? 1500) * 1.2) / 1_000_000;
      const reservation = await budget!.reserve("deepseek-flash", upper);
      reservedUsd += upper;
      const response = await originalFetch(input, init);
      const responseArtifact = `provider-response-${reservation}.json`;
      const record = { provider: "deepseek-flash", tokens: null as number | null, upperBoundUsd: upper, status: response.status, responseArtifact };
      requests.push(record);
      usageTasks.push(response.clone().text().then(async (text) => {
        let content = "", usage: unknown = null;
        for (const line of body.stream ? text.split("\n").filter((v) => v.startsWith("data: ")).map((v) => v.slice(6)) : [text]) {
          try {
            const parsed = JSON.parse(line);
            content += (body.stream ? parsed.choices?.[0]?.delta?.content : parsed.choices?.[0]?.message?.content) ?? "";
            if (parsed.usage?.total_tokens != null) {
              usage = parsed.usage;
              record.tokens = parsed.usage.total_tokens;
              if (response.ok) await budget!.settle(reservation, parsed.usage.prompt_tokens, parsed.usage.completion_tokens);
            }
          } catch {}
        }
        await writeFile(resolve(output, responseArtifact), JSON.stringify({ content, usage, status: response.status }, null, 2));
      }).catch(() => {}));
      return response;
    }
    assert.equal(url.origin, backend.origin, "Evaluation may access only its local database and explicitly approved providers");
    if (cachedEmbeddingsOnly && url.pathname === "/rest/v1/rpc/reserve_voyage_request") {
      // All provider embeddings must already be cached. Do not simulate a
      // paid-provider cooldown for local replay. Chunk batch sizes and model
      // results stay unchanged; these timings are not indexing throughput.
      const body = JSON.parse(String(init?.body));
      return originalFetch(input, { ...init, body: JSON.stringify({ ...body, p_rpm: 100000, p_tpm: 100000000 }) });
    }
    return originalFetch(input, init);
  };
  const context: TenantContext = { db: createClient(backend.origin, "sb_publishable_fixture", { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: "Bearer " + backend.token(backend.owner) } } }),
    user: { id: backend.owner, app_metadata: { provider: "google" }, email: "owner@fixture.invalid" } as User,
    organization: { id: backend.org, name: "Isolated evaluation", industry: "Other", created_at: "" }, role: "owner" };
  const results: Record<string, unknown>[] = [], indexing: Record<string, unknown>[] = [];
  try {
    for (const corpus of corpora) {
      await asUser(backend.db, backend.owner);
      await backend.db.query("delete from data_sources where organization_id=$1", [backend.org]);
      const ids = new Map<string, string>(), prepared = new Map<string, Awaited<ReturnType<typeof prepareFile>>>();
      for (const doc of corpus.documents) {
        const source = doc.path ? await readFile(doc.path, "utf8") : doc.text!;
        const bytes = doc.format === "pdf" ? evaluationPdf(source) : doc.format === "docx" ? evaluationDocx(source) : Buffer.from(source);
        const file = new File([new Uint8Array(bytes)], `${doc.id}.${doc.format ?? "txt"}`);
        await writeFile(resolve(output, `${corpus.id}-${doc.id}.${doc.format ?? "txt"}`), bytes);
        const input = await prepareFile(file); input.name = doc.title;
        prepared.set(doc.id, input);
        const start = performance.now();
        let document = await ingestPrepared(context, input, undefined, randomUUID());
        const deadline = Date.now() + (live ? 30 * 60_000 : 60_000);
        while (document.status === "processing") {
          if (Date.now() > deadline) throw new Error("Indexing evaluation deadline exceeded");
          const wait = Math.max(0, Date.parse(document.index_next_attempt_at ?? "") - Date.now());
          if (wait) { console.log(JSON.stringify({ indexing: corpus.id, waitingMs: wait })); await delay(Math.min(wait, 30000)); }
          document = await continueIndexing(context, document.id);
        }
        if (document.status !== "ready") throw new Error(`Evaluation source indexing failed: ${document.error_message}`);
        ids.set(doc.id, document.id);
        indexing.push({ corpus: corpus.id, document: doc.id, format: doc.format, sourceHash: hash(bytes), originalBytes: bytes.length,
          extractedCharacters: input.text.length, chunks: document.chunk_count, durationMs: Math.round(performance.now() - start) });
      }
      const histories = corpus.cases.map((item) => [...(item.history ?? []), { role: "user" as const, content: item.question }].map((m) => ({ ...m, id: randomUUID(), organization_id: backend.org, conversation_id: randomUUID(), sources: [], created_at: "" }) as ChatMessage));
      // One batched query embedding pass; both algorithms receive identical
      // provider results. No per-case answer keys enter the retrieval pipeline.
      const queries = [...new Set(histories.flatMap((h) => [baselineQuery(h), planRetrieval(h).query.trim().replace(/\s+/g, " ")]))];
      const vectors = await embeddings("query").embedDocuments(queries);
      const queryVectors = new Map(queries.map((q, i) => [q, vectors[i]]));
      for (const [query, vector] of queryVectors) {
        await storeQueryEmbedding(context, queryEmbeddingHash(query), vector, AbortSignal.timeout(10000));
      }
      for (let i = 0; i < corpus.cases.length; i++) {
        const item = corpus.cases[i], history = histories[i], plan = planRetrieval(history);
        // Keys are source-backed even for formats whose extracted layout differs.
        const supports = item.evidence.map((span) => {
          const doc = corpus.documents.find((d) => d.id === span.document)!;
          const raw = doc.path ? "" : doc.text!;
          let quote = span.quote;
          if (doc.format === "csv") quote = csvQuote(raw, span.quote);
          if (doc.format === "json") quote = jsonQuote(span.quote);
          assert.ok(normalized(prepared.get(span.document)!.text).includes(normalized(quote)), `Answer key is not a source span: ${corpus.id}/${item.id}`);
          return { documentId: ids.get(span.document)!, quote };
        });
        for (const variant of ["baseline", "improved"]) {
          const start = performance.now();
          let evidence: Evidence[], coverage = { selectedPassages: 0, selectedDocuments: 0, availablePassages: null as number | null, availableDocuments: null as number | null, partial: false, degraded: false };
          let candidates: unknown[] = [];
          if (variant === "baseline") {
            const found = await context.db.rpc("match_document_chunks", { query_embedding: queryVectors.get(baselineQuery(history)), match_count: 4, filter: { organizationId: backend.org } });
            assert.equal(found.error, null);
            candidates = found.data;
            evidence = baselineEvidence(found.data, backend.org);
          } else {
            const found = await retrieveForPlan(context, plan, AbortSignal.timeout(75000));
            evidence = found.evidence; coverage = found.coverage; candidates = found.candidates;
          }
          const retrievalMs = performance.now() - start;
          let retrievalRechecks: { samples: number; consistent: boolean; evidenceSha256: string[]; durationMs: number[] } | null = null;
          if (retrievalOnly) {
            const evidenceHash = (items: Evidence[]) => hash(JSON.stringify(items));
            const hashes = [evidenceHash(evidence)], durations = [Math.round(retrievalMs * 100) / 100];
            for (let sample = 1; sample < 3; sample++) {
              const sampleStart = performance.now();
              if (variant === "baseline") {
                const again = await context.db.rpc("match_document_chunks", { query_embedding: queryVectors.get(baselineQuery(history)), match_count: 4, filter: { organizationId: backend.org } });
                assert.equal(again.error, null); hashes.push(evidenceHash(baselineEvidence(again.data, backend.org)));
              } else hashes.push(evidenceHash((await retrieveForPlan(context, plan, AbortSignal.timeout(75000))).evidence));
              durations.push(Math.round((performance.now() - sampleStart) * 100) / 100);
            }
            retrievalRechecks = { samples: 3, consistent: hashes.every((value) => value === hashes[0]), evidenceSha256: hashes, durationMs: durations };
          }
          const groups = new Map<string, string>();
          for (const passage of evidence) groups.set(passage.source.id, (groups.get(passage.source.id) ?? "") + "\n" + passage.content);
          const covered = supports.filter((span) => normalized(groups.get(span.documentId) ?? "").includes(normalized(span.quote))).length;
          // Retrieval-only ablation: same query vector, tenant checks, context
          // limits and neighbor policy, with lexical ranking disabled. It does
          // not make an additional embedding or generation provider request.
          let vectorOnlyEvidenceRecall: number | null = null;
          if (variant === "improved" && plan.mode !== "summary" && supports.length) {
            const semantic = await context.db.rpc("search_knowledge", { p_query_text: "", p_query_embedding: queryVectors.get(plan.query.trim().replace(/\s+/g, " ")), p_match_count: 24 });
            assert.equal(semantic.error, null);
            const primary = selectEvidence(semantic.data as SearchHit[], { ...plan, maxPassages: plan.mode === "fact" ? 4 : 6 });
            const neighbors = await context.db.rpc("knowledge_passage_context", { p_passage_ids: primary.slice(0, 2).map((hit) => hit.id) });
            assert.equal(neighbors.error, null);
            const extra = (neighbors.data as SearchHit[]).filter((hit) => !primary.some((anchor) => anchor.id === hit.id)).map((hit) => ({ ...hit,
              score: (primary.find((anchor) => anchor.document_id === hit.document_id)?.score ?? 0) * 0.5 }));
            const selected = selectEvidence([...primary, ...extra], plan).map(asEvidence);
            const documents = new Map<string, string>();
            selected.forEach((passage) => documents.set(passage.source.id, (documents.get(passage.source.id) ?? "") + "\n" + passage.content));
            vectorOnlyEvidenceRecall = supports.filter((span) => normalized(documents.get(span.documentId) ?? "").includes(normalized(span.quote))).length / supports.length;
          }
          const recallAt = Object.fromEntries([4, 8, 12].map((k) => {
            const passages = new Map<string, string>();
            evidence.slice(0, k).forEach((e) => passages.set(e.source.id, (passages.get(e.source.id) ?? "") + "\n" + e.content));
            return [k, supports.length ? supports.filter((s) => normalized(passages.get(s.documentId) ?? "").includes(normalized(s.quote))).length / supports.length : null];
          }));
          const relevantRanks = supports.map((span) => evidence.findIndex((passage) => passage.source.id === span.documentId && normalized(passage.content).includes(normalized(span.quote))) + 1).filter((rank) => rank > 0);
          for (let repeat = 0; repeat < repeats; repeat++) {
            const generationStart = performance.now();
            const requestStart = requests.length;
            let answer: { content: string; sources: Source[]; diagnostics?: unknown; usage?: unknown } | null = null, error: string | null = null;
            if (live && !retrievalOnly) {
              try {
                answer = variant === "baseline" ? await baselineAnswer(corpus.id, history, evidence)
                  : evidence.length ? await answerFromEvidence(corpus.id, history, plan, evidence, coverage, [], () => {}, AbortSignal.timeout(75000))
                    : { content: missingEvidenceAnswer(coverage.degraded), sources: [] };
              } catch (failure) { error = failure instanceof Error ? failure.message : "Generation failed"; }
            }
            results.push({ corpus: corpus.id, split: corpus.split, caseId: item.id, kind: item.kind, question: item.question, variant, repeat,
              mode: plan.mode, query: variant === "baseline" ? baselineQuery(history) : plan.query,
              evidenceRecall: supports.length ? covered / supports.length : null,
              vectorOnlyEvidenceRecall,
              recallAt,
              allRequiredEvidence: supports.length ? covered === supports.length : null,
              reciprocalRank: relevantRanks.length ? 1 / Math.min(...relevantRanks) : 0,
              retrievalMs: Math.round(retrievalMs * 100) / 100, retrievalRechecks, contextCharacters: evidence.reduce((n, e) => n + e.content.length, 0), coverage,
              expected: item, supports, candidates, evidence, answer, error, generationMs: live && !retrievalOnly ? Math.round(performance.now() - generationStart) : null,
              providerResponses: requests.slice(requestStart).flatMap((request) => request.responseArtifact ? [request.responseArtifact] : []),
              screening: answer ? screening(answer.content, item) : null });
            await writeFile(resolve(output, "results.json"), JSON.stringify(results, null, 2));
          }
        }
      }
      console.log(JSON.stringify({ evaluated: corpus.id, questions: corpus.cases.length, mode: live ? "real providers" : "nonsemantic surrogate; generation not run" }));
    }
    const summaries = [...new Set(results.map((r) => `${r.split}/${r.variant}`))].map((key) => {
      const group = results.filter((r) => `${r.split}/${r.variant}` === key && r.repeat === 0);
      const answerable = group.filter((r) => r.evidenceRecall !== null);
      return { key, cases: group.length, meanEvidenceRecall: answerable.reduce((n, r) => n + Number(r.evidenceRecall), 0) / answerable.length,
        fullyCovered: answerable.filter((r) => r.allRequiredEvidence === true).length, answerable: answerable.length,
        recallAt4: answerable.reduce((n, r) => n + Number((r.recallAt as Record<string, number>)["4"]), 0) / answerable.length,
        mrr: answerable.reduce((n, r) => n + Number(r.reciprocalRank), 0) / answerable.length,
        retrievalP50Ms: percentile(group.map((r) => Number(r.retrievalMs)), 0.5), retrievalP95Ms: percentile(group.map((r) => Number(r.retrievalMs)), 0.95),
        answerQuality: live && !retrievalOnly ? "Recorded answers require source-backed review; alias scores are not correctness" : "NOT RUN" };
    });
    await Promise.allSettled(usageTasks);
    assert.equal(await ragImplementationHash(), implementationHash, "Implementation changed during evaluation; results must not be treated as a frozen run");
    const rechecks = results.filter((row) => row.repeat === 0 && row.retrievalRechecks).map((row) => row.retrievalRechecks as { consistent: boolean; samples: number });
    const report = { version: 1, completedAt: new Date().toISOString(), implementationHash, mode: live ? retrievalOnly ? "actual Voyage vectors; repeated local retrieval; generation NOT RUN" : "real Voyage/DeepSeek; isolated local PostgreSQL/WASM" : "nonsemantic hash-token vectors; actual local SQL/ingestion/selection; no generation",
      frozenHashes: manifest.hashes, evaluatedCorpora: corpora.map((corpus) => corpus.id), cachedEmbeddingsOnly, retrievalOnly, repeats, summaries, indexing, providerRequests: requests,
      repeatedRetrieval: { cases: rechecks.length, consistent: rechecks.filter((r) => r.consistent).length, samplesPerCase: rechecks[0]?.samples ?? 0 },
      initialRequestReservationsUsd: live ? reservedUsd : 0, conservativeCostUpperBoundUsd: budget?.totalUpperUsd ?? 0,
      measuredBilling: "Provider invoice not checked; peak-price token usage where supplied, otherwise maximum reservation; total shared across runs",
      limitations: ["Local PostgreSQL/WASM is not remote concurrent PostgreSQL or a production latency benchmark.", "Offline vectors do not measure semantic embedding quality or factual answers.", "Answer alias scores and exact-span recall do not prove semantic citation entailment or complete correctness.", "The novella key is a new source-backed 20-question key; prior 20 questions were not supplied.", "Holdout results must never be used to tune this implementation."] };
    await writeFile(resolve(output, "summary.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ output, ...report }));
  } finally {
    await Promise.allSettled(usageTasks);
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in savedEnvironment)) delete process.env[key];
    Object.assign(process.env, savedEnvironment);
    await backend.close();
    await budget?.close();
  }
}
function csvQuote(raw: string, quote: string) {
  const header = raw.split(/\r?\n/)[0].split(","), row = quote.split(",");
  return row.map((cell, i) => `${header[i]}: ${cell}`).join("; ");
}
function jsonQuote(quote: string) { return Object.entries(JSON.parse(`{${quote}}`)).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join("; "); }
void main().catch((error) => { console.error("RAG evaluation failed:", error instanceof Error ? error.message : "Unknown failure"); process.exitCode = 1; });
