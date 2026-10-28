"use client";

import { useRef, useState, type FormEvent } from "react";
import { DropdownMenu } from "radix-ui";
import { MoreHorizontal, Pencil, Trash2, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/client-errors";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { SavedConversation } from "@/lib/chat/history";

export function ConversationActions({
  conversation,
  disabled,
  onRename,
  onDelete,
}: {
  conversation: SavedConversation;
  disabled?: boolean;
  onRename: (conversation: SavedConversation) => void;
  onDelete: (id: string) => void;
}) {
  const [action, setAction] = useState<"rename" | "delete" | null>(null);
  const [title, setTitle] = useState(conversation.title);
  const [busy, setBusy] = useState(false);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || (action === "rename" && !title.trim())) return;
    setBusy(true);
    try {
      const response = await fetch("/api/conversations/" + conversation.id, {
        method: action === "delete" ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        ...(action === "rename"
          ? { body: JSON.stringify({ title: title.trim() }) }
          : {}),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not update this conversation.");
      if (action === "delete") {
        onDelete(conversation.id);
        toast.success("Conversation deleted");
      } else {
        onRename(data.conversation);
        toast.success("Conversation renamed");
      }
      setAction(null);
    } catch (error) {
      toast.error(
        friendlyError(
          error,
          "Could not update this conversation. Check your connection and try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          ref={menuTrigger}
          disabled={disabled}
          aria-label={"Options for " + conversation.title}
          className="conversation-menu-trigger flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent focus-visible:bg-accent"
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={5}
            className="z-50 min-w-44 rounded-lg border bg-white p-1.5 text-xs shadow-[0_12px_40px_#17334220]"
          >
            <DropdownMenu.Item
              onSelect={() => {
                setTitle(conversation.title);
                setAction("rename");
              }}
              className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2.5 outline-none focus:bg-muted"
            >
              <Pencil className="size-3.5" />
              Rename
            </DropdownMenu.Item>
            <DropdownMenu.Item
              onSelect={() => setAction("delete")}
              className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2.5 text-destructive outline-none focus:bg-red-50"
            >
              <Trash2 className="size-3.5" />
              Delete
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <Dialog
        open={Boolean(action)}
        onOpenChange={(open) => {
          if (!open && !busy) setAction(null);
        }}
      >
        <DialogContent
          className="max-w-sm"
          onCloseAutoFocus={(event) => {
            if (menuTrigger.current?.isConnected) {
              event.preventDefault();
              menuTrigger.current.focus();
            }
          }}
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (busy) event.preventDefault();
          }}
        >
          <DialogTitle className="text-lg font-semibold tracking-tight">
            {action === "delete"
              ? "Delete this conversation?"
              : "Rename conversation"}
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-muted-foreground">
            {action === "delete"
              ? "This removes the conversation and its messages from your history. This cannot be undone."
              : "Give this conversation a name that’s easy to find."}
          </DialogDescription>
          <form onSubmit={save}>
            {action === "rename" && (
              <>
                <label htmlFor={"title-" + conversation.id} className="sr-only">
                  Conversation name
                </label>
                <input
                  id={"title-" + conversation.id}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={120}
                  required
                  disabled={busy}
                  autoFocus
                  className="field"
                />
              </>
            )}
            {action === "delete" && (
              <p className="truncate rounded-lg bg-muted px-3 py-3 text-sm">
                {conversation.title}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAction(null)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={busy || (action === "rename" && !title.trim())}
                variant={action === "delete" ? "destructive" : "default"}
              >
                {busy && <LoaderCircle className="size-4 animate-spin" />}
                {action === "delete" ? "Delete conversation" : "Save name"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
