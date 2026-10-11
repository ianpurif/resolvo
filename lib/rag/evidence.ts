import type { Source } from "@/types";
import type { RetrievalPlan } from "./query-plan";

export interface SearchHit {
  id: string;
  document_id: string;
  organization_id: string;
  index_revision: string;
  title: string;
  content: string;
  chunk_index: number | null;
  start_offset: number | null;
  end_offset: number | null;
  section: string | null;
  similarity: number | null;
  lexical_score: number;
  score: number;
}
export interface Evidence {
  source: Source;
  citationId: string;
  content: string;
}
export interface EvidenceCoverage {
  selectedPassages: number;
  selectedDocuments: number;
  availablePassages: number | null;
  availableDocuments: number | null;
  partial: boolean;
  degraded: boolean;
}
export function selectEvidence(hits: SearchHit[], plan: RetrievalPlan): SearchHit[] {
  const result: SearchHit[] = [];
  const seen = new Set<string>();
  const content = new Set<string>();
  let used = 0;
  const add = (hit: SearchHit) => {
    // Do not truncate a passage halfway through its supporting fact.
    const key = hit.content.trim().replace(/\s+/g, " ");
    if (!seen.has(hit.id) && !content.has(key) && result.length < plan.maxPassages && used + hit.content.length <= plan.characterBudget) {
      result.push(hit); seen.add(hit.id); content.add(key); used += hit.content.length;
    }
  };
  if (plan.mode === "summary") {
    // Overview hits arrive in document rounds. Preserve this source coverage.
    hits.forEach(add);
    return result;
  }
  const ranked = [...hits].sort((a, b) => b.score - a.score || a.document_id.localeCompare(b.document_id)
    || (a.chunk_index ?? 500) - (b.chunk_index ?? 500) || a.id.localeCompare(b.id));
  if (plan.mode === "comparison") {
    const docs = new Set<string>();
    // Reserve evidence for distinct sources before redundant neighbors. Rank,
    // rather than inferred dates in filenames, determines candidate order.
    for (const hit of ranked) {
      if (docs.size >= 4) break;
      if (!docs.has(hit.document_id)) { add(hit); docs.add(hit.document_id); }
    }
  }
  ranked.forEach(add);
  return result;
}
export function asEvidence(hit: SearchHit): Evidence {
  return { citationId: hit.id, content: hit.content,
    source: { id: hit.document_id, chunkId: hit.id, revision: hit.index_revision,
      chunkIndex: hit.chunk_index ?? undefined, startOffset: hit.start_offset ?? undefined,
      endOffset: hit.end_offset ?? undefined, section: hit.section ?? undefined,
      title: hit.title, excerpt: hit.content } };
}
