import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { TenantContext } from "@/lib/auth";
import { AppError } from "@/lib/config";
import { checkDatabaseError } from "@/lib/supabase/server";
import { EMBEDDING_MODEL } from "./embedding-policy";

export function cachedQueryVector(value: unknown): number[] | null {
  try {
    const vector = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(vector) && vector.length === 1024 && vector.every(Number.isFinite) && vector.some((v) => v !== 0) ? vector : null;
  } catch { return null; }
}
export function queryEmbeddingHash(query: string) {
  return createHash("sha256").update(JSON.stringify({ query, model: EMBEDDING_MODEL, type: "query", dimensions: 1024, version: 2 })).digest("hex");
}
function cacheDatabase() {
  const url = process.env.SUPABASE_URL?.trim(), key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new AppError("Configure the server's Supabase service key for the trusted query cache.", 503);
  // This privileged client accesses derived vectors only. Source evidence and
  // indexing continue through the user's JWT and database authorization.
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
function cacheError(error: { code?: string; message: string } | null) {
  if (error && ["PGRST202", "42883", "42703"].includes(error.code ?? ""))
    throw new AppError("Apply supabase/migrations/202610110003_server_only_query_cache.sql before searching knowledge.", 503);
  checkDatabaseError(error, "read the trusted query cache");
}
export async function readQueryEmbedding(context: TenantContext, hash: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const result = await cacheDatabase().from("query_embeddings").select("embedding")
    .eq("organization_id", context.organization.id).eq("query_hash", hash).eq("model", EMBEDDING_MODEL)
    .eq("server_verified", true).gt("created_at", new Date(Date.now() - 7 * 86400000).toISOString())
    .abortSignal(signal).maybeSingle();
  cacheError(result.error);
  return cachedQueryVector(result.data?.embedding);
}
export async function storeQueryEmbedding(context: TenantContext, hash: string, vector: number[], signal: AbortSignal) {
  signal.throwIfAborted();
  if (!/^[0-9a-f]{64}$/.test(hash) || !cachedQueryVector(vector)) throw new AppError("Invalid query embedding.", 502);
  const result = await cacheDatabase().rpc("store_query_embedding", {
    // Resolved by server authentication; never accepted from a request body.
    p_organization_id: context.organization.id, p_hash: hash, p_embedding: vector,
  }).abortSignal(signal);
  if (result.error && ["PGRST202", "42883", "42703"].includes(result.error.code ?? "")) cacheError(result.error);
  if (result.error) console.error(JSON.stringify({ event: "rag.cache_write_failed", code: result.error.code }));
}
