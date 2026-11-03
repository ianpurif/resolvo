import assert from "node:assert/strict";
import test from "node:test";
import { zendesk } from "@/lib/integrations/providers/zendesk";
import type { ConnectorContext } from "@/lib/integrations/types";
test("Zendesk indexes article text and retains its Help Center link", async () => {
  const ctx: ConnectorContext = { config: { baseUrl: "https://company.zendesk.com" }, credential: {}, request: async () => ({ status: 200, headers: {}, bytes: Buffer.from('{"article":{"id":1,"title":"Returns","body":"<p>Returns are accepted for thirty days.</p>","html_url":"https://company.zendesk.com/hc/articles/1"}}') }) };
  const d = await zendesk.read(ctx, "1"); assert.match(d.text!, /thirty days/); assert.match(d.url!, /articles\/1/);
});
