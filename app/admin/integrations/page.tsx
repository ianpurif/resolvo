import { requireWorkspacePage } from "@/lib/auth";
import { PageHeading } from "@/components/admin/page-heading";
import { IntegrationsManager } from "@/components/admin/integrations-manager";
export default async function IntegrationsPage() {
  await requireWorkspacePage();
  return <><PageHeading eyebrow="Your connected workspace" title="Integrations" description="Bring your tools into the same knowledge base. Choose what to sync and who can use it." /><IntegrationsManager /></>;
}
