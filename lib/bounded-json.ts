import { AppError } from "./config";

export async function readBoundedJson(request: Request, limit = 24576): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    throw new AppError("Use a JSON request body.", 415);
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)))) throw new AppError("Invalid Content-Length.", 400);
  if (declared !== null && Number(declared) > limit) throw new AppError("This request is too large.", 413);
  if (!request.body) throw new AppError("The request body is empty.", 400);
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) { void reader.cancel().catch(() => {}); throw new AppError("This request is too large.", 413); }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("The request was interrupted. Please retry.", 400);
  } finally { reader.releaseLock(); }
  if (declared !== null && Number(declared) !== bytes) throw new AppError("The request body is incomplete.", 400);
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { throw new AppError("The request contains invalid JSON.", 400); }
}
