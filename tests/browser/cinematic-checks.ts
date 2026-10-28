import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, type Browser, type Page } from "@playwright/test";

const digest = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
// Capture only the rendered scene, without element auto-scroll or duplicate
// stability waits on a continuously animated, fixed canvas.
const canvasShot = (page: Page) =>
  page.screenshot({
    timeout: 60_000,
    style:
      ".cinema-header,.cinema-story,.cinema-controls,.cinema-chapters,.cinema-vignette,.cinema-grain,nextjs-portal { visibility:hidden!important; }",
  });
const chapters = [
  "begin",
  "product",
  "fabric",
  "how-it-works",
  "outline",
  "color",
  "details",
  "capabilities",
  "your-next-answer",
];
async function chapter(page: Page, id: string) {
  await page.locator(`#${id}`).evaluate((element) =>
    window.scrollTo({
      top: (element as HTMLElement).offsetTop,
      behavior: "instant",
    }),
  );
  await expect
    .poll(
      async () =>
        Math.abs(
          Number(
            await page
              .getByTestId("cinematic-canvas")
              .getAttribute("data-progress"),
          ) -
            chapters.indexOf(id) / 8,
        ),
      { timeout: 20_000 },
    )
    .toBeLessThan(0.0001);
  await page.waitForTimeout(350);
}
const stitches = async (page: Page) =>
  Number(
    await page.getByTestId("cinematic-canvas").getAttribute("data-stitches"),
  );

/** Actual GLB/WebGL checks, independent of the authenticated fixture transports. */
export async function verifyCinematic(
  browser: Browser,
  origin: string,
  output: string,
  record: (message: string) => void,
) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  try {
    await page.goto(origin);
    await expect(page.locator(".cinema")).toHaveAttribute(
      "data-scene",
      "ready",
      { timeout: 60_000 },
    );
    const canvas = page.getByTestId("cinematic-canvas");
    await expect(canvas).toHaveAttribute("data-model", "blender-atelier");
    await page.waitForTimeout(1000);
    const initial = digest(await canvasShot(page));
    await page.waitForTimeout(650);
    assert.notEqual(
      digest(await canvasShot(page)),
      initial,
      "the atelier must be alive before scrolling",
    );
    assert.equal(await stitches(page), 0, "the story starts on blank fabric");
    await page.screenshot({ path: join(output, "cinematic-arrival.png") });
    record(
      "The real Blender machine loads and animates immediately above blank fabric",
    );

    await page.getByRole("button", { name: "Pause ambient motion" }).click();
    await page.waitForTimeout(1200);
    const still = digest(await canvasShot(page));
    await page.waitForTimeout(350);
    assert.equal(
      digest(await canvasShot(page)),
      still,
      "pause must stop the actual canvas",
    );
    assert.equal(
      await page.evaluate(() => document.elementFromPoint(1050, 440)?.tagName),
      "CANVAS",
    );
    await page.mouse.move(1050, 440);
    await page.mouse.down();
    await page.mouse.move(1160, 465, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(700);
    assert.notEqual(
      digest(await canvasShot(page)),
      still,
      "drag must change the physical view",
    );
    await page.getByRole("button", { name: "Play ambient motion" }).click();
    record(
      "Ambient pause freezes rendering while pointer exploration remains interactive",
    );

    // Reload resets pointer orbit so the chapter screenshots show their authored composition.
    await page.reload();
    await expect(page.locator(".cinema")).toHaveAttribute(
      "data-scene",
      "ready",
    );
    const counts: number[] = [],
      shots: string[] = [];
    for (const id of chapters) {
      await chapter(page, id);
      const shot = await page.screenshot({
        path: join(output, `cinematic-${id}.png`),
      });
      counts.push(await stitches(page));
      shots.push(digest(shot));
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
    }
    assert.equal(new Set(shots).size, 9);
    assert.deepEqual(counts.slice(0, 3), [0, 0, 0]);
    for (let i = 3; i < counts.length; i++)
      assert.ok(counts[i] >= counts[i - 1]);
    assert.ok(
      counts[3] > 0 &&
        counts[3] < counts[4] &&
        counts[4] < counts[5] &&
        counts[5] < counts[6],
    );
    assert.equal(
      counts[7],
      Number(await canvas.getAttribute("data-total-stitches")),
    );
    assert.equal(counts[8], counts[7]);
    record(
      "Nine distinct chapters build the same embroidery from zero stitches to a complete held finale",
    );

    await chapter(page, "details");
    assert.equal(await stitches(page), counts[6]);
    await chapter(page, "outline");
    assert.equal(await stitches(page), counts[4]);
    await chapter(page, "fabric");
    assert.equal(await stitches(page), 0);
    await expect(
      page
        .getByRole("navigation", { name: "Journey chapters" })
        .getByRole("link", { name: "The fabric", exact: true }),
    ).toHaveAttribute("aria-current", "step");
    record(
      "Reverse scrolling restores the exact earlier stitches and returns to blank fabric",
    );

    await chapter(page, "color");
    await page.getByRole("button", { name: "Pause ambient motion" }).click();
    await page.waitForTimeout(700);
    const kingfisher = digest(await canvasShot(page));
    await page
      .getByRole("group", { name: "Thread palette" })
      .getByRole("button", { name: "Forest", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("button", { name: "Forest", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(600);
    assert.notEqual(digest(await canvasShot(page)), kingfisher);
    await chapter(page, "capabilities");
    const full = digest(await canvasShot(page));
    await page.getByRole("button", { name: "Inspect the stitching" }).click();
    await page.waitForTimeout(1000);
    assert.notEqual(digest(await canvasShot(page)), full);
    await page.getByRole("button", { name: "View the whole piece" }).click();
    await page.getByRole("button", { name: "Play ambient motion" }).click();
    record(
      "Keyboard palette selection recolors the stitches; inspection moves into the completed piece",
    );

    const performanceEvidence = [];
    for (const viewport of [
      { width: 2560, height: 1440 },
      { width: 3840, height: 2160 },
    ]) {
      await page.setViewportSize(viewport);
      await chapter(page, "begin");
      await expect(
        page.getByRole("link", { name: "Open your workspace", exact: true }),
      ).toBeInViewport();
      if (viewport.width === 3840)
        await page.screenshot({ path: join(output, "cinematic-4k.png") });
      await chapter(page, "color");
      const metrics = await canvas.evaluate((element) => {
        const canvas = element as HTMLCanvasElement,
          gl = canvas.getContext("webgl2"),
          debug = gl?.getExtension("WEBGL_debug_renderer_info");
        return {
          width: innerWidth,
          height: innerHeight,
          pixels: canvas.width * canvas.height,
          drawCalls: Number(canvas.dataset.drawCalls),
          cpuSubmitMs: Number(canvas.dataset.frameMs),
          renderer:
            gl && debug
              ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
              : "unavailable",
        };
      });
      assert.ok(metrics.pixels <= 2_000_000 && metrics.pixels > 0);
      assert.ok(metrics.drawCalls < 45);
      const samples = await page.evaluate(async () => {
        const sections = Array.from(
          document.querySelectorAll<HTMLElement>(".cinema-scene"),
        );
        const canvas = document.querySelector<HTMLCanvasElement>("canvas")!,
          result: number[] = [];
        for (const index of [4, 5, 6, 5, 4, 3]) {
          scrollTo({ top: sections[index].offsetTop, behavior: "instant" });
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
          result.push(
            Math.abs(
              Number(canvas.dataset.progress) -
                Number(canvas.dataset.targetProgress),
            ),
          );
        }
        return result;
      });
      assert.ok(samples.every((lag) => lag <= 0.00401));
      performanceEvidence.push({
        ...metrics,
        maxTimelineLag: Math.max(...samples),
      });
    }
    await writeFile(
      join(output, "cinematic-performance.json"),
      JSON.stringify(performanceEvidence, null, 2),
    );
    record(
      "1440p and 4K stay within 2M render pixels, under 45 draws, and a 0.004 timeline lag in both scroll directions",
    );

    await page.setViewportSize({ width: 1440, height: 900 });
    await chapter(page, "begin");
    await page
      .getByRole("link", { name: "Open your workspace", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Continue with Google" }),
    ).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(0);
    await page.goto(origin);
    await expect(page.locator(".cinema")).toHaveAttribute(
      "data-scene",
      "ready",
    );
    await canvas.evaluate((element) =>
      (element as HTMLCanvasElement)
        .getContext("webgl2")
        ?.getExtension("WEBGL_lose_context")
        ?.loseContext(),
    );
    await expect(page.locator(".cinema")).toHaveAttribute(
      "data-scene",
      "fallback",
    );
    await expect(page.locator(".cinema-poster img")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Open your workspace", exact: true }),
    ).toBeVisible();
    assert.deepEqual(errors, []);
    record(
      "Workspace navigation disposes the GPU scene; context loss restores the Blender still edition without console errors",
    );
  } finally {
    await context.close();
  }

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "no-preference",
  });
  try {
    const page = await mobile.newPage();
    await page.goto(origin);
    await expect(page.locator(".cinema")).toHaveAttribute(
      "data-scene",
      "ready",
      { timeout: 60_000 },
    );
    await page.screenshot({
      path: join(output, "cinematic-mobile-arrival.png"),
    });
    await page.getByRole("button", { name: "Open menu" }).click();
    await page
      .getByRole("navigation", { name: "Mobile navigation" })
      .getByRole("link", { name: "Capabilities" })
      .click();
    await expect(
      page.getByRole("navigation", { name: "Mobile navigation" }),
    ).toHaveCount(0);
    await chapter(page, "capabilities");
    await page.getByRole("button", { name: "Inspect the stitching" }).tap();
    await page.waitForTimeout(800);
    await page.screenshot({
      path: join(output, "cinematic-mobile-reveal.png"),
    });
    assert.equal(
      await page
        .getByTestId("cinematic-canvas")
        .evaluate((element) => getComputedStyle(element).touchAction),
      "pan-y pinch-zoom",
    );
    for (const viewport of [
      { width: 810, height: 1080 },
      { width: 320, height: 568 },
    ]) {
      await page.setViewportSize(viewport);
      await chapter(page, "begin");
      await expect(
        page.getByRole("link", { name: "Open your workspace", exact: true }),
      ).toBeInViewport();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await page.screenshot({
        path: join(output, `cinematic-${viewport.width}.png`),
      });
    }
    record(
      "Mobile, tablet and short portrait scenes preserve menu navigation, inspection, native touch scrolling and pinch zoom",
    );
  } finally {
    await mobile.close();
  }

  const reduced = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    reducedMotion: "reduce",
  });
  try {
    const page = await reduced.newPage();
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext,
        scope = window as unknown as { webglAttempts: number };
      scope.webglAttempts = 0;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        ...args: Parameters<typeof original>
      ) {
        if (String(args[0]).includes("webgl")) scope.webglAttempts++;
        return Reflect.apply(original, this, args);
      } as typeof original;
    });
    await page.goto(origin);
    await expect(page.locator(".cinema")).toHaveAttribute(
      "data-motion",
      "static",
    );
    assert.equal(
      await page.evaluate(
        () => (window as unknown as { webglAttempts: number }).webglAttempts,
      ),
      0,
    );
    await page.waitForTimeout(800);
    await page.screenshot({
      path: join(output, "cinematic-reduced-motion.png"),
    });
    await page.locator("#capabilities").scrollIntoViewIfNeeded();
    await expect(page.getByAltText(/completed kingfisher/)).toBeVisible();
    await page.getByRole("button", { name: "Enable cinematic motion" }).click();
    await expect(page.locator(".cinema")).toHaveAttribute(
      "data-scene",
      "ready",
      { timeout: 60_000 },
    );
    assert.ok(
      (await page.evaluate(
        () => (window as unknown as { webglAttempts: number }).webglAttempts,
      )) > 0,
    );
    record(
      "Reduced motion creates no WebGL context, shows the real finished embroidery, and supports explicit motion opt-in",
    );
  } finally {
    await reduced.close();
  }

  for (const failure of ["webgl", "asset"]) {
    const context = await browser.newContext({
      reducedMotion: "no-preference",
    });
    try {
      const page = await context.newPage();
      if (failure === "asset")
        await page.route("**/models/embroidery-machine.glb", (route) =>
          route.fulfill({ status: 503, body: "Unavailable" }),
        );
      else
        await page.addInitScript(() => {
          const original = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function (
            this: HTMLCanvasElement,
            ...args: Parameters<typeof original>
          ) {
            return String(args[0]).includes("webgl")
              ? null
              : Reflect.apply(original, this, args);
          } as typeof original;
        });
      await page.goto(origin);
      await expect(page.locator(".cinema")).toHaveAttribute(
        "data-scene",
        "fallback",
        { timeout: 60_000 },
      );
      await expect(page.locator(".cinema-poster img")).toBeVisible();
      await page
        .getByRole("link", { name: "Open your workspace", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Continue with Google" }),
      ).toBeVisible();
      record(
        `${failure === "asset" ? "An unavailable model" : "A browser without WebGL"} retains the artwork and working workspace entry`,
      );
    } finally {
      await context.close();
    }
  }
}
