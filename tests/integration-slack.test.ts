import assert from "node:assert/strict";
import test from "node:test";
import { slackConnector } from "@/lib/integrations/providers/slack";
import type { ConnectorContext } from "@/lib/integrations/types";
test("Slack threads become separately resumable source pages and preserve message permalinks", async () => {
  const ctx: ConnectorContext = { config: { workspaceUrl: "https://company.slack.com" }, credential: { token: "user-token" }, request: async (url) => ({ status: 200, headers: {}, bytes: Buffer.from(JSON.stringify({ ok: true, messages: [{ ts: url.includes("replies") ? "100.002" : "100.001", text: "Our current support policy is documented here.", reply_count: 1 }], response_metadata: {} })) }) };
  const page = await slackConnector.list(ctx, "C1"); assert.equal(page.items.length, 2); assert.equal(page.items[1].kind, "container");
  const replies = await slackConnector.list(ctx, page.items[1].id); assert.equal(replies.items.length, 1);
  assert.equal((await slackConnector.read(ctx, replies.items[0].id)).url, "https://company.slack.com/archives/C1/p100002");
});
