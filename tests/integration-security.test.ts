import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { seal, unseal } from "@/lib/integrations/credentials";
import { integrationUrl, sameOriginUrl, publicAddresses, checkResponse } from "@/lib/integrations/http";
test("credentials authenticate ciphertext and bind it to the tenant and connection", () => {
  process.env.INTEGRATION_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const value = seal({ token: "test-private-token" }, "tenant/connection");
  assert.ok(!value.includes("test-private-token"));
  assert.deepEqual(unseal(value, "tenant/connection"), { token: "test-private-token" });
  assert.throws(() => unseal(value, "other/connection"), /decrypted/);
  const parts = value.split("."); parts[3] = Buffer.from("tampered").toString("base64url");
  assert.throws(() => unseal(parts.join("."), "tenant/connection"), /decrypted/);
  delete process.env.INTEGRATION_ENCRYPTION_KEY;
  assert.throws(() => seal({}, "scope"), /32-byte key/);
});
test("connector transport rejects unsafe URLs, DNS addresses and off-origin pagination", async () => {
  for (const url of ["http://example.com", "https://localhost", "https://169.254.169.254/latest", "https://[::1]", "https://user:secret@example.com", "https://example.com:8443"])
    assert.throws(() => integrationUrl(url));
  for (const host of ["127.0.0.1", "10.0.0.1", "::ffff:127.0.0.1", "169.254.169.254"])
    await assert.rejects(publicAddresses(host, AbortSignal.timeout(1000)), /Private/);
  assert.throws(() => sameOriginUrl("https://api.github.com", "https://attacker.example/steal"), /outside/);
  assert.equal(sameOriginUrl("https://api.github.com", "/user/repos?page=2"), "https://api.github.com/user/repos?page=2");
  assert.throws(() => checkResponse({ status: 429, bytes: Buffer.from("secret response"), headers: { "retry-after": "120" } }), (e: unknown) => e instanceof Error && !e.message.includes("secret"));
});
