"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, AlertCircle, Ticket as TicketIcon } from "lucide-react";
import { EmptyState } from "./empty-state";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";
import type { Ticket, TicketStatus } from "@/types";

export function TicketsTable({ tickets }: { tickets: Ticket[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const filtered = tickets.filter((ticket) => (status === "all" || ticket.status === status) && `${ticket.ticket_number} ${ticket.order_number ?? ""} ${ticket.customer_email} ${ticket.issue}`.toLowerCase().includes(search.toLowerCase()));
  async function updateStatus(id: string, status: TicketStatus) {
    if (saving) return;
    setSaving(id); setError(null);
    try {
      const response = await fetch(`/api/tickets/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Couldn't update ticket status.");
      router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Couldn't update ticket status."); }
    finally { setSaving(null); }
  }
  return <>
    <div className="mb-5 flex flex-wrap items-center gap-3"><label className="flex h-10 min-w-[200px] flex-1 items-center gap-2 rounded-lg border bg-white px-3 sm:max-w-sm"><Search className="size-3.5 text-muted-foreground" /><input aria-label="Search tickets" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tickets…" className="w-full bg-transparent text-xs outline-none" /></label><select aria-label="Filter ticket status" value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-lg border bg-white px-3 text-xs"><option value="all">All statuses</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option></select><span className="ml-auto text-[10px] text-muted-foreground">{filtered.length} {filtered.length === 1 ? "ticket" : "tickets"}</span></div>
    {error && <div role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"><AlertCircle className="size-4" />{error}</div>}
    <div className="overflow-hidden rounded-xl border bg-white">{filtered.length === 0 ? <EmptyState title={tickets.length ? "No matching tickets." : "You’re all caught up."} description={tickets.length ? "Try a different search or filter." : "When a customer asks your assistant to create a ticket, it lands here. Ready for a human touch."} /> : <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="border-b bg-[#fbfcf9] text-[10px] text-muted-foreground"><tr>{["Ticket", "Order / Customer", "Issue", "Status", "Created"].map((label) => <th key={label} className="px-5 py-3.5 font-medium">{label}</th>)}</tr></thead><tbody className="divide-y">{filtered.map((ticket) => <tr key={ticket.id}><td className="px-5 py-5"><button onClick={() => setSelected(ticket)} className="flex items-center gap-2 whitespace-nowrap font-medium text-primary hover:underline"><TicketIcon className="size-3.5 text-[#96a38e]" />{ticket.ticket_number}</button></td><td className="min-w-[170px] px-5 py-5"><div>{ticket.order_number ?? "General inquiry"}</div><div className="mt-1.5 text-[10px] text-muted-foreground">{ticket.customer_email}</div></td><td className="min-w-[200px] max-w-[300px] px-5 py-5"><button onClick={() => setSelected(ticket)} className="line-clamp-2 text-left text-[11px] leading-6 text-muted-foreground hover:text-foreground">{ticket.issue}</button></td><td className="px-5 py-5"><div className="flex items-center gap-2"><select aria-label={`Status for ${ticket.ticket_number}`} value={ticket.status} disabled={Boolean(saving)} onChange={(event) => void updateStatus(ticket.id, event.target.value as TicketStatus)} className="rounded-lg border bg-muted/30 px-2 py-1.5 text-[10px]"><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option></select>{saving === ticket.id && <Loader2 className="size-3 animate-spin" />}</div></td><td className="px-5 py-5 text-[11px] whitespace-nowrap text-muted-foreground">{formatDate(ticket.created_at)}</td></tr>)}</tbody></table></div>}</div>
    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}><DialogContent><DialogTitle className="text-lg font-semibold">{selected?.ticket_number}</DialogTitle><DialogDescription className="text-xs text-muted-foreground">{selected?.order_number ?? "General inquiry"} · {selected?.customer_email}</DialogDescription><p className="rounded-lg border bg-muted/40 p-4 text-sm leading-7 whitespace-pre-wrap">{selected?.issue}</p><p className="text-[11px] text-muted-foreground">Created {selected && formatDate(selected.created_at, true)} UTC. A ticket records the issue for review; it does not approve a refund or return.</p></DialogContent></Dialog>
  </>;
}
