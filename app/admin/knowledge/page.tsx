import { getWorkspace } from "@/lib/supabase/queries";
import { PageHeading } from "@/components/admin/page-heading";
import { KnowledgeManager } from "@/components/admin/knowledge-manager";
import { requireWorkspacePage } from "@/lib/auth";
export default async function KnowledgePage() {
  const data = await getWorkspace();
  const context = await requireWorkspacePage();
  return (
    <>
      <PageHeading
        eyebrow="Your company’s sources"
        title="Knowledge"
        description="Connect and manage the sources behind your answers."
      />
      <KnowledgeManager documents={data.documents} sources={data.sources} canManage={context.role === "owner"} />
    </>
  );
}
