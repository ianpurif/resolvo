import { requireWorkspacePage } from "@/lib/auth";
import { AdminShell } from "@/components/admin/admin-shell";
export const dynamic = "force-dynamic";
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await requireWorkspacePage();
  return (
    <AdminShell
      organization={context.organization}
      email={context.user.email ?? ""}
    >
      {children}
    </AdminShell>
  );
}
