import assert from "node:assert/strict";
import test from "node:test";
import { microsoftFiles } from "@/lib/integrations/providers/microsoft-files";
import type { ConnectorContext } from "@/lib/integrations/types";
test("Microsoft follows same-origin pagination and downloads without bearer credentials", async () => {
  let downloaded = false;
  const ctx: ConnectorContext = { config: {}, credential: { token: "private" }, request: async (url, opts) => {
    if (url.startsWith("https://download.example")) { assert.equal(opts?.headers?.Authorization, undefined); downloaded = true; return { status: 200, headers: {}, bytes: Buffer.from("The Microsoft policy document text.") }; }
    assert.equal(opts?.headers?.Authorization, "Bearer private");
    return { status: 200, headers: {}, bytes: Buffer.from(JSON.stringify({ id: "f", name: "policy.txt", eTag: "v1", "@microsoft.graph.downloadUrl": "https://download.example/signed" })) };
  } };
  assert.match((await microsoftFiles.read(ctx, "drive|f")).text!, /Microsoft/);
  assert.ok(downloaded);
  await assert.rejects(microsoftFiles.list(ctx, "drive|root", "https://attacker.example"), /outside/);
});
