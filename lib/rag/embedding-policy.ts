import { Tokenizer } from "@huggingface/tokenizers";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import path from "node:path";

export const EMBEDDING_MODEL = "voyage-4-lite";
export const EMBEDDING_DIMENSION = 1024;
export const MAX_EMBEDDING_ATTEMPTS = 6;

let tokenizer: Promise<Tokenizer> | undefined;
export function voyageTokenizer() {
  tokenizer ??= readFile(
    path.join(process.cwd(), "lib/rag/assets/voyage-4-tokenizer.json.gz"),
  ).then(
    (bytes) => new Tokenizer(JSON.parse(gunzipSync(bytes).toString()), {}),
  );
  return tokenizer;
}

export function embeddingLimits() {
  function positive(name: string, fallback: number) {
    const value = process.env[name]?.trim();
    if (!value) return fallback;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1)
      throw new Error(`${name} must be a positive integer.`);
    return parsed;
  }
  const rpm = positive("VOYAGE_REQUESTS_PER_MINUTE", 3);
  const tpm = positive("VOYAGE_TOKENS_PER_MINUTE", 10_000);
  // Leave room for queries; also bound each provider request independently of
  // account tier. Input-type prompts/special tokens receive a per-input margin.
  return {
    rpm,
    tpm,
    batchTokens: Math.max(1, Math.min(12_000, Math.floor(tpm * 0.45))),
  };
}

export async function tokenCounts(texts: string[]) {
  const encoder = await voyageTokenizer();
  return texts.map((text) => encoder.encode(text).ids.length + 16);
}

export function selectEmbeddingBatch<T extends { token_count: number }>(
  chunks: T[],
  budget = embeddingLimits().batchTokens,
) {
  const selected: T[] = [];
  let tokens = 0;
  for (const chunk of chunks) {
    if (chunk.token_count > budget)
      throw new Error("A knowledge chunk exceeds the configured token budget.");
    if (selected.length >= 128 || tokens + chunk.token_count > budget) break;
    selected.push(chunk);
    tokens += chunk.token_count;
  }
  return { chunks: selected, tokens };
}

export function retryAfterMilliseconds(headers: Headers, now = Date.now()) {
  const milliseconds = Number(headers.get("retry-after-ms"));
  if (Number.isFinite(milliseconds) && milliseconds > 0) return milliseconds;
  const value = headers.get("retry-after");
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0)
    return Math.ceil(seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : 0;
}

export function embeddingBackoff(
  attempt: number,
  status?: number,
  retryAfterMs = 0,
  random = Math.random(),
) {
  const base = status === 429 ? 60_000 : 1000;
  return (
    Math.max(retryAfterMs, Math.min(300_000, base * 2 ** attempt)) +
    Math.floor(random * 1000)
  );
}

export function retryableEmbeddingFailure(status?: number, message = "") {
  if (
    /insufficient[_ -]?quota|quota (?:has been )?exhausted|out of credits|credit balance|monthly (?:usage|spend|spending) limit|usage quota (?:exceeded|exhausted)/i.test(
      message,
    )
  )
    return false;
  return (
    status === undefined || status === 408 || status === 429 || status >= 500
  );
}
