"use client";

import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, Trash2, Loader2, CheckCircle2, AlertCircle, X, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "./empty-state";
import { formatDate, cn } from "@/lib/utils";
import { validateUpload } from "@/lib/validations";
import type { KnowledgeDocument } from "@/types";

export function KnowledgeManager({ documents, preview }: { documents: KnowledgeDocument[]; preview: boolean }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<KnowledgeDocument | null>(null);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);

  function selectFile(selected?: File) {
    if (!selected) return;
    try { validateUpload(selected); setFile(selected); setNotice(null); }
    catch (error) { setNotice({ error: true, text: error instanceof Error ? error.message : "Invalid file." }); }
  }
  function drop(event: DragEvent) { event.preventDefault(); setDragging(false); if (!busy && !preview) selectFile(event.dataTransfer.files[0]); }
  async function upload() {
    if (!file || busy) return;
    setBusy(true); setNotice(null);
    try {
      const form = new FormData(); form.append("file", file);
      const response = await fetch("/api/knowledge", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Upload failed.");
      setNotice({ error: false, text: `${data.document.name} is indexed and ready for answers.` });
      setFile(null); if (fileInput.current) fileInput.current.value = "";
    } catch (error) { setNotice({ error: true, text: error instanceof Error ? error.message : "Couldn't upload this file." }); }
    finally { setBusy(false); router.refresh(); }
  }
  async function deleteDocument() {
    if (!deleting || busy) return;
    setBusy(true); setNotice(null);
    try {
      const response = await fetch(`/api/knowledge/${deleting.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Delete failed.");
      setNotice({ error: false, text: `${deleting.name} and its indexed chunks were deleted.` }); setDeleting(null); router.refresh();
    } catch (error) { setNotice({ error: true, text: error instanceof Error ? error.message : "Couldn't delete this document." }); setDeleting(null); }
    finally { setBusy(false); }
  }

  return <>
    <section className="mb-6 rounded-xl border bg-white p-5 md:p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-sm font-medium">Give your assistant something to work with.</h2><p className="mt-2 text-xs text-muted-foreground">Upload policies, guides, and answers your customers can rely on.</p></div><BookOpen className="hidden size-5 text-[#91a18a] sm:block" /></div>
      <div onDragOver={(event) => { event.preventDefault(); if (!preview && !busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop} className={cn("rounded-xl border border-dashed px-5 py-8 text-center", dragging ? "border-primary bg-secondary" : "border-[#d4ddcf] bg-[#fbfcf9]", preview && "opacity-70")}>
        <input type="file" ref={fileInput} id="knowledge-file" accept=".pdf,.txt,.md" disabled={busy || preview} onChange={(event) => selectFile(event.target.files?.[0])} className="sr-only" />
        <span className="mx-auto mb-3 flex size-10 items-center justify-center rounded-xl border bg-white"><Upload className="size-4 text-primary" /></span>
        {file ? <div className="flex items-center justify-center gap-2 text-xs font-medium"><FileText className="size-3.5" />{file.name}<button aria-label="Clear selected file" disabled={busy} onClick={() => { setFile(null); if (fileInput.current) fileInput.current.value = ""; }}><X className="size-3.5 text-muted-foreground" /></button></div> : <p className="text-xs"><button type="button" disabled={preview || busy} onClick={() => fileInput.current?.click()} className="font-medium text-primary underline decoration-primary/30 underline-offset-4 disabled:cursor-default">Choose a file</button><span className="text-muted-foreground"> or drag it here</span></p>}
        <p className="mt-2 text-[10px] text-muted-foreground">PDF, TXT, or Markdown · Up to 4 MB · Text-based documents</p>
        {preview && <p className="mt-3 text-[11px] text-[#897957]">Connect your workspace to start uploading.</p>}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-[10px] text-muted-foreground">Documents are split, embedded, and made searchable automatically.</p><Button size="sm" disabled={!file || busy || preview} onClick={() => void upload()}>{busy && !deleting ? <><Loader2 className="animate-spin" />Indexing document…</> : <><Upload />Upload & index</>}</Button></div>
    </section>
    {notice && <div role={notice.error ? "alert" : "status"} className={cn("mb-5 flex items-center gap-2 rounded-lg border p-3 text-xs leading-6", notice.error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>{notice.error ? <AlertCircle className="size-4 shrink-0" /> : <CheckCircle2 className="size-4 shrink-0" />}{notice.text}</div>}
    <section className="overflow-hidden rounded-xl border bg-white"><div className="flex items-center justify-between border-b px-5 py-4"><h2 className="text-xs font-semibold">{preview ? "Sample knowledge files" : "Your documents"}<span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{documents.length}</span></h2><span className="text-[10px] text-muted-foreground">{preview ? "Included in sample-data/" : "Company source of truth"}</span></div>
      {documents.length === 0 ? <EmptyState title="Every good answer starts with knowledge." description="Upload your first policy or guide to give your assistant a trusted source." /> : <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="border-b bg-[#fbfcf9] text-[10px] font-medium text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Document</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Chunks</th><th className="px-4 py-3 font-medium">Added</th><th className="px-5 py-3"><span className="sr-only">Actions</span></th></tr></thead><tbody className="divide-y">{documents.map((document) => <tr key={document.id}><td className="min-w-[220px] px-5 py-4"><div className="flex items-center gap-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-muted/40"><FileText className="size-4 text-[#8d9b85]" /></span><div><div className="font-medium">{document.name}</div><div className="mt-1 text-[10px] text-muted-foreground">{document.mime_type.split("/").at(-1)?.toUpperCase()}{!preview && ` · ${(document.size_bytes / 1024).toFixed(1)} KB`}</div>{document.error_message && <p className="mt-2 max-w-sm text-[10px] leading-5 text-red-600">{document.error_message}</p>}</div></div></td><td className="px-4 py-4"><StatusBadge status={document.status} preview={preview} /></td><td className="px-4 py-4 text-muted-foreground">{preview ? "Not indexed" : document.chunk_count}</td><td className="px-4 py-4 whitespace-nowrap text-muted-foreground">{preview ? "Sample" : formatDate(document.created_at)}</td><td className="px-5 py-4"><Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-red-600" aria-label={`Delete ${document.name}`} disabled={preview || busy} onClick={() => setDeleting(document)}><Trash2 className="size-3.5" /></Button></td></tr>)}</tbody></table></div>}
    </section>
    <Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !busy) setDeleting(null); }}><DialogContent><DialogTitle className="text-lg font-semibold">Delete this document?</DialogTitle><DialogDescription className="text-sm leading-7 text-muted-foreground">“{deleting?.name}” and its searchable chunks will be permanently removed. Future answers will no longer use this source. Previous conversation citations are kept as historical excerpts.</DialogDescription><div className="flex justify-end gap-2"><DialogClose asChild><Button variant="outline" disabled={busy}>Keep document</Button></DialogClose><Button variant="destructive" disabled={busy} onClick={() => void deleteDocument()}>{busy && <Loader2 className="animate-spin" />}Delete document</Button></div></DialogContent></Dialog>
  </>;
}
