import assert from "node:assert/strict";
import test from "node:test";
import { googleDrive } from "@/lib/integrations/providers/google-drive";
import type { ConnectorContext, ConnectorRequest } from "@/lib/integrations/types";
export function fixtureContext(handler: ConnectorRequest, config: Record<string, string> = {}): ConnectorContext {
  return { config, credential: { token: "test-token" }, request: handler };
}
export function reply(value: unknown, status = 200) {
  return { status, headers: {}, bytes: Buffer.from(typeof value === "string" ? value : JSON.stringify(value)) };
}
test("Drive pages folders, exports native documents and skips unchanged downloads", async () => {
  const calls: string[] = [];
  const ctx = fixtureContext(async (url) => {
    calls.push(url);
    if (url.includes("/export?")) return reply("The indexed document contains the current support policy.");
    if (url.includes("/files/doc?")) return reply({ id: "doc", name: "Policy", mimeType: "application/vnd.google-apps.document", version: "12" });
    return reply({ files: [{ id: "folder", name: "Policies", mimeType: "application/vnd.google-apps.folder" }], nextPageToken: "page2" });
  });
  assert.equal((await googleDrive.list(ctx)).items[0].kind, "container");
  assert.equal((await googleDrive.list(ctx, "folder", "page2")).cursor, "page2");
  assert.ok(calls.at(-1)?.includes("pageToken=page2"));
  assert.match((await googleDrive.read(ctx, "doc")).text!, /support policy/);
  const before = calls.length;
  assert.equal((await googleDrive.read(ctx, "doc", "12")).text, undefined);
  assert.equal(calls.length, before + 1);
});
