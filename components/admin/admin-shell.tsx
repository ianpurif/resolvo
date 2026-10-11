"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  BookOpen,
  Ticket,
  MessageSquare,
  ArrowUpRight,
  ChevronRight,
  Building2,
  Menu,
  LogOut,
} from "lucide-react";
import { Brand } from "@/components/brand";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Organization } from "@/types";
const navigation = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/knowledge", label: "Knowledge & sources", icon: BookOpen },
  { href: "/admin/tickets", label: "Tickets", icon: Ticket },
  { href: "/admin/conversations", label: "Conversations", icon: MessageSquare },
];
export function AdminShell({
  children,
  organization,
  email,
}: {
  children: React.ReactNode;
  organization: Organization;
  email: string;
}) {
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  const current =
    navigation.find((item) => item.href === path)?.label ?? "Workspace";
  const sidebar = (
    <>
      <Link href="/dashboard" className="mb-9 inline-flex w-fit">
        <Brand />
      </Link>
      <div className="mb-8 flex items-center gap-3 rounded-xl border bg-white/70 p-3">
        <Building2 className="size-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold">
            {organization.name}
          </div>
          <div className="mt-1 truncate text-[10px] text-muted-foreground">
            {organization.industry}
          </div>
        </div>
      </div>
      <nav aria-label="Workspace navigation" className="space-y-1">
        {navigation.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={() => setMenu(false)}
            aria-current={path === href ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-3 text-xs font-medium",
              path === href
                ? "bg-[#e8f0e7] text-primary"
                : "text-muted-foreground hover:bg-white",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto pt-8">
        <Link
          href="/support"
          className="mb-6 flex items-center justify-between rounded-xl border bg-white p-4 text-xs text-primary"
        >
          Open knowledge assistant
          <ArrowUpRight className="size-4" />
        </Link>
        <div className="border-t pt-5">
          <p className="truncate text-xs text-muted-foreground">{email}</p>
          <form action="/auth/signout" method="post" className="mt-4">
            <button className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary">
              <LogOut className="size-3.5" />
              Sign out
            </button>
          </form>
        </div>
      </div>
    </>
  );
  return (
    <div className="min-h-dvh bg-[#fafbf8]">
      <aside className="fixed inset-y-0 left-0 hidden w-[250px] flex-col border-r bg-[#f4f6f1] px-5 py-7 lg:flex">
        {sidebar}
      </aside>
      <Dialog open={menu} onOpenChange={setMenu}>
        <DialogContent className="top-0 left-0 flex h-dvh max-h-none w-[280px] translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-[#f4f6f1] px-5 py-7">
          <DialogTitle className="sr-only">Workspace navigation</DialogTitle>
          <DialogDescription className="sr-only">
            Navigate your company workspace.
          </DialogDescription>
          {sidebar}
        </DialogContent>
      </Dialog>
      <div className="lg:ml-[250px]">
        <header className="flex h-[74px] items-center gap-3 border-b bg-white px-5 md:px-9">
          <button
            aria-label="Open navigation"
            onClick={() => setMenu(true)}
            className="lg:hidden"
          >
            <Menu className="size-5" />
          </button>
          <span className="hidden text-xs text-muted-foreground sm:block">
            {organization.name}
          </span>
          <ChevronRight className="size-3 text-muted-foreground" />
          <span className="text-xs font-medium">{current}</span>
          <span className="ml-auto rounded-full border px-3 py-1 text-[10px] text-primary">
            Private workspace
          </span>
        </header>
        <main className="mx-auto max-w-[1320px] px-5 py-7 md:px-9 md:py-9">
          {children}
        </main>
      </div>
    </div>
  );
}
