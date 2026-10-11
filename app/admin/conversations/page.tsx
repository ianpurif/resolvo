import { getWorkspace } from "@/lib/supabase/queries";
import { ConversationsList } from "@/components/admin/conversations-list";
import { PageHeading } from "@/components/admin/page-heading";
export default async function ConversationsPage() {
  const data = await getWorkspace();
  return (
    <>
      <PageHeading
        eyebrow="Workspace history"
        title="Conversations"
        description="Questions and cited answers from your company’s assistant."
      />
      <ConversationsList conversations={data.conversations} />
    </>
  );
}
