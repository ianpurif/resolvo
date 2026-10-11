import Link from "next/link";
import {
  BookOpen,
  Plug,
  Ticket,
  MessageSquare,
  ArrowUpRight,
  Activity,
} from "lucide-react";
import { getWorkspace } from "@/lib/supabase/queries";
import { PageHeading } from "@/components/admin/page-heading";
import { EmptyState } from "@/components/admin/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/utils";
export default async function DashboardPage() {
  const data = await getWorkspace();
  const metrics = [
    { label: "Connected sources", value: data.counts.sources, icon: Plug },
    { label: "Documents", value: data.counts.documents, icon: BookOpen },
    { label: "Knowledge chunks", value: data.counts.knowledge, icon: BookOpen },
    { label: "Open tickets", value: data.counts.tickets, icon: Ticket },
    {
      label: "Conversations",
      value: data.counts.conversations,
      icon: MessageSquare,
    },
  ];
  const activity = [
    ...data.documents.map((doc) => ({
      id: doc.id,
      title: doc.name,
      date: doc.updated_at,
      note:
        doc.status === "ready"
          ? "Knowledge indexed"
          : doc.status === "failed"
            ? "Indexing failed"
            : "Indexing in progress",
    })),
    ...data.tickets.map((ticket) => ({
      id: ticket.id,
      title: ticket.ticket_number,
      date: ticket.created_at,
      note: "Ticket created",
    })),
    ...data.conversations.map((conv) => ({
      id: conv.id,
      title: conv.title,
      date: conv.updated_at,
      note: "Conversation updated",
    })),
  ]
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, 8);
  return (
    <>
      <PageHeading
        eyebrow="Your company workspace"
        title="Knowledge your team can trust."
        description="Connect your sources and keep answers grounded in your company’s own data."
      />
      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl border bg-white p-5">
            <div className="mb-5 flex justify-between text-xs text-muted-foreground">
              {label}
              <Icon className="size-4" />
            </div>
            <p className="text-3xl font-medium">{value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-xl border bg-white">
          <div className="flex justify-between border-b p-5 text-xs font-semibold">
            Connected knowledge
            <Link href="/admin/knowledge" className="flex gap-1 text-primary">
              Manage
              <ArrowUpRight className="size-3" />
            </Link>
          </div>
          {!data.sources.length ? (
            <EmptyState
              title="Start with your first source."
              description="Upload documents, import a public web page, or write knowledge for your company."
            />
          ) : (
            <div className="divide-y">
              {data.sources.slice(0, 6).map((source) => (
                <div
                  key={source.id}
                  className="flex items-center justify-between gap-3 p-5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">
                      {source.name}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {source.kind} ·{" "}
                      {source.last_indexed_at
                        ? formatDate(source.last_indexed_at, true) + " UTC"
                        : "Awaiting successful indexing"}
                    </p>
                  </div>
                  {data.documents.find(
                    (doc) => doc.data_source_id === source.id,
                  ) && (
                    <StatusBadge
                      status={
                        data.documents.find(
                          (doc) => doc.data_source_id === source.id,
                        )!.status
                      }
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="rounded-xl border bg-white">
          <h2 className="flex items-center gap-2 border-b p-5 text-xs font-semibold">
            <Activity className="size-4" />
            Recent activity
          </h2>
          {!activity.length ? (
            <EmptyState
              title="A clean workspace."
              description="Your company’s indexing, tickets and conversations will appear here."
            />
          ) : (
            <div className="divide-y">
              {activity.map((item) => (
                <div key={item.id} className="p-5">
                  <p className="truncate text-xs font-medium">{item.title}</p>
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    {item.note} · {formatDate(item.date, true)} UTC
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
