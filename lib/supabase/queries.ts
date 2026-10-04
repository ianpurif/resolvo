import "server-only";
import { configuration } from "@/lib/config";
import { previewData } from "@/lib/demo-data";
import { database, checkDatabaseError } from "./server";
import type { WorkspaceData, Conversation, ChatMessage } from "@/types";

export async function getWorkspace(): Promise<WorkspaceData> {
  if (!configuration().databaseReady) return previewData();
  const db = database();
  const [orders, tickets, documents, conversations] = await Promise.all([
    db.from("orders").select("*").order("created_at", { ascending: false }),
    db.from("tickets").select("id,ticket_number,order_number,customer_email,issue,status,created_at").order("created_at", { ascending: false }),
    db.from("documents").select("*").order("created_at", { ascending: false }),
    db.from("conversations").select("*").order("updated_at", { ascending: false }),
  ]);
  for (const result of [orders, tickets, documents, conversations]) checkDatabaseError(result.error, "load workspace data");
  return { preview: false, orders: orders.data ?? [], tickets: tickets.data ?? [], documents: documents.data ?? [], conversations: conversations.data ?? [] };
}

export async function getConversation(id: string): Promise<{ conversation: Conversation | null; messages: ChatMessage[] }> {
  const db = database();
  const [conversation, messages] = await Promise.all([
    db.from("conversations").select("*").eq("id", id).maybeSingle(),
    db.from("messages").select("*").eq("conversation_id", id).order("created_at"),
  ]);
  checkDatabaseError(conversation.error, "load this conversation");
  checkDatabaseError(messages.error, "load conversation messages");
  return { conversation: conversation.data, messages: messages.data ?? [] };
}
