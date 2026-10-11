import { requireWorkspacePage } from "@/lib/auth";
import { configuration } from "@/lib/config";
import { SupportChat } from "@/components/chat/support-chat";
import { checkDatabaseError } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export default async function SupportPage() {
  const context = await requireWorkspacePage();
  const conversations = await context.db
    .from("conversations")
    .select("id,title")
    .eq("organization_id", context.organization.id)
    .order("updated_at", { ascending: false })
    .limit(30);
  checkDatabaseError(conversations.error, "load conversation history");
  return (
    <SupportChat
      key={context.organization.id}
      ready={configuration().ready}
      organization={context.organization}
      email={context.user.email ?? ""}
      initialConversations={conversations.data ?? []}
    />
  );
}
