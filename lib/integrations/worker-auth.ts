import "server-only";
import { timingSafeEqual } from "node:crypto";
import { AppError } from "@/lib/config";
export function requireWorker(request: Request) {
  const secret = process.env.INTEGRATION_SYNC_SECRET?.trim();
  if (!secret || secret.length < 32) throw new AppError("Configure a worker secret of at least 32 characters.", 503);
  const expected = Buffer.from(`Bearer ${secret}`), actual = Buffer.from(request.headers.get("authorization") ?? "");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new AppError("Worker authorization failed.", 401);
}
