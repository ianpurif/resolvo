import assert from "node:assert/strict";
import test from "node:test";
import { hubspot } from "@/lib/integrations/providers/hubspot";
import type { ConnectorContext } from "@/lib/integrations/types";
test("HubSpot retrieves configured CRM properties and original record links", async () => {
  const ctx: ConnectorContext = { config: { portalId: "123", objectType: "deals" }, credential: { token: "private-app" }, request: async (url) => { assert.match(url, /crm\/v3\/objects\/deals\/42\?properties=dealname/); return { status: 200, headers: {}, bytes: Buffer.from('{"id":"42","updatedAt":"v1","properties":{"dealname":"Enterprise contract","amount":"1200"}}') }; } };
  const result = await hubspot.read(ctx, "42"); assert.match(result.text!, /amount: 1200/); assert.equal(result.url, "https://app.hubspot.com/contacts/123/record/0-3/42");
});
