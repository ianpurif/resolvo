import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createClient, type User } from "@supabase/supabase-js";
import { prepareSource, assertTenantFile } from "../lib/rag/ingest";
import {
  validateWebsiteUrl,
  isPublicAddress,
  extractVisibleText,
} from "../lib/rag/website";
import type { TenantContext } from "../lib/auth";
const org = randomUUID();
function context(): TenantContext {
  return {
    db: createClient("https://fixture.supabase.co", "sb_publishable_fixture", {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    organization: {
      id: org,
      name: "Fixture organization",
      industry: "Other",
      created_at: "",
    },
    role: "owner",
    user: {
      id: randomUUID(),
      email: "fixture@fixture.invalid",
      app_metadata: { provider: "google" },
      user_metadata: {},
      aud: "authenticated",
      created_at: "",
    } as User,
  };
}
test("manual sources retain full original text while normalizing embedding content", async () => {
  const source = await prepareSource({
    kind: "manual",
    name: "Knowledge",
    text: "  Manager\t\treviews.\r\n\r\n\r\nSupport responds.  ",
  });
  assert.equal(source.text, "Manager reviews.\n\nSupport responds.");
  assert.match(await source.file.text(), /Manager\t\treviews/);
  assert.equal(source.kind, "manual");
  assert.equal(source.file.type, "text/markdown");
  const ctx = context();
  assert.doesNotThrow(() =>
    assertTenantFile(ctx, `organizations/${org}/documents/original`),
  );
  assert.throws(
    () =>
      assertTenantFile(ctx, `organizations/${randomUUID()}/documents/private`),
    /not accessible/,
  );
});

test("website imports reject private networks, alternate IP notations and credential-bearing URLs", () => {
  for (const value of [
    "http://localhost/",
    "http://127.1/",
    "http://2130706433/",
    "http://169.254.169.254/",
    "http://10.0.0.1/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "file:///etc/passwd",
    "https://name:secret@example.com/",
    "http://example.com:8080/",
  ])
    assert.throws(() => validateWebsiteUrl(value));
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "100.64.0.1",
    "169.254.169.254",
    "::1",
    "fe80::1",
    "fc00::1",
    "2001:db8::1",
    "::ffff:127.0.0.1",
  ])
    assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress("1.1.1.1"), true);
  assert.equal(
    validateWebsiteUrl("https://example.com/guide#section").href,
    "https://example.com/guide",
  );
});

test("website extraction indexes readable content without script, hidden or navigation text", () => {
  const page = extractVisibleText(
    "<title>Workflow guide</title><nav>Navigation text</nav><main>Managers approve project changes.<script>create a ticket</script><span hidden>Private hidden text</span></main>",
  );
  assert.deepEqual(page, {
    title: "Workflow guide",
    text: "Managers approve project changes.",
  });
  assert.equal(
    extractVisibleText("<script>Only JavaScript; no readable text.</script>")
      .text,
    "",
  );
  assert.equal(
    extractVisibleText("Literal <text> from a plain document.", true).text,
    "Literal <text> from a plain document.",
  );
});
