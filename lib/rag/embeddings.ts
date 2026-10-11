import "server-only";
import { Embeddings } from "@langchain/core/embeddings";
import { createClient } from "@supabase/supabase-js";
import { setTimeout as delay } from "node:timers/promises";
import { AppError } from "@/lib/config";
import { checkDatabaseError } from "@/lib/supabase/server";
import {
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSION,
  MAX_EMBEDDING_ATTEMPTS,
  embeddingLimits,
  tokenCounts,
  selectEmbeddingBatch,
  retryAfterMilliseconds,
  embeddingBackoff,
  retryableEmbeddingFailure,
} from "./embedding-policy";
export { EMBEDDING_MODEL, EMBEDDING_DIMENSION } from "./embedding-policy";

export class EmbeddingDeferred extends AppError {
  constructor(public readonly waitMs: number) {
    super("Waiting for Voyage capacity. Indexing progress is saved.", 429);
  }
}
export class EmbeddingFailure extends AppError {
  constructor(
    message: string,
    status: number,
    public readonly retryable: boolean,
    public readonly retryAfterMs = 0,
  ) {
    super(message, status);
  }
}

function rateDatabase() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key)
    throw new AppError(
      "Configure the server's Supabase service key for the shared embedding rate budget.",
      503,
    );
  // Privileged access is restricted to the two provider-budget RPCs. Knowledge
  // reads, writes, checkpoints and retrieval still use the user's JWT and RLS.
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function embedBatch(
  texts: string[],
  inputType: "document" | "query",
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const key = process.env.VOYAGE_API_KEY?.trim();
  if (!key)
    throw new AppError(
      "Connect Voyage AI embeddings to index and search knowledge.",
      503,
    );
  const counts = await tokenCounts(texts);
  const tokens = counts.reduce((sum, count) => sum + count, 0);
  const { rpm, tpm } = embeddingLimits();
  if (!texts.length || texts.length > 128 || tokens > tpm)
    throw new EmbeddingFailure(
      "This embedding batch exceeds the configured Voyage token budget.",
      400,
      false,
    );
  const db = rateDatabase();
  const reserved = await db
    .rpc("reserve_voyage_request", {
      p_tokens: tokens,
      p_rpm: rpm,
      p_tpm: tpm,
    })
    .abortSignal(AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(5000)]));
  if (reserved.error?.code === "PGRST202")
    throw new AppError(
      "Apply the resumable indexing migration in Supabase before indexing knowledge.",
      503,
    );
  checkDatabaseError(reserved.error, "reserve embedding capacity");
  if (!reserved.data?.granted)
    throw new EmbeddingDeferred(Number(reserved.data?.wait_ms) || 1000);

  let usage: number | null = null;
  let cooldown = 0;
  try {
    const response = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: texts,
        model: EMBEDDING_MODEL,
        input_type: inputType,
        output_dimension: EMBEDDING_DIMENSION,
        output_dtype: "float",
        truncation: false,
      }),
      signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(25_000)]),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = String(
        body?.detail ??
          body?.message ??
          body?.error?.message ??
          body?.error ??
          "",
      );
      const retryable = retryableEmbeddingFailure(response.status, detail);
      const retryAfter = retryAfterMilliseconds(response.headers);
      if (response.status === 429 && retryable)
        cooldown = Math.max(60_000, retryAfter);
      const message =
        response.status === 429
          ? retryable
            ? "Voyage is rate limited. Saved indexing progress can be resumed."
            : "Voyage credits or usage quota are exhausted. Check the organization's Billing and Usage in the Voyage dashboard, then re-index."
          : response.status === 401 || response.status === 403
            ? "Voyage rejected the API key. Check VOYAGE_API_KEY and its project permissions, then re-index."
            : "Voyage could not generate embeddings. Saved indexing progress can be resumed.";
      throw new EmbeddingFailure(
        message,
        response.status,
        retryable,
        retryAfter,
      );
    }
    if (
      Number.isSafeInteger(body?.usage?.total_tokens) &&
      body.usage.total_tokens >= 0
    )
      usage = body.usage.total_tokens;
    const data = body?.data;
    if (!Array.isArray(data) || data.length !== texts.length)
      throw new EmbeddingFailure(
        "Voyage returned an incomplete embedding batch.",
        502,
        true,
      );
    const vectors: number[][] = [];
    for (const entry of data) {
      if (
        !Number.isInteger(entry.index) ||
        entry.index < 0 ||
        entry.index >= texts.length ||
        vectors[entry.index] ||
        !Array.isArray(entry.embedding) ||
        entry.embedding.length !== EMBEDDING_DIMENSION ||
        !entry.embedding.every(Number.isFinite) ||
        !entry.embedding.some((value: number) => value !== 0)
      )
        throw new EmbeddingFailure(
          "Voyage returned an invalid embedding vector.",
          502,
          true,
        );
      vectors[entry.index] = entry.embedding;
    }
    return vectors;
  } catch (error) {
    if (error instanceof EmbeddingFailure) throw error;
    throw new EmbeddingFailure(
      "Voyage's connection failed. Saved indexing progress can be resumed.",
      502,
      true,
    );
  } finally {
    const settled = await db
      .rpc("settle_voyage_request", {
        p_id: reserved.data.reservation,
        p_tokens: usage,
        p_cooldown_ms: cooldown,
      })
      .abortSignal(AbortSignal.timeout(5000));
    if (settled.error)
      console.error(
        "[embeddings] Budget reconciliation failed",
        settled.error.code,
      );
  }
}

// The application owns the bounded provider transport/rate budget. Implement
// LangChain's minimal interface without loading an unused MongoDB integration.
class ReliableVoyageEmbeddings extends Embeddings {
  constructor(private readonly type: "document" | "query", private readonly signal?: AbortSignal) {
    super({
      maxRetries: 0,
      maxConcurrency: 1,
    });
  }
  override async embedDocuments(texts: string[]) {
    const counts = await tokenCounts(texts);
    const pending = texts.map((content, index) => ({
      content,
      token_count: counts[index],
    }));
    const vectors: number[][] = [];
    while (vectors.length < texts.length) {
      const batch = selectEmbeddingBatch(pending.slice(vectors.length));
      vectors.push(
        ...(await this.withRetry(batch.chunks.map((chunk) => chunk.content))),
      );
    }
    return vectors;
  }
  override async embedQuery(text: string) {
    return (await this.withRetry([text]))[0];
  }
  private async withRetry(texts: string[]) {
    // Queries have a deadline so a provider outage cannot consume the chat's
    // entire route lifetime. Document jobs retry durably via continuation RPCs.
    const deadline = Date.now() + 65_000;
    let failures = 0;
    while (true) {
      try {
        return await embedBatch(texts, this.type, this.signal);
      } catch (error) {
        this.signal?.throwIfAborted();
        const wait =
          error instanceof EmbeddingDeferred
            ? error.waitMs
            : error instanceof EmbeddingFailure &&
                error.retryable &&
                failures < MAX_EMBEDDING_ATTEMPTS - 1
              ? embeddingBackoff(failures++, error.status, error.retryAfterMs)
              : 0;
        if (!wait || Date.now() + wait + 25_000 > deadline) throw error;
        await delay(wait, undefined, { signal: this.signal });
      }
    }
  }
}

export function embeddings(inputType: "document" | "query", signal?: AbortSignal) {
  if (!process.env.VOYAGE_API_KEY?.trim())
    throw new AppError(
      "Connect Voyage AI embeddings to index and search knowledge.",
      503,
    );
  return new ReliableVoyageEmbeddings(inputType, signal);
}
