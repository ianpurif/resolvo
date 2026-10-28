import assert from "node:assert/strict";
import test from "node:test";
import { confluence } from "@/lib/integrations/providers/confluence";
import type { ConnectorContext } from "@/lib/integrations/types";
test("Confluence extracts visible storage text and rejects off-origin page links", async () => {
  const ctx: ConnectorContext = { config: { baseUrl: "https://company.atlassian.net" }, credential: {}, request: async () => ({ status: 200, headers: {}, bytes: Buffer.from(JSON.stringify({ id: "1", title: "Policy", version: { number: 2 }, body: { storage: { value: "<p>Visible company policy.</p><script>secret script</script>" } } })) }) };
  const d = await confluence.read(ctx, "1"); assert.match(d.text!, /Visible company/); assert.ok(!d.text!.includes("script"));
  await assert.rejects(confluence.list(ctx, "@collection", "https://attacker.example"), /outside/);
});
