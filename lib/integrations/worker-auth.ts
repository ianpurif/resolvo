import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "@/lib/config";
import { integrationDatabase, integrationError } from "./database";
export type WorkerProof = { nonce: string; issuedAt: number };
export function workerSignatureMessage(timestamp: string, nonce: string) {
  return `POST\n/api/integrations/worker\n${timestamp}\n${nonce}`;
}
export function requireWorker(request: Request): WorkerProof | null {
  const secret = process.env.INTEGRATION_SYNC_SECRET?.trim();
  if (!secret || secret.length < 32) throw new AppError("Configure a worker secret of at least 32 characters.", 503);
  const expected = Buffer.from(`Bearer ${secret}`), actual = Buffer.from(request.headers.get("authorization") ?? "");
  if (expected.length === actual.length && timingSafeEqual(expected, actual)) return null;
  const timestamp = request.headers.get("x-resolvo-worker-timestamp") ?? "";
  const nonce = request.headers.get("x-resolvo-worker-nonce") ?? "";
  const signature = request.headers.get("x-resolvo-worker-signature") ?? "";
  if (request.method !== "POST" || !/^\d{10}$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 60
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(nonce) || !/^[0-9a-f]{64}$/.test(signature))
    throw new AppError("Worker authorization failed.", 401);
  const signed = createHmac("sha256", secret).update(workerSignatureMessage(timestamp, nonce)).digest();
  if (!timingSafeEqual(signed, Buffer.from(signature, "hex"))) throw new AppError("Worker authorization failed.", 401);
  return { nonce, issuedAt: Number(timestamp) };
}
export async function consumeWorkerProof(proof: WorkerProof | null) {
  if (!proof) return;
  const result = await integrationDatabase().rpc("consume_integration_worker_nonce", { p_nonce: proof.nonce, p_issued_at: proof.issuedAt });
  if (result.error && /expired|replay/.test(result.error.message)) throw new AppError("Worker authorization expired or was already used.", 401);
  integrationError(result.error);
}
