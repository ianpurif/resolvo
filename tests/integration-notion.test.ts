import assert from "node:assert/strict";
import test from "node:test";
import { notion } from "@/lib/integrations/providers/notion";
import type { ConnectorContext } from "@/lib/integrations/types";
test("Notion extracts nested blocks and paginated tables without dropping later blocks", async () => {
  const ctx: ConnectorContext = { config: {}, credential: { token: "notion-token" }, request: async (url) => ({ status: 200, headers: {}, bytes: Buffer.from(JSON.stringify(url.includes("/pages/")
    ? { id: "p", url: "https://notion.so/p", last_edited_time: "v1", properties: { title: { title: [{ plain_text: "Policy" }] } } }
    : url.includes("/blocks/child/") ? { results: [{ id: "row", type: "table_row", table_row: { cells: [[{ plain_text: "Leave" }], [{ plain_text: "25 days" }]] } }], has_more: false }
      : url.includes("start_cursor") ? { results: [{ id: "end", type: "paragraph", paragraph: { rich_text: [{ plain_text: "End of policy." }] } }], has_more: false }
        : { results: [{ id: "child", type: "table", has_children: true, table: {} }], has_more: true, next_cursor: "second" })) }) };
  const result = await notion.read(ctx, "p"); assert.match(result.text!, /Leave \| 25 days/); assert.match(result.text!, /End of policy/);
});
