import { getWorkspace } from "@/lib/supabase/queries";
import { PageHeading } from "@/components/admin/page-heading";
import { ConversationsList } from "@/components/admin/conversations-list";

export default async function ConversationsPage() {
  const data = await getWorkspace();
  return <><PageHeading eyebrow="The whole conversation" title="Listen a little closer." description="See what customers are asking and how your assistant is helping." /><ConversationsList conversations={data.conversations} /></>;
}
