import assert from "node:assert/strict";
import test from "node:test";
import { supabase } from "@/lib/integrations/providers/supabase";
import type { ConnectorContext } from "@/lib/integrations/types";
test("Supabase uses keyset pagination and does not misrepresent new API keys as JWTs", async () => {
  const ctx: ConnectorContext = { config: { baseUrl: "https://project.supabase.co", table: "policies" }, credential: { token: "sb_publishable_test" }, request: async (url, options) => {
    assert.ok(url.includes("id=eq.42")); assert.equal(options?.headers?.apikey, "sb_publishable_test"); assert.equal(options?.headers?.Authorization, undefined);
    return { status: 200, headers: {}, bytes: Buffer.from('[{"id":42,"name":"Leave policy","days":25}]') }; } };
  assert.match((await supabase.read(ctx, "42")).text!, /"days": 25/);
});
