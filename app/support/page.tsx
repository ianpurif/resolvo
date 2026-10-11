import { requireWorkspacePage } from "@/lib/auth";
import { configuration } from "@/lib/config";
import { SupportChat } from "@/components/chat/support-chat";
import { getPersonalConversations } from "@/lib/supabase/queries";
export const dynamic = "force-dynamic";
export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ conversation?: string }>;
}) {
  const context = await requireWorkspacePage();
  const history = await getPersonalConversations(context);
  const { conversation } = await searchParams;
  return (
    <SupportChat
      key={context.user.id + ":" + context.organization.id}
      ready={configuration().ready}
      organization={context.organization}
      email={context.user.email ?? ""}
      initialConversations={history.conversations}
      initialHasMore={history.hasMore}
      initialConversationId={conversation}
    />
  );
}
