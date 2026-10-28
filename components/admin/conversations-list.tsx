"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, MessageSquare, ArrowUpRight, Plus } from "lucide-react";
import { ConversationActions } from "@/components/chat/conversation-actions";
import { EmptyState } from "./empty-state";
import { formatDate } from "@/lib/utils";
import type { Conversation } from "@/types";

export function ConversationsList({
  conversations,
}: {
  conversations: Conversation[];
}) {
  const [search, setSearch] = useState("");
  const [items, setItems] = useState(conversations);
  const router = useRouter();
  const filtered = items.filter((item) =>
    item.title.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-3">
        <label className="search-field flex-1 sm:max-w-sm">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            aria-label="Search conversations"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find a conversation…"
            className="min-w-0 w-full bg-transparent text-xs outline-none"
          />
        </label>
        <Link
          href="/support"
          className="flex shrink-0 items-center gap-2 rounded-[7px] bg-primary px-4 py-3 text-xs font-semibold text-white transition-colors hover:bg-primary/90"
        >
          <Plus className="size-3.5" />
          New chat
        </Link>
      </div>
      <div className="surface">
        <div className="surface-heading">
          <span>Your conversation library</span>
          <span className="text-[10px] font-normal text-muted-foreground">
            {filtered.length}{" "}
            {filtered.length === 1 ? "conversation" : "conversations"}
          </span>
        </div>
        {!filtered.length ? (
          <EmptyState
            title={
              items.length
                ? "No matching conversations"
                : "Your next conversation starts here"
            }
            description={
              items.length
                ? "Try a different search."
                : "Ask a question in the assistant. Your personal history is saved here."
            }
          />
        ) : (
          <div className="divide-y">
            {filtered.map((item) => (
              <div key={item.id} className="conversation-row list-row">
                <Link
                  href={"/support?conversation=" + item.id}
                  className="flex min-w-0 flex-1 items-center gap-4"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[#cfe0e7] bg-[#f1f7fa]">
                    <MessageSquare className="size-4 text-primary" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="mt-1.5 text-[10px] text-muted-foreground">
                      Updated {formatDate(item.updated_at, true)} UTC
                    </p>
                  </div>
                  <ArrowUpRight className="hidden size-4 shrink-0 text-muted-foreground sm:block" />
                </Link>
                <ConversationActions
                  conversation={item}
                  onRename={(updated) => {
                    setItems((previous) =>
                      previous.map((old) =>
                        old.id === updated.id ? { ...old, ...updated } : old,
                      ),
                    );
                    router.refresh();
                  }}
                  onDelete={(id) => {
                    setItems((previous) =>
                      previous.filter((old) => old.id !== id),
                    );
                    router.refresh();
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="mt-4 text-[11px] text-muted-foreground">
        {items.length} recent{" "}
        {items.length === 1 ? "conversation" : "conversations"}. Older chats are
        available in the sidebar.
      </p>
    </>
  );
}
