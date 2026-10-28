import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { authorizationRequest, stateHash } from "@/lib/integrations/oauth";
import { connectionInput } from "@/lib/integrations/service";
test("OAuth uses PKCE, random state, and a fixed application callback", () => {
  process.env.APP_URL = "https://resolvo.example"; process.env.SUPABASE_URL = "https://supabase.example"; process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fixture";
  const config = { authorizationUrl: "https://auth.example/authorize", tokenUrl: "https://auth.example/token", clientId: "client", clientSecret: "never-in-url", scope: "read" };
  const first = authorizationRequest(config), second = authorizationRequest(config), url = new URL(first.url);
  assert.notEqual(first.state, second.state);
  assert.equal(url.searchParams.get("code_challenge"), createHash("sha256").update(first.verifier).digest("base64url"));
  assert.equal(url.searchParams.get("redirect_uri"), "https://resolvo.example/api/integrations/oauth/callback");
  assert.ok(!first.url.includes(config.clientSecret)); assert.equal(stateHash(first.state).length, 64);
  assert.equal(connectionInput.safeParse({ organization_id: "forged", provider: "github", name: "GitHub", authentication: { mode: "token", token: "test" } }).success, false);
});
