"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowUp,
  Plus,
  MessageSquare,
  Menu,
  Loader2,
  BookOpen,
  LogOut,
  ArrowUpRight,
  Building2,
  RotateCcw,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { MessageBubble } from "./message-bubble";
import { cn } from "@/lib/utils";
import type { ChatMessage, Organization } from "@/types";
type Saved = { id: string; title: string };
type Pending = { id: string; text: string; userId: string };
type StreamEvent = {
  type: "status" | "draft" | "done" | "error";
  text?: string;
  error?: string;
  conversationId?: string;
  message?: ChatMessage;
};
export function SupportChat({
  ready,
  organization,
  email,
  initialConversations,
}: {
  ready: boolean;
  organization: Organization;
  email: string;
  initialConversations: Saved[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState(initialConversations);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [menu, setMenu] = useState(false);
  const [status, setStatus] = useState("");
  const busyRef = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, draft, busy]);
  function startNew() {
    if (busyRef.current) return;
    setMessages([]);
    setConversationId(null);
    setPending(null);
    setError("");
    setDraft("");
    setInput("");
    setMenu(false);
  }
  async function open(id: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setMenu(false);
    try {
      const response = await fetch("/api/conversations/" + id, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMessages(data.messages);
      setConversationId(id);
      setPending(null);
      setDraft("");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not load this conversation.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function send(text: string, retry?: Pending) {
    if (!text.trim() || busyRef.current) return;
    const turn = retry ?? {
      id: crypto.randomUUID(),
      text: text.trim(),
      userId: crypto.randomUUID(),
    };
    busyRef.current = true;
    setBusy(true);
    setError("");
    setDraft("");
    setInput("");
    setPending(turn);
    setStatus("Connecting…");
    if (!retry)
      setMessages((previous) => [
        ...previous,
        {
          id: turn.userId,
          organization_id: organization.id,
          conversation_id: conversationId ?? "",
          role: "user",
          content: turn.text,
          sources: [],
          created_at: new Date().toISOString(),
        },
      ]);
    abort.current = new AbortController();
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: turn.text,
          conversationId,
          requestId: turn.id,
        }),
        signal: abort.current.signal,
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "The message could not be sent.");
      }
      if (!response.body)
        throw new Error("Streaming is unavailable in this browser.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let complete = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary: number;
        while ((boundary = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          if (!frame.startsWith("data: ")) continue;
          const event = JSON.parse(frame.slice(6)) as StreamEvent;
          if (event.type === "error")
            throw new Error(event.error ?? "The assistant could not finish.");
          if (event.type === "status") {
            setStatus(event.text ?? "Retrieving knowledge…");
            if (event.conversationId) setConversationId(event.conversationId);
          }
          if (event.type === "draft") {
            setDraft(event.text ?? "");
            setStatus("Writing an answer…");
          }
          if (event.type === "done" && event.message && event.conversationId) {
            const id = event.conversationId;
            setMessages((previous) => [...previous, event.message!]);
            setConversationId(id);
            setPending(null);
            setDraft("");
            complete = true;
            setConversations((previous) =>
              [
                {
                  id,
                  title:
                    previous.find((item) => item.id === id)?.title ??
                    turn.text.slice(0, 80),
                },
                ...previous.filter((item) => item.id !== id),
              ].slice(0, 30),
            );
          }
        }
      }
      if (!complete)
        throw new Error("The response was interrupted. Retry this message.");
    } catch (error) {
      setDraft("");
      setError(
        error instanceof Error
          ? error.message
          : "Could not connect. Please retry.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
      setStatus("");
      abort.current = null;
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void send(input);
  }
  const sidebar = (
    <>
      <Link href="/dashboard" className="mb-9 inline-flex">
        <Brand />
      </Link>
      <div className="mb-7 flex gap-3 rounded-xl border bg-white/70 p-3">
        <Building2 className="size-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">{organization.name}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Private knowledge assistant
          </p>
        </div>
      </div>
      <Button
        onClick={startNew}
        disabled={busy}
        variant="outline"
        className="mb-7 justify-start bg-white"
      >
        <Plus />
        New conversation
      </Button>
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Workspace conversations
      </p>
      <div className="flex-1 space-y-1 overflow-auto">
        {!conversations.length ? (
          <p className="text-xs leading-6 text-muted-foreground">
            Your company’s conversations will appear here.
          </p>
        ) : (
          conversations.map((item) => (
            <button
              key={item.id}
              disabled={busy}
              onClick={() => void open(item.id)}
              className={cn(
                "flex w-full gap-2 rounded-lg p-3 text-left text-xs",
                item.id === conversationId
                  ? "bg-white text-primary"
                  : "text-muted-foreground hover:bg-white",
              )}
            >
              <MessageSquare className="size-3.5 shrink-0" />
              <span className="truncate">{item.title}</span>
            </button>
          ))
        )}
      </div>
      <Link
        href="/dashboard"
        className="my-6 flex justify-between text-xs text-primary"
      >
        Company dashboard
        <ArrowUpRight className="size-3.5" />
      </Link>
      <div className="border-t pt-5">
        <p className="truncate text-xs text-muted-foreground">{email}</p>
        <form action="/auth/signout" method="post" className="mt-3">
          <button className="flex gap-2 text-xs text-muted-foreground">
            <LogOut className="size-3.5" />
            Sign out
          </button>
        </form>
      </div>
    </>
  );
  return (
    <div className="flex h-dvh min-h-[500px] bg-white">
      <aside className="hidden w-[250px] shrink-0 flex-col border-r bg-[#f6f7f3] px-5 py-7 lg:flex">
        {sidebar}
      </aside>
      <Dialog open={menu} onOpenChange={setMenu}>
        <DialogContent className="top-0 left-0 flex h-dvh max-h-none w-[280px] translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-[#f6f7f3] px-5 py-7">
          <DialogTitle className="sr-only">Workspace conversations</DialogTitle>
          <DialogDescription className="sr-only">
            Open a saved company conversation.
          </DialogDescription>
          {sidebar}
        </DialogContent>
      </Dialog>
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[74px] shrink-0 items-center gap-3 border-b px-5 md:px-10">
          <button
            aria-label="Open conversations"
            onClick={() => setMenu(true)}
            className="lg:hidden"
          >
            <Menu className="size-5" />
          </button>
          <p className="truncate text-xs font-medium">
            {conversations.find((item) => item.id === conversationId)?.title ??
              "New conversation"}
          </p>
          <span className="ml-auto text-[10px] text-muted-foreground">
            Private to {organization.name}
          </span>
        </header>
        <div className="flex-1 overflow-y-auto px-5 md:px-10">
          <div className="mx-auto max-w-[720px] py-10">
            {!messages.length ? (
              <div className="flex min-h-[45dvh] flex-col items-center justify-center text-center">
                <div className="mb-6 rounded-2xl border bg-secondary p-5">
                  <BookOpen className="size-7 text-primary" />
                </div>
                <p className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-primary">
                  {organization.name} knowledge
                </p>
                <h1 className="text-4xl font-medium tracking-tight">
                  Answers from your
                  <br />
                  <span className="text-muted-foreground">
                    company’s own sources.
                  </span>
                </h1>
                <p className="mt-5 max-w-md text-sm leading-7 text-muted-foreground">
                  Ask about your company’s services, processes, policies or
                  documents. The assistant cites its sources and tells you when
                  evidence is missing.
                </p>
                <Link
                  href="/admin/knowledge"
                  className="mt-7 text-xs font-medium text-primary"
                >
                  Connect or update knowledge
                  <ArrowUpRight className="ml-1 inline size-3.5" />
                </Link>
              </div>
            ) : (
              <div className="space-y-7">
                {messages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
              </div>
            )}
            {draft && (
              <div className="mt-7">
                <MessageBubble
                  message={{
                    id: "stream",
                    organization_id: organization.id,
                    conversation_id: conversationId ?? "",
                    role: "assistant",
                    content: draft,
                    sources: [],
                    created_at: "",
                  }}
                />
              </div>
            )}
            {busy && (
              <p
                role="status"
                className="mt-6 flex items-center gap-2 text-xs text-muted-foreground"
              >
                <Loader2 className="size-4 animate-spin" />
                {status}
              </p>
            )}
            {error && (
              <div
                role="alert"
                className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-900"
              >
                {error}
                {pending && (
                  <button
                    disabled={busy}
                    onClick={() => void send(pending.text, pending)}
                    className="mt-2 flex items-center gap-2 font-semibold"
                  >
                    <RotateCcw className="size-3.5" />
                    Retry message
                  </button>
                )}
              </div>
            )}
            <div ref={bottom} />
          </div>
        </div>
        <footer className="shrink-0 px-5 py-4 md:px-10">
          <form
            onSubmit={submit}
            className="mx-auto max-w-[720px] rounded-2xl border p-3 shadow-xs"
          >
            <label htmlFor="message" className="sr-only">
              Ask your company’s assistant
            </label>
            <textarea
              id="message"
              rows={2}
              maxLength={4000}
              value={input}
              disabled={busy || !ready || Boolean(pending && error)}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  void send(input);
                }
              }}
              placeholder="Ask a question about your company’s knowledge…"
              className="w-full resize-none bg-transparent p-2 text-sm outline-none"
            />
            <div className="flex items-center justify-between">
              <span className="px-2 text-[10px] text-muted-foreground">
                {ready
                  ? "Cited answers from your company’s knowledge"
                  : "AI providers must be configured before chatting"}
              </span>
              <Button
                type="submit"
                size="icon"
                aria-label="Send message"
                disabled={
                  !input.trim() || busy || !ready || Boolean(pending && error)
                }
              >
                <ArrowUp />
              </Button>
            </div>
          </form>
          <p className="mt-3 text-center text-[10px] text-muted-foreground">
            Check the cited sources before relying on an AI answer.
          </p>
        </footer>
      </main>
    </div>
  );
}
