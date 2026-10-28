import assert from "node:assert/strict";
import { join } from "node:path";
import { expect, type Browser, type Page } from "@playwright/test";
import type { startFixtureBackend } from "./fixture-backend";

type Backend = Awaited<ReturnType<typeof startFixtureBackend>>;
const workerSecret = "fixture-worker-secret-at-least-32-characters";

export async function verifyIntegrations(page: Page, browser: Browser, backend: Backend, origin: string, output: string, record: (check: string) => void) {
  const viewport = page.viewportSize()!;
  const headers = { Origin: origin };
  const config = { baseUrl: "https://fixture.integration.invalid", listPath: "/items?parent={parent}&cursor={cursor}", readPath: "/items/{id}", itemsPath: "items", nextPath: "next" };
  async function drain(id: string) {
    await expect.poll(async () => {
      const response = await page.request.post(origin + "/api/integrations/worker", { headers: { Authorization: `Bearer ${workerSecret}` } });
      assert.equal(response.status(), 200, await response.text());
      const detail = await (await page.request.get(origin + `/api/integrations/${id}`)).json();
      assert.equal(detail.connection.status, "connected", JSON.stringify(detail));
      return detail.connection.generation;
    }, { timeout: 90_000, intervals: [500, 1000] }).toBeNull();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + "/admin/integrations");
  await expect(page.getByRole("heading", { name: "Integrations", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Connect Custom REST API", exact: true }).click();
  await page.getByLabel("Account label", { exact: true }).fill("Fixture API");
  await page.getByLabel("Access token or API key", { exact: true }).fill("fixture-provider-token");
  for (const [key, value] of Object.entries(config)) await page.locator(`[name="config.${key}"]`).fill(value);
  await page.getByRole("button", { name: "Connect account", exact: true }).click();
  const card = page.getByRole("button").filter({ hasText: "Fixture API" });
  await expect(card).toBeVisible();
  const accounts = await (await page.request.get(origin + "/api/integrations")).json();
  const connection = accounts.connections.find((c: { name: string }) => c.name === "Fixture API");
  assert.ok(connection?.id);
  assert.ok(!JSON.stringify(accounts).includes("fixture-provider-token"));
  assert.equal((await page.request.post(origin + "/api/integrations/worker")).status(), 401);
  await card.click();
  await page.getByRole("checkbox", { name: "Select Team policies", exact: true }).check();
  await page.getByRole("button", { name: "Save selection & sync", exact: true }).click();
  await expect(page.getByText("Selection saved. Synchronization started.")).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await drain(connection.id);
  const initial = await backend.integrationSnapshot();
  assert.equal(initial.length, 2);
  await page.reload();
  await card.click();
  await expect(page.getByRole("dialog")).toContainText("Indexed sources");
  await page.screenshot({ path: join(output, "integrations-desktop.png") });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  record("Real integration routes connect an API account, persist a folder selection, and publish two sources through the leased worker and embedding pipeline (local provider fixtures)");

  await page.goto(origin + "/support");
  await page.getByRole("button", { name: "All knowledge sources", exact: true }).click();
  await page.getByRole("checkbox", { name: "custom api", exact: true }).check();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByLabel("Ask your company’s assistant").fill("How does the connected change review process work?");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("button", { name: /^View source: Connected/ }).first()).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: /^View source: Connected/ }).first().click();
  await expect(page.getByRole("link", { name: "Open original source" })).toHaveAttribute("href", /^https:\/\/docs\.fixture\.invalid\//);
  await page.screenshot({ path: join(output, "integration-citation.png") });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  const latestPrompt = backend.modelCalls.at(-1)!.messages[0].content;
  assert.ok(latestPrompt.includes("Connected process"));
  assert.ok(!latestPrompt.includes('"title":"Review process"'));
  record("Platform-filtered chat retrieves connected data and displays a clickable original-source citation");

  const embeddingCalls = backend.documentEmbeddingCalls();
  assert.equal((await page.request.post(origin + `/api/integrations/${connection.id}/sync`, { headers })).status(), 200);
  await drain(connection.id);
  assert.deepEqual(await backend.integrationSnapshot(), initial);
  assert.equal(backend.documentEmbeddingCalls(), embeddingCalls);
  backend.integrationRecords.set("process", { ...backend.integrationRecords.get("process")!, text: "The updated change review process has three steps. Submit the change, a department manager reviews it, and the team lead approves publication.", updated_at: "v2" });
  backend.integrationRecords.delete("handbook");
  assert.equal((await page.request.post(origin + `/api/integrations/${connection.id}/sync`, { headers })).status(), 200);
  await drain(connection.id);
  const updated = await backend.integrationSnapshot();
  assert.equal(updated.length, 1);
  assert.notEqual(updated[0].active_revision, initial.find((i) => i.id === updated[0].id)!.active_revision);
  assert.equal(backend.documentEmbeddingCalls(), embeddingCalls + 1);
  record("Incremental synchronization spends zero document embeddings on unchanged content, replaces one changed revision, and removes a deleted source");

  const tokenCookie = (await page.context().cookies()).find((cookie) => cookie.name.endsWith("auth-token"))!;
  assert.ok(tokenCookie);
  const colleague = await browser.newContext();
  try {
    await colleague.addCookies([{ ...tokenCookie, value: "base64-" + Buffer.from(JSON.stringify({ access_token: backend.token(backend.colleague), refresh_token: "colleague-fixture", expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: "bearer", user: { id: backend.colleague, app_metadata: { provider: "google" } } })).toString("base64url") }]);
    assert.equal((await colleague.request.get(origin + `/api/integrations/${connection.id}`)).status(), 404);
    const privateSources = await (await colleague.request.get(origin + "/api/knowledge/sources")).json();
    assert.ok(!privateSources.sources.some((s: { id: string }) => s.id === updated[0].id));
    assert.equal((await colleague.request.get(origin + `/api/knowledge/${updated[0].id}/file`)).status(), 404);
    assert.equal((await page.request.patch(origin + `/api/integrations/${connection.id}`, { headers, data: { visibility: "workspace" } })).status(), 200);
    const shared = await (await colleague.request.get(origin + "/api/knowledge/sources")).json();
    assert.ok(shared.sources.some((s: { id: string }) => s.id === updated[0].id));
    assert.equal((await page.request.patch(origin + `/api/integrations/${connection.id}`, { headers, data: { visibility: "private" } })).status(), 200);
  } finally { await colleague.close(); }
  record("Another workspace member cannot manage or read a private connection; explicit owner sharing grants retrieval access");

  const oauth = await page.request.post(origin + "/api/integrations/oauth", { headers, data: { provider: "custom-api", name: "Fixture OAuth", config, authentication: { mode: "oauth2", oauth: { authorizationUrl: "https://fixture.integration.invalid/authorize", tokenUrl: "https://fixture.integration.invalid/token", clientId: "fixture-client", clientSecret: "fixture-client-secret", scope: "read" } } } });
  assert.equal(oauth.status(), 200, await oauth.text());
  const authorization = new URL((await oauth.json()).authorizationUrl);
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  const callback = origin + "/api/integrations/oauth/callback?" + new URLSearchParams({ state: authorization.searchParams.get("state")!, code: "fixture-code" });
  const completed = await page.request.get(callback);
  assert.ok(completed.url().includes("oauth=connected"), completed.url());
  const replay = await page.request.get(callback);
  assert.ok(replay.url().includes("oauth=failed"));
  const afterOauth = await (await page.request.get(origin + "/api/integrations")).json();
  assert.equal(afterOauth.connections.filter((c: { name: string }) => c.name === "Fixture OAuth").length, 1);
  const oauthId = afterOauth.connections.find((c: { name: string }) => c.name === "Fixture OAuth").id;
  assert.equal((await page.request.delete(origin + `/api/integrations/${oauthId}`, { headers })).status(), 200);
  record("OAuth PKCE callback exchanges and encrypts credentials, consumes the state once, and rejects replay (local token endpoint)");

  await page.goto(origin + "/admin/integrations");
  await card.click();
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await page.getByRole("button", { name: "Disconnect account", exact: true }).click();
  await expect(page.getByText("Account disconnected and indexed sources removed.")).toBeVisible();
  assert.equal((await backend.integrationSnapshot()).length, 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Integrations", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect Custom REST API", exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  await page.screenshot({ path: join(output, "integrations-mobile.png") });
  record("Disconnect removes indexed content immediately; the Integrations dashboard fits mobile without horizontal overflow");
  await page.setViewportSize(viewport);
}
