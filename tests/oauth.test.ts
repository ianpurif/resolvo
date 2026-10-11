import assert from "node:assert/strict";
import test from "node:test";
import { inspectGoogleOAuth } from "../lib/auth/oauth-diagnostics";

for (const origin of [
  "http://localhost:3000",
  "https://production.fixture.invalid",
]) {
  test(
    "OAuth uses the Supabase callback at Google and the app callback for the return to " +
      origin,
    async (t) => {
      let requests = 0;
      t.mock.method(
        globalThis,
        "fetch",
        async (input: string | URL | Request) => {
          const url = new URL(input instanceof Request ? input.url : input);
          requests++;
          if (url.hostname === "fixture.supabase.co") {
            assert.equal(url.pathname, "/auth/v1/authorize");
            assert.equal(url.searchParams.get("provider"), "google");
            assert.equal(
              url.searchParams.get("redirect_to"),
              origin + "/auth/callback",
            );
            assert.equal(url.searchParams.get("code_challenge_method"), "s256");
            assert.ok(url.searchParams.get("code_challenge"));
            return new Response(null, {
              status: 302,
              headers: {
                location:
                  "https://accounts.google.com/o/oauth2/v2/auth?client_id=public-fixture-client&redirect_uri=https%3A%2F%2Ffixture.supabase.co%2Fauth%2Fv1%2Fcallback",
              },
            });
          }
          assert.equal(url.hostname, "accounts.google.com");
          if (url.pathname === "/o/oauth2/v2/auth")
            return new Response(null, {
              status: 302,
              headers: { location: "/v3/signin/identifier" },
            });
          return new Response(
            "<html><form>Google account sign-in</form></html>",
          );
        },
      );
      const result = await inspectGoogleOAuth({
        url: "https://fixture.supabase.co",
        key: "sb_publishable_fixture",
        origin,
      });
      assert.equal(result.appCallback, origin + "/auth/callback");
      assert.equal(
        result.googleCallback,
        "https://fixture.supabase.co/auth/v1/callback",
      );
      assert.equal(result.googleClientId, "public-fixture-client");
      assert.equal(result.pkceReady, true);
      assert.equal(result.readyForInteractiveLogin, true);
      assert.equal(result.googleError, null);
      assert.equal(requests, 3);
    },
  );
}

test("OAuth verification detects Google's redirect_uri_mismatch even when its error page returns HTTP 200", async (t) => {
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.hostname === "fixture.supabase.co")
      return new Response(null, {
        status: 302,
        headers: {
          location:
            "https://accounts.google.com/o/oauth2/v2/auth?client_id=public-fixture-client&redirect_uri=https%3A%2F%2Ffixture.supabase.co%2Fauth%2Fv1%2Fcallback",
        },
      });
    if (url.pathname === "/o/oauth2/v2/auth")
      return new Response(null, {
        status: 302,
        headers: { location: "/signin/oauth/error" },
      });
    return new Response(
      '<span data-response-code="400" data-error-code="redirect_uri_mismatch">Access blocked</span>',
    );
  });
  const result = await inspectGoogleOAuth({
    url: "https://fixture.supabase.co",
    key: "sb_publishable_fixture",
    origin: "http://localhost:3000",
  });
  assert.equal(result.googleError, "redirect_uri_mismatch");
  assert.equal(result.readyForInteractiveLogin, false);
});
