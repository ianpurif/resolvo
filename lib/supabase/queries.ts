import "server-only";
import { requireWorkspacePage, type TenantContext } from "@/lib/auth";
import { checkDatabaseError } from "./server";
import type { WorkspaceData, Conversation, ChatMessage } from "@/types";
export async function getWorkspace(): Promise<WorkspaceData> {
  const context = await requireWorkspacePage();
  const { db, organization } = context;
  const [documents, sources, tickets, conversations, knowledge, openTickets] =
    await Promise.all([
      db
        .from("documents")
        .select("*", { count: "exact" })
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false })
        .limit(100),
      db
        .from("data_sources")
        .select("*", { count: "exact" })
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false })
        .limit(100),
      db
        .from("tickets")
        .select(
          "id,organization_id,ticket_number,customer_email,issue,status,created_at",
        )
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false })
        .limit(100),
      db
        .from("conversations")
        .select("*", { count: "exact" })
        .eq("organization_id", organization.id)
        .order("updated_at", { ascending: false })
        .limit(100),
      db
        .from("document_chunks")
        .select("id", { count: "exact" })
        .eq("organization_id", organization.id)
        .limit(1),
      db
        .from("tickets")
        .select("id", { count: "exact" })
        .eq("organization_id", organization.id)
        .neq("status", "resolved")
        .limit(1),
    ]);
  for (const result of [
    documents,
    sources,
    tickets,
    conversations,
    knowledge,
    openTickets,
  ])
    checkDatabaseError(result.error, "load workspace data");
  return {
    documents: documents.data ?? [],
    sources: sources.data ?? [],
    tickets: tickets.data ?? [],
    conversations: conversations.data ?? [],
    counts: {
      documents: documents.count ?? 0,
      sources: sources.count ?? 0,
      knowledge: knowledge.count ?? 0,
      conversations: conversations.count ?? 0,
      tickets: openTickets.count ?? 0,
    },
  };
}
export async function getConversation(
  context: TenantContext,
  id: string,
): Promise<{ conversation: Conversation | null; messages: ChatMessage[] }> {
  const [conversation, messages] = await Promise.all([
    context.db
      .from("conversations")
      .select("*")
      .eq("organization_id", context.organization.id)
      .eq("id", id)
      .maybeSingle(),
    context.db
      .from("messages")
      .select("*")
      .eq("organization_id", context.organization.id)
      .eq("conversation_id", id)
      .order("created_at")
      .limit(200),
  ]);
  checkDatabaseError(conversation.error, "load this conversation");
  checkDatabaseError(messages.error, "load conversation messages");
  return { conversation: conversation.data, messages: messages.data ?? [] };
}
