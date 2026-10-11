"use client";

import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check, Copy, FileText, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
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

function useCopy() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy isn’t available. Select the text to copy it.");
    }
  }
  return { copied, copy };
}
function nodeText(node: ReactNode): string {
  return Children.toArray(node)
    .map((item) =>
      typeof item === "string" || typeof item === "number"
        ? String(item)
        : isValidElement<{ children?: ReactNode }>(item)
          ? nodeText(item.props.children)
          : "",
    )
    .join("");
}
function CodeBlock({ children }: { children?: ReactNode }) {
  const { copied, copy } = useCopy();
  const element = Children.toArray(children).find((item) =>
    isValidElement(item),
  );
  const language = isValidElement<{ className?: string }>(element)
    ? element.props.className?.replace("language-", "")
    : "";
  return (
    <div className="my-4 overflow-hidden rounded-xl border border-[#2b4637] bg-[#183328]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5 text-[10px] text-[#a7c6b3]">
        <span>{language || "Code"}</span>
        <button
          aria-label="Copy code"
          onClick={() => void copy(nodeText(children).replace(/\n$/, ""))}
          className="flex items-center gap-1.5 rounded px-1 py-0.5 hover:text-white"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? "Copied" : "Copy code"}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

export function MessageBubble({
  message,
  streaming = false,
}: {
  message: ChatMessage;
  streaming?: boolean;
}) {
  const [source, setSource] = useState<Source | null>(null);
  const { copied, copy } = useCopy();
  if (message.role === "user")
    return (
      <div className="flex justify-end pl-8 sm:pl-16">
        <div className="max-w-[94%] rounded-[20px] rounded-br-md bg-[#eef3ec] px-5 py-3.5 text-[13px] leading-7 whitespace-pre-wrap break-words">
          {message.content}
        </div>
      </div>
    );
  return (
    <div className="flex items-start gap-3 sm:gap-4">
      <Brand compact className="mt-0.5 [&_.brand-mark]:size-7" />
      <div className="min-w-0 flex-1">
        <p className="mb-3 text-xs font-semibold">
          Resolvo
          <span className="ml-2 text-[9px] font-normal text-muted-foreground">
            ASSISTANT
          </span>
        </p>
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
              pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
              table: ({ children }) => (
                <div className="my-4 overflow-x-auto rounded-lg">
                  <table>{children}</table>
                </div>
              ),
            }}
          >
            {message.content}
          </ReactMarkdown>
          {streaming && (
            <span
              className="thinking-dot ml-1 inline-block h-3 w-1 rounded-full bg-primary"
              aria-hidden="true"
            />
          )}
        </div>
        {message.sources.length > 0 && (
          <div className="mt-5">
            <p className="mb-2.5 text-[9px] font-medium tracking-wider text-muted-foreground">
              GROUNDED IN YOUR SOURCES
            </p>
            <div className="flex flex-wrap gap-2">
              {message.sources.map((item, index) => (
                <button
                  key={item.chunkId ?? item.id}
                  onClick={() => setSource(item)}
                  aria-label={"View source: " + item.title}
                  className="flex max-w-full items-center gap-1.5 rounded-lg border bg-[#f8faf6] px-2.5 py-2 text-[10px] text-primary transition-colors hover:border-[#a6bea9] hover:bg-secondary"
                >
                  <span className="flex size-4 shrink-0 items-center justify-center rounded bg-[#e7eee1] text-[8px]">
                    {index + 1}
                  </span>
                  <FileText className="size-3 shrink-0" />
                  <span className="truncate">{item.title}</span>
                  <ArrowUpRight className="size-3 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        )}
        {!streaming && (
          <div className="mt-3 flex items-center gap-2">
            <button
              aria-label="Copy answer"
              onClick={() => void copy(message.content)}
              className="rounded-lg p-2 text-[#95a48f] hover:bg-accent hover:text-primary"
            >
              {copied ? (
                <Check className="size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </button>
            {copied && (
              <span role="status" className="text-[10px] text-muted-foreground">
                Copied
              </span>
            )}
          </div>
        )}
      </div>
      <Dialog
        open={Boolean(source)}
        onOpenChange={(open) => {
          if (!open) setSource(null);
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogTitle className="pr-5 text-lg font-semibold tracking-tight">
            {source?.title}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 text-xs text-muted-foreground">
            <FileText className="size-3.5" />
            Source excerpt used for this answer
          </DialogDescription>
          <div className="max-h-[50dvh] overflow-y-auto rounded-xl border bg-[#f7faf5] p-5 text-sm leading-7 whitespace-pre-wrap break-words">
            {source?.excerpt}
          </div>
          <p className="text-[10px] leading-5 text-muted-foreground">
            This excerpt is saved with the conversation. The original document
            may have changed since this answer.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
