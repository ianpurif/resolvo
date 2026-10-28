import assert from "node:assert/strict";
import test from "node:test";
import { asana } from "@/lib/integrations/providers/asana";
import type { ConnectorContext } from "@/lib/integrations/types";
test("Asana unwraps task responses and retains descriptions and permalinks", async () => {
  const ctx: ConnectorContext = { config: { projectId: "1" }, credential: {}, request: async () => ({ status: 200, headers: {}, bytes: Buffer.from('{"data":{"gid":"2","name":"Release","notes":"Review the deployment checklist.","completed":false,"permalink_url":"https://app.asana.com/0/1/2"}}') }) };
  assert.match((await asana.read(ctx, "2")).text!, /deployment checklist/);
});
