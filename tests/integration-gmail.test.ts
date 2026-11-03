import assert from "node:assert/strict";
import test from "node:test";
import { gmail } from "@/lib/integrations/providers/gmail";
import type { ConnectorContext } from "@/lib/integrations/types";
test("Gmail paginates label selections, decodes MIME bodies without duplicate alternatives or attachments", async () => {
  const message = { id: "m1", threadId: "t1", historyId: "v1", payload: { mimeType: "multipart/mixed", headers: [{ name: "Subject", value: "Team review" }], parts: [{ mimeType: "multipart/alternative", parts: [{ mimeType: "text/plain", body: { data: Buffer.from("The manager reviews all changes.").toString("base64url") } }, { mimeType: "text/html", body: { data: Buffer.from("<p>Duplicate HTML</p>").toString("base64url") } }] }, { filename: "private.txt", mimeType: "text/plain", body: { data: Buffer.from("Attachment excluded").toString("base64url") } }] } };
  const calls: string[] = [];
  const ctx: ConnectorContext = { config: { query: "after:2025/01/01" }, credential: { token: "fixture" }, request: async (url) => { calls.push(url); return { status: 200, headers: {}, bytes: Buffer.from(JSON.stringify(url.endsWith("/labels") ? { labels: [{ id: "INBOX", name: "Inbox" }] } : new URL(url).pathname.endsWith("/messages") ? { messages: [{ id: "m1" }], nextPageToken: "page2" } : message)) }; } };
  assert.equal((await gmail.list(ctx)).items[0].id, "label:INBOX");
  const page = await gmail.list(ctx, "label:INBOX");
  assert.equal(page.cursor, "page2"); assert.equal(page.items[0].name, "Team review");
  assert.ok(calls.some((url) => new URL(url).searchParams.get("q") === "after:2025/01/01"));
  const read = await gmail.read(ctx, "message:m1");
  assert.match(read.text!, /manager reviews/); assert.doesNotMatch(read.text!, /Duplicate|Attachment/);
  assert.equal(read.url, "https://mail.google.com/mail/u/0/#all/t1");
  assert.equal((await gmail.read(ctx, "message:m1", "v1")).text, undefined);
});
