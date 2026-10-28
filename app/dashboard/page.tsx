import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  MessageSquare,
  Plus,
  Ticket,
} from "lucide-react";
import { getWorkspace } from "@/lib/supabase/queries";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/utils";
export default async function DashboardPage() {
  const data = await getWorkspace();
  return (
    <>
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">Your connected knowledge</p>
          <h1>Your workspace</h1>
        </div>
        <Link
          href="/admin/knowledge"
          className="flex shrink-0 items-center gap-2 rounded-[7px] border border-input bg-white px-4 py-3 text-xs font-semibold transition-colors hover:bg-accent"
        >
          <Plus className="size-3.5" />
          <span className="hidden sm:inline">Add knowledge</span>
          <span className="sm:hidden">Add source</span>
        </Link>
      </div>
      <Link href="/support" className="dashboard-start group">
        <div>
          <span className="eyebrow mb-4">
            <MessageSquare className="size-3.5" />
            RESOLVO ASSISTANT
          </span>
          <h2>Start with a good question.</h2>
          <p className="mt-3 text-xs leading-6 text-muted-foreground">
            Find answers in your company’s own sources.
          </p>
        </div>
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-[#123c4d] text-white transition-transform group-hover:translate-x-1">
          <ArrowRight className="size-5" />
        </span>
      </Link>
      <div className="workspace-metrics">
        {[
          {
            label: "Sources",
            value: data.counts.sources,
            href: "/admin/knowledge",
            icon: BookOpen,
          },
          {
            label: "Your chats",
            value: data.counts.conversations,
            href: "/admin/conversations",
            icon: MessageSquare,
          },
          {
            label: "Open tickets",
            value: data.counts.tickets,
            href: "/admin/tickets",
            icon: Ticket,
          },
        ].map(({ label, value, href, icon: Icon }) => (
          <Link href={href} key={label} className="group">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Icon className="hidden size-3.5 sm:block" />
              {label}
            </div>
            <p className="metric-value group-hover:text-primary">{value}</p>
          </Link>
        ))}
      </div>
      <div className="grid gap-7 lg:grid-cols-2">
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Recent knowledge</h2>
            <Link
              href="/admin/knowledge"
              className="flex items-center gap-1 text-[11px] text-primary"
            >
              View all
              <ArrowUpRight className="size-3" />
            </Link>
          </div>
          <div className="surface">
            {data.documents.length ? (
              data.documents.slice(0, 5).map((doc) => (
                <Link href="/admin/knowledge" key={doc.id} className="list-row">
                  <BookOpen className="size-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{doc.name}</p>
                    <p className="mt-1.5 text-[10px] text-muted-foreground">
                      {formatDate(doc.updated_at)} · {doc.chunk_count} chunks
                    </p>
                  </div>
                  <StatusBadge status={doc.status} />
                </Link>
              ))
            ) : (
              <div className="px-6 py-9">
                <BookOpen className="mb-4 size-6 text-[#7399aa]" />
                <p className="text-sm font-medium">Connect your first source</p>
                <p className="mt-2 text-xs leading-6 text-muted-foreground">
                  A document, a public web page, or something your team knows.
                </p>
                <Link
                  href="/admin/knowledge"
                  className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-primary"
                >
                  Add knowledge
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>
            )}
          </div>
        </section>
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Pick up a conversation</h2>
            <Link
              href="/admin/conversations"
              className="flex items-center gap-1 text-[11px] text-primary"
            >
              View all
              <ArrowUpRight className="size-3" />
            </Link>
          </div>
          <div className="surface">
            {data.conversations.length ? (
              data.conversations.slice(0, 5).map((conv) => (
                <Link
                  href={"/support?conversation=" + conv.id}
                  key={conv.id}
                  className="list-row"
                >
                  <MessageSquare className="size-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{conv.title}</p>
                    <p className="mt-1.5 text-[10px] text-muted-foreground">
                      {formatDate(conv.updated_at, true)} UTC
                    </p>
                  </div>
                  <ArrowUpRight className="size-3.5 text-muted-foreground" />
                </Link>
              ))
            ) : (
              <div className="px-6 py-9">
                <MessageSquare className="mb-4 size-6 text-[#7399aa]" />
                <p className="text-sm font-medium">A fresh start</p>
                <p className="mt-2 text-xs leading-6 text-muted-foreground">
                  Your personal conversations will be saved automatically.
                </p>
                <Link
                  href="/support"
                  className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-primary"
                >
                  Start a chat
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
