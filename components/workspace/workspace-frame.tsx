"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { friendlyError } from "@/lib/client-errors";
import {
  ArrowUpRight,
  BookOpen,
  LayoutGrid,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  MessageSquare,
  PanelLeft,
  Plus,
  Settings2,
  Ticket,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Brand } from "@/components/brand";
import { ConversationActions } from "@/components/chat/conversation-actions";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { groupConversations, type SavedConversation } from "@/lib/chat/history";
import type { Organization } from "@/types";

export type WorkspaceFrameProps = {
  children: ReactNode;
  organization: Organization;
  email: string;
  title: string;
  conversations: SavedConversation[];
  hasMore?: boolean;
  busy?: boolean;
  activeId?: string | null;
  onNew?: () => void;
  onOpen?: (id: string) => void;
  onRename?: (item: SavedConversation) => void;
  onDelete?: (id: string) => void;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  headerActions?: ReactNode;
  chat?: boolean;
};
const nav = [
  { href: "/dashboard", label: "Workspace", icon: LayoutGrid },
  { href: "/admin/knowledge", label: "Knowledge", icon: BookOpen },
  { href: "/admin/conversations", label: "Conversations", icon: MessageSquare },
  { href: "/admin/tickets", label: "Support tickets", icon: Ticket },
];

export function WorkspaceFrame(props: WorkspaceFrameProps) {
  const {
    children,
    organization,
    email,
    title,
    conversations,
    hasMore,
    busy,
    activeId,
    onNew,
    onOpen,
    onRename,
    onDelete,
    onLoadMore,
    loadingMore,
    headerActions,
    chat,
  } = props;
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const day = useSyncExternalStore(subscribeDay, localDay, serverDay);
  const filtered = conversations.filter((item) =>
    item.title.toLowerCase().includes(search.toLowerCase()),
  );
  const groups = day
    ? groupConversations(filtered, new Date(day))
    : filtered.length
      ? [{ label: "Recent chats", items: filtered }]
      : [];
  const sidebar = (
    <div className="flex h-full min-h-0 flex-col px-4 py-5">
      <div className="mb-7 flex items-center justify-between px-1">
        <Link href="/" aria-label="Resolvo home">
          <Brand />
        </Link>
        <button
          onClick={() => {
            setCollapsed(true);
            setMobile(false);
          }}
          className="hidden rounded-lg p-2 text-muted-foreground hover:bg-white lg:block"
          aria-label="Collapse sidebar"
        >
          <PanelLeft className="size-4" />
        </button>
      </div>
      {onNew ? (
        <button
          disabled={busy}
          onClick={() => {
            onNew();
            setMobile(false);
          }}
          className="flex w-full items-center gap-3 rounded-xl bg-primary px-4 py-3 text-xs font-medium text-white hover:bg-[#1f674b] disabled:opacity-50"
        >
          <Plus className="size-4" />
          New chat
          <span aria-hidden="true" className="ml-auto text-white/65">
            ↗
          </span>
        </button>
      ) : (
        <Link
          href="/support"
          onClick={() => setMobile(false)}
          className="flex items-center gap-3 rounded-xl bg-primary px-4 py-3 text-xs font-medium text-white hover:bg-[#1f674b]"
        >
          <Plus className="size-4" />
          New chat
          <ArrowUpRight className="ml-auto size-3.5 text-white/65" />
        </Link>
      )}
      <nav aria-label="Workspace navigation" className="mt-5 space-y-1">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link
            href={href}
            key={href}
            onClick={() => setMobile(false)}
            aria-current={path === href ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs transition-colors",
              path === href
                ? "bg-[#e2ede4] font-medium text-primary"
                : "text-[#697e70] hover:bg-white",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="mt-7 flex items-center justify-between px-3">
        <span className="text-[10px] font-medium tracking-[.1em] text-[#819087]">
          YOUR CHATS
        </span>
        <button
          aria-label={searchOpen ? "Close chat search" : "Search chats"}
          onClick={() => {
            setSearchOpen(!searchOpen);
            setSearch("");
          }}
          className="rounded p-1 text-muted-foreground hover:bg-white"
        >
          {searchOpen ? (
            <X className="size-3.5" />
          ) : (
            <Search className="size-3.5" />
          )}
        </button>
      </div>
      {searchOpen && (
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          autoFocus
          aria-label="Search chat history"
          placeholder="Find a conversation…"
          className="mx-2 mt-2 rounded-lg border bg-white p-2.5 text-xs"
        />
      )}
      <nav
        aria-label="Conversation history"
        className="mt-3 min-h-0 flex-1 overflow-y-auto pb-4"
      >
        {!groups.length ? (
          <p className="px-3 py-3 text-[11px] leading-6 text-muted-foreground">
            {search
              ? "No matching chats in loaded history."
              : "A fresh start. Your conversations will appear here."}
          </p>
        ) : (
          groups.map(({ label, items }) => (
            <div key={label} className="mb-4">
              <p className="px-3 py-2 text-[10px] text-[#88978d]">{label}</p>
              {items.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "group flex items-center gap-1 rounded-lg pr-1",
                    item.id === activeId
                      ? "bg-white shadow-xs"
                      : "hover:bg-white/70",
                  )}
                >
                  {onOpen ? (
                    <button
                      onClick={() => {
                        onOpen(item.id);
                        setMobile(false);
                      }}
                      disabled={busy}
                      aria-current={item.id === activeId ? "page" : undefined}
                      className="min-w-0 flex-1 truncate px-3 py-2.5 text-left text-[11px] text-[#536b5b]"
                    >
                      {item.title}
                    </button>
                  ) : (
                    <Link
                      href={"/support?conversation=" + item.id}
                      onClick={() => setMobile(false)}
                      className="min-w-0 flex-1 truncate px-3 py-2.5 text-[11px] text-[#536b5b]"
                    >
                      {item.title}
                    </Link>
                  )}
                  {onRename && onDelete && (
                    <ConversationActions
                      conversation={item}
                      disabled={busy}
                      onRename={onRename}
                      onDelete={onDelete}
                    />
                  )}
                </div>
              ))}
            </div>
          ))
        )}
        {hasMore && onLoadMore && (
          <button
            disabled={loadingMore || busy}
            onClick={onLoadMore}
            className="flex w-full items-center justify-center gap-2 py-3 text-[11px] text-primary"
          >
            {loadingMore && <LoaderCircle className="size-3 animate-spin" />}
            Load older chats
          </button>
        )}
      </nav>
      <div className="mt-auto border-t pt-4">
        <Link
          href="/admin/settings"
          onClick={() => setMobile(false)}
          className="mb-3 flex items-center gap-3 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-white"
        >
          <Settings2 className="size-4" />
          Settings
        </Link>
        <div className="flex items-center gap-2.5 rounded-xl border bg-white/75 px-3 py-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#e8eee6] text-xs font-semibold text-primary">
            {organization.name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold">
              {organization.name}
            </p>
            <p className="mt-1 truncate text-[9px] text-muted-foreground">
              {email}
            </p>
          </div>
          <form action="/auth/signout" method="post">
            <button
              aria-label="Sign out"
              title="Sign out"
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"
            >
              <LogOut className="size-3.5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
  return (
    <div
      className={cn(
        "flex bg-[#fbfcfa]",
        chat ? "h-dvh min-h-[420px] overflow-hidden" : "min-h-dvh",
      )}
    >
      <aside
        aria-label="Sidebar"
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 border-r bg-[#f1f5f1] lg:block",
          collapsed ? "w-0 overflow-hidden border-0" : "w-[260px]",
        )}
      >
        {!collapsed && sidebar}
      </aside>
      <Dialog open={mobile} onOpenChange={setMobile}>
        <DialogContent className="top-0 left-0 h-dvh max-h-none w-[min(290px,90vw)] translate-x-0 translate-y-0 rounded-none border-0 bg-[#f1f5f1] p-0">
          <DialogTitle className="sr-only">Workspace navigation</DialogTitle>
          <DialogDescription className="sr-only">
            Your conversations and company workspace.
          </DialogDescription>
          {sidebar}
        </DialogContent>
      </Dialog>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[68px] shrink-0 items-center gap-3 border-b bg-white/90 px-4 sm:px-7">
          <button
            aria-label="Expand sidebar"
            onClick={() => setCollapsed(false)}
            className={cn(
              "hidden rounded-lg p-2 text-muted-foreground hover:bg-muted",
              collapsed && "lg:block",
            )}
          >
            <PanelLeft className="size-4" />
          </button>
          <button
            aria-label="Open sidebar"
            onClick={() => setMobile(true)}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted lg:hidden"
          >
            <PanelLeft className="size-4" />
          </button>
          <p className="min-w-0 flex-1 truncate text-[13px] font-medium">
            {title}
          </p>
          {headerActions}
          <span className="hidden items-center gap-1.5 rounded-full bg-[#f1f5ef] px-3 py-1.5 text-[10px] text-[#758772] sm:flex">
            <LockKeyhole className="size-3" />
            Private workspace
          </span>
        </header>
        <main
          id="main-content"
          className={cn(
            "min-w-0 flex-1",
            chat
              ? "flex min-h-0 flex-col bg-white"
              : "mx-auto w-full max-w-[1180px] px-5 py-8 sm:px-9 sm:py-10",
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

export function useHistoryPagination(
  initial: SavedConversation[],
  initialHasMore: boolean,
) {
  const [conversations, setConversations] = useState(initial);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  async function loadMore() {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await fetch(
        "/api/conversations?offset=" + conversations.length,
        { cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not load older chats.");
      setConversations((previous) => [
        ...previous,
        ...data.conversations.filter(
          (item: SavedConversation) =>
            !previous.some((old) => old.id === item.id),
        ),
      ]);
      setHasMore(data.hasMore);
    } catch (error) {
      toast.error(
        friendlyError(
          error,
          "Could not load older chats. Check your connection and try again.",
        ),
      );
    } finally {
      setLoadingMore(false);
    }
  }
  return { conversations, setConversations, hasMore, loadingMore, loadMore };
}

function localDay() {
  return new Date().toDateString();
}
function serverDay() {
  return "";
}
function subscribeDay(onChange: () => void) {
  const timer = setInterval(onChange, 60_000);
  return () => clearInterval(timer);
}
