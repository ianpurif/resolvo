import { getWorkspace } from "@/lib/supabase/queries";
import { PageHeading } from "@/components/admin/page-heading";
import { KnowledgeManager } from "@/components/admin/knowledge-manager";
export default async function KnowledgePage() {
  const data = await getWorkspace();
  return (
    <>
      <PageHeading
        eyebrow="Company knowledge"
        title="Your sources. Your answers."
        description="Connect real company data, update it, and keep the assistant grounded."
      />
      <KnowledgeManager documents={data.documents} sources={data.sources} />
    </>
  );
}
