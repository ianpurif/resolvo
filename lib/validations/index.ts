import { z } from "zod";
import { MAX_FILE_SIZE, UPLOAD_SIZE_ERROR } from "@/lib/knowledge-limits";
export { MAX_FILE_SIZE } from "@/lib/knowledge-limits";
export const ticketStatusSchema = z.enum(["open", "in_progress", "resolved"]);
export const knowledgeFilterSchema = z.object({
  platforms: z.array(z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/)).max(100).optional(),
  documentIds: z.array(z.uuid()).max(100).optional(),
}).strict();
export type KnowledgeFilter = z.infer<typeof knowledgeFilterSchema>;
export const chatInputSchema = z
  .object({
    message: z.string().trim().min(1).max(4000),
    conversationId: z.uuid().nullable(),
    requestId: z.uuid(),
    filters: knowledgeFilterSchema.optional(),
  })
  .strict();
export const createTicketSchema = z
  .object({ issue: z.string().trim().min(10).max(2000) })
  .strict();
export const workspaceSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    industry: z.string().trim().min(2).max(80),
  })
  .strict();
export const sourceInputSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("manual"),
      name: z.string().trim().min(1).max(160),
      text: z.string().trim().min(20).max(250000),
    })
    .strict(),
  z.object({ kind: z.literal("website"), url: z.url().max(2048) }).strict(),
]);
export const acceptedExtensions = ["pdf", "docx", "txt", "md", "csv", "tsv", "json"] as const;
export function validateUpload(file: { name: string; size: number }) {
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  if (
    !extension ||
    !acceptedExtensions.includes(
      extension as (typeof acceptedExtensions)[number],
    )
  )
    throw new Error("Choose a PDF, DOCX, TXT, Markdown, CSV, TSV, or JSON file.");
  if (!file.size) throw new Error("This file is empty.");
  if (file.size > MAX_FILE_SIZE) throw new Error(UPLOAD_SIZE_ERROR);
  return extension;
}
