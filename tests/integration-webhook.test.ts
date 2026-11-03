import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { verifyWebhook } from "@/lib/integrations/webhook";
test("webhooks verify raw signatures and reject expired events and altered payloads", () => {
  const body = '{"changed":"file"}', secret = "a-long-private-test-webhook-secret", timestamp = "1780000000", now = Number(timestamp) * 1000;
  const signature = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
  const headers = new Headers({ "x-resolvo-timestamp": timestamp, "x-resolvo-signature": signature });
  verifyWebhook(body, headers, secret, "custom-api", now);
  assert.throws(() => verifyWebhook(body + " ", headers, secret, "custom-api", now), /signature/);
  assert.throws(() => verifyWebhook(body, headers, secret, "custom-api", now + 301000), /expired/);
  verifyWebhook(body, new Headers({ "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}` }), secret, "github", now);
});
