import assert from "node:assert/strict";
import test from "node:test";
import { dropbox } from "@/lib/integrations/providers/dropbox";
import { box } from "@/lib/integrations/providers/box";
import type { ConnectorContext, ConnectorResponse } from "@/lib/integrations/types";
test("Dropbox continues folder cursors and recognizes deleted files", async () => {
  const ctx: ConnectorContext = { config: {}, credential: { token: "dropbox-token" }, request: async (url, options) => {
    if (url.endsWith("get_metadata")) return { status: 409, headers: {}, bytes: Buffer.from('{"error_summary":"path/not_found/"}') };
    assert.match(options!.body!, /cursor/); return { status: 200, headers: {}, bytes: Buffer.from(JSON.stringify({ entries: [{ id: "id:file", name: "Policy.txt", ".tag": "file" }], has_more: false, cursor: "end" })) };
  } };
  assert.equal((await dropbox.list(ctx, "folder", "cursor1")).items.length, 1);
  await assert.rejects(dropbox.read(ctx, "id:missing"), /deleted/);
});
test("Box strips authorization before following the signed download redirect", async () => {
  const ctx: ConnectorContext = { config: {}, credential: { token: "box-token" }, request: async (url, options): Promise<ConnectorResponse> => {
    if (url === "https://download.example/signed") { assert.equal(options?.headers, undefined); return { status: 200, headers: {}, bytes: Buffer.from("The real text body of the connected Box document.") }; }
    if (url.endsWith("/content")) return { status: 302, headers: { location: "https://download.example/signed" }, bytes: Buffer.alloc(0) };
    return { status: 200, headers: {}, bytes: Buffer.from('{"id":"1","name":"Policy.txt","sha1":"version1"}') };
  } };
  assert.match((await box.read(ctx, "1")).text!, /Box document/);
});
