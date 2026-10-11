import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { vectorStore } from "./vector-store";
import { embeddings, EMBEDDING_MODEL } from "./embeddings";
import { checkDatabaseError } from "@/lib/supabase/server";
import type { TenantContext } from "@/lib/auth";
import type { Source } from "@/types";
const metadataSchema = z.object({
  documentId: z.uuid(),
  organizationId: z.uuid(),
  title: z.string(),
});
export async function retrieveKnowledge(context: TenantContext, query: string) {
  const normalized = query.trim().replace(/\s+/g, " ").slice(0, 1500);
  const hash = createHash("sha256").update(normalized).digest("hex");
  const cached = await context.db
    .from("query_embeddings")
    .select("embedding")
    .eq("organization_id", context.organization.id)
    .eq("query_hash", hash)
    .eq("model", EMBEDDING_MODEL)
    .gt("created_at", new Date(Date.now() - 7 * 86400000).toISOString())
    .maybeSingle();
  checkDatabaseError(cached.error, "read the query embedding");
  let vector: number[];
  let cacheWrite: PromiseLike<unknown> = Promise.resolve();
  if (cached.data)
    vector =
      typeof cached.data.embedding === "string"
        ? JSON.parse(cached.data.embedding)
        : cached.data.embedding;
  else {
    vector = await embeddings("query").embedQuery(normalized);
    cacheWrite = context.db
      .rpc("cache_query_embedding", { p_hash: hash, p_embedding: vector })
      .then((stored) => {
        if (stored.error)
          console.error("[retrieval] Query embedding cache write failed");
      });
  }
  // SQL resolves the same membership and filters the tenant BEFORE vector ranking.
  const [results] = await Promise.all([
    vectorStore(context).similaritySearchVectorWithScore(vector, 4),
    cacheWrite,
  ]);
  return results.flatMap(([document, score]) => {
    const parsed = metadataSchema.safeParse(document.metadata);
    if (
      score < 0.35 ||
      !parsed.success ||
      parsed.data.organizationId !== context.organization.id
    )
      return [];
    const source: Source = {
      id: parsed.data.documentId,
      title: parsed.data.title,
      excerpt: document.pageContent.slice(0, 600),
    };
    return [{ source, content: document.pageContent.slice(0, 1400) }];
  });
}
