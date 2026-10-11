// Keep the multipart envelope below Vercel's 4.5 MB request limit. PostgreSQL
// and the private Storage bucket enforce the same 4 MiB document limit.
export const MAX_FILE_SIZE = 4 * 1024 * 1024;
export const MAX_KNOWLEDGE_REQUEST_SIZE = MAX_FILE_SIZE + 64 * 1024;
export const UPLOAD_SIZE_ERROR =
  "Files must be 4 MB or smaller. Compress the document or split it into smaller files.";

export function declaredKnowledgeBodySize(headers: Headers) {
  const value = headers.get("content-length");
  if (value === null) return null;
  if (!/^\d+$/.test(value)) return NaN;
  return Number(value);
}
