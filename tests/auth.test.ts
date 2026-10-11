import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { resolveIdentity, resolveWorkspace } from "../lib/auth-context";
import { AppError, authConfiguration } from "../lib/config";

test("backend verifies the identity with Supabase and resolves membership from that user, ignoring claimed organization metadata", async (t) => {
  const userId = randomUUID(),
    orgA = randomUUID(),
    claimedOrg = randomUUID();
  let provider = "google",
    exists = true,
    verified = true;
  const paths: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input);
    paths.push(url.pathname);
    const reply = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    if (url.pathname === "/auth/v1/user")
      return verified
        ? reply({
            id: userId,
            email: "verified@fixture.invalid",
            app_metadata: { provider },
            user_metadata: { organization_id: claimedOrg },
            aud: "authenticated",
            created_at: "",
          })
        : reply({ msg: "Invalid JWT" }, 401);
    assert.equal(url.pathname, "/rest/v1/organization_members");
    assert.equal(url.searchParams.get("user_id"), "eq." + userId);
    assert.equal(url.searchParams.has("organization_id"), false);
    return reply(
      exists
        ? {
            role: "owner",
            organizations: {
              id: orgA,
              name: "Verified workspace",
              industry: "Other",
              created_at: "",
            },
          }
        : null,
    );
  });
  const db = createClient(
    "https://fixture.supabase.co",
    "sb_publishable_fixture",
    {
      global: { headers: { Authorization: "Bearer fixture-session" } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const context = await resolveWorkspace(await resolveIdentity(db));
  assert.equal(context.organization.id, orgA);
  assert.notEqual(context.organization.id, claimedOrg);
  assert.deepEqual(paths, ["/auth/v1/user", "/rest/v1/organization_members"]);
  provider = "email";
  paths.length = 0;
  await assert.rejects(
    resolveIdentity(db),
    (error) => error instanceof AppError && error.status === 401,
  );
  assert.deepEqual(paths, ["/auth/v1/user"]);
  provider = "google";
  exists = false;
  await assert.rejects(
    resolveWorkspace(await resolveIdentity(db)),
    (error) => error instanceof AppError && error.status === 403,
  );
  verified = false;
  await assert.rejects(
    resolveIdentity(db),
    (error) => error instanceof AppError && error.status === 401,
  );
});

test("authentication refuses a privileged service key in the publishable-key setting", () => {
  const keys = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "APP_URL"] as const;
  const before = keys.map((key) => process.env[key]);
  try {
    process.env.SUPABASE_URL = "https://fixture.supabase.co";
    process.env.APP_URL = "http://localhost:3000";
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_secret_fixture";
    assert.throws(authConfiguration, /publishable key/);
    process.env.SUPABASE_PUBLISHABLE_KEY =
      "header." +
      Buffer.from(JSON.stringify({ role: "service_role" })).toString(
        "base64url",
      ) +
      ".signature";
    assert.throws(authConfiguration, /publishable or anon/);
  } finally {
    keys.forEach((key, index) => {
      if (before[index] === undefined) delete process.env[key];
      else process.env[key] = before[index];
    });
  }
});
