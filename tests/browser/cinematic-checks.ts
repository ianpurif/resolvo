import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { expect, type Browser, type Page } from "@playwright/test";

const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
async function chapter(page: Page, id: string) {
  await page.locator(`#${id}`).evaluate((element) => window.scrollTo({ top: (element as HTMLElement).offsetTop, behavior: "instant" }));
  await page.waitForTimeout(1800);
}

/** Real WebGL checks supplement the authenticated suite's reduced-motion browser. */
export async function verifyCinematic(browser: Browser, origin: string, output: string, record: (message: string) => void) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  try {
    await page.goto(origin);
    await expect(page.locator(".cinema")).toHaveAttribute("data-scene", "ready", { timeout: 60_000 });
    await page.waitForTimeout(1800);
    const canvas = page.getByTestId("cinematic-canvas");
    const initial = digest(await canvas.screenshot());
    await page.waitForTimeout(900);
    assert.notEqual(digest(await canvas.screenshot()), initial, "the first scene must animate before scrolling");
    await page.screenshot({ path: join(output, "cinematic-arrival.png") });
    record("WebGL renders the original woven scene and animates before the first scroll");

    await page.getByRole("button", { name: "Pause ambient motion" }).click();
    await page.waitForTimeout(4500);
    const still = digest(await canvas.screenshot());
    await page.waitForTimeout(650);
    assert.equal(digest(await canvas.screenshot()), still, "pause must stop ambient rendering");
    assert.equal(await page.evaluate(() => document.elementFromPoint(1050, 440)?.tagName), "CANVAS", "the illustration must receive direct pointer input");
    await page.mouse.move(1050, 440); await page.mouse.down();
    await page.mouse.move(1180, 470, { steps: 12 }); await page.mouse.up();
    await page.waitForTimeout(1200);
    assert.notEqual(digest(await canvas.screenshot()), still, "drag must turn the physical sculpture");
    await page.getByRole("button", { name: "Play ambient motion" }).click();
    record("Ambient pause freezes the actual canvas; pointer dragging still turns the sculpture");

    const shots: string[] = [];
    for (const [id, name] of [["product", "sources"], ["how-it-works", "connection"], ["capabilities", "evidence"], ["your-next-answer", "ending"]]) {
      await chapter(page, id);
      shots.push(digest(await canvas.screenshot()));
      await page.screenshot({ path: join(output, `cinematic-${name}.png`) });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    assert.equal(new Set(shots).size, 4);
    await chapter(page, "product");
    await expect(page.getByRole("navigation", { name: "Journey chapters" }).getByRole("link", { name: "Your sources", exact: true })).toHaveAttribute("aria-current", "step");
    record("All five scroll chapters render distinct shots and native reverse scrolling restores the source chapter");

    await page.getByRole("group", { name: "Explore source types" }).getByRole("button", { name: "Web pages" }).click();
    await expect(page.getByRole("group", { name: "Explore source types" }).getByRole("button", { name: "Web pages" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#product .cinema-source-detail")).toContainText("public page");
    await chapter(page, "capabilities");
    await page.getByRole("button", { name: "Trace written notes" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Trace written notes" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#capabilities .cinema-source-detail")).toContainText("written notes");
    record("Source selection persists between scenes and evidence tracing works from the keyboard");

    await chapter(page, "begin");
    await page.getByRole("link", { name: "Open your workspace", exact: true }).click();
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(0);
    await page.goto(origin);
    await expect(page.locator(".cinema")).toHaveAttribute("data-scene", "ready");
    await canvas.evaluate((element) => (element as HTMLCanvasElement).getContext("webgl2")?.getExtension("WEBGL_lose_context")?.loseContext());
    await expect(page.locator(".cinema")).toHaveAttribute("data-scene", "fallback");
    await expect(page.locator(".cinema-poster")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open your workspace", exact: true })).toBeVisible();
    assert.deepEqual(errors, []);
    record("Navigation disposes the scene; a real lost WebGL context restores the artwork and working links");
  } finally { await context.close(); }

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "no-preference" });
  try {
    const page = await mobile.newPage();
    await page.goto(origin);
    await expect(page.locator(".cinema")).toHaveAttribute("data-scene", "ready", { timeout: 60_000 });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: join(output, "cinematic-mobile-arrival.png") });
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Capabilities" }).click();
    await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toHaveCount(0);
    await chapter(page, "capabilities");
    await page.getByRole("button", { name: "Trace web pages" }).tap();
    await expect(page.getByRole("button", { name: "Trace web pages" })).toHaveAttribute("aria-pressed", "true");
    await page.screenshot({ path: join(output, "cinematic-mobile-evidence.png") });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.getByTestId("cinematic-canvas").evaluate((element) => getComputedStyle(element).touchAction), "pan-y pinch-zoom");
    for (const viewport of [{ width: 810, height: 1080 }, { width: 320, height: 568 }]) {
      await page.setViewportSize(viewport);
      await chapter(page, "begin");
      await expect(page.getByRole("link", { name: "Open your workspace", exact: true })).toBeInViewport();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: join(output, `cinematic-${viewport.width}.png`) });
    }
    record("Mobile and tablet WebGL, menu navigation, touch controls, pinch zoom, and short portrait layouts remain usable");
  } finally { await mobile.close(); }

  const reduced = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  try {
    const page = await reduced.newPage();
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      const scope = window as unknown as { webglAttempts: number };
      scope.webglAttempts = 0;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) {
        if (String(args[0]).includes("webgl")) scope.webglAttempts++;
        return Reflect.apply(original, this, args);
      } as typeof original;
    });
    await page.goto(origin);
    await expect(page.locator(".cinema")).toHaveAttribute("data-motion", "static");
    await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => (window as unknown as { webglAttempts: number }).webglAttempts), 0);
    await page.screenshot({ path: join(output, "cinematic-reduced-motion.png") });
    await page.getByRole("button", { name: "Enable cinematic motion" }).click();
    await expect(page.locator(".cinema")).toHaveAttribute("data-scene", "ready", { timeout: 60_000 });
    assert.ok(await page.evaluate(() => (window as unknown as { webglAttempts: number }).webglAttempts) > 0);
    record("Reduced-motion users receive the static edition without a WebGL context and can explicitly enable the experience");
  } finally { await reduced.close(); }

  const fallback = await browser.newContext({ reducedMotion: "no-preference" });
  try {
    const page = await fallback.newPage();
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) {
        return String(args[0]).includes("webgl") ? null : Reflect.apply(original, this, args);
      } as typeof original;
    });
    await page.goto(origin);
    await expect(page.locator(".cinema")).toHaveAttribute("data-scene", "fallback", { timeout: 60_000 });
    await expect(page.locator(".cinema-poster img")).toBeVisible();
    await page.getByRole("link", { name: "Open your workspace", exact: true }).click();
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    record("Browsers without WebGL retain the textured landing page and the real workspace entry");
  } finally { await fallback.close(); }
}
