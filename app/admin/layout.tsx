import type { Metadata } from "next";
import { configuration } from "@/lib/config";
import { AdminShell } from "@/components/admin/admin-shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin workspace" };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const config = configuration();
  return <AdminShell missing={config.missing} databaseReady={config.databaseReady}>{children}</AdminShell>;
}
