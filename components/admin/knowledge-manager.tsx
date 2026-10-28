"use client";
import { useState, useRef, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { friendlyError } from "@/lib/client-errors";
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
  canManage = true,
}: {
  documents: KnowledgeDocument[];
  sources: DataSource[];
  canManage?: boolean;
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [kind, setKind] = useState<DataSource["kind"]>("file");
  const [busy, setBusy] = useState(false);
  function setNotice(
    message: string,
    kind: "success" | "error" | "warning" = "error",
  ) {
    if (message) toast[kind](message, { id: "knowledge-notice" });
    else toast.dismiss("knowledge-notice");
  }
  const [editing, setEditing] = useState<KnowledgeDocument | null>(null);
  const [deleting, setDeleting] = useState<KnowledgeDocument | null>(null);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const saveRequest = useRef<string | null>(null);
  const advancing = useRef(false);
  const [recoveryDelay, setRecoveryDelay] = useState(0);
  useEffect(() => {
    if (!canManage) return;
    const pending = documents
      .filter(
        (document) =>
          document.status === "processing" && document.indexing_token && !document.integration_connection_id,
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
            setNotice(data.document.name + " is indexed and ready.", "success");
          else if (data.document.error_message)
            setNotice(data.document.error_message);
        } catch (error) {
          setRecoveryDelay(30_000);
          setNotice(
            friendlyError(error, "Connection interrupted.") +
              " Saved progress will be retried.",
            "warning",
          );
        } finally {
          advancing.current = false;
          router.refresh();
        }
      },
      Math.max(1000, recoveryDelay, next - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [documents, router, recoveryDelay, canManage]);
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
        "success",
      );
      saveRequest.current = null;
      setEditing(null);
      setText("");
      setUrl("");
      setName("");
      form.current?.reset();
    } catch (error) {
      setNotice(
        friendlyError(
          error,
          "Could not save knowledge. Check your connection and try again.",
        ),
      );
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
        data.document.error_message ? "warning" : "success",
      );
    } catch (error) {
      setNotice(
        friendlyError(
          error,
          "Could not resume indexing. Check your connection and try again.",
        ),
      );
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
          friendlyError(
            error,
            "Could not load knowledge. Check your connection and try again.",
          ),
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
      setNotice("Knowledge source deleted.", "success");
      setDeleting(null);
    } catch (error) {
      setNotice(
        friendlyError(
          error,
          "Could not delete this source. Check your connection and try again.",
        ),
      );
    } finally {
      setBusy(false);
      router.refresh();
    }
  }
  return (
    <>
      <div className="knowledge-layout">
        <div>
          {canManage ? (
            <form
              ref={form}
              onSubmit={submit}
              onChange={() => {
                saveRequest.current = null;
              }}
              className="knowledge-form space-y-5"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold tracking-tight">
                  {editing
                    ? "Update " + editing.name
                    : "Connect company knowledge"}
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
              <div className="source-tabs" aria-label="Knowledge source type">
                {(["file", "website", "manual"] as const).map((item) => (
                  <Button
                    key={item}
                    type="button"
                    size="sm"
                    variant={kind === item ? "default" : "outline"}
                    disabled={busy || Boolean(editing)}
                    aria-pressed={kind === item}
                    onClick={() => {
                      setKind(item);
                      saveRequest.current = null;
                    }}
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
                <label className="upload-zone">
                  <Upload
                    className="mb-4 size-6 text-primary"
                    strokeWidth={1.5}
                  />
                  <span className="mb-5 text-sm font-medium">
                    Choose a file to connect
                  </span>
                  <input
                    key="file"
                    name="file"
                    type="file"
                    accept=".pdf,.docx,.txt,.md,.csv,.tsv,.json"
                    required
                    disabled={busy}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      event.currentTarget.setCustomValidity("");
                      saveRequest.current = null;
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
                    PDF, DOCX, TXT, Markdown, CSV, TSV or JSON · Up to 4 MB
                  </span>
                </label>
              ) : kind === "website" ? (
                <label className="field-label">
                  Public web page
                  <input
                    key="website"
                    type="url"
                    required
                    value={url}
                    onChange={(event) => {
                      setUrl(event.target.value);
                      saveRequest.current = null;
                    }}
                    maxLength={2048}
                    disabled={busy}
                    className="field"
                    placeholder="https://your-company.com/knowledge"
                  />
                  <span className="mt-2 block text-[11px] text-muted-foreground">
                    Imports this page’s visible text. Re-index to fetch its
                    latest content.
                  </span>
                </label>
              ) : (
                <>
                  <label className="field-label">
                    Source name
                    <input
                      required
                      minLength={1}
                      maxLength={160}
                      value={name}
                      onChange={(event) => {
                        setName(event.target.value);
                        saveRequest.current = null;
                      }}
                      disabled={busy}
                      className="field"
                    />
                  </label>
                  <label className="field-label">
                    Knowledge
                    <textarea
                      required
                      minLength={20}
                      maxLength={250000}
                      rows={8}
                      value={text}
                      onChange={(event) => {
                        setText(event.target.value);
                        saveRequest.current = null;
                      }}
                      disabled={busy}
                      className="field"
                    />
                  </label>
                </>
              )}
              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-dashed pt-5">
                <p className="text-[11px] text-muted-foreground">
                  Only members of your company can access these sources.
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
          ) : (
            <p className="mb-6 text-sm text-muted-foreground">
              You can read company knowledge. Workspace owners manage sources
              and indexing.
            </p>
          )}
          {documents.some((document) => document.status === "processing") && (
            <p
              className="mt-4 text-xs leading-6 text-muted-foreground"
              role="status"
            >
              Keep this page open while indexing. Progress is saved if you
              leave.
            </p>
          )}
        </div>
        <section className="surface">
          <h2 className="surface-heading">
            Connected sources{" "}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {documents.length}
            </span>
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
                  <div key={document.id} className="knowledge-source">
                    <div className="knowledge-source-heading">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium break-words">
                          {document.name}
                        </p>
                        <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                          {document.chunk_count} chunks ·{" "}
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
                                aria-label={
                                  "Indexing progress for " + document.name
                                }
                                className="h-2 w-full max-w-xs"
                                value={document.index_completed ?? 0}
                                max={document.index_total}
                              />
                            </div>
                          )}
                      </div>
                      <StatusBadge status={document.status} />
                    </div>
                    <div className="knowledge-source-actions">
                      <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                        {document.integration_connection_id ? "Connected source" : source?.kind === "manual"
                          ? "Written knowledge"
                          : source?.kind === "website"
                            ? "Web page"
                            : "Document"}
                      </span>
                      <div className="flex items-center gap-0.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={"Edit " + document.name}
                          disabled={
                            !canManage ||
                            Boolean(document.integration_connection_id) ||
                            busy ||
                            document.status === "processing"
                          }
                          onClick={() => void edit(document)}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={"Re-index " + document.name}
                          disabled={!canManage || busy || Boolean(document.integration_connection_id)}
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
                          disabled={!canManage || busy || Boolean(document.integration_connection_id)}
                          onClick={() => setDeleting(document)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
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
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy ? "Deleting…" : "Delete source"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
