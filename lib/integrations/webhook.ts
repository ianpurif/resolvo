import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "@/lib/config";
export function verifyWebhook(body: string, headers: Headers, secret: string, provider: string, now = Date.now()) {
  const timestamp = headers.get("x-resolvo-timestamp");
  let value: string, signed: string;
  if (provider === "github" && headers.has("x-hub-signature-256")) {
    value = headers.get("x-hub-signature-256")!; signed = body;
  } else {
    if (!timestamp || !/^\d{10}$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300) throw new AppError("Webhook timestamp is missing or expired.", 401);
    value = headers.get("x-resolvo-signature") ?? ""; signed = `${timestamp}.${body}`;
  }
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(signed).digest("hex")}`), actual = Buffer.from(value);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new AppError("Webhook signature is invalid.", 401);
}
