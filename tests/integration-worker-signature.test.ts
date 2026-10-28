import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import test from "node:test";
import { requireWorker, workerSignatureMessage } from "@/lib/integrations/worker-auth";
import { tenantDatabase } from "./helpers/database";

test("worker validates time-bound signatures and consumes their nonces atomically", async () => {
  const secret = "a-test-signing-secret-of-at-least-32-characters";
  process.env.INTEGRATION_SYNC_SECRET = secret;
  const timestamp = String(Math.floor(Date.now() / 1000)), nonce = randomUUID();
  const signature = createHmac("sha256", secret).update(workerSignatureMessage(timestamp, nonce)).digest("hex");
  const headers = { "x-resolvo-worker-timestamp": timestamp, "x-resolvo-worker-nonce": nonce, "x-resolvo-worker-signature": signature };
  const request = (overrides: Record<string, string> = {}) => new Request("https://app.example/api/integrations/worker", { method: "POST", headers: { ...headers, ...overrides } });
  assert.deepEqual(requireWorker(request()), { nonce, issuedAt: Number(timestamp) });
  assert.throws(() => requireWorker(request({ "x-resolvo-worker-timestamp": String(Number(timestamp) - 120) })), /authorization failed/);
  assert.throws(() => requireWorker(request({ "x-resolvo-worker-signature": "0".repeat(64) })), /authorization failed/);
  assert.throws(() => requireWorker(new Request("https://app.example/api/integrations/worker", { headers })), /authorization failed/);
  const db = await tenantDatabase();
  try {
    await db.exec("set role service_role");
    await db.query("select consume_integration_worker_nonce($1,$2)", [nonce, timestamp]);
    await assert.rejects(db.query("select consume_integration_worker_nonce($1,$2)", [nonce, timestamp]), /replay/);
    await assert.rejects(db.query("select consume_integration_worker_nonce($1,$2)", [randomUUID(), Number(timestamp) - 120]), /expired/);
    await db.exec("reset role;set role authenticated");
    await assert.rejects(db.query("select consume_integration_worker_nonce($1,$2)", [randomUUID(), timestamp]), /permission denied/);
    await assert.rejects(db.query("select * from private.integration_worker_nonces"), /permission denied/);
  } finally { await db.close(); }
});
