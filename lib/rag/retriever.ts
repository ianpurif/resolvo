import "server-only";
import { z } from "zod";
import { embeddings } from "./embeddings";
import { EmbeddingDeferred, EmbeddingFailure } from "./embeddings";
import { checkDatabaseError } from "@/lib/supabase/server";
import { AppError } from "@/lib/config";
import type { TenantContext } from "@/lib/auth";
import { asEvidence, selectEvidence, type SearchHit, type EvidenceCoverage } from "./evidence";
import { planRetrieval, searchTerms, type RetrievalPlan } from "./query-plan";
import { queryEmbeddingHash, readQueryEmbedding, storeQueryEmbedding } from "./query-cache";
export { cachedQueryVector, queryEmbeddingHash } from "./query-cache";

const hitSchema = z.object({
  id: z.uuid(), document_id: z.uuid(), organization_id: z.uuid(), index_revision: z.uuid(),
  title: z.string().max(160), content: z.string().min(1).max(6000),
  chunk_index: z.number().int().nullable(), start_offset: z.number().int().nullable(),
  end_offset: z.number().int().nullable(), section: z.string().nullable(),
  similarity: z.number().finite().nullable(), lexical_score: z.number().finite(), score: z.number().finite(),
});

function retrievalError(error: { message: string; code?: string } | null) {
  if (error?.code === "PGRST202" || error?.code === "42883" || error?.code === "42703")
    throw new AppError("Apply supabase/migrations/202610110002_grounded_hybrid_retrieval.sql before searching knowledge.", 503);
  checkDatabaseError(error, "search company knowledge");
}

export async function retrieveForPlan(context: TenantContext, plan: RetrievalPlan, signal?: AbortSignal) {
  const started = performance.now();
  const boundedSignal = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(75000)]);
  boundedSignal.throwIfAborted();
  const normalized = plan.query.trim().replace(/\s+/g, " ");
  const hash = queryEmbeddingHash(normalized);
  let vector = await readQueryEmbedding(context, hash, boundedSignal);
  const cacheHit = Boolean(vector);
  let degraded = false;
  if (!vector) {
    try {
      vector = await embeddings("query", boundedSignal).embedQuery(normalized);
      await storeQueryEmbedding(context, hash, vector, boundedSignal);
    } catch (error) {
      boundedSignal.throwIfAborted();
      // A transient embedding outage can still use authorized full text search.
      // Configuration/authentication failures stay explicit; never call this
      // failure "missing company knowledge".
      if (!(error instanceof EmbeddingDeferred || error instanceof EmbeddingFailure && error.retryable)) throw error;
      degraded = true;
    }
  }
  const parseHits = (data: unknown) => {
    const parsed = z.array(hitSchema).max(48).safeParse(data);
    if (!parsed.success || parsed.data.some((hit) => hit.organization_id !== context.organization.id))
      throw new AppError("Knowledge search returned invalid evidence. Please retry.", 502);
    return parsed.data;
  };
  const found = await context.db.rpc("search_knowledge", {
    p_query_text: plan.lexicalQuery || plan.question, p_query_embedding: vector, p_match_count: 24,
  }).abortSignal(boundedSignal);
  retrievalError(found.error);
  const hits = parseHits(found.data);
  let selected: SearchHit[];
  let availablePassages: number | null = null, availableDocuments: number | null = null;
  if (plan.mode === "summary") {
    const catalog = await context.db.from("documents").select("id,name,chunk_count")
      .eq("organization_id", context.organization.id).in("status", ["ready", "processing"])
      .gt("chunk_count", 0).order("name").limit(101).abortSignal(boundedSignal);
    checkDatabaseError(catalog.error, "read source coverage");
    const documents = (catalog.data ?? []) as { id: string; name: string; chunk_count: number }[];
    const terms = searchTerms(plan.question);
    const named = documents.filter((doc) => {
      const words = searchTerms(doc.name);
      return words.length > 0 && words.some((word) => terms.includes(word));
    });
    const preferred = documents.filter((doc) => plan.preferredDocuments.includes(doc.id));
    const corpusSummary = /\b(?:all (?:the )?(?:documents|files|sources|knowledge)|knowledge base|entire|workspace)\b/i.test(plan.question);
    const scope = preferred.length ? preferred : named.length ? named : corpusSummary ? documents
      : documents.filter((doc) => hits.slice(0, 8).some((hit) => hit.document_id === doc.id));
    availableDocuments = scope.length === 101 ? null : scope.length;
    availablePassages = scope.length === 101 ? null : scope.reduce((n, doc) => n + doc.chunk_count, 0);
    const overview = await context.db.rpc("knowledge_overview", { p_document_ids: scope.slice(0, 8).map((doc) => doc.id), p_count: 24 }).abortSignal(boundedSignal);
    retrievalError(overview.error);
    selected = selectEvidence(parseHits(overview.data), plan);
  } else {
    const primary = selectEvidence(hits, { ...plan, maxPassages: plan.mode === "fact" ? 4 : 6 });
    const neighbors = primary.length ? await context.db.rpc("knowledge_passage_context", { p_passage_ids: primary.slice(0, 2).map((hit) => hit.id) }).abortSignal(boundedSignal) : null;
    if (neighbors) retrievalError(neighbors.error);
    const extra = neighbors ? parseHits(neighbors.data).filter((hit) => !primary.some((anchor) => anchor.id === hit.id)).map((hit) => ({ ...hit,
      score: (primary.find((anchor) => anchor.document_id === hit.document_id)?.score ?? 0) * 0.5 })) : [];
    selected = selectEvidence([...primary, ...extra], plan);
  }
  boundedSignal.throwIfAborted();
  const evidence = selected.map(asEvidence);
  const selectedDocuments = new Set(selected.map((hit) => hit.document_id)).size;
  const coverage: EvidenceCoverage = { selectedPassages: selected.length, selectedDocuments, availablePassages, availableDocuments,
    partial: plan.mode === "summary" && (availablePassages === null || availableDocuments === null || selected.length < availablePassages || selectedDocuments < availableDocuments), degraded };
  const diagnostics = { event: "rag.retrieval", mode: plan.mode, followUp: plan.followUp, cacheHit, degraded,
    candidates: hits.length, passages: selected.length, documents: selectedDocuments, characters: selected.reduce((n, hit) => n + hit.content.length, 0),
    partial: coverage.partial, durationMs: Math.round(performance.now() - started) };
  console.info(JSON.stringify(diagnostics));
  return { evidence, coverage, diagnostics, candidates: hits };
}

// Compatibility for existing server integrations. Chat uses the explicit plan.
export async function retrieveKnowledge(context: TenantContext, query: string, signal?: AbortSignal) {
  return (await retrieveForPlan(context, planRetrieval([{ role: "user", content: query, sources: [] }]), signal)).evidence;
}
