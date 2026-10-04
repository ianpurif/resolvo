import { z } from "zod";

export const orderNumberSchema = z.string().trim().toUpperCase().regex(/^ORD-\d{4,10}$/, "Use an order number like ORD-1002.");
export const ticketStatusSchema = z.enum(["open", "in_progress", "resolved"]);
export const chatInputSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  conversationId: z.uuid().nullable(),
  requestId: z.uuid(),
});
export const searchKnowledgeSchema = z.object({ query: z.string().trim().min(2).max(1000) });
export const getOrderSchema = z.object({ orderNumber: orderNumberSchema });
export const createTicketSchema = z.object({
  orderNumber: orderNumberSchema.optional(),
  customerEmail: z.email().max(254).optional(),
  issue: z.string().trim().min(10).max(2000),
});
export const MAX_FILE_SIZE = 4 * 1024 * 1024;
export const acceptedExtensions = ["pdf", "txt", "md"] as const;

export function validateUpload(file: { name: string; size: number }) {
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  if (!extension || !acceptedExtensions.includes(extension as typeof acceptedExtensions[number])) {
    throw new Error("Choose a PDF, TXT, or Markdown file.");
  }
  if (file.size === 0) throw new Error("This file is empty.");
  if (file.size > MAX_FILE_SIZE) throw new Error("Files must be 4 MB or smaller.");
  return extension;
}
