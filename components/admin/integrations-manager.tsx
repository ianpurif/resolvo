"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, Check, ChevronRight, Folder, Loader2, Plug, RefreshCw, Search, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { Connector, ConnectorAuth, Connection, RemoteItem, RemotePage } from "@/lib/integrations/types";
type Platform = Omit<Connector, "list" | "read"> & { oauthConfigured: boolean };
type Summary = Pick<Connection, "id" | "provider" | "name" | "visibility" | "status" | "sync_interval_minutes" | "next_sync_at" | "last_sync_at" | "last_error" | "generation">;
type Detail = { connection: Summary; selections: { external_id: string; name: string; kind: RemoteItem["kind"] }[]; items: { id: string; name: string; source_url?: string; document_id?: string; last_error?: string }[]; total: number; progress: { total: number; completed: number; indexed: number } };
const inputClass = "w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/25";
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init }); const data = await response.json();
  if (!response.ok) throw new Error(data.error || "The integration request failed."); return data as T;
}
function body(method: string, value: unknown): RequestInit { return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) }; }
function failure(error: unknown) { toast.error(error instanceof Error ? error.message : "Could not complete this operation."); }
export function IntegrationsManager() {
  const [platforms, setPlatforms] = useState<Platform[]>([]), [connections, setConnections] = useState<Summary[]>([]), [total, setTotal] = useState(0);
  const [ready, setReady] = useState(false), [canShare, setCanShare] = useState(false), [error, setError] = useState(""), [loading, setLoading] = useState(true), [search, setSearch] = useState("");
  const [creating, setCreating] = useState<Platform | null>(null), [authMode, setAuthMode] = useState<ConnectorAuth>("token"), [busy, setBusy] = useState(false);
  const [active, setActive] = useState<string | null>(null), [detail, setDetail] = useState<Detail | null>(null), [disconnecting, setDisconnecting] = useState<Summary | null>(null);
  const [browser, setBrowser] = useState<RemotePage>({ items: [] }), [browsing, setBrowsing] = useState(false), [trail, setTrail] = useState<RemoteItem[]>([]), [selection, setSelection] = useState<RemoteItem[]>([]), [browseError, setBrowseError] = useState("");
  const advancing = useRef(false), activeRef = useRef(active);
  const refresh = useCallback(async (offset = 0) => {
    try {
      const data = await api<{ connections: Summary[]; total: number; ready: boolean; canShare: boolean; platforms: Platform[] }>(`/api/integrations?offset=${offset}`);
      setConnections((old) => offset ? [...old, ...data.connections] : data.connections); setTotal(data.total); setPlatforms(data.platforms); setReady(data.ready); setCanShare(data.canShare); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load integrations."); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void Promise.resolve().then(() => refresh()); const oauth = new URLSearchParams(window.location.search).get("oauth"); if (oauth) { toast[oauth === "connected" ? "success" : "error"](oauth === "connected" ? "Account connected. Choose the sources to synchronize." : "OAuth connection failed or expired. Check the provider setup and try again."); window.history.replaceState(null, "", "/admin/integrations"); } }, [refresh]);
  const loadDetail = useCallback(async (id: string, initialize = false) => {
    const data = await api<Detail>(`/api/integrations/${id}`);
    if (activeRef.current && activeRef.current !== id) return data;
    setDetail(data); setConnections((old) => old.map((c) => c.id === id ? data.connection : c));
    if (initialize) setSelection(data.selections.map((s) => ({ id: s.external_id, name: s.name, kind: s.kind })));
    return data;
  }, []);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      if (advancing.current) return; advancing.current = true;
      void (async () => {
        try { const d = await loadDetail(active); if (["connected", "error"].includes(d.connection.status) && (d.connection.generation || Date.parse(d.connection.next_sync_at) <= Date.now())) {
          await api(`/api/integrations/${active}/sync?advance=true`, { method: "POST" }); await loadDetail(active);
        } } catch (e) { failure(e); } finally { advancing.current = false; }
      })();
    }, 5000);
    return () => clearInterval(timer);
  }, [active, loadDetail]);
  async function browse(id: string, path: RemoteItem[], cursor?: string) {
    setBrowsing(true); setBrowseError("");
    try { const query = new URLSearchParams(); if (path.length) query.set("parent", path.at(-1)!.id); if (cursor) query.set("cursor", cursor);
      const page = await api<RemotePage>(`/api/integrations/${id}/sources?${query}`);
      if (activeRef.current === id) { setBrowser((old) => ({ ...page, items: cursor ? [...old.items, ...page.items] : page.items })); setTrail(path); }
    } catch (e) { setBrowseError(e instanceof Error ? e.message : "Could not browse sources."); } finally { setBrowsing(false); }
  }
  async function openConnection(c: Summary) {
    activeRef.current = c.id; setActive(c.id); setDetail(null); setBrowser({ items: [] }); setTrail([]);
    try { await loadDetail(c.id, true); if (c.status !== "disconnected") await browse(c.id, []); } catch (e) { failure(e); }
  }
  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!creating) return; setBusy(true);
    try {
      const form = new FormData(event.currentTarget), config = Object.fromEntries(creating.fields.map((f) => [f.key, String(form.get(`config.${f.key}`) ?? "").trim()]).filter(([, value]) => value));
      const authentication: Record<string, unknown> = { mode: authMode };
      if (authMode === "token") authentication.token = form.get("token");
      if (authMode === "basic") { authentication.username = form.get("username"); authentication.password = form.get("password"); }
      if (authMode === "service-account") { const account = JSON.parse(String(form.get("serviceAccount"))); authentication.serviceAccount = { client_email: account.client_email, private_key: account.private_key }; }
      if (form.get("webhookSecret")) authentication.webhookSecret = form.get("webhookSecret");
      if (authMode === "oauth2" && !creating.oauthConfigured) authentication.oauth = { authorizationUrl: form.get("authorizationUrl"), tokenUrl: form.get("tokenUrl"), clientId: form.get("clientId"), clientSecret: form.get("clientSecret"), scope: form.get("scope") };
      const value = { provider: creating.id, name: form.get("name"), config, visibility: form.get("visibility") || "private", authentication };
      if (authMode === "oauth2") { const data = await api<{ authorizationUrl: string }>("/api/integrations/oauth", body("POST", value)); window.location.assign(data.authorizationUrl); return; }
      await api("/api/integrations", body("POST", value)); setCreating(null); await refresh(); toast.success("Account connected. Open it to choose sources.");
    } catch (e) { failure(e); } finally { setBusy(false); }
  }
  async function saveSelection() { if (!active) return; setBusy(true); try { await api(`/api/integrations/${active}/sources`, body("PUT", { items: selection.map(({ id, name, kind }) => ({ id, name, kind })) })); await api(`/api/integrations/${active}/sync`, { method: "POST" }); await loadDetail(active); toast.success("Selection saved. Synchronization started."); } catch (e) { failure(e); } finally { setBusy(false); } }
  async function settings(value: object) { if (!active) return; try { await api(`/api/integrations/${active}`, body("PATCH", value)); await loadDetail(active); } catch (e) { failure(e); } }
  return <div className="space-y-8">
    {error && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">{error} <button onClick={() => void refresh()} className="ml-2 underline">Retry</button></div>}
    {!error && !loading && !ready && <p role="status" className="rounded-xl border bg-muted p-4 text-sm">An administrator must configure the server’s integration encryption key before accounts can be connected.</p>}
    <section aria-label="Connected accounts" className="space-y-3"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Your accounts <span className="text-sm font-normal text-muted-foreground">{total}</span></h2><Button variant="ghost" onClick={() => void refresh()}><RefreshCw className="size-4" />Refresh</Button></div>
      {loading ? <Loader2 className="size-5 animate-spin" /> : !connections.length ? <div className="rounded-2xl border border-dashed p-8 text-center"><Plug className="mx-auto mb-3 size-7 text-primary" /><p className="text-sm">Connect a platform below, then choose what to index.</p></div> : <div className="grid gap-3 md:grid-cols-2">{connections.map((c) => <button key={c.id} onClick={() => void openConnection(c)} className="rounded-xl border bg-card p-5 text-left transition hover:border-primary/40"><div className="flex items-center justify-between gap-3"><span className="font-semibold">{c.name}</span><span className={`rounded-full px-2 py-1 text-[10px] ${c.status === "connected" ? "bg-emerald-50 text-emerald-800" : "bg-muted text-muted-foreground"}`}>{c.generation && c.status === "connected" ? "Syncing" : c.status}</span></div><p className="mt-1 text-xs text-muted-foreground">{platforms.find((p) => p.id === c.provider)?.name ?? c.provider} · {c.visibility === "private" ? "Only you" : "Workspace"}</p><p className="mt-3 text-xs text-muted-foreground">{c.last_sync_at ? `Last synced ${new Date(c.last_sync_at).toLocaleString()}` : "Choose sources to start indexing"}</p>{c.last_error && <p className="mt-2 text-xs text-destructive">{c.last_error}</p>}</button>)}</div>}
      {connections.length < total && <Button variant="outline" onClick={() => void refresh(connections.length)}>Load more accounts</Button>}
    </section>
    <section aria-label="Available platforms"><div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><h2 className="text-lg font-semibold">Connect a platform</h2><label className="flex items-center gap-2 rounded-lg border px-3"><Search className="size-4 text-muted-foreground" /><input aria-label="Search platforms" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a platform or category" className="w-full bg-transparent py-2 text-sm outline-none" /></label></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{platforms.filter((p) => `${p.name} ${p.category} ${p.description}`.toLowerCase().includes(search.toLowerCase())).map((p) => <article key={p.id} className="flex flex-col rounded-xl border bg-card p-5"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{p.category}</p><h3 className="mt-2 font-semibold">{p.name}</h3><p className="mt-2 mb-4 flex-1 text-xs leading-6 text-muted-foreground">{p.description}</p><Button variant="outline" disabled={!ready} onClick={() => { setCreating(p); setAuthMode(p.oauthConfigured ? "oauth2" : p.auth.includes("token") ? "token" : p.auth[0]); }}><Plug className="size-3.5" />Connect {p.name}</Button></article>)}</div>
      <p className="mt-4 text-xs leading-6 text-muted-foreground">Use Custom REST API or MCP for services beyond this catalog. Add multiple accounts for any platform. Automatic sync while this page is closed requires the background worker or a scheduled worker request.</p>
    </section>
    <Dialog open={Boolean(creating)} onOpenChange={(open) => !busy && !open && setCreating(null)}><DialogContent className="max-h-[90dvh] max-w-xl overflow-auto"><DialogTitle>Connect {creating?.name}</DialogTitle><DialogDescription>Selected content is private to you by default. Credentials are encrypted on the server.</DialogDescription><form onSubmit={connect} className="space-y-4">
      <label className="block space-y-1 text-xs font-medium">Account label<input name="name" required maxLength={160} defaultValue={creating?.name} className={inputClass} /></label>
      <label className="block space-y-1 text-xs font-medium">Authentication<select aria-label="Authentication" value={authMode} onChange={(e) => setAuthMode(e.target.value as ConnectorAuth)} className={inputClass}>{creating?.auth.map((mode) => <option key={mode} value={mode}>{mode === "oauth2" ? "OAuth 2.0" : mode === "token" ? "Access token / API key" : mode === "basic" ? "Username & password / API token" : mode === "service-account" ? "Google service account" : "Public access"}</option>)}</select></label>
      {authMode === "token" && <label className="block space-y-1 text-xs font-medium">Access token or API key<input name="token" type="password" required autoComplete="off" className={inputClass} /></label>}
      {authMode === "basic" && <><label className="block space-y-1 text-xs font-medium">Username<input name="username" required autoComplete="off" className={inputClass} /></label><label className="block space-y-1 text-xs font-medium">Password or API token<input name="password" type="password" required autoComplete="off" className={inputClass} /></label></>}
      {authMode === "service-account" && <label className="block space-y-1 text-xs font-medium">Service account JSON<textarea name="serviceAccount" required rows={5} autoComplete="off" className={inputClass} /></label>}
      {authMode === "oauth2" && !creating?.oauthConfigured && <fieldset className="space-y-3 rounded-xl border p-3"><legend className="px-1 text-xs font-semibold">OAuth application settings</legend><p className="text-xs text-muted-foreground">Register this callback: <span className="break-all">{typeof window !== "undefined" ? window.location.origin : ""}/api/integrations/oauth/callback</span></p>{["authorizationUrl", "tokenUrl", "clientId", "clientSecret", "scope"].map((field) => <label key={field} className="block space-y-1 text-xs">{({ authorizationUrl: "Authorization URL", tokenUrl: "Token URL", clientId: "Client ID", clientSecret: "Client secret", scope: "Scopes (space separated)" })[field]}<input name={field} type={field === "clientSecret" ? "password" : "text"} required={["authorizationUrl", "tokenUrl", "clientId"].includes(field)} autoComplete="off" className={inputClass} /></label>)}</fieldset>}
      {creating?.fields.map((field) => <label key={field.key} className="block space-y-1 text-xs font-medium">{field.label}{field.key === "urls" ? <textarea name={`config.${field.key}`} required={field.required} placeholder={field.placeholder} rows={3} className={inputClass} /> : <input name={`config.${field.key}`} required={field.required} placeholder={field.placeholder} className={inputClass} />}</label>)}
      <label className="block space-y-1 text-xs font-medium">Access<select name="visibility" className={inputClass}><option value="private">Only me</option>{canShare && <option value="workspace">Share selected content with workspace members</option>}</select></label>
      <details className="text-xs"><summary className="cursor-pointer font-medium">Optional webhook updates</summary><label className="mt-2 block space-y-1">Webhook signing secret (at least 32 characters)<input name="webhookSecret" type="password" minLength={32} maxLength={256} autoComplete="off" className={inputClass} /></label><p className="mt-2 text-muted-foreground">Configure the same secret in your provider or webhook relay. The account panel shows the endpoint after connecting.</p></details>
      <Button disabled={busy} type="submit" className="w-full">{busy ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />}{authMode === "oauth2" ? "Authorize account" : "Connect account"}</Button>
    </form></DialogContent></Dialog>
    <Dialog open={Boolean(active)} onOpenChange={(open) => { if (!open) { setActive(null); activeRef.current = null; } }}><DialogContent className="max-h-[92dvh] max-w-3xl overflow-auto"><DialogTitle>{detail?.connection.name ?? "Loading account"}</DialogTitle><DialogDescription>Select files or folders to include. Folders include readable descendants and new files discovered during future syncs.</DialogDescription>
      {!detail ? <Loader2 className="size-5 animate-spin" /> : <>
        <div className="grid grid-cols-3 gap-3 rounded-xl bg-muted/50 p-4 text-center"><div><strong>{detail.progress.indexed}</strong><p className="mt-1 text-[10px] text-muted-foreground">Indexed sources</p></div><div><strong>{detail.progress.completed} / {detail.progress.total}</strong><p className="mt-1 text-[10px] text-muted-foreground">Sync steps completed</p></div><div><strong className="text-sm">{detail.connection.status}</strong><p className="mt-1 text-[10px] text-muted-foreground">Connection status</p></div></div>
        {detail.progress.total > 0 && <progress aria-label="Synchronization progress" value={detail.progress.completed} max={detail.progress.total} className="h-2 w-full" />}
        {detail.connection.last_error && <p role="alert" className="text-xs leading-6 text-destructive">{detail.connection.last_error}</p>}
        {detail.connection.status !== "disconnected" && <>
          <div className="flex flex-wrap items-end gap-3"><label className="space-y-1 text-xs">Sync interval<select className={inputClass} value={detail.connection.sync_interval_minutes} onChange={(e) => void settings({ interval: Number(e.target.value) })}>{[15,30,60,180,360,720,1440].map((m) => <option key={m} value={m}>{m < 60 ? `${m} minutes` : `${m / 60} hours`}</option>)}</select></label><label className="space-y-1 text-xs">Who can ask questions<select className={inputClass} value={detail.connection.visibility} onChange={(e) => void settings({ visibility: e.target.value })}><option value="private">Only me</option>{canShare && <option value="workspace">Workspace members</option>}</select></label><Button variant="outline" disabled={busy} onClick={async () => { setBusy(true); try { await api(`/api/integrations/${active}/sync`, { method: "POST" }); await loadDetail(active!); } catch (e) { failure(e); } finally { setBusy(false); } }}><RefreshCw className="size-4" />Sync now</Button></div>
          <div className="rounded-xl border"><div className="flex flex-wrap items-center gap-1 border-b p-3 text-xs"><button onClick={() => void browse(active!, [])} className="font-medium">All sources</button>{trail.map((entry, index) => <span key={index} className="flex items-center gap-1"><ChevronRight className="size-3" /><button onClick={() => void browse(active!, trail.slice(0,index+1))}>{entry.name}</button></span>)}</div><div className="max-h-64 overflow-auto p-2">
            {browseError && <p role="alert" className="p-3 text-xs text-destructive">{browseError}</p>}
            {browser.items.map((entry) => <div key={entry.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/50"><input aria-label={`Select ${entry.name}`} type="checkbox" checked={selection.some((s) => s.id === entry.id)} onChange={() => setSelection((old) => old.some((s) => s.id === entry.id) ? old.filter((s) => s.id !== entry.id) : [...old, entry])} /><span className="min-w-0 flex-1 truncate text-xs">{entry.name}</span>{entry.kind === "container" && <button aria-label={`Open ${entry.name}`} onClick={() => void browse(active!, [...trail, entry])} className="flex items-center gap-1 text-xs text-primary"><Folder className="size-3.5" />Open</button>}{entry.url && <a href={entry.url} target="_blank" rel="noopener noreferrer" aria-label={`Original ${entry.name}`}><ArrowUpRight className="size-3.5" /></a>}</div>)}
            {browsing && <Loader2 className="m-3 size-4 animate-spin" />}{!browser.items.length && !browsing && !browseError && <p className="p-4 text-xs text-muted-foreground">No readable sources are available here. Check the provider’s access permissions.</p>}
            {browser.cursor && <Button variant="ghost" disabled={browsing} onClick={() => void browse(active!, trail, browser.cursor)}>Load more sources</Button>}
          </div></div>
          <div className="space-y-2"><p className="text-xs font-semibold">{selection.length} selected</p><div className="flex max-h-24 flex-wrap gap-2 overflow-auto">{selection.map((s) => <button key={s.id} title="Remove from selection" onClick={() => setSelection((old) => old.filter((i) => i.id !== s.id))} className="rounded-md bg-accent px-2 py-1 text-xs">{s.name} ×</button>)}</div><Button disabled={busy} onClick={() => void saveSelection()}><Check className="size-4" />Save selection & sync</Button></div>
        </>}
        <details className="text-xs"><summary className="cursor-pointer font-semibold">Indexed content ({detail.total})</summary><div className="mt-3 max-h-44 space-y-2 overflow-auto">{detail.items.map((i) => <p key={i.id}>{i.source_url ? <a className="underline" href={i.source_url} target="_blank" rel="noopener noreferrer">{i.name}</a> : i.name}{i.last_error && <span className="ml-2 text-destructive">{i.last_error}</span>}</p>)}{detail.items.length < detail.total && <Button variant="ghost" onClick={async () => { try { const data = await api<Detail>(`/api/integrations/${active}?offset=${detail.items.length}`); setDetail({ ...data, items: [...detail.items, ...data.items] }); } catch (e) { failure(e); } }}>Load more content</Button>}</div></details>
        {detail.connection.status !== "disconnected" && <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"><p className="max-w-md break-all text-[10px] text-muted-foreground">Webhook endpoint: {typeof window !== "undefined" ? window.location.origin : ""}/api/integrations/webhooks/{active}</p><Button variant="outline" onClick={() => setDisconnecting(detail.connection)}><Unplug className="size-4" />Disconnect</Button></div>}
      </>}
    </DialogContent></Dialog>
    <Dialog open={Boolean(disconnecting)} onOpenChange={(open) => !open && setDisconnecting(null)}><DialogContent><DialogTitle>Disconnect {disconnecting?.name}?</DialogTitle><DialogDescription>This removes its saved credentials and indexed sources. Previous answers retain their historical excerpts. Provider consent can also be removed in the provider’s account settings.</DialogDescription><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDisconnecting(null)}>Cancel</Button><Button disabled={busy} onClick={async () => { if (!disconnecting) return; setBusy(true); try { await api(`/api/integrations/${disconnecting.id}`, { method: "DELETE" }); setDisconnecting(null); setActive(null); activeRef.current = null; await refresh(); toast.success("Account disconnected and indexed sources removed."); } catch (e) { failure(e); } finally { setBusy(false); } }}>Disconnect account</Button></div></DialogContent></Dialog>
  </div>;
}
