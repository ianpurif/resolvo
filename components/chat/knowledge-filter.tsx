"use client";
import { useState } from "react";
import { Filter, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { KnowledgeFilter as FilterValue } from "@/lib/validations";
type Choice = { id: string; title: string; platform: string };
export function KnowledgeFilter({ value, onChange, disabled }: { value: FilterValue; onChange: (value: FilterValue) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false), [sources, setSources] = useState<Choice[]>([]), [more, setMore] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const active = Boolean(value.platforms?.length || value.documentIds?.length);
  async function load(offset = 0) {
    setBusy(true); setError("");
    try { const response = await fetch(`/api/knowledge/sources?offset=${offset}`); const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setSources((old) => offset ? [...old, ...data.sources] : data.sources); setMore(data.hasMore);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load sources."); } finally { setBusy(false); }
  }
  function toggle(key: "platforms" | "documentIds", id: string) {
    const previous = value[key] ?? [], next = previous.includes(id) ? previous.filter((v) => v !== id) : [...previous, id];
    onChange({ ...value, [key]: next });
  }
  return <>
    <button type="button" disabled={disabled} onClick={() => { setOpen(true); void load(); }} className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent disabled:opacity-50"><Filter className="size-3.5" />{active ? "Filtered knowledge" : "All knowledge sources"}</button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-lg"><DialogTitle>Choose knowledge sources</DialogTitle><DialogDescription>Answers use selected platforms and sources together. Leave both empty to search all knowledge you can access.</DialogDescription>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="max-h-[55dvh] space-y-4 overflow-auto">
        <fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold">Platforms</legend>{[...new Set(sources.map((s) => s.platform))].sort().map((platform) => <label key={platform} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.platforms?.includes(platform) ?? false} onChange={() => toggle("platforms", platform)} />{platform === "uploads" ? "Uploaded & written knowledge" : platform.replaceAll("-", " ")}</label>)}</fieldset>
        <fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold">Individual sources</legend>{sources.filter((s) => !value.platforms?.length || value.platforms.includes(s.platform)).map((s) => <label key={s.id} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={value.documentIds?.includes(s.id) ?? false} onChange={() => toggle("documentIds", s.id)} /><span>{s.title}</span></label>)}</fieldset>
        {!sources.length && !busy && <p className="text-sm text-muted-foreground">No indexed sources are available yet.</p>}
        {more && <Button variant="outline" disabled={busy} onClick={() => void load(sources.length)}>Load more sources</Button>}
        {busy && <Loader2 className="size-4 animate-spin" />}
      </div>
      <div className="flex justify-between"><Button variant="outline" onClick={() => onChange({})}>Clear filters</Button><Button onClick={() => setOpen(false)}>Done</Button></div>
    </DialogContent></Dialog>
  </>;
}
