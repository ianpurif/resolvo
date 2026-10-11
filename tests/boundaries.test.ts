import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { resolveCitations } from "../lib/ai/citations";
import { validateUpload, chatInputSchema } from "../lib/validations";
import { extractText, normalizeText } from "../lib/rag/ingest";
import { requireSameOrigin } from "../lib/api";

test("only retrieved source IDs become citations, duplicate IDs are collapsed", () => {
  const id = randomUUID();
  const source = {
    id,
    title: "Return Policy",
    excerpt: "30 days after delivery.",
  };
  const result = resolveCitations(
    `Return within 30 days. [[source:${id}]] [[source:fake-id]] [[source:${id}]]\nSource: Invented`,
    new Map([[id, source]]),
  );
  assert.deepEqual(result.sources, [source]);
  assert.equal(result.content, "Return within 30 days.");
});

test("invalid and oversized uploads are rejected before ingestion", () => {
  assert.throws(() => validateUpload({ name: "report.exe", size: 100 }));
  assert.throws(() => validateUpload({ name: "report.pdf", size: 0 }));
  assert.throws(() =>
    validateUpload({ name: "report.pdf", size: 5 * 1024 * 1024 }),
  );
  assert.equal(validateUpload({ name: "POLICY.MD", size: 200 }), "md");
});

test("text extraction accepts UTF-8, normalizes whitespace, rejects fake PDFs and invalid text", async () => {
  const file = new File(
    ["# Policy\r\n\r\n\r\nReturns\t  within 30 days."],
    "policy.md",
  );
  assert.equal(
    normalizeText(await extractText(file, "md")),
    "# Policy\n\nReturns within 30 days.",
  );
  await assert.rejects(extractText(file, "pdf"), /not a valid PDF/);
  await assert.rejects(
    extractText(new File([new Uint8Array([0xff, 0xfe])], "binary.txt"), "txt"),
    /UTF-8/,
  );
});

test("the current PDF parser extracts text from a valid PDF", async () => {
  const stream = "BT /F1 12 Tf 72 720 Td (Returns within 30 days.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${offset.toString().padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const text = await extractText(
    new File([pdf], "valid.pdf", { type: "application/pdf" }),
    "pdf",
  );
  assert.match(text, /Returns within 30 days/);
});

test("external inputs require a bounded message and opaque UUIDs", () => {
  assert.equal(
    chatInputSchema.safeParse({
      message: "x".repeat(4001),
      conversationId: null,
      requestId: randomUUID(),
    }).success,
    false,
  );
  assert.equal(
    chatInputSchema.safeParse({
      message: "Hi",
      conversationId: "admin",
      requestId: randomUUID(),
    }).success,
    false,
  );
});

test("CSRF checks compare the configured application origin and require Origin", () => {
  const previous = {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_PUBLISHABLE_KEY,
    app: process.env.APP_URL,
  };
  process.env.SUPABASE_URL = "https://fixture.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fixture";
  process.env.APP_URL = "http://localhost:3000";
  try {
    assert.doesNotThrow(() =>
      requireSameOrigin(
        new Request("http://internal/api/chat", {
          headers: { origin: "http://localhost:3000" },
        }),
      ),
    );
    assert.throws(() =>
      requireSameOrigin(
        new Request("http://internal/api/chat", {
          headers: { origin: "https://untrusted.example" },
        }),
      ),
    );
    assert.throws(() =>
      requireSameOrigin(new Request("http://internal/api/chat")),
    );
    assert.equal(
      chatInputSchema.safeParse({
        message: "Hi",
        conversationId: null,
        requestId: randomUUID(),
        organization_id: randomUUID(),
      }).success,
      false,
    );
  } finally {
    for (const [key, value] of Object.entries({
      SUPABASE_URL: previous.url,
      SUPABASE_PUBLISHABLE_KEY: previous.key,
      APP_URL: previous.app,
    }))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  }
});
