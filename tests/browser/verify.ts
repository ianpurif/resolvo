import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { chromium, expect } from "@playwright/test";
import { startFixtureBackend } from "./fixture-backend";
import { verifyCinematic } from "./cinematic-checks";

async function main() {
  const root = process.cwd(),
    base = resolve(root, ".local"),
    output = join(base, "verification");
  await mkdir(output, { recursive: true });
  await rm(join(output, "browser-evidence.json"), { force: true });
  const directory = await mkdtemp(join(base, "browser-suite-"));
  assert.ok(resolve(directory).startsWith(base + sep));
  const appOrigin = "http://127.0.0.1:3100",
    backendOrigin = "http://127.0.0.1:3101";
  const backend = await startFixtureBackend(3101, appOrigin);
  let child: ReturnType<typeof spawn> | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const checks: string[] = [];
  function record(check: string) {
    checks.push(check);
    console.log(check);
  }
  const logs: string[] = [];
  try {
    for (const file of [
      "app",
      "components",
      "lib",
      "types",
      "public",
      "supabase",
      "proxy.ts",
      "next.config.ts",
      "postcss.config.mjs",
      "tsconfig.json",
      "package.json",
    ])
      await cp(join(root, file), join(directory, file), { recursive: true });
    await symlink(
      join(root, "node_modules"),
      join(directory, "node_modules"),
      "junction",
    );
    const nextConfigPath = join(directory, "next.config.ts");
    await writeFile(
      nextConfigPath,
      (await readFile(nextConfigPath, "utf8")).replace(
        "const nextConfig: NextConfig = {",
        "const nextConfig: NextConfig = { turbopack: { root: " +
          JSON.stringify(root) +
          " },",
      ),
    );
    // Redirect only the copied test app's provider transports. Production sources
    // and .env.local are never changed or copied. All credentials below are fixtures.
    const modelPath = join(directory, "lib/ai/model.ts");
    await writeFile(
      modelPath,
      (await readFile(modelPath, "utf8")).replace(
        "apiKey: process.env.DEEPSEEK_API_KEY,",
        "apiKey: process.env.DEEPSEEK_API_KEY, configuration: { baseURL: '" +
          backendOrigin +
          "/deepseek' },",
      ),
    );
    const embeddingPath = join(directory, "lib/rag/embeddings.ts");
    await writeFile(
      embeddingPath,
      (await readFile(embeddingPath, "utf8")).replace(
        "https://api.voyageai.com/v1/embeddings",
        backendOrigin + "/voyage/embeddings",
      ),
    );
    child = spawn(
      process.execPath,
      [
        join(root, "node_modules/next/dist/bin/next"),
        "dev",
        "--hostname",
        "127.0.0.1",
        "--port",
        "3100",
      ],
      {
        cwd: directory,
        windowsHide: true,
        env: {
          ...process.env,
          SUPABASE_URL: backendOrigin,
          SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
          SUPABASE_SERVICE_ROLE_KEY: "fixture-service-key",
          APP_URL: appOrigin,
          DEEPSEEK_API_KEY: "fixture-deepseek",
          VOYAGE_API_KEY: "fixture-voyage",
          VOYAGE_REQUESTS_PER_MINUTE: "100",
          VOYAGE_TOKENS_PER_MINUTE: "100000",
          NEXT_TELEMETRY_DISABLED: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.stdout?.on("data", (data) => {
      logs.push(data.toString());
      if (data.toString().includes("Ready"))
        console.log("Isolated Next.js fixture is ready");
    });
    child.stderr?.on("data", (data) => logs.push(data.toString()));
    const deadline = Date.now() + 120_000;
    while (true) {
      try {
        const response = await fetch(appOrigin, {
          signal: AbortSignal.timeout(20_000),
        });
        if (response.ok) break;
      } catch {}
      if (Date.now() > deadline)
        throw new Error("Fixture Next.js server did not start");
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    browser = await chromium.launch({ headless: true, args: ["--enable-unsafe-swiftshader"] });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      permissions: ["clipboard-read", "clipboard-write"],
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(60_000);
    const errors: string[] = [];
    const controlledInputWarnings: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        /changing (?:a controlled|an uncontrolled) input/i.test(message.text())
      )
        controlledInputWarnings.push(message.text());
    });
    page.on("response", async (response) => {
      if (response.url().endsWith("/continue") && !response.ok()) {
        console.error(
          "Index continuation response:",
          response.status(),
          (await response.text()).slice(0, 240),
        );
      }
    });
    await page.goto(appOrigin);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Your knowledge.",
    );
    await expect(page.locator('img[src*="resolvo-logo"]')).not.toHaveCount(0);
    await expect
      .poll(
        () =>
          page
            .locator("img")
            .evaluateAll((images) =>
              images.every(
                (image) =>
                  image instanceof HTMLImageElement &&
                  image.complete &&
                  image.naturalWidth > 0,
              ),
            ),
        { timeout: 20_000 },
      )
      .toBe(true);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({ path: join(output, "landing-desktop.png") });
    await page.screenshot({
      path: join(output, "landing-desktop-full.png"),
      fullPage: true,
    });
    record(
      "Landing page, responsive width, supplied logo, and reduced-motion rendering",
    );
    await page
      .getByRole("link", { name: "Open your workspace", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Continue with Google" }),
    ).toBeVisible();
    await page.screenshot({ path: join(output, "login-desktop.png") });
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect(
      page.getByRole("heading", { name: "Your workspace", exact: true }),
    ).toBeVisible({ timeout: 60_000 });
    record(
      "Actual Google-start, PKCE callback, session cookies, and dashboard with fixture Auth transport",
    );
    await page.screenshot({ path: join(output, "dashboard-desktop.png") });
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Settings", exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("main")
        .getByText("owner@fixture.invalid", { exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: join(output, "settings-desktop.png") });
    record(
      "Settings displays the actual authenticated account and company workspace",
    );
    await page
      .getByRole("link", { name: "Support tickets", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Support tickets", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: backend.ticket.ticket_number, exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      "Please review access to the company handbook.",
    );
    await page.screenshot({ path: join(output, "ticket-dialog-desktop.png") });
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", {
        name: backend.ticket.ticket_number,
        exact: true,
      }),
    ).toBeFocused();
    const ticketUpdate = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/tickets/" + backend.ticket.id) &&
        response.request().method() === "PATCH",
    );
    await page
      .getByLabel("Status for " + backend.ticket.ticket_number)
      .selectOption("in_progress");
    assert.equal((await ticketUpdate).status(), 200);
    await page.reload();
    await expect(
      page.getByLabel("Status for " + backend.ticket.ticket_number),
    ).toHaveValue("in_progress");
    await page.getByLabel("Search tickets").fill("no matching issue");
    await expect(
      page.getByText("No matching tickets.", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Search tickets").fill("");
    await page.screenshot({ path: join(output, "tickets-desktop.png") });
    record(
      "Ticket details, keyboard focus restoration, search, and status updates persist through actual routes",
    );
    await page.getByRole("link", { name: "Knowledge", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Knowledge", exact: true }),
    ).toBeVisible();
    const websiteUrl = "https://example.com/knowledge";
    await page
      .getByRole("button", { name: "Website URL", exact: true })
      .click();
    await expect(page.locator('input[type="url"]')).toHaveValue("");
    await page.locator('input[type="url"]').fill(websiteUrl);
    await page
      .getByRole("button", { name: "Upload document", exact: true })
      .click();
    await expect(page.locator('input[type="file"]')).toBeVisible();
    await expect(page.locator('input[type="file"]')).toHaveValue("");
    await page
      .getByRole("button", { name: "Website URL", exact: true })
      .click();
    await expect(page.locator('input[type="url"]')).toHaveValue(websiteUrl);
    await page
      .getByRole("button", { name: "Write knowledge", exact: true })
      .click();
    await expect(page.getByLabel("Source name", { exact: true })).toHaveValue(
      "",
    );
    await page
      .getByRole("button", { name: "Website URL", exact: true })
      .click();
    await expect(page.locator('input[type="url"]')).toHaveValue(websiteUrl);
    await page
      .getByRole("button", { name: "Upload document", exact: true })
      .click();
    await expect(page.locator('input[type="file"]')).toBeVisible();
    assert.deepEqual(controlledInputWarnings, []);
    record(
      "Switching knowledge source types preserves the URL and emits no controlled-input warnings",
    );
    await page
      .getByRole("button", { name: "Write knowledge", exact: true })
      .click();
    await page
      .getByLabel("Source name", { exact: true })
      .fill("Review process");
    await page
      .getByLabel("Knowledge", { exact: true })
      .fill(
        "The change review process has two steps. Submit the change, then a department manager reviews it. Track progress with const status = 'review';.",
      );
    await page
      .getByRole("button", { name: "Save & index", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Edit Review process" }),
    ).toBeEnabled({ timeout: 60_000 });
    await page.screenshot({ path: join(output, "knowledge-desktop.png") });
    record(
      "Manual knowledge saved to private fixture Storage and indexed through actual SQL/checkpoint routes",
    );
    await page.getByRole("link", { name: "New chat", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "What would you like to know?" }),
    ).toBeVisible();
    await page.screenshot({ path: join(output, "chat-empty-desktop.png") });
    const input = page.getByLabel("Ask your company’s assistant");
    await input.fill("How does change review work?");
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Stop response" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "View source: Review process" }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      page.getByRole("button", { name: "Send message", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy code" })).toBeVisible();
    const savedId = new URL(page.url()).searchParams.get("conversation")!;
    assert.ok(savedId);
    assert.equal(backend.modelCalls.length, 1);
    await page.getByRole("button", { name: "Copy code" }).click();
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      "const status = 'review';",
    );
    await page.getByRole("button", { name: "Copy answer" }).click();
    assert.match(
      await page.evaluate(() => navigator.clipboard.readText()),
      /two steps/,
    );
    await page
      .getByRole("button", { name: "View source: Review process" })
      .click();
    await expect(page.getByRole("dialog")).toContainText("department manager");
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.screenshot({ path: join(output, "chat-desktop.png") });
    record(
      "Actual tenant-scoped retrieval and LangGraph stream with local provider fixtures; Markdown, code copy, answer copy, and citations",
    );
    await page.reload();
    await expect(
      page.getByRole("button", { name: "View source: Review process" }),
    ).toBeVisible({ timeout: 60_000 });
    await input.fill("Who reviews it?");
    await input.press("Enter");
    await expect(
      page.getByRole("button", { name: "View source: Review process" }),
    ).toHaveCount(2, { timeout: 60_000 });
    assert.ok(
      backend.modelCalls[1].messages.some(
        (item) => item.content === "How does change review work?",
      ),
    );
    record(
      "Reload reopens persisted messages and follow-up includes existing conversation context",
    );
    await page
      .getByRole("link", { name: "Conversations", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Conversations", exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: join(output, "conversations-desktop.png") });
    await page
      .getByRole("main")
      .getByRole("link")
      .filter({ hasText: "How does change review work?" })
      .click();
    await expect(page.getByRole("button", { name: "Copy answer" })).toHaveCount(
      2,
    );
    record("The conversation library opens the saved thread in the assistant");
    await page
      .getByRole("button", { name: "Options for How does change review work?" })
      .first()
      .click();
    await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
    await page.getByLabel("Conversation name").fill("Our review workflow");
    await page.screenshot({ path: join(output, "rename-dialog-desktop.png") });
    await page.getByRole("button", { name: "Save name" }).click();
    await expect(
      page.getByRole("button", { name: "Our review workflow", exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("button", {
          name: "Options for Our review workflow",
          exact: true,
        })
        .first(),
    ).toBeFocused();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Our review workflow", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Collapse sidebar", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Expand sidebar", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Expand sidebar", exact: true })
      .click();
    record("Rename persists after reload and sidebar collapses/reopens");
    await input.fill("simulate failure");
    await input.press("Enter");
    await expect(
      page.getByRole("button", { name: "Retry message", exact: true }),
    ).toBeVisible({ timeout: 60_000 });
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Retry message", exact: true }),
    ).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "New chat", exact: true }).click();
    await input.fill("slow response");
    await input.press("Enter");
    await expect(
      page.getByRole("button", { name: "Stop response" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Stop response" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Answer stopped" }),
    ).toBeVisible();
    record(
      "Provider failure has actionable recovery after reload, and Stop cancels the response",
    );
    await page.goto(appOrigin + "/support?conversation=" + savedId);
    await expect(
      page.getByRole("button", { name: "Our review workflow", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Options for Our review workflow" })
      .first()
      .click();
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(
      (
        await page.request.get(appOrigin + "/api/conversations/" + savedId)
      ).status(),
      200,
    );
    const forged = await page.request.patch(
      appOrigin + "/api/conversations/" + savedId,
      {
        headers: { Origin: "https://foreign.invalid" },
        data: { title: "Forged" },
      },
    );
    assert.equal(forged.status(), 403);
    const extra = await page.request.patch(
      appOrigin + "/api/conversations/" + savedId,
      {
        headers: { Origin: appOrigin },
        data: { title: "Forged", organization_id: backend.org },
      },
    );
    assert.equal(extra.status(), 400);
    const tokenCookie = (await context.cookies()).find((cookie) =>
      cookie.name.endsWith("auth-token"),
    )!;
    assert.ok(tokenCookie);
    const stranger = await browser.newContext();
    await stranger.addCookies([
      {
        ...tokenCookie,
        value:
          "base64-" +
          Buffer.from(
            JSON.stringify({
              access_token: backend.token(backend.colleague),
              refresh_token: "colleague-fixture",
              expires_at: Math.floor(Date.now() / 1000) + 3600,
              token_type: "bearer",
              user: {
                id: backend.colleague,
                app_metadata: { provider: "google" },
              },
            }),
          ).toString("base64url"),
      },
    ]);
    assert.equal(
      (
        await stranger.request.get(appOrigin + "/api/conversations/" + savedId)
      ).status(),
      404,
    );
    assert.equal(
      (
        await stranger.request.patch(
          appOrigin + "/api/conversations/" + savedId,
          { headers: { Origin: appOrigin }, data: { title: "Stolen" } },
        )
      ).status(),
      404,
    );
    assert.equal(
      (
        await stranger.request.post(appOrigin + "/api/chat", {
          headers: { Origin: appOrigin },
          data: {
            message: "Continue another member's chat",
            conversationId: savedId,
            requestId: randomUUID(),
          },
        })
      ).status(),
      404,
    );
    await stranger.close();
    const onboardingContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    });
    await onboardingContext.addCookies([
      {
        ...tokenCookie,
        value:
          "base64-" +
          Buffer.from(
            JSON.stringify({
              access_token: backend.token(backend.newUser),
              refresh_token: "new-user-fixture",
              expires_at: Math.floor(Date.now() / 1000) + 3600,
              token_type: "bearer",
              user: {
                id: backend.newUser,
                app_metadata: { provider: "google" },
              },
            }),
          ).toString("base64url"),
      },
    ]);
    const onboardingPage = await onboardingContext.newPage();
    onboardingPage.on("pageerror", (error) => errors.push(error.message));
    await onboardingPage.goto(appOrigin + "/onboarding");
    await expect(
      onboardingPage.getByRole("heading", {
        name: "Make room for your knowledge",
      }),
    ).toBeVisible();
    await onboardingPage.screenshot({
      path: join(output, "onboarding-mobile.png"),
      fullPage: true,
    });
    await onboardingPage
      .getByLabel("Company name", { exact: true })
      .fill("New browser workspace");
    await onboardingPage
      .getByLabel("Industry", { exact: true })
      .fill("Research");
    await onboardingPage
      .getByRole("button", { name: "Create company workspace" })
      .click();
    await expect(
      onboardingPage.getByRole("heading", {
        name: "Your workspace",
        exact: true,
      }),
    ).toBeVisible({ timeout: 60000 });
    assert.equal(
      await onboardingPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await onboardingPage.screenshot({
      path: join(output, "dashboard-mobile.png"),
      fullPage: true,
    });
    await onboardingPage.goto(appOrigin + "/admin/conversations");
    await expect(
      onboardingPage.getByText("Your next conversation starts here", {
        exact: true,
      }),
    ).toBeVisible();
    await onboardingPage.screenshot({
      path: join(output, "conversations-empty-mobile.png"),
      fullPage: true,
    });
    await onboardingContext.close();
    record(
      "Mobile onboarding creates a real isolated workspace through the existing authenticated route",
    );
    record(
      "Actual conversation APIs reject another company member, forged Origin, and browser tenant fields",
    );
    await page
      .getByRole("button", { name: "Options for Our review workflow" })
      .first()
      .click();
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    await page
      .getByRole("button", { name: "Delete conversation", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "What would you like to know?" }),
    ).toBeVisible();
    assert.equal(
      (
        await page.request.get(appOrigin + "/api/conversations/" + savedId)
      ).status(),
      404,
    );
    record(
      "Delete confirmation can be cancelled; confirmed delete removes persisted conversation",
    );
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.getByRole("button", { name: "Open sidebar" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({ path: join(output, "chat-tablet.png") });
    record(
      "Tablet chat fits the viewport and the navigation drawer closes with Escape",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Open sidebar" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page
      .getByRole("dialog")
      .getByRole("link", { name: "Knowledge", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Knowledge", exact: true }),
    ).toBeVisible();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.getByRole("button", { name: "Edit Review process" }).click();
    await expect(
      page.getByRole("textbox", { name: "Knowledge", exact: true }),
    ).toHaveValue(/Submit the change/, { timeout: 60_000 });
    const updatedKnowledge =
      "The change review process has two steps. Submit the change, then a department manager reviews it. The updated checklist also requires a review note.";
    await page
      .getByRole("textbox", { name: "Knowledge", exact: true })
      .fill(updatedKnowledge);
    const indexedUpdate = page.waitForResponse(
      (response) =>
        response.url().includes("/api/knowledge/") &&
        response.url().endsWith("/continue") &&
        response.ok(),
      { timeout: 60_000 },
    );
    await page
      .getByRole("button", { name: "Save & index", exact: true })
      .click();
    await indexedUpdate;
    await expect(
      page.getByRole("button", { name: "Edit Review process" }),
    ).toBeEnabled({ timeout: 60_000 });
    await page.getByRole("button", { name: "Edit Review process" }).click();
    await expect(
      page.getByRole("textbox", { name: "Knowledge", exact: true }),
    ).toHaveValue(updatedKnowledge, { timeout: 60_000 });
    await page.getByRole("button", { name: "Cancel edit" }).click();
    await page.screenshot({
      path: join(output, "knowledge-mobile.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Delete Review process" }).click();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Edit Review process" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Delete Review process" }).click();
    await page
      .getByRole("button", { name: "Delete source", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Edit Review process" }),
    ).toHaveCount(0);
    record(
      "Knowledge editing preserves the original text, re-indexes an update, and deletes only after confirmation",
    );
    await page.getByRole("button", { name: "Open sidebar" }).click();
    await page
      .getByRole("dialog")
      .getByRole("link", { name: "New chat", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "What would you like to know?" }),
    ).toBeVisible();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({ path: join(output, "chat-mobile.png") });
    record(
      "Mobile chat, knowledge form, original-source edit, and navigation drawer fit the viewport",
    );
    await page.goto(appOrigin + "/admin/settings");
    await expect(
      page.getByRole("heading", { name: "Settings", exact: true }),
    ).toBeVisible();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: join(output, "settings-mobile.png"),
      fullPage: true,
    });
    await page.goto(appOrigin + "/admin/tickets");
    await expect(
      page.getByLabel("Status for " + backend.ticket.ticket_number),
    ).toHaveValue("in_progress");
    await page.getByLabel("Filter ticket status").selectOption("resolved");
    await expect(
      page.getByText("No matching tickets.", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Filter ticket status").selectOption("all");
    await expect(
      page.getByLabel("Status for " + backend.ticket.ticket_number),
    ).toBeInViewport();
    await expect(
      page.getByRole("button", {
        name: "Please review access to the company handbook.",
        exact: true,
      }),
    ).toBeInViewport();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: join(output, "tickets-mobile.png"),
      fullPage: true,
    });
    await page.goto(appOrigin + "/admin/conversations");
    await expect(
      page.getByRole("heading", { name: "Conversations", exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("main")
        .getByRole("link")
        .filter({ hasText: "slow response" }),
    ).toBeVisible();
    await page
      .getByLabel("Search conversations")
      .fill("no matching conversation");
    await expect(
      page.getByText("No matching conversations", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Search conversations").fill("");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: join(output, "conversations-mobile.png"),
      fullPage: true,
    });
    record(
      "Mobile settings, ticket filters, and the conversation library remain usable without page overflow",
    );
    await page.getByRole("button", { name: "Open sidebar" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Sign out", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Continue with Google" }),
    ).toBeVisible();
    assert.equal(
      (await page.request.get(appOrigin + "/api/conversations")).status(),
      401,
    );
    record(
      "Actual sign-out route clears session and protected APIs deny the logged-out browser",
    );
    await page.screenshot({
      path: join(output, "login-mobile.png"),
      fullPage: true,
    });
    await page.goto(appOrigin + "/a-page-that-does-not-exist");
    await expect(
      page.getByRole("heading", { name: "A thread we couldn’t find." }),
    ).toBeVisible();
    await page.screenshot({
      path: join(output, "not-found-mobile.png"),
      fullPage: true,
    });
    await expect(
      page.getByRole("link", { name: "Back to your workspace" }),
    ).toHaveAttribute("href", "/support");
    record(
      "The responsive not-found state offers a working path back to the workspace",
    );
    await page.goto(appOrigin);
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(
      page.getByRole("navigation", { name: "Mobile navigation" }),
    ).toBeVisible();
    await page
      .getByRole("navigation", { name: "Mobile navigation" })
      .getByRole("link", { name: "The workspace" })
      .click();
    await expect(
      page.getByRole("navigation", { name: "Mobile navigation" }),
    ).toHaveCount(0);
    await page.goto(appOrigin);
    await page.screenshot({
      path: join(output, "landing-mobile.png"),
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(controlledInputWarnings, []);
    await verifyCinematic(browser, appOrigin, output, record);
    await writeFile(
      join(output, "browser-evidence.json"),
      JSON.stringify(
        {
          status: "passed",
          completedAt: new Date().toISOString(),
          verification:
            "Local PGlite database with fixture Supabase Auth and provider transports; no hosted data or paid requests",
          checks,
          runtimeErrors: errors,
          controlledInputWarnings,
          screenshots: [
            "cinematic-arrival.png",
            "cinematic-sources.png",
            "cinematic-connection.png",
            "cinematic-evidence.png",
            "cinematic-ending.png",
            "cinematic-mobile-arrival.png",
            "cinematic-mobile-evidence.png",
            "cinematic-810.png",
            "cinematic-320.png",
            "cinematic-reduced-motion.png",
            "chat-empty-desktop.png",
            "conversations-mobile.png",
            "conversations-empty-mobile.png",
            "landing-desktop-full.png",
            "conversations-desktop.png",
            "tickets-desktop.png",
            "ticket-dialog-desktop.png",
            "rename-dialog-desktop.png",
            "onboarding-mobile.png",
            "dashboard-mobile.png",
            "settings-mobile.png",
            "tickets-mobile.png",
            "login-mobile.png",
            "not-found-mobile.png",
            "landing-desktop.png",
            "login-desktop.png",
            "dashboard-desktop.png",
            "settings-desktop.png",
            "knowledge-desktop.png",
            "chat-desktop.png",
            "knowledge-mobile.png",
            "chat-mobile.png",
            "chat-tablet.png",
            "landing-mobile.png",
          ],
        },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify(
        {
          status: "passed",
          checks: checks.length,
          evidence: join(output, "browser-evidence.json"),
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error("Browser verification failed:", error);
    if (browser) {
      const pages = browser.contexts().flatMap((context) => context.pages());
      if (pages.length)
        await pages[0].screenshot({
          path: join(output, "browser-failure.png"),
          fullPage: true,
        });
    }
    process.exitCode = 1;
  } finally {
    await browser?.close();
    if (child?.pid) {
      if (process.platform === "win32")
        spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        });
      else child.kill("SIGTERM");
    }
    await backend.close();
    await writeFile(join(output, "browser-next.log"), logs.join(""));
    if (!resolve(directory).startsWith(base + sep))
      throw new Error("Unsafe fixture cleanup path");
    await rm(directory, { recursive: true, force: true });
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
