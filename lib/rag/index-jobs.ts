import "server-only";
import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/config";
import { checkDatabaseError } from "@/lib/supabase/server";
import type { TenantContext } from "@/lib/auth";
import { requireKnowledgeOwner } from "@/lib/auth-context";
import type { KnowledgeDocument } from "@/types";
import { embedBatch, EmbeddingDeferred, EmbeddingFailure } from "./embeddings";
import { embeddingBackoff, selectEmbeddingBatch } from "./embedding-policy";

export type IndexJob = {
  revision: string;
  document_id: string;
  file_path: string;
  content_hash: string;
  name: string;
  completed: number;
  attempts: number;
  lease_until: string | null;
  manifest: { content: string; token_count: number }[];
};

export async function pendingIndex(context: TenantContext, id: string) {
  const result = await context.db
    .from("document_index_jobs")
    .select(
      "revision,document_id,file_path,content_hash,name,completed,attempts,lease_until,manifest",
    )
    .eq("organization_id", context.organization.id)
    .eq("document_id", id)
    .maybeSingle();
  if (result.error?.code === "PGRST205" || result.error?.code === "42P01")
    throw new AppError(
      "Apply supabase/migrations/202610090001_resumable_indexing.sql in Supabase's SQL Editor before indexing knowledge.",
      503,
    );
  checkDatabaseError(result.error, "read saved indexing progress");
  return result.data as IndexJob | null;
}

export async function continueIndexing(context: TenantContext, id: string) {
  requireKnowledgeOwner(context);
  const lease = randomUUID();
  const claim = await context.db
    .rpc("claim_document_index_batch", {
      p_id: id,
      p_lease: lease,
    })
    .abortSignal(AbortSignal.timeout(5000));
  checkDatabaseError(claim.error, "claim the next indexing batch");
  if (!claim.data.claimed) return claim.data.document as KnowledgeDocument;
  const job = claim.data.job as IndexJob;
  try {
    let batch;
    try {
      batch = selectEmbeddingBatch(job.manifest.slice(job.completed));
    } catch {
      throw new EmbeddingFailure(
        "The configured Voyage token budget is too small for a knowledge chunk. Check the account's TPM setting.",
        400,
        false,
      );
    }
    const vectors = await embedBatch(
      batch.chunks.map((chunk) => chunk.content),
      "document",
    );
    const checkpoint = await context.db
      .rpc("checkpoint_document_index_batch", {
        p_id: id,
        p_lease: lease,
        p_offset: job.completed,
        p_vectors: vectors,
      })
      .abortSignal(AbortSignal.timeout(5000));
    checkDatabaseError(checkpoint.error, "save the indexed batch");
    const retired = checkpoint.data.retired_file as string | null;
    if (
      retired?.startsWith(
        `organizations/${context.organization.id}/documents/${id}/`,
      )
    ) {
      const removed = await context.db.storage
        .from("support-documents")
        .remove([retired]);
      if (removed.error)
        console.error("[indexing] Retired file cleanup failed");
    }
    return checkpoint.data.document as KnowledgeDocument;
  } catch (error) {
    // A successful checkpoint can lose its HTTP response. Read back the durable
    // cursor before treating it as a failed batch or touching a newer lease.
    const current = await context.db
      .from("document_index_jobs")
      .select("completed,revision,lease")
      .eq("document_id", id)
      .eq("organization_id", context.organization.id)
      .abortSignal(AbortSignal.timeout(5000))
      .maybeSingle();
    if (
      !current.error &&
      (!current.data ||
        current.data.completed > job.completed ||
        current.data.revision !== job.revision ||
        current.data.lease !== lease)
    ) {
      const document = await context.db
        .from("documents")
        .select("*")
        .eq("id", id)
        .eq("organization_id", context.organization.id)
        .abortSignal(AbortSignal.timeout(5000))
        .maybeSingle();
      checkDatabaseError(document.error, "read committed indexing progress");
      if (!document.data) throw new AppError("Document not found.", 404);
      return document.data as KnowledgeDocument;
    }
    const deferred = error instanceof EmbeddingDeferred;
    const transient =
      error instanceof EmbeddingFailure
        ? error.retryable
        : error instanceof AppError
          ? error.status >= 500 && error.status !== 503
          : true;
    const waitMs = deferred
      ? error.waitMs
      : embeddingBackoff(
          job.attempts,
          error instanceof AppError ? error.status : undefined,
          error instanceof EmbeddingFailure ? error.retryAfterMs : 0,
        );
    const message =
      (error instanceof AppError
        ? error.message
        : "Indexing could not finish.") +
      " Re-index to resume saved progress; the original and previous index are retained.";
    const saved = await context.db
      .rpc("defer_document_index_batch", {
        p_id: id,
        p_lease: lease,
        p_delay_ms: Math.min(2_147_483_647, Math.ceil(waitMs)),
        p_message: message,
        p_failure: !deferred,
        p_terminal: !deferred && !transient,
      })
      .abortSignal(AbortSignal.timeout(5000));
    checkDatabaseError(saved.error, "save indexing recovery status");
    if (!deferred)
      console.error("[indexing] Batch deferred", {
        status: error instanceof AppError ? error.status : "connection",
        attempt: job.attempts + 1,
        completed: job.completed,
      });
    return saved.data as KnowledgeDocument;
  }
}
