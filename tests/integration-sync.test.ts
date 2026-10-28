import assert from "node:assert/strict";
import test from "node:test";
import { contentIdentity, syncTasks } from "@/lib/integrations/sync";
import { requireWorker } from "@/lib/integrations/worker-auth";
test("sync identity avoids repeat embeddings and traversal keys deduplicate overlapping folders", () => {
  const first = contentIdentity({ name: "Policy", text: "  The policy has a stable readable value.\r\n", url: "javascript:alert(1)" });
  const second = contentIdentity({ name: "Renamed policy", text: "The policy has a stable readable value.\n" });
  assert.equal(first.hash, second.hash); assert.equal(first.url, undefined);
  assert.throws(() => contentIdentity({ name: "Too large", text: "a".repeat(250001) }), /250,000/);
  const items = [{ id: "file", name: "File", kind: "document" as const }];
  assert.equal(syncTasks(items, "folder-a")[0].key, syncTasks(items, "folder-b")[0].key);
  assert.notEqual(syncTasks([], "folder-a", "page2")[0].key, syncTasks([], "folder-b", "page2")[0].key);
});
test("background worker requires a strong bearer secret", () => {
  process.env.INTEGRATION_SYNC_SECRET = "test-worker-secret-that-is-long-enough";
  assert.throws(() => requireWorker(new Request("https://app.example/api/integrations/worker")), /authorization/);
  requireWorker(new Request("https://app.example/api/integrations/worker", { headers: { Authorization: `Bearer ${process.env.INTEGRATION_SYNC_SECRET}` } }));
});
