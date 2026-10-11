"use client";
import { useState, useRef, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  RefreshCw,
  Trash2,
  Download,
  Pencil,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { EmptyState } from "./empty-state";
import { formatDate } from "@/lib/utils";
import { validateUpload } from "@/lib/validations";
import type { DataSource, KnowledgeDocument } from "@/types";
export function KnowledgeManager({
  documents,
  sources,
}: {
  documents: KnowledgeDocument[];
  sources: DataSource[];
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [kind, setKind] = useState<DataSource["kind"]>("file");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<KnowledgeDocument | null>(null);
  const [deleting, setDeleting] = useState<KnowledgeDocument | null>(null);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const saveRequest = useRef<string | null>(null);
  const advancing = useRef(false);
  const [recoveryDelay, setRecoveryDelay] = useState(0);
  useEffect(() => {
    const pending = documents
      .filter(
        (document) =>
          document.status === "processing" && document.indexing_token,
      )
      .sort(
        (a, b) =>
          Date.parse(a.index_next_attempt_at ?? a.updated_at) -
          Date.parse(b.index_next_attempt_at ?? b.updated_at),
      );
    if (!pending.length) return;
    const document = pending[0];
    const next = Date.parse(
      document.index_next_attempt_at ?? document.updated_at,
    );
    const timer = window.setTimeout(
      async () => {
        if (advancing.current) return;
        advancing.current = true;
        try {
          const response = await fetch(
            `/api/knowledge/${document.id}/continue`,
            { method: "POST" },
          );
          const data = await response.json();
          if (!response.ok)
            throw new Error(data.error ?? "Could not continue indexing.");
          setRecoveryDelay(0);
          if (data.document.status === "ready" && !data.document.error_message)
            setNotice(data.document.name + " is indexed and ready.");
          else if (data.document.error_message)
            setNotice(data.document.error_message);
        } catch (error) {
          setRecoveryDelay(30_000);
          setNotice(
            (error instanceof Error
              ? error.message
              : "Connection interrupted.") + " Saved progress will be retried.",
          );
        } finally {
          advancing.current = false;
          router.refresh();
        }
      },
      Math.max(1000, recoveryDelay, next - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [documents, router, recoveryDelay]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      let body: BodyInit;
      const headers: Record<string, string> = {};
      saveRequest.current ??= crypto.randomUUID();
      headers["Idempotency-Key"] = saveRequest.current;
      if (kind === "file") {
        const fields = new FormData(event.currentTarget);
        const file = fields.get("file");
        if (!(file instanceof File))
          throw new Error("Choose a document to import.");
        validateUpload(file);
        body = fields;
      } else {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(
          kind === "website" ? { kind, url } : { kind, name, text },
        );
      }
      const response = await fetch(
        editing ? "/api/knowledge/" + editing.id : "/api/knowledge",
        { method: editing ? "PATCH" : "POST", headers, body },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (data.document.error_message)
        throw new Error(data.document.error_message);
      if (data.document.status === "failed")
        throw new Error(
          "The source is saved but indexing is paused. Use Re-index to resume.",
        );
      setNotice(
        data.document.status === "processing"
          ? data.document.name +
              " is saved. Indexing will continue automatically here."
          : data.document.name + " is indexed and ready.",
      );
      saveRequest.current = null;
      setEditing(null);
      setText("");
      setUrl("");
      setName("");
      form.current?.reset();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Indexing failed.");
    } finally {
      setBusy(false);
      router.refresh();
    }
  }
  async function reindex(document: KnowledgeDocument) {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(
        "/api/knowledge/" + document.id + "/reindex",
        { method: "POST" },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setNotice(
        data.document.status === "processing"
          ? document.name + " is continuing from saved indexing progress."
          : (data.document.error_message ??
              document.name + " has been re-indexed."),
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Indexing failed.");
    } finally {
      setBusy(false);
      router.refresh();
    }
  }
  async function edit(document: KnowledgeDocument) {
    const source = sources.find((item) => item.id === document.data_source_id);
    if (!source) return;
    setEditing(document);
    setKind(source.kind);
    setName(document.name);
    setUrl(source.locator ?? "");
    setText("");
    setNotice("");
    if (source.kind === "manual") {
      setBusy(true);
      try {
        const response = await fetch("/api/knowledge/" + document.id + "/file");
        if (!response.ok)
          throw new Error("The original knowledge could not be loaded.");
        setText(await response.text());
      } catch (error) {
        setNotice(
          error instanceof Error ? error.message : "Could not load knowledge.",
        );
      } finally {
        setBusy(false);
      }
    }
    form.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      const response = await fetch("/api/knowledge/" + deleting.id, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setNotice("Source, document and indexed chunks deleted.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Delete failed.");
    } finally {
      setBusy(false);
      setDeleting(null);
      router.refresh();
    }
  }
  return (
    <>
      <form
        ref={form}
        onSubmit={submit}
        onChange={() => {
          saveRequest.current = null;
        }}
        className="mb-6 space-y-5 rounded-xl border bg-white p-5 md:p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">
            {editing ? "Update " + editing.name : "Connect company knowledge"}
          </h2>
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setText("");
                setName("");
                setUrl("");
                form.current?.reset();
              }}
              className="text-xs text-muted-foreground"
            >
              Cancel edit
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {(["file", "website", "manual"] as const).map((item) => (
            <Button
              key={item}
              type="button"
              size="sm"
              variant={kind === item ? "default" : "outline"}
              disabled={busy || Boolean(editing)}
              onClick={() => setKind(item)}
            >
              {item === "file"
                ? "Upload document"
                : item === "website"
                  ? "Website URL"
                  : "Write knowledge"}
            </Button>
          ))}
        </div>
        {kind === "file" ? (
          <label className="block rounded-xl border border-dashed bg-[#fbfcf9] p-6 text-sm">
            <Upload className="mb-3 size-5 text-primary" />
            <input
              name="file"
              type="file"
              accept=".pdf,.docx,.txt,.md"
              required
              disabled={busy}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.setCustomValidity("");
                setNotice("");
                if (!file) return;
                try {
                  validateUpload(file);
                } catch (error) {
                  const message =
                    error instanceof Error
                      ? error.message
                      : "Choose a valid document.";
                  event.currentTarget.setCustomValidity(message);
                  setNotice(message);
                }
              }}
              className="w-full text-xs"
            />
            <span className="mt-3 block text-xs text-muted-foreground">
              PDF, DOCX, TXT or Markdown · Up to 4 MB
            </span>
          </label>
        ) : kind === "website" ? (
          <label className="block text-xs">
            Public web page
            <input
              type="url"
              required
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              maxLength={2048}
              disabled={busy}
              className="mt-2 w-full rounded-lg border p-3 text-sm"
              placeholder="https://your-company.com/knowledge"
            />
            <span className="mt-2 block text-[11px] text-muted-foreground">
              Imports this page’s visible text. Re-index to fetch its latest
              content.
            </span>
          </label>
        ) : (
          <>
            <label className="block text-xs">
              Source name
              <input
                required
                minLength={1}
                maxLength={160}
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={busy}
                className="mt-2 w-full rounded-lg border p-3 text-sm"
              />
            </label>
            <label className="block text-xs">
              Knowledge
              <textarea
                required
                minLength={20}
                maxLength={250000}
                rows={8}
                value={text}
                onChange={(event) => setText(event.target.value)}
                disabled={busy}
                className="mt-2 w-full rounded-lg border p-3 text-sm"
              />
            </label>
          </>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">
            Private to your company. Updates replace the previous index
            atomically.
          </p>
          <Button disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="animate-spin" />
                Indexing…
              </>
            ) : (
              "Save & index"
            )}
          </Button>
        </div>
      </form>
      {documents.some((document) => document.status === "processing") && (
        <p
          className="mb-5 text-xs leading-6 text-muted-foreground"
          role="status"
        >
          Indexing continues automatically while this page is open. Progress is
          saved after each batch. If you leave, reopen Company knowledge or use
          Re-index to resume.
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="mb-5 rounded-lg border bg-white p-4 text-xs leading-6"
        >
          {notice}
        </p>
      )}
      <section className="overflow-hidden rounded-xl border bg-white">
        <h2 className="border-b p-5 text-xs font-semibold">
          Connected documents · {documents.length} shown
        </h2>
        {!documents.length ? (
          <EmptyState
            title="No company knowledge yet."
            description="Add a document, web page or written source to start receiving grounded answers."
          />
        ) : (
          <div className="divide-y">
            {documents.map((document) => {
              const source = sources.find(
                (item) => item.id === document.data_source_id,
              );
              return (
                <div
                  key={document.id}
                  className="flex flex-wrap items-center justify-between gap-4 p-5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{document.name}</p>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {source?.kind} · {document.chunk_count} chunks ·{" "}
                      {formatDate(document.updated_at, true)} UTC
                    </p>
                    {source?.locator && (
                      <p className="mt-2 truncate text-[11px] text-muted-foreground">
                        {source.locator}
                      </p>
                    )}
                    {document.error_message && (
                      <p className="mt-2 text-xs leading-6 text-red-700">
                        {document.error_message}
                      </p>
                    )}
                    {document.indexing_token &&
                      Boolean(document.index_total) && (
                        <div
                          className="mt-3 space-y-2 text-xs text-muted-foreground"
                          role="status"
                        >
                          <p>
                            {document.index_completed ?? 0} of{" "}
                            {document.index_total} chunks embedded
                            {document.status === "processing" &&
                            document.index_next_attempt_at &&
                            Date.parse(document.index_next_attempt_at) >
                              Date.parse(document.updated_at) + 2000
                              ? " · waiting for the next batch"
                              : ""}
                          </p>
                          <progress
                            className="h-2 w-full max-w-xs"
                            value={document.index_completed ?? 0}
                            max={document.index_total}
                          />
                        </div>
                      )}
                  </div>
                  <StatusBadge status={document.status} />
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={"Edit " + document.name}
                      disabled={busy || document.status === "processing"}
                      onClick={() => void edit(document)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={"Re-index " + document.name}
                      disabled={busy}
                      onClick={() => void reindex(document)}
                    >
                      <RefreshCw />
                    </Button>
                    <Button asChild size="icon" variant="ghost">
                      <a
                        href={"/api/knowledge/" + document.id + "/file"}
                        aria-label={"Download " + document.name}
                      >
                        <Download />
                      </a>
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={"Delete " + document.name}
                      disabled={busy}
                      onClick={() => setDeleting(document)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Delete this knowledge source?</DialogTitle>
          <DialogDescription>
            {deleting?.name} and its indexed knowledge will be removed. Saved
            conversation excerpts remain historical records.
          </DialogDescription>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => void remove()}
          >
            Delete source
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
