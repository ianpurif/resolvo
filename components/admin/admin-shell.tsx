"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LayoutDashboard, BookOpen, Package, Ticket, MessageSquare, ArrowUpRight, ChevronRight, Leaf, Settings2, Menu, CheckCircle2, Circle, Terminal } from "lucide-react";
import { Brand } from "@/components/brand";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/knowledge", label: "Knowledge base", icon: BookOpen },
  { href: "/admin/orders", label: "Orders", icon: Package },
  { href: "/admin/tickets", label: "Support tickets", icon: Ticket },
  { href: "/admin/conversations", label: "Conversations", icon: MessageSquare },
];

export function AdminShell({ children, missing, databaseReady }: { children: React.ReactNode; missing: string[]; databaseReady: boolean }) {
  const path = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const current = navigation.find((item) => item.href === path)?.label ?? "Workspace";
  const sidebar = <>
    <Link href="/admin" className="mb-9 inline-flex w-fit" aria-label="Resolvo admin home"><Brand /></Link>
    <div className="mb-9 flex items-center gap-3 rounded-xl border bg-white/70 p-3"><span className="flex size-9 items-center justify-center rounded-lg bg-[#eeeae1]"><Leaf className="size-5 text-[#737b58]" /></span><div><div className="text-xs font-semibold">Northstar Supply</div><div className="mt-1 text-[10px] text-muted-foreground">Demo business workspace</div></div></div>
    <span className="mb-3 px-3 text-[10px] font-semibold tracking-[.12em] text-muted-foreground uppercase">Workspace</span>
    <nav aria-label="Admin navigation" className="space-y-1">{navigation.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMenuOpen(false)} aria-current={path === href ? "page" : undefined} className={cn("flex items-center gap-3 rounded-lg px-3 py-3 text-xs font-medium transition-colors", path === href ? "bg-[#e8f0e7] text-primary" : "text-muted-foreground hover:bg-white hover:text-foreground")}><Icon className="size-4" strokeWidth={1.7} />{label}{path === href && <span className="ml-auto size-1.5 rounded-full bg-primary" />}</Link>)}</nav>
    <div className="mt-auto pt-9"><div className="mb-5 rounded-xl border bg-white/70 p-4"><div className="mb-2 text-xs font-medium">See the customer experience</div><p className="mb-3 text-[11px] leading-5 text-muted-foreground">Your knowledge, brought to life in one helpful conversation.</p><Link href="/support" className="flex items-center justify-between text-[11px] font-medium text-primary">Open support chat<ArrowUpRight className="size-3.5" /></Link></div><button onClick={() => setSetupOpen(true)} className="mb-5 flex w-full items-center gap-3 px-3 text-xs text-muted-foreground hover:text-primary"><Settings2 className="size-4" />Workspace setup</button><div className="flex items-center gap-3 border-t pt-5"><span className="flex size-8 items-center justify-center rounded-full bg-[#dfe7d8] text-[10px] font-semibold">NS</span><div><div className="text-xs font-medium">Northstar team</div><div className="mt-1 text-[10px] text-muted-foreground">Admin workspace</div></div></div></div>
  </>;
  return <div className="min-h-dvh bg-[#fafbf8]">
    <aside className="fixed inset-y-0 left-0 hidden w-[250px] flex-col border-r bg-[#f4f6f1] px-5 py-7 lg:flex">{sidebar}</aside>
    <Dialog open={menuOpen} onOpenChange={setMenuOpen}><DialogContent className="top-0 left-0 flex h-dvh max-h-none w-[280px] max-w-[85vw] translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-y-0 border-l-0 bg-[#f4f6f1] px-5 py-7"><DialogTitle className="sr-only">Admin navigation</DialogTitle><DialogDescription className="sr-only">Navigate the Northstar support workspace.</DialogDescription>{sidebar}</DialogContent></Dialog>
    <div className="lg:ml-[250px]"><header className="flex h-[74px] items-center justify-between gap-3 border-b bg-white px-5 md:px-9"><div className="flex items-center gap-3"><button aria-label="Open navigation" onClick={() => setMenuOpen(true)} className="p-1.5 lg:hidden"><Menu className="size-5" /></button><span className="hidden text-xs text-muted-foreground sm:block">Workspace</span><ChevronRight className="hidden size-3 text-muted-foreground sm:block" /><span className="text-xs font-medium">{current}</span></div><button onClick={() => setSetupOpen(true)} className="flex items-center gap-2 rounded-full border bg-[#fafbf8] px-3 py-1.5 text-[10px] text-muted-foreground"><span className={cn("size-1.5 rounded-full", missing.length ? "bg-amber-500" : "bg-primary")} />{missing.length ? "Setup required" : "Services configured"}</button></header>
      <main className="mx-auto max-w-[1320px] px-5 py-7 md:px-9 md:py-9">
        {!databaseReady && <div className="mb-7 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#e6e4d5] bg-[#f6f4e9] px-4 py-3"><p className="text-[11px] leading-5 text-[#827858]"><span className="font-semibold">Preview workspace.</span> Orders and knowledge files are sample data. Connect Supabase to upload, save tickets, and keep conversations.</p><button onClick={() => setSetupOpen(true)} className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-[#827858]">Set up workspace<ArrowUpRight className="size-3" /></button></div>}
        {children}
      </main>
    </div>
    <Dialog open={setupOpen} onOpenChange={setSetupOpen}><DialogContent><DialogTitle className="text-lg font-semibold">Connect your workspace</DialogTitle><DialogDescription className="text-sm leading-6 text-muted-foreground">Add these server-only values to .env.local, run the database migration and seed, then restart the app. Configured means a value is present; it does not verify connectivity.</DialogDescription><div className="space-y-3">{["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "DEEPSEEK_API_KEY", "VOYAGE_API_KEY"].map((name) => <div key={name} className="flex items-center gap-2.5 rounded-lg border p-3">{missing.includes(name) ? <Circle className="size-4 text-amber-600" /> : <CheckCircle2 className="size-4 text-primary" />}<code className="min-w-0 flex-1 text-[11px] break-all">{name}</code><span className="text-[10px] text-muted-foreground">{missing.includes(name) ? "Missing" : "Configured"}</span></div>)}</div><div className="rounded-lg bg-muted p-4"><div className="mb-2 flex items-center gap-2 text-xs font-medium"><Terminal className="size-3.5" />Index sample knowledge</div><code className="text-xs">npm run ingest:samples</code><p className="mt-2 text-[11px] leading-5 text-muted-foreground">See README.md for SQL, credentials, demo scenarios, and deployment instructions.</p></div></DialogContent></Dialog>
  </div>;
}
