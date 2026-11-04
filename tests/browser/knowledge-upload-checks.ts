import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { expect, type Browser } from "@playwright/test";
import { evaluationPdf } from "../helpers/evaluation-files";
import type { KnowledgeDocument } from "@/types";

export async function verifyKnowledgeUpload(
  browser: Browser,
  origin: string,
  record: (message: string) => void,
) {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  try {
    const page = await context.newPage();
    const endpoint = `${origin}/api/knowledge`;
    const name = "Lantern review handbook";
    const fact = "The documented review process has two steps. Submit the change. A department manager reviews it. Lantern reference 763.";
    const file = { name: `${name}.pdf`, mimeType: "application/pdf", buffer: evaluationPdf(fact) };
    const denied = await page.request.post(endpoint, {
      headers: { Origin: origin, "Idempotency-Key": randomUUID() },
      multipart: { file },
    });
    assert.equal(denied.status(), 401);

    await page.goto(`${origin}/admin/knowledge`);
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect(page.getByRole("heading", { name: "Your workspace", exact: true }))
      .toBeVisible({ timeout: 60_000 });
    await page.goto(`${origin}/admin/knowledge`);
    await page.getByRole("button", { name: "Upload document", exact: true }).click();
    const picker = page.locator('input[type="file"]');
    const save = page.getByRole("button", { name: "Save & index", exact: true });
    await picker.setInputFiles({ ...file, buffer: Buffer.from("This is not a valid PDF file.") });
    await save.click();
    await expect(page.getByText("This file is not a valid PDF.", { exact: true }))
      .toBeVisible({ timeout: 60_000 });

    await picker.setInputFiles(file);
    const [saved] = await Promise.all([
      page.waitForResponse((response) => response.url() === endpoint && response.request().method() === "POST", { timeout: 60_000 }),
      save.click(),
    ]);
    assert.equal(saved.status(), 202, await saved.text());
    const { document } = await saved.json() as { document: KnowledgeDocument };
    assert.equal(document.status, "processing");
    const row = page.locator(".knowledge-source").filter({ hasText: name });
    await expect(row.getByText("Indexed", { exact: true })).toBeVisible({ timeout: 60_000 });
    const original = await page.request.get(`${endpoint}/${document.id}/file`);
    assert.equal(original.status(), 200);
    assert.equal(original.headers()["content-type"], "application/pdf");
    assert.deepEqual(await original.body(), file.buffer);

    const chat = await page.request.post(`${origin}/api/chat`, {
      headers: { Origin: origin },
      data: {
        message: "What are the two steps in the Lantern review process?",
        conversationId: null,
        requestId: randomUUID(),
        filters: { documentIds: [document.id] },
      },
      timeout: 60_000,
    });
    const stream = await chat.text();
    assert.equal(chat.status(), 200, stream);
    assert.match(stream, /"type":"done"/);
    assert.doesNotMatch(stream, /"type":"error"/);
    assert.match(stream, /Lantern reference 763/);
    record("Owner uploads a real PDF, saves the exact private original, indexes it, and retrieves cited text; malformed and anonymous uploads are rejected");
  } finally {
    await context.close();
  }
}
