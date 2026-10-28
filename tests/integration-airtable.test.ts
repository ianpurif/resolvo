import assert from "node:assert/strict";
import test from "node:test";
import { airtable } from "@/lib/integrations/providers/airtable";
import type { ConnectorContext } from "@/lib/integrations/types";
test("Airtable preserves record field names and encodes pagination cursors", async () => {
  const ctx: ConnectorContext = { config: { baseId: "app1", tableId: "tbl1" }, credential: {}, request: async (url) => { assert.match(url, /offset=a%2Fb/); return { status: 200, headers: {}, bytes: Buffer.from('{"records":[{"id":"rec1","fields":{"Name":"Policy","Allowance":25}}],"offset":"next"}') }; } };
  const page = await airtable.list(ctx, "@collection", "a/b"); assert.equal(page.items[0].name, "Policy"); assert.equal(page.cursor, "next");
});
