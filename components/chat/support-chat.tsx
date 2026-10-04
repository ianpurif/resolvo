"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, ArrowUpRight, Plus, MessageSquare, Package, RotateCcw, ShieldCheck, LifeBuoy, ChevronRight, Leaf, Menu, Loader2, CornerDownLeft, BookOpen, AlertCircle, Check, Headphones } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { MessageBubble } from "./message-bubble";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/types";

const questions = [
  { icon: RotateCcw, title: "Returns, made simple", description: "What is your return policy?", question: "What is your return policy?" },
  { icon: Package, title: "Find your order", description: "Where is ORD-1002?", question: "Where is ORD-1002?" },
  { icon: ShieldCheck, title: "Check return eligibility", description: "Can I return ORD-1025?", question: "Can I return ORD-1025?" },
  { icon: LifeBuoy, title: "Something isn't right", description: "My order arrived damaged.", question: "My order arrived damaged." },
];
interface SavedConversation { id: string; title: string }
interface PendingTurn { id: string; text: string; userId: string }
const STORAGE_KEY = "resolvo-conversations";

export function SupportChat({ ready }: { ready: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<SavedConversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingTurn | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    Promise.resolve().then(() => {
      try {
        const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
        if (Array.isArray(saved)) setConversations(saved.filter((item): item is SavedConversation => typeof item?.id === "string" && typeof item?.title === "string").slice(0, 12));
      } catch { setError("This browser couldn't load your conversation history. You can still start a new conversation."); }
    });
  }, []);

  useEffect(() => { if (messages.length || busy || error) bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, busy, error]);
  useEffect(() => {
    if (textarea.current) { textarea.current.style.height = "auto"; textarea.current.style.height = `${Math.min(textarea.current.scrollHeight, 140)}px`; }
  }, [input]);

  function newConversation() {
    if (busyRef.current) return;
    setMessages([]); setConversationId(null); setError(null); setPending(null); setInput(""); setMobileMenu(false);
    textarea.current?.focus();
  }

  async function openConversation(id: string) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null); setMobileMenu(false);
    try {
      const response = await fetch(`/api/conversations/${id}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMessages(data.messages); setConversationId(id); setPending(null);
    } catch (error) { setError(error instanceof Error ? error.message : "Couldn't load this conversation."); }
    finally { busyRef.current = false; setBusy(false); }
  }

  async function send(text: string, retry?: PendingTurn) {
    if (!text.trim() || busyRef.current) return;
    const turn = retry ?? { id: crypto.randomUUID(), text: text.trim(), userId: crypto.randomUUID() };
    busyRef.current = true; setBusy(true); setError(null); setInput(""); setPending(turn);
    if (!retry) setMessages((previous) => [...previous, { id: turn.userId, conversation_id: conversationId ?? "", role: "user", content: turn.text, sources: [], created_at: new Date().toISOString() }]);
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: turn.text, conversationId, requestId: turn.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Couldn't send your message.");
      setMessages((previous) => [...previous, data.message]);
      setConversationId(data.conversationId); setPending(null);
      if (!conversationId) {
        const saved = [{ id: data.conversationId, title: turn.text.slice(0, 55) }, ...conversations.filter((item) => item.id !== data.conversationId)].slice(0, 12);
        setConversations(saved);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); }
        catch { setError("Your conversation is saved, but this browser couldn't keep its history link."); }
      }
    } catch (error) { setError(error instanceof Error ? error.message : "Couldn't connect. Please try again."); }
    finally { busyRef.current = false; setBusy(false); textarea.current?.focus(); }
  }

  function submit(event: FormEvent) { event.preventDefault(); if (!pending || !error) void send(input); }
  const currentTitle = conversations.find((item) => item.id === conversationId)?.title ?? "New conversation";

  const sidebar = <>
    <Link href="/support" className="mb-9 inline-flex w-fit" aria-label="Resolvo support home"><Brand /></Link>
    <div className="mb-7 flex items-center gap-3 rounded-xl border bg-white/70 p-3"><span className="flex size-9 items-center justify-center rounded-lg bg-[#eeeae1]"><Leaf className="size-5 text-[#737b58]" /></span><div><div className="text-xs font-semibold">Northstar Supply</div><div className="mt-1 text-[10px] text-muted-foreground">Customer help center</div></div></div>
    <Button onClick={newConversation} disabled={busy} className="mb-8 w-full justify-start bg-white text-foreground shadow-xs hover:bg-white/80" variant="outline"><Plus />New conversation</Button>
    <div className="mb-3 px-2 text-[10px] font-semibold tracking-[.12em] text-muted-foreground uppercase">Your conversations</div>
    <div className="flex-1 space-y-1 overflow-auto">
      {conversations.length === 0 ? <p className="px-2 text-xs leading-6 text-muted-foreground">A fresh start. Your conversations will appear here.</p> : conversations.map((item) => <button key={item.id} disabled={busy} onClick={() => void openConversation(item.id)} className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-3 text-left text-xs hover:bg-white disabled:opacity-50", item.id === conversationId ? "bg-white text-primary shadow-xs" : "text-muted-foreground")}><MessageSquare className="size-3.5 shrink-0" /><span className="truncate">{item.title}</span></button>)}
    </div>
    <div className="mb-5 rounded-xl border border-[#dce5da] bg-[#edf2e8] p-4"><div className="mb-2 flex items-center gap-2 text-xs font-medium"><Headphones className="size-4 text-primary" />A person, when you need one</div><p className="text-[11px] leading-5 text-[#7b8575]">Ask us to create a ticket and our support team will take it from there.</p></div>
    <Link href="/admin" className="mb-5 flex items-center justify-between px-2 text-xs text-muted-foreground hover:text-primary">Open admin workspace<ArrowUpRight className="size-3.5" /></Link>
    <div className="flex items-center gap-2.5 border-t pt-5"><span className="flex size-8 items-center justify-center rounded-full border bg-white text-xs font-medium">G</span><div><div className="text-xs font-medium">Guest customer</div><div className="mt-0.5 text-[10px] text-muted-foreground">Here to help, always</div></div></div>
  </>;

  return <div className="flex h-dvh min-h-[500px] overflow-hidden bg-white">
    <aside className="hidden w-[250px] shrink-0 flex-col border-r bg-[#f6f7f3] px-5 py-7 lg:flex">{sidebar}</aside>
    <Dialog open={mobileMenu} onOpenChange={setMobileMenu}><DialogContent className="top-0 left-0 flex h-dvh max-h-none w-[280px] max-w-[85vw] translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-y-0 border-l-0 bg-[#f6f7f3] px-5 py-7"><DialogTitle className="sr-only">Support navigation</DialogTitle><DialogDescription className="sr-only">Start a conversation or open your saved conversations.</DialogDescription>{sidebar}</DialogContent></Dialog>
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-[74px] shrink-0 items-center justify-between gap-4 border-b px-5 md:px-8">
        <div className="flex min-w-0 items-center gap-3"><button aria-label="Open navigation" onClick={() => setMobileMenu(true)} className="rounded p-1.5 lg:hidden"><Menu className="size-5" /></button><span className="hidden text-xs text-muted-foreground sm:inline">Support</span><ChevronRight className="hidden size-3 text-muted-foreground sm:block" /><span className="truncate text-xs font-medium">{currentTitle}</span></div>
        <div className="flex shrink-0 items-center gap-2 rounded-full border bg-[#fafbf8] px-3 py-1.5 text-[10px] text-muted-foreground"><span className={cn("size-1.5 rounded-full", ready ? "bg-primary" : "bg-amber-500")} />{ready ? "Ready to help" : "Preview workspace"}</div>
      </header>
      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-5 md:px-10">
            {messages.length === 0 ? <div className="mx-auto flex min-h-full max-w-[620px] flex-col justify-center py-8 md:py-12">
              <div className="mb-7 flex items-center gap-2"><span className="h-px w-6 bg-primary/40" /><span className="text-[10px] font-semibold tracking-[.15em] text-primary uppercase">Your Northstar support assistant</span></div>
              <div className="mb-6 flex size-16 items-center justify-center rounded-[20px] border border-[#dce8dc] bg-[#f0f6ee] shadow-[0_4px_15px_#ecf1e7]"><MessageSquare className="size-7 text-primary" strokeWidth={1.5} /><span className="relative -top-4 -right-1 flex size-4 items-center justify-center rounded-full border border-white bg-primary"><Check className="size-2.5 text-white" /></span></div>
              <h1 className="text-[34px] leading-[1.2] font-medium tracking-[-.055em] md:text-[43px]">A little help,<br /><span className="text-[#899286]">right when you need it.</span></h1>
              <p className="mt-5 max-w-[410px] text-[13px] leading-6 text-muted-foreground">From order updates to returns and everything in between. Let’s get you the answer you need.</p>
              <div className="mt-9 grid grid-cols-1 gap-3 sm:grid-cols-2">{questions.map(({ icon: Icon, title, description, question }) => <button key={title} disabled={busy} onClick={() => { setInput(question); textarea.current?.focus(); }} className="group flex items-start gap-3.5 rounded-xl border bg-white p-4 text-left transition-colors hover:border-[#a8c5b3] hover:bg-[#fbfdf9]"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#f4f6f0]"><Icon className="size-4 text-[#7a8975]" strokeWidth={1.5} /></span><span className="min-w-0 flex-1"><span className="block text-xs font-medium">{title}</span><span className="mt-1.5 block text-[11px] text-muted-foreground">{description}</span></span><ArrowUpRight className="mt-1 size-3.5 text-[#b5bdb0] group-hover:text-primary" /></button>)}</div>
              <div className="mt-7 flex items-center gap-2 text-[10px] text-muted-foreground"><BookOpen className="size-3.5" />Answers grounded in Northstar’s knowledge base.</div>
            </div> : <div className="mx-auto max-w-[680px] space-y-7 py-8">{messages.map((message) => <MessageBubble key={message.id} message={message} />)}</div>}
            {busy && <div role="status" className="mx-auto mb-6 flex max-w-[680px] items-center gap-3 text-xs text-muted-foreground"><Loader2 className="size-4 animate-spin text-primary" />{messages.length ? "Finding the right answer…" : "Opening conversation…"}</div>}
            {error && <div role="alert" className="mx-auto mb-6 flex max-w-[680px] items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4"><AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-700" /><div className="flex-1 text-xs leading-6 text-amber-900">{error}{pending && <button className="mt-2 flex items-center gap-1.5 font-semibold underline underline-offset-4" disabled={busy} onClick={() => void send(pending.text, pending)}><RotateCcw className="size-3" />Retry message</button>}</div></div>}
            <div ref={bottom} />
          </div>
          <div className="shrink-0 px-5 pt-3 pb-4 md:px-10 md:pb-5"><div className="mx-auto max-w-[680px]">
            <form onSubmit={submit} className="rounded-2xl border border-[#dfe5da] bg-white p-3 shadow-[0_3px_20px_#24342008] focus-within:border-[#a8c5b3]">
              <label htmlFor="message" className="sr-only">Your message</label><textarea ref={textarea} id="message" rows={1} maxLength={4000} value={input} disabled={busy || Boolean(pending && error)} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!pending || !error) void send(input); } }} placeholder="Ask a question, or tell us what’s on your mind…" className="max-h-[140px] min-h-10 w-full border-0 bg-transparent px-2 py-2 text-[13px] leading-6 placeholder:text-[#a2a99e] focus:outline-none disabled:opacity-50" />
              <div className="mt-1 flex items-center justify-between gap-2"><span className="flex items-center gap-1.5 px-2 text-[10px] text-muted-foreground"><ShieldCheck className="size-3.5" />{ready ? "Powered by your company’s knowledge" : "Connect your workspace to start chatting"}</span><Button size="icon" type="submit" aria-label="Send message" disabled={!input.trim() || busy || Boolean(pending && error)} className="size-8 rounded-lg"><ArrowUp className="size-4" /></Button></div>
            </form>
            <div className="mt-3 flex justify-between gap-3 px-1 text-[9px] text-[#969d92]"><span>AI can make mistakes. We’re here to help you check.</span><span className="hidden items-center gap-1 sm:flex"><CornerDownLeft className="size-2.5" />Enter to send · Shift + Enter for a new line</span></div>
          </div></div>
        </main>
        <aside className="hidden w-[265px] shrink-0 flex-col border-l bg-[#fcfcfa] px-6 py-8 xl:flex">
          <div className="mb-7 text-[10px] font-semibold tracking-[.12em] text-muted-foreground uppercase">A good place to start</div>
          <div className="mb-7 flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-[#eeeae1]"><Leaf className="size-5 text-[#737b58]" /></span><div><div className="text-xs font-semibold">Northstar Supply</div><div className="mt-1 text-[10px] text-muted-foreground">Everyday essentials, thoughtfully made.</div></div></div>
          <p className="text-xs leading-6 text-muted-foreground">One conversation. All the support you need.</p>
          <div className="mt-7 space-y-6">{[{ icon: BookOpen, title: "Clear answers", text: "Policies and product questions, straight from our knowledge base." }, { icon: Package, title: "Order updates", text: "Have your order number handy. We’ll take a look." }, { icon: Headphones, title: "A helping hand", text: "Need more support? Ask us to open a ticket for the team." }].map(({ icon: Icon, title, text }) => <div key={title} className="flex items-start gap-3"><Icon className="mt-0.5 size-4 shrink-0 text-[#819177]" strokeWidth={1.5} /><div><div className="text-xs font-medium">{title}</div><p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">{text}</p></div></div>)}</div>
          <div className="mt-auto pt-10"><div className="border-t pt-5 text-[10px] leading-5 text-muted-foreground">Thoughtful support.<br />Powered by <span className="font-medium text-foreground">resolvo.</span></div></div>
        </aside>
      </div>
    </div>
  </div>;
}
