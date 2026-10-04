"use client";

import { useState } from "react";
import { Search, MessageSquare, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { EmptyState } from "./empty-state";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { MessageBubble } from "@/components/chat/message-bubble";
import { formatDate } from "@/lib/utils";
import type { Conversation, ChatMessage } from "@/types";

export function ConversationsList({ conversations }: { conversations: Conversation[] }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filtered = conversations.filter((item) => `${item.title} ${item.customer_identifier}`.toLowerCase().includes(search.toLowerCase()));
  async function openConversation(conversation: Conversation) {
    setSelected(conversation); setMessages([]); setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/conversations/${conversation.id}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Couldn't load this conversation.");
      setMessages(data.messages);
    } catch (error) { setError(error instanceof Error ? error.message : "Couldn't load this conversation."); }
    finally { setLoading(false); }
  }
  return <>
    <div className="mb-5 flex items-center gap-3"><label className="flex h-10 flex-1 items-center gap-2 rounded-lg border bg-white px-3 sm:max-w-sm"><Search className="size-3.5 text-muted-foreground" /><input aria-label="Search conversations" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations…" className="w-full bg-transparent text-xs outline-none" /></label><span className="ml-auto text-[10px] text-muted-foreground">{filtered.length} {filtered.length === 1 ? "conversation" : "conversations"}</span></div>
    <div className="overflow-hidden rounded-xl border bg-white">{filtered.length === 0 ? <EmptyState title={conversations.length ? "No matching conversations." : "Make room for good conversations."} description={conversations.length ? "Try another search." : "Customer questions and your assistant’s grounded answers will be saved here. Open the support chat to start one."} /> : <div className="divide-y">{filtered.map((conversation) => <button key={conversation.id} onClick={() => void openConversation(conversation)} className="flex w-full items-center gap-4 px-5 py-5 text-left hover:bg-muted/40"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-[#f5f8f0]"><MessageSquare className="size-4 text-[#7d9273]" /></span><div className="min-w-0 flex-1"><div className="truncate text-xs font-medium">{conversation.title}</div><div className="mt-2 text-[10px] text-muted-foreground">{conversation.customer_identifier} · {formatDate(conversation.updated_at, true)} UTC</div></div><ArrowRight className="size-4 text-muted-foreground" /></button>)}</div>}</div>
    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}><DialogContent className="max-w-2xl"><DialogTitle className="pr-5 text-base font-semibold">{selected?.title}</DialogTitle><DialogDescription className="text-xs text-muted-foreground">Saved conversation · {selected?.customer_identifier}</DialogDescription>{loading ? <div role="status" className="flex items-center gap-2 py-10 text-xs text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading messages…</div> : error ? <div role="alert" className="flex items-center gap-2 text-sm text-red-600"><AlertCircle className="size-4" />{error}</div> : <div className="space-y-6 border-t pt-5">{messages.map((message) => <MessageBubble key={message.id} message={message} />)}{messages.length === 0 && <p className="text-xs text-muted-foreground">No messages have been saved yet.</p>}</div>}</DialogContent></Dialog>
  </>;
}
