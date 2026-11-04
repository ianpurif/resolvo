import { UPLOAD_SIZE_ERROR } from "./knowledge-limits";
import type { KnowledgeDocument } from "@/types";

export async function readKnowledgeDocument(response: Response, fallback: string) {
  if (response.status === 413) throw new Error(UPLOAD_SIZE_ERROR);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (typeof data?.error === "string" && data.error.trim())
      throw new Error(data.error);
    if (response.status === 401)
      throw new Error("Your session expired. Sign in again and retry.");
    if (response.status === 403)
      throw new Error("Only workspace owners can save or index knowledge. Sign in with an owner account.");
    if (response.status === 429)
      throw new Error("Too many requests. Wait a moment and retry.");
    throw new Error(fallback);
  }
  const document = data?.document;
  if (typeof document?.id !== "string" || typeof document.name !== "string" ||
    !["processing", "ready", "failed"].includes(document.status))
    throw new Error(fallback);
  return document as KnowledgeDocument;
}
