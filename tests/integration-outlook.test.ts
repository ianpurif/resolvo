import assert from "node:assert/strict";
import test from "node:test";
import { outlook } from "@/lib/integrations/providers/outlook";
import type { ConnectorContext } from "@/lib/integrations/types";
test("Outlook selects child folders and immutable message IDs with bounded same-origin pagination", async () => {
  const mail = { id: "m1", subject: "Review process", webLink: "https://outlook.office.com/mail/id/m1", changeKey: "v1", body: { contentType: "html", content: "<p>Managers review every submitted change.</p><script>unsafe()</script>" } };
  const ctx: ConnectorContext = { config: {}, credential: { token: "fixture" }, request: async (url, options) => {
    assert.match(options!.headers!.Prefer, /ImmutableId/);
    return { status: 200, headers: {}, bytes: Buffer.from(JSON.stringify(url.includes("/messages/m1") ? mail : url.includes("/messages?") ? { value: [mail], "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/messages?$skip=50" } : { value: [{ id: "folder1", displayName: "Inbox" }] })) };
  } };
  assert.equal((await outlook.list(ctx)).items[0].id, "folder:folder1");
  assert.equal((await outlook.list(ctx, "folder:folder1")).items[0].id, "contents:folder1");
  const page = await outlook.list(ctx, "contents:folder1");
  assert.equal(page.items[0].id, "message:m1"); assert.ok(page.cursor);
  const read = await outlook.read(ctx, "message:m1");
  assert.match(read.text!, /Managers review/); assert.doesNotMatch(read.text!, /unsafe/);
  assert.equal((await outlook.read(ctx, "message:m1", "v1")).text, undefined);
  await assert.rejects(outlook.list(ctx, "contents:folder1", "https://attacker.invalid/"), /outside/);
});
