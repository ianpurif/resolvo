"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type FormEvent,
} from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  ChevronRight,
  RotateCcw,
  Square,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/client-errors";
import { Brand } from "@/components/brand";
import {
  WorkspaceFrame,
  useHistoryPagination,
} from "@/components/workspace/workspace-frame";
import { ConversationActions } from "./conversation-actions";
import { MessageBubble } from "./message-bubble";
import { consumeChatStream } from "@/lib/chat/stream";
import type { SavedConversation } from "@/lib/chat/history";
import type { ChatMessage, Organization } from "@/types";

type Pending = {
  id: string;
  text: string;
  userId: string;
  conversationId: string | null;
};
export function SupportChat({
  ready,
  organization,
  email,
  initialConversations,
  initialHasMore = false,
  initialConversationId,
}: {
  ready: boolean;
  organization: Organization;
  email: string;
  initialConversations: SavedConversation[];
  initialHasMore?: boolean;
  initialConversationId?: string;
}) {
  const history = useHistoryPagination(initialConversations, initialHasMore);
  const { conversations, setConversations } = history;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [status, setStatus] = useState("");
  const [atBottom, setAtBottom] = useState(true);
  const busyRef = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);
  const autoScroll = useRef(true);
  const composer = useRef<HTMLTextAreaElement>(null);
  const abort = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abort.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!autoScroll.current) return;
    const frame = requestAnimationFrame(() => {
      if (scroller.current)
        scroller.current.scrollTo({
          top: scroller.current.scrollHeight,
          behavior:
            busy || matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "instant"
              : "smooth",
        });
    });
    return () => cancelAnimationFrame(frame);
  }, [messages, draft, busy]);
  function updateURL(id: string | null) {
    window.history.replaceState(
      null,
      "",
      id ? "/support?conversation=" + id : "/support",
    );
  }
  function startNew() {
    if (busyRef.current) return;
    setMessages([]);
    setConversationId(null);
    setPending(null);
    setError("");
    setDraft("");
    setInput("");
    autoScroll.current = true;
    setAtBottom(true);
    updateURL(null);
    composer.current?.focus();
  }
  const open = useCallback(
    async (id: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setStatus("Loading conversation…");
      setError("");
      setDraft("");
      const controller = new AbortController();
      abort.current = controller;
      try {
        const response = await fetch("/api/conversations/" + id, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error ?? "Could not load this conversation.");
        setMessages(data.messages);
        setConversationId(id);
        setInput("");
        setPending(null);
        setConversations((previous) => [
          { ...data.conversation },
          ...previous.filter((item) => item.id !== id),
        ]);
        const last = data.messages.at(-1) as ChatMessage | undefined;
        if (last?.role === "user" && last.request_id) {
          setPending({
            id: last.request_id,
            text: last.content,
            userId: last.id,
            conversationId: id,
          });
          setError(
            "This answer wasn’t completed. Retry to continue this conversation.",
          );
        }
        autoScroll.current = true;
        setAtBottom(true);
        updateURL(id);
      } catch (failure) {
        if (!mounted.current) return;
        const message = controller.signal.aborted
          ? "Loading stopped. Open this conversation again when you’re ready."
          : friendlyError(
              failure,
              "Couldn’t load this conversation. Check your connection and try again.",
            );
        setError(message);
        toast.error(message);
      } finally {
        busyRef.current = false;
        if (mounted.current) {
          setBusy(false);
          setStatus("");
        }
        abort.current = null;
      }
    },
    [setConversations],
  );
  useEffect(() => {
    if (initialConversationId)
      void Promise.resolve().then(() => open(initialConversationId));
  }, [initialConversationId, open]);
  async function send(text: string, retry?: Pending) {
    if (!text.trim() || busyRef.current || !ready) return;
    const turn = retry ?? {
      id: crypto.randomUUID(),
      text: text.trim(),
      userId: crypto.randomUUID(),
      conversationId,
    };
    busyRef.current = true;
    setBusy(true);
    setError("");
    setDraft("");
    setInput("");
    setPending(turn);
    setStatus("Finding the right context…");
    autoScroll.current = true;
    setAtBottom(true);
    if (composer.current) composer.current.style.height = "56px";
    if (!retry)
      setMessages((previous) => [
        ...previous,
        {
          id: turn.userId,
          organization_id: organization.id,
          conversation_id: turn.conversationId ?? "",
          role: "user",
          content: turn.text,
          sources: [],
          created_at: new Date().toISOString(),
          request_id: turn.id,
        },
      ]);
    const controller = new AbortController();
    abort.current = controller;
    let complete = false;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: turn.text,
          conversationId: turn.conversationId,
          requestId: turn.id,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "The message could not be sent.");
      }
      if (!response.body)
        throw new Error("The response could not be opened. Please retry.");
      await consumeChatStream(response.body, (event) => {
        if (event.type === "error")
          throw new Error(event.error ?? "The assistant could not finish.");
        if (event.type === "status") {
          setStatus(event.text ?? "Searching company knowledge…");
          if (event.conversationId) {
            turn.conversationId = event.conversationId;
            setConversationId(event.conversationId);
            setPending({ ...turn });
            updateURL(event.conversationId);
            setConversations((previous) => {
              const existing = previous.find(
                (item) => item.id === event.conversationId,
              );
              return [
                {
                  id: event.conversationId!,
                  title: existing?.title ?? turn.text.slice(0, 80),
                  created_at: existing?.created_at ?? new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
                ...previous.filter((item) => item.id !== event.conversationId),
              ];
            });
          }
        }
        if (event.type === "draft") {
          setDraft(event.text ?? "");
          setStatus("Writing an answer…");
        }
        if (event.type === "done" && event.message && event.conversationId) {
          complete = true;
          setMessages((previous) => [
            ...previous.filter((item) => item.id !== event.message!.id),
            event.message!,
          ]);
          setConversationId(event.conversationId);
          setPending(null);
          setDraft("");
          updateURL(event.conversationId);
          setConversations((previous) => {
            const old = previous.find(
              (item) => item.id === event.conversationId,
            );
            return [
              {
                id: event.conversationId!,
                title: old?.title ?? turn.text.slice(0, 80),
                created_at: old?.created_at ?? new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              ...previous.filter((item) => item.id !== event.conversationId),
            ];
          });
        }
      });
      if (!complete)
        throw new Error("The response was interrupted. Retry this message.");
    } catch (failure) {
      if (!mounted.current || complete) return;
      setDraft("");
      const stopped = controller.signal.aborted;
      const message = stopped
        ? "Answer stopped. Retry when you’re ready."
        : friendlyError(
            failure,
            "The answer couldn’t finish. Check your connection and retry.",
          );
      setError(message);
      if (!stopped) toast.error(message, { id: "chat-error" });
    } finally {
      busyRef.current = false;
      abort.current = null;
      if (mounted.current) {
        setBusy(false);
        setStatus("");
        requestAnimationFrame(() => composer.current?.focus());
      }
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void send(input);
  }
  function renamed(item: SavedConversation) {
    setConversations((previous) =>
      previous.map((old) => (old.id === item.id ? item : old)),
    );
  }
  function deleted(id: string) {
    setConversations((previous) => previous.filter((item) => item.id !== id));
    if (id === conversationId) startNew();
  }
  const selected = conversations.find((item) => item.id === conversationId);
  return (
    <WorkspaceFrame
      organization={organization}
      email={email}
      title={selected?.title ?? "Resolvo assistant"}
      conversations={conversations}
      activeId={conversationId}
      busy={busy}
      hasMore={history.hasMore}
      loadingMore={history.loadingMore}
      onLoadMore={() => void history.loadMore()}
      onNew={startNew}
      onOpen={(id) => void open(id)}
      onRename={renamed}
      onDelete={deleted}
      chat
      headerActions={
        selected && (
          <ConversationActions
            conversation={selected}
            disabled={busy}
            onRename={renamed}
            onDelete={deleted}
          />
        )
      }
    >
      <div
        ref={scroller}
        onScroll={() => {
          const element = scroller.current;
          if (!element) return;
          const near =
            element.scrollHeight - element.scrollTop - element.clientHeight <
            140;
          autoScroll.current = near;
          setAtBottom(near);
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 sm:px-8"
      >
        <div className="mx-auto max-w-[760px] py-8 sm:py-11">
          {!messages.length && !busy ? (
            <div className="chat-welcome">
              <Brand
                compact
                className="mb-7 rounded-xl border border-dashed border-[#a9c2cd] bg-[#eef5f8] p-2 [&_.brand-mark]:size-10"
              />
              <p className="mb-3 text-[11px] text-muted-foreground">
                Your {organization.name} knowledge assistant
              </p>
              <h1>What would you like to know?</h1>
              <p className="mt-4 max-w-sm text-[13px] leading-6 text-muted-foreground">
                Find an answer. Explore an idea. Start with your company’s
                knowledge.
              </p>
              <div className="mt-8 grid w-full max-w-lg gap-2 sm:grid-cols-3">
                {[
                  {
                    label: "Understand a policy",
                    text: "What are the key policies in our company knowledge?",
                    icon: BookOpen,
                  },
                  {
                    label: "Find a process",
                    text: "What processes are documented in our company knowledge?",
                    icon: Sparkles,
                  },
                  {
                    label: "Explore our sources",
                    text: "Summarize the information available in our company knowledge.",
                    icon: SearchIcon,
                  },
                ].map(({ label, text, icon: Icon }) => (
                  <button
                    key={label}
                    onClick={() => {
                      setInput(text);
                      composer.current?.focus();
                    }}
                    disabled={!ready}
                    className="prompt-suggestion disabled:opacity-50 sm:flex-col sm:items-start"
                  >
                    <Icon className="size-4 text-primary" />
                    {label}
                  </button>
                ))}
              </div>
              <Link
                href="/admin/knowledge"
                className="mt-7 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
              >
                Manage your company’s sources
                <ChevronRight className="size-3" />
              </Link>
            </div>
          ) : (
            <div className="space-y-9">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </div>
          )}
          {draft && (
            <div className="mt-9">
              <MessageBubble
                streaming
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
          {busy && !draft && (
            <div
              role="status"
              className="mt-6 flex items-center gap-3 text-xs text-muted-foreground"
            >
              <Brand compact className="[&_.brand-mark]:size-7" />
              <span className="thinking-dot">{status || "Loading…"}</span>
            </div>
          )}
          {busy && draft && (
            <p role="status" className="sr-only">
              Writing an answer…
            </p>
          )}
          {error && (
            <div
              role="alert"
              className="mt-6 rounded-xl border border-amber-200/80 bg-amber-50/60 px-4 py-3 text-xs leading-6 text-amber-900"
            >
              {error}
              <div className="mt-2 flex items-center gap-5">
                {pending ? (
                  <button
                    disabled={busy}
                    onClick={() => void send(pending.text, pending)}
                    className="flex items-center gap-1.5 font-semibold"
                  >
                    <RotateCcw className="size-3.5" />
                    Retry message
                  </button>
                ) : conversationId ? (
                  <button
                    disabled={busy}
                    onClick={() => void open(conversationId)}
                    className="font-semibold"
                  >
                    Reload conversation
                  </button>
                ) : null}
                <button
                  disabled={busy}
                  onClick={startNew}
                  className="font-semibold"
                >
                  Start a new chat
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <footer className="relative shrink-0 bg-[#fbfdfe] px-4 pt-2 pb-[max(14px,env(safe-area-inset-bottom))] sm:px-8">
        {!atBottom && (
          <button
            aria-label="Jump to latest message"
            onClick={() => {
              autoScroll.current = true;
              scroller.current?.scrollTo({
                top: scroller.current.scrollHeight,
                behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                  ? "instant"
                  : "smooth",
              });
            }}
            className="absolute -top-10 left-1/2 flex size-9 -translate-x-1/2 items-center justify-center rounded-full border bg-white shadow-sm"
          >
            <ArrowDown className="size-4" />
          </button>
        )}
        <form onSubmit={submit} className="composer mx-auto max-w-[760px]">
          <label htmlFor="message" className="sr-only">
            Ask your company’s assistant
          </label>
          <textarea
            ref={composer}
            id="message"
            rows={2}
            maxLength={4000}
            value={input}
            disabled={busy || !ready || Boolean(pending && error)}
            onChange={(event) => {
              setInput(event.target.value);
              event.target.style.height = "56px";
              event.target.style.height =
                Math.min(160, event.target.scrollHeight) + "px";
            }}
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
            placeholder="Ask your company’s knowledge…"
            className="min-h-14 w-full resize-none bg-transparent px-2 py-2 text-sm leading-6 outline-none! placeholder:text-muted-foreground disabled:opacity-60"
          />
          <div className="flex items-center justify-between px-1">
            <Link
              href="/admin/knowledge"
              className="flex items-center gap-1.5 rounded-md border bg-[#f0f6f9] px-2.5 py-1.5 text-[10px] text-muted-foreground hover:text-primary"
            >
              <BookOpen className="size-3" />
              Company knowledge
            </Link>
            <div className="flex items-center gap-3">
              <span className="hidden text-[9px] text-muted-foreground sm:block">
                Enter to send · Shift + Enter for a new line
              </span>
              {busy ? (
                <button
                  type="button"
                  aria-label="Stop response"
                  onClick={() => abort.current?.abort()}
                  className="flex size-9 items-center justify-center rounded-lg bg-[#173f51] text-white"
                >
                  <Square className="size-3.5" fill="currentColor" />
                </button>
              ) : (
                <button
                  type="submit"
                  aria-label="Send message"
                  disabled={
                    !input.trim() || !ready || Boolean(pending && error)
                  }
                  className="flex size-9 items-center justify-center rounded-lg bg-[#173f51] text-white transition-colors hover:bg-[#236078] disabled:bg-[#e5edf2] disabled:text-[#91a9b5]"
                >
                  <ArrowUp className="size-4" />
                </button>
              )}
            </div>
          </div>
        </form>
        <p className="mx-auto mt-3 max-w-[760px] text-center text-[10px] text-muted-foreground">
          {ready
            ? "AI can make mistakes. Check the sources behind important answers."
            : "Chat is temporarily unavailable. Your workspace administrator can check the connection."}
        </p>
      </footer>
    </WorkspaceFrame>
  );
}
function SearchIcon() {
  return <BookOpen className="size-4 text-primary" />;
}
