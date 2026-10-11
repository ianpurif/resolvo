import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../lib/config";
import {
  MAX_FILE_SIZE,
  MAX_KNOWLEDGE_REQUEST_SIZE,
} from "../lib/knowledge-limits";
import { readKnowledgeSource } from "../lib/rag/read-source";
import { prepareFile } from "../lib/rag/ingest";

const endpoint = "http://localhost/api/knowledge";
const status = (expected: number) => (error: unknown) =>
  error instanceof AppError && error.status === expected;

test("actual multipart parsing accepts one UTF-8 document and normalizes its text", async () => {
  const form = new FormData();
  form.set(
    "file",
    new File(
      ["# Knowledge\r\nActual document content with café and Unicode."],
      "Knowledge.MD",
    ),
  );
  const source = await readKnowledgeSource(
    new Request(endpoint, { method: "POST", body: form }),
  );
  assert.equal(source.kind, "file");
  assert.equal(source.name, "Knowledge");
  assert.equal(source.file.type, "text/markdown");
  assert.match(source.text, /\nActual document content with café/);
});

test("a file one byte above the limit returns 413 even when the multipart envelope fits", async () => {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(MAX_FILE_SIZE + 1)], "large.pdf"));
  await assert.rejects(
    readKnowledgeSource(new Request(endpoint, { method: "POST", body: form })),
    status(413),
  );
});

test("oversized declared bodies are rejected before reading or parsing", async () => {
  const request = new Request(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": String(MAX_KNOWLEDGE_REQUEST_SIZE + 1),
    },
    body: "{}",
  });
  await assert.rejects(readKnowledgeSource(request), status(413));
  assert.equal(request.bodyUsed, false);
});

test("actual chunked streams without Content-Length are bounded and cancelled", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(64 * 1024));
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request(
    endpoint,
    Object.assign(
      { duplex: "half" },
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: stream,
      },
    ),
  );
  await assert.rejects(readKnowledgeSource(request), status(413));
  assert.equal(cancelled, true);
});

test("a truncated multipart body produces a controlled 400 rather than a parser TypeError", async () => {
  const form = new FormData();
  form.set(
    "file",
    new File(
      ["Readable document content with more than twenty characters."],
      "knowledge.txt",
    ),
  );
  const complete = new Request(endpoint, { method: "POST", body: form });
  const bytes = new Uint8Array(await complete.arrayBuffer());
  const truncated = new Request(endpoint, {
    method: "POST",
    headers: complete.headers,
    body: bytes.slice(0, 20),
  });
  await assert.rejects(readKnowledgeSource(truncated), status(400));
});

test("multipart uploads reject duplicate files and additional tenant fields", async () => {
  for (const key of ["file", "organization_id"]) {
    const form = new FormData();
    form.set(
      "file",
      new File(["Readable original document content."], "knowledge.txt"),
    );
    form.append(key, "unexpected field");
    await assert.rejects(
      readKnowledgeSource(
        new Request(endpoint, { method: "POST", body: form }),
      ),
      status(400),
    );
  }
});

test("complete JSON manual sources parse, while incomplete, malformed and unsupported bodies fail safely", async () => {
  const body = JSON.stringify({
    kind: "manual",
    name: "Document notes",
    text: "Readable document notes with more than twenty characters.",
  });
  const source = await readKnowledgeSource(
    new Request(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }),
  );
  assert.equal(source.kind, "manual");
  await assert.rejects(
    readKnowledgeSource(
      new Request(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(body.length + 1),
        },
        body,
      }),
    ),
    status(400),
  );
  await assert.rejects(
    readKnowledgeSource(
      new Request(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
    ),
    status(400),
  );
  await assert.rejects(
    readKnowledgeSource(
      new Request(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/xml" },
        body: "<source/>",
      }),
    ),
    status(415),
  );
});

test("a real blank two-page PDF cannot be indexed as artificial page-number text", async () => {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 5 0 R >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 5 0 R >>",
    "<< /Length 0 >>\nstream\nendstream",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += "xref\n0 6\n0000000000 65535 f \n";
  pdf += offsets
    .slice(1)
    .map((offset) => offset.toString().padStart(10, "0") + " 00000 n \n")
    .join("");
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  await assert.rejects(
    prepareFile(new File([pdf], "blank.pdf", { type: "application/pdf" })),
    status(422),
  );
});
