import "server-only";
import { AppError } from "@/lib/config";
import {
  declaredKnowledgeBodySize,
  MAX_FILE_SIZE,
  MAX_KNOWLEDGE_REQUEST_SIZE,
  UPLOAD_SIZE_ERROR,
} from "@/lib/knowledge-limits";
import { sourceInputSchema } from "@/lib/validations";
import { prepareFile, prepareSource } from "./ingest";

// Count actual bytes as well as Content-Length, including chunked requests.
// Parse only a complete bounded body, never Next's truncated multipart stream.
export async function readKnowledgeSource(request: Request) {
  const declared = declaredKnowledgeBodySize(request.headers);
  if (declared !== null && !Number.isFinite(declared))
    throw new AppError("The upload has an invalid Content-Length.", 400);
  if (declared !== null && declared > MAX_KNOWLEDGE_REQUEST_SIZE)
    throw new AppError(UPLOAD_SIZE_ERROR, 413);
  const contentType = request.headers.get("content-type") ?? "";
  const mediaType = contentType.split(";")[0].trim().toLowerCase();
  if (!["multipart/form-data", "application/json"].includes(mediaType))
    throw new AppError(
      "Use a document upload or a JSON knowledge source.",
      415,
    );
  if (!request.body) throw new AppError("The knowledge source is empty.", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_KNOWLEDGE_REQUEST_SIZE) {
        void reader.cancel().catch(() => {});
        throw new AppError(UPLOAD_SIZE_ERROR, 413);
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "The upload was interrupted. Choose the file and retry.",
      400,
    );
  } finally {
    reader.releaseLock();
  }
  if (declared !== null && declared !== size)
    throw new AppError(
      "The upload is incomplete. Choose the file and retry.",
      400,
    );
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const body = new Response(bytes, {
    headers: { "Content-Type": contentType },
  });
  if (mediaType === "multipart/form-data") {
    let form: FormData;
    try {
      form = await body.formData();
    } catch {
      throw new AppError(
        "The document upload is malformed or incomplete. Choose the file and retry.",
        400,
      );
    }
    const entries = [...form.entries()];
    const file = form.get("file");
    if (entries.length !== 1 || !(file instanceof File))
      throw new AppError("Choose one document to import.", 400);
    if (file.size > MAX_FILE_SIZE) throw new AppError(UPLOAD_SIZE_ERROR, 413);
    return prepareFile(file);
  }
  let input: unknown;
  try {
    input = await body.json();
  } catch {
    throw new AppError("The knowledge source contains invalid JSON.", 400);
  }
  return prepareSource(sourceInputSchema.parse(input));
}
