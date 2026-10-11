"use client";

import { useState } from "react";
import { Check, Copy, FileText, ArrowUpRight } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Brand } from "@/components/brand";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { ChatMessage, Source } from "@/types";

export function MessageBubble({ message }: { message: ChatMessage }) {
  const [source, setSource] = useState<Source | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  if (message.role === "user")
    return (
      <div className="flex justify-end pl-12">
        <div className="max-w-[90%] rounded-2xl rounded-tr-sm bg-[#edf4ee] px-5 py-3.5 text-sm leading-7 whitespace-pre-wrap break-words">
          {message.content}
        </div>
      </div>
    );
  return (
    <div className="flex items-start gap-3.5">
      <Brand compact className="mt-1 [&>span]:size-7 [&_svg]:size-4" />
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs font-semibold">Company assistant</span>
          <span className="rounded border px-1 py-0.5 text-[9px] text-muted-foreground">
            AI
          </span>
        </div>
        <div className="chat-markdown">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              img: ({ alt }) => <span>{alt}</span>,
              a: ({ children, href }) => (
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              ),
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
        {message.sources.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              Sources
            </span>
            {message.sources.map((item) => (
              <button
                key={item.id}
                onClick={() => setSource(item)}
                className="flex items-center gap-1.5 rounded-md border bg-muted/50 px-2.5 py-1.5 text-[11px] text-primary hover:bg-secondary"
              >
                <FileText className="size-3" />
                {item.title}
                <ArrowUpRight className="size-3 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
        <div className="mt-2 flex items-center gap-2">
          <button
            aria-label="Copy answer"
            className="rounded p-1.5 text-muted-foreground hover:bg-accent"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(message.content);
                setCopied(true);
                setCopyError(false);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                setCopyError(true);
              }
            }}
          >
            {copied ? (
              <Check className="size-3.5" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </button>
          {copyError && (
            <span role="status" className="text-xs text-muted-foreground">
              Select the text to copy it.
            </span>
          )}
        </div>
      </div>
      <Dialog
        open={Boolean(source)}
        onOpenChange={(open) => {
          if (!open) setSource(null);
        }}
      >
        <DialogContent>
          <DialogTitle className="pr-5 text-lg font-semibold">
            {source?.title}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Excerpt retrieved from the company knowledge base.
          </DialogDescription>
          <div className="rounded-xl border bg-muted/60 p-4 text-sm leading-7 whitespace-pre-wrap">
            {source?.excerpt}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
