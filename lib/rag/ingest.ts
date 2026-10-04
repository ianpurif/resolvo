import "server-only";
import { randomUUID } from "node:crypto";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { AppError } from "@/lib/config";
import { database, checkDatabaseError } from "@/lib/supabase/server";
import { validateUpload } from "@/lib/validations";
import { vectorStore } from "./vector-store";
import type { KnowledgeDocument } from "@/types";

export async function extractText(file: File, extension: string) {
  if (extension === "pdf") {
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new AppError("This file is not a valid PDF.", 400);
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: bytes });
    try { return (await parser.getText()).text; }
    catch { throw new AppError("We couldn't read this PDF. Use a text-based PDF without password protection.", 400); }
    finally { await parser.destroy(); }
  }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()); }
  catch { throw new AppError("Save this document as UTF-8 text and upload it again.", 400); }
}

export function normalizeText(text: string) {
  return text.replace(/\r\n?/g, "\n").replace(/\0/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

async function prepareDocument(file: File) {
  let extension: string;
  try { extension = validateUpload(file); }
  catch (error) { throw new AppError(error instanceof Error ? error.message : "Invalid file.", 400); }
  if (!process.env.VOYAGE_API_KEY?.trim()) throw new AppError("Connect Voyage AI embeddings before uploading knowledge.", 503);
  const text = normalizeText(await extractText(file, extension));
  if (text.length < 20) throw new AppError("This document has too little readable text. Scanned PDFs need OCR before upload.", 400);
  if (text.length > 250000) throw new AppError("This document is too long. Split it into files with fewer than 250,000 characters.", 400);
  return { extension, text };
}

export async function ingestDocument(file: File): Promise<KnowledgeDocument> {
  const { extension, text } = await prepareDocument(file);
  const db = database();
  const id = randomUUID();
  const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-160);
  const filePath = `${id}/${filename}`;
  const mime = extension === "pdf" ? "application/pdf" : extension === "md" ? "text/markdown" : "text/plain";
  const title = text.match(/^#\s+(.+)$/m)?.[1]?.slice(0, 160) ?? file.name.replace(/\.[^.]+$/, "");
  const uploaded = await db.storage.from("support-documents").upload(filePath, file, { contentType: mime, upsert: false });
  checkDatabaseError(uploaded.error, "store this document");
  const inserted = await db.from("documents").insert({ id, name: title, file_path: filePath, mime_type: mime, size_bytes: file.size }).select().single();
  if (inserted.error) {
    await db.storage.from("support-documents").remove([filePath]);
    checkDatabaseError(inserted.error, "save this document");
  }
  return indexDocument({ id, name: title, file_path: filePath }, text);
}

async function indexDocument(document: Pick<KnowledgeDocument, "id" | "name" | "file_path">, text: string, replaceExisting = false): Promise<KnowledgeDocument> {
  const db = database();
  const { id, name: title, file_path: filePath } = document;
  const filename = filePath.split("/").at(-1)!;
  try {
    if (replaceExisting) {
      const removed = await db.from("document_chunks").delete().eq("document_id", id);
      checkDatabaseError(removed.error, "clear old document embeddings");
    }
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1200, chunkOverlap: 200 });
    const chunks = await splitter.splitDocuments([new Document({ pageContent: text, metadata: { documentId: id, title, source: filename } })]);
    await vectorStore("document").addDocuments(chunks, { ids: chunks.map(() => randomUUID()) });
    const finished = await db.from("documents").update({ status: "ready", chunk_count: chunks.length, error_message: null }).eq("id", id).select().single();
    checkDatabaseError(finished.error, "complete document indexing");
    return finished.data;
  } catch {
    const cleanup = await db.from("document_chunks").delete().eq("document_id", id);
    if (cleanup.error) console.error("[ingestion] Partial chunk cleanup failed");
    const failed = await db.from("documents").update({ status: "failed", chunk_count: 0, error_message: "Indexing failed. Check your embedding configuration, then re-index or delete and upload again." }).eq("id", id);
    if (failed.error) console.error("[ingestion] Failed status update failed");
    throw new AppError("We couldn't index this document. Check the embedding connection, then delete and upload it again.", 502);
  }
}

/** Rebuild a failed document from its original Storage file, retaining its ID. */
export async function reindexDocument(document: KnowledgeDocument, file: File): Promise<KnowledgeDocument> {
  const { text } = await prepareDocument(file);
  const started = await database().from("documents")
    .update({ status: "processing", chunk_count: 0, error_message: null })
    .eq("id", document.id).eq("status", "failed").select().single();
  checkDatabaseError(started.error, "start document re-indexing");
  return indexDocument(document, text, true);
}
