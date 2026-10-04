import { getWorkspace } from "@/lib/supabase/queries";
import { PageHeading } from "@/components/admin/page-heading";
import { KnowledgeManager } from "@/components/admin/knowledge-manager";

export default async function KnowledgePage() {
  const data = await getWorkspace();
  return <><PageHeading eyebrow="The foundation of a helpful answer" title="Your knowledge base." description="Company policies and helpful information. One trusted source for your assistant." /><KnowledgeManager documents={data.documents} preview={data.preview} /></>;
}
