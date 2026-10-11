import "server-only";
import { randomUUID, createHash } from "node:crypto";
import { splitKnowledge, INDEX_POLICY_VERSION } from "./chunks";
import { delimitedKnowledge, jsonKnowledge } from "./structured";
import { AppError } from "@/lib/config";
import { checkDatabaseError } from "@/lib/supabase/server";
import { validateUpload } from "@/lib/validations";
import { MAX_FILE_SIZE } from "@/lib/knowledge-limits";
import { tokenCounts } from "./embedding-policy";
import { pendingIndex, continueIndexing } from "./index-jobs";
import { extractWebsite } from "./website";
import type { TenantContext } from "@/lib/auth";
import { requireKnowledgeOwner } from "@/lib/auth-context";
import type { KnowledgeDocument, DataSource } from "@/types";
import { fromBuffer, type Entry } from "yauzl";
export function normalizeText(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\0/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
async function validateDocx(bytes: Buffer) {
  await new Promise<void>((resolve, reject) =>
    fromBuffer(bytes, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) {
        reject(new AppError("This DOCX file is not a valid document.", 400));
        return;
      }
      let size = 0;
      let expanded = 0;
      let count = 0;
      let document = false;
      zip.on("entry", (entry: Entry) => {
        size += entry.uncompressedSize;
        count++;
        if (entry.fileName === "word/document.xml") document = true;
        if (
          size > 20 * 1024 * 1024 ||
          count > 2000 ||
          entry.generalPurposeBitFlag & 1
        ) {
          zip.close();
          reject(
            new AppError(
              "This DOCX archive is encrypted or expands beyond the import limit.",
              400,
            ),
          );
          return;
        }
        if (entry.fileName.endsWith("/")) {
          zip.readEntry();
          return;
        }
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) {
            zip.close();
            reject(new AppError("This DOCX archive could not be read.", 400));
            return;
          }
          stream.on("data", (chunk: Buffer) => {
            expanded += chunk.length;
            if (expanded > 20 * 1024 * 1024) {
              stream.destroy();
              zip.close();
              reject(
                new AppError(
                  "This DOCX archive expands beyond the import limit.",
                  400,
                ),
              );
            }
          });
          stream.on("end", () => zip.readEntry());
          stream.on("error", () => {
            zip.close();
            reject(new AppError("This DOCX archive is damaged.", 400));
          });
        });
      });
      zip.on("end", () =>
        document
          ? resolve()
          : reject(new AppError("This file is not a DOCX document.", 400)),
      );
      zip.on("error", () =>
        reject(new AppError("This DOCX file could not be read.", 400)),
      );
      zip.readEntry();
    }),
  );
}
export async function extractText(file: File, extension: string) {
  if (extension === "pdf") {
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.subarray(0, 5).toString() !== "%PDF-")
      throw new AppError("This file is not a valid PDF.", 400);
    const { PDFParse } = await import("pdf-parse");
    let parser: InstanceType<typeof PDFParse> | undefined;
    try {
      parser = new PDFParse({ data: bytes });
      if ((await parser.getInfo()).total > 100)
        throw new AppError(
          "Split PDFs longer than 100 pages into smaller files.",
          400,
        );
      const result = await parser.getText();
      // Page-number separators are parser metadata, not document knowledge.
      // Using page text also keeps blank/image-only PDFs from passing validation.
      return result.pages.map((page) => page.text).join("\n\n");
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        "Use a text-based PDF without password protection.",
        400,
      );
    } finally {
      await parser?.destroy();
    }
  }
  if (extension === "docx") {
    const bytes = Buffer.from(await file.arrayBuffer());
    await validateDocx(bytes);
    const { extractRawText } = await import("mammoth");
    try {
      return (await extractRawText({ buffer: bytes })).value;
    } catch {
      throw new AppError(
        "This DOCX file could not be read. Save a valid, unencrypted DOCX document.",
        400,
      );
    }
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      await file.arrayBuffer(),
    );
    return extension === "csv" ? delimitedKnowledge(text, ",")
      : extension === "tsv" ? delimitedKnowledge(text, "\t")
        : extension === "json" ? jsonKnowledge(text) : text;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Save this document as UTF-8 text.", 400);
  }
}
type Prepared = {
  file: File;
  text: string;
  name: string;
  kind: DataSource["kind"];
  locator: string | null;
};
export async function prepareFile(file: File): Promise<Prepared> {
  let extension: string;
  try {
    extension = validateUpload(file);
  } catch (error) {
    throw new AppError(
      error instanceof Error ? error.message : "Invalid file.",
      file.size > MAX_FILE_SIZE ? 413 : 400,
    );
  }
  const text = normalizeText(await extractText(file, extension));
  if (extension === "pdf" && text.length < 20)
    throw new AppError(
      "This PDF contains too little readable text. Upload a text-based PDF; scanned pages require OCR first.",
      422,
    );
  const mime =
    extension === "pdf"
      ? "application/pdf"
      : extension === "docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : extension === "md"
          ? "text/markdown"
          : extension === "csv" ? "text/csv"
            : extension === "tsv" ? "text/tab-separated-values"
              : extension === "json" ? "application/json" : "text/plain";
  return {
    file: new File([file], file.name, { type: mime }),
    text,
    name: file.name.replace(/\.[^.]+$/, "").slice(0, 160),
    kind: "file",
    locator: null,
  };
}
export async function prepareSource(
  input:
    | { kind: "manual"; name: string; text: string }
    | { kind: "website"; url: string },
): Promise<Prepared> {
  if (input.kind === "manual")
    return {
      file: new File([input.text], "knowledge.md", { type: "text/markdown" }),
      text: normalizeText(input.text),
      name: input.name,
      kind: "manual",
      locator: null,
    };
  const page = await extractWebsite(input.url);
  return {
    file: new File([page.text], "website.txt", { type: "text/plain" }),
    text: normalizeText(page.text),
    name: page.name,
    kind: "website",
    locator: page.locator,
  };
}
export function assertTenantFile(context: TenantContext, path: string) {
  if (
    !path.startsWith("organizations/" + context.organization.id + "/documents/")
  )
    throw new AppError("This file is not accessible.", 404);
}
export async function loadDocument(context: TenantContext, id: string) {
  const result = await context.db
    .from("documents")
    .select("*")
    .eq("organization_id", context.organization.id)
    .eq("id", id)
    .maybeSingle();
  checkDatabaseError(result.error, "read this document");
  if (!result.data) throw new AppError("Document not found.", 404);
  return result.data as KnowledgeDocument;
}
export async function ingestPrepared(
  context: TenantContext,
  input: Prepared,
  existing?: KnowledgeDocument,
  requestId?: string,
): Promise<KnowledgeDocument> {
  requireKnowledgeOwner(context);
  const { db, organization } = context;
  if (existing && existing.organization_id !== organization.id)
    throw new AppError("Document not found.", 404);
  if (!process.env.VOYAGE_API_KEY?.trim())
    throw new AppError("Voyage embeddings are not configured.", 503);
  if (input.text.length < 20 || input.text.length > 250000)
    throw new AppError(
      "Use between 20 and 250,000 characters of readable text.",
      400,
    );
  validateUpload(input.file);
  const hash = createHash("sha256").update(input.text).digest("hex");
  if (!existing && requestId) {
    const previous = await db
      .from("documents")
      .select("*")
      .eq("id", requestId)
      .eq("organization_id", organization.id)
      .maybeSingle();
    checkDatabaseError(previous.error, "check the saved knowledge request");
    if (previous.data) {
      const job = await pendingIndex(context, requestId);
      if ((job?.content_hash ?? previous.data.content_hash) !== hash)
        throw new AppError(
          "This save request already contains different knowledge. Start a new save.",
          409,
        );
      return previous.data as KnowledgeDocument;
    }
  }
  if (existing) {
    const job = await pendingIndex(context, existing.id);
    if (job) {
      if (job.content_hash !== hash || job.name !== input.name)
        throw new AppError(
          "Resume the saved index with Re-index before starting another revision.",
          409,
        );
      return existing;
    }
  } else {
    // Verify the migration before uploading an original that cannot be claimed.
    await pendingIndex(context, requestId ?? randomUUID());
  }
  if (
    existing?.status === "ready" &&
    !existing.error_message &&
    existing.content_hash === hash &&
    existing.name === input.name &&
    existing.index_policy_version === INDEX_POLICY_VERSION
  ) {
    const source = await db
      .from("data_sources")
      .select("kind,locator")
      .eq("organization_id", organization.id)
      .eq("id", existing.data_source_id)
      .single();
    checkDatabaseError(source.error, "read the knowledge source");
    if (!source.data) throw new AppError("Knowledge source not found.", 404);
    if (
      source.data.kind === input.kind &&
      source.data.locator === input.locator
    )
      return existing;
  }
  const chunks = await splitKnowledge(input.text);
  const texts = chunks.map((chunk) => chunk.content);
  if (texts.length > 500)
    throw new AppError(
      "This document produces too many chunks. Split it into smaller files.",
      400,
    );
  const counts = await tokenCounts(texts);
  const id = existing?.id ?? requestId ?? randomUUID();
  const revision = existing ? randomUUID() : (requestId ?? randomUUID());
  const filename = input.file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-160);
  const path =
    "organizations/" +
    organization.id +
    "/documents/" +
    id +
    "/" +
    revision +
    "/" +
    filename;
  const mime = input.file.type || "text/plain";
  const uploaded = await db.storage
    .from("support-documents")
    .upload(path, input.file, { contentType: mime, upsert: false });
  if (
    uploaded.error &&
    "statusCode" in uploaded.error &&
    String(uploaded.error.statusCode) === "409"
  ) {
    // Recover an upload whose response was lost before its job was created.
    // Never overwrite a different original under an idempotency key.
    const stored = await db.storage.from("support-documents").download(path);
    checkDatabaseError(stored.error, "verify the saved original");
    if (
      !stored.data ||
      createHash("sha256")
        .update(Buffer.from(await stored.data.arrayBuffer()))
        .digest("hex") !==
        createHash("sha256")
          .update(Buffer.from(await input.file.arrayBuffer()))
          .digest("hex")
    )
      throw new AppError(
        "This save request already contains a different original. Start a new save.",
        409,
      );
  } else checkDatabaseError(uploaded.error, "store this document");
  let claimed = false;
  try {
    const started = await db.rpc("start_document_index_job", {
      p_id: id,
      p_revision: revision,
      p_name: input.name,
      p_kind: input.kind,
      p_locator: input.locator,
      p_file_path: path,
      p_mime: mime,
      p_size: input.file.size,
      p_replace: Boolean(existing),
      p_hash: hash,
      p_manifest: chunks.map((chunk, index) => ({
        ...chunk,
        token_count: counts[index],
      })),
    });
    if (
      started.error?.message.includes("in progress") ||
      started.error?.message.includes("capacity")
    )
      throw new AppError(
        "An index update is already running. Wait a moment and retry.",
        409,
      );
    checkDatabaseError(started.error, "start document indexing");
    claimed = true;
    // Save and acknowledge the durable job immediately. Provider calls happen in
    // short continuation requests, each committing just one completed batch.
    return started.data as KnowledgeDocument;
  } catch (error) {
    // An uncertain RPC response may still have committed. Never delete its
    // original unless we can positively verify that no job references it.
    if (!claimed) {
      const stored = await pendingIndex(context, id).catch(() => undefined);
      if (stored?.revision === revision) return loadDocument(context, id);
      const persisted = await db
        .from("documents")
        .select("*")
        .eq("id", id)
        .eq("organization_id", organization.id)
        .maybeSingle();
      if (
        !persisted.error &&
        persisted.data?.file_path === path &&
        persisted.data.content_hash === hash
      )
        return persisted.data as KnowledgeDocument;
      if (
        stored === null &&
        !persisted.error &&
        persisted.data?.file_path !== path
      )
        await db.storage.from("support-documents").remove([path]);
    }
    if (error instanceof AppError) throw error;
    throw new AppError(
      "The source could not be saved. Retry with the same save request.",
      502,
    );
  }
}
export async function reindexDocument(
  context: TenantContext,
  document: KnowledgeDocument,
) {
  requireKnowledgeOwner(context);
  const pending = await pendingIndex(context, document.id);
  if (pending) {
    const resumed = await context.db.rpc("resume_document_index_job", {
      p_id: document.id,
    });
    checkDatabaseError(resumed.error, "resume saved indexing progress");
    return continueIndexing(context, document.id);
  }
  assertTenantFile(context, document.file_path);
  const source = await context.db
    .from("data_sources")
    .select("*")
    .eq("organization_id", context.organization.id)
    .eq("id", document.data_source_id)
    .single();
  checkDatabaseError(source.error, "read this knowledge source");
  if (source.data.kind === "website")
    return ingestPrepared(
      context,
      await prepareSource({ kind: "website", url: source.data.locator }),
      document,
    );
  const original = await context.db.storage
    .from("support-documents")
    .download(document.file_path);
  checkDatabaseError(original.error, "read the original knowledge file");
  if (!original.data) throw new AppError("The original file is missing.", 404);
  const file = new File(
    [original.data],
    document.file_path.split("/").at(-1)!,
    { type: document.mime_type },
  );
  const prepared = await prepareFile(file);
  prepared.kind = source.data.kind;
  prepared.name = document.name;
  return ingestPrepared(context, prepared, document);
}
