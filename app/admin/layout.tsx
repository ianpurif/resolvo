import { requireWorkspacePage } from "@/lib/auth";
import { AdminShell } from "@/components/admin/admin-shell";
import { getPersonalConversations } from "@/lib/supabase/queries";
export const dynamic = "force-dynamic";
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await requireWorkspacePage();
  const history = await getPersonalConversations(context);
  return (
    <AdminShell
      key={context.user.id + JSON.stringify(history.conversations)}
      organization={context.organization}
      email={context.user.email ?? ""}
      initialConversations={history.conversations}
      initialHasMore={history.hasMore}
    >
      {children}
    </AdminShell>
  );
}
