import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { AppError } from "@/lib/config";
import { normalizeText } from "@/lib/rag/ingest";
import { splitKnowledge } from "@/lib/rag/chunks";
import { selectEmbeddingBatch, tokenCounts } from "@/lib/rag/embedding-policy";
import { embedBatch, EmbeddingDeferred, EmbeddingFailure } from "@/lib/rag/embeddings";
import { integrationDatabase, integrationError } from "./database";
import { connectorContext } from "./service";
import { connector } from "./registry";
import { ConnectorError } from "./http";
import { sourceUrl } from "./provider-utils";
import type { Connection, RemoteDocument, RemoteItem } from "./types";
type Task = { id: string; attempts: number; payload: { type: "list" | "read" | "index"; id: string; name?: string; cursor?: string; meta?: Record<string, unknown> } };
type Item = { id: string; document_id: string | null; remote_version: string | null; content_hash: string | null };
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
export function syncTasks(items: RemoteItem[], parent: string, cursor?: string) {
  const tasks = items.map((i) => ({ key: `source:${createHash("md5").update(i.id).digest("hex")}`, payload: { type: i.kind === "container" ? "list" : "read", id: i.id, name: i.name } }));
  if (cursor) tasks.push({ key: `page:${hash(`${parent}\0${cursor}`)}`, payload: { type: "list", id: parent, name: "", cursor } } as typeof tasks[number]);
  return tasks;
}
export function contentIdentity(document: RemoteDocument) {
  const text = document.text === undefined ? undefined : normalizeText(document.text);
  if (text !== undefined && (text.length < 20 || text.length > 250000)) throw new AppError("Select a source with 20 to 250,000 readable characters. Split larger sources before indexing.", 422);
  return { text, hash: text === undefined ? undefined : hash(text), name: document.name.slice(0, 160), url: sourceUrl(document.url), version: document.version };
}
export async function syncOne(connectionId?: string) {
  const db = integrationDatabase();
  const claimed = await db.rpc("claim_integration", { p_connection: connectionId ?? null }); integrationError(claimed.error);
  if (!claimed.data) return false;
  const { connection, task } = claimed.data as { connection: Connection; task: Task };
  const step = async (action: string, data: object = {}) => {
    const result = await db.rpc("integration_step", { p_connection: connection.id, p_lease: connection.lease, p_task: task.id, p_action: action, p_data: data });
    integrationError(result.error); return result.data;
  };
  try {
    if (task.payload.type === "index") {
      const index = await step("claim-index");
      if (!index.claimed) {
        if (!index.document.indexing_token && index.document.status === "ready") await step("index-published");
        else await step("wait", { delay: Math.max(2, Math.ceil((Date.parse(index.document.index_next_attempt_at ?? "") - Date.now()) / 1000) || 10) });
        return true;
      }
      const job = index.job as { completed: number; manifest: { content: string; token_count: number }[] };
      try {
        const batch = selectEmbeddingBatch(job.manifest.slice(job.completed));
        // A large source can wait across several budget windows. Revalidate it
        // before publication so a removed or newer revision is not resurrected.
        if (job.completed + batch.chunks.length === job.manifest.length) {
          const current = contentIdentity(await connector(connection.provider).read(await connectorContext(connection), task.payload.id, task.payload.meta?.version as string | undefined));
          if (current.text !== undefined && current.hash !== task.payload.meta?.hash) {
            await step("restart"); return true;
          }
        }
        const vectors = await embedBatch(batch.chunks.map((c) => c.content), "document");
        await step("checkpoint", { offset: job.completed, vectors });
      } catch (error) {
        if (error instanceof EmbeddingDeferred) await step("defer-index", { delay: Math.min(2147483647, Math.ceil(error.waitMs)), error: "Waiting for the shared embedding budget." });
        else throw error;
      }
      return true;
    }
    const provider = connector(connection.provider), ctx = await connectorContext(connection);
    if (task.payload.type === "list") {
      const page = await provider.list(ctx, task.payload.id, task.payload.cursor);
      if (page.cursor && page.cursor === task.payload.cursor) throw new AppError("The provider repeated its pagination cursor. Retry after correcting its API mapping.", 422);
      await step("listed", { tasks: syncTasks(page.items, task.payload.id, page.cursor) });
    } else {
      const found = await db.from("integration_items").select("id,document_id,remote_version,content_hash").eq("connection_id", connection.id).eq("organization_id", connection.organization_id).eq("external_id", task.payload.id).maybeSingle();
      integrationError(found.error); const saved = found.data as Item | null;
      const pending = saved?.document_id ? await db.from("document_index_jobs").select("revision,content_hash,file_path").eq("document_id", saved.document_id).eq("organization_id", connection.organization_id).maybeSingle() : null;
      if (pending) integrationError(pending.error);
      const read = contentIdentity(await provider.read(ctx, task.payload.id, saved?.document_id && saved.content_hash && !pending?.data ? saved.remote_version ?? undefined : undefined));
      if (saved?.document_id && saved.content_hash && !pending?.data && (read.text === undefined || saved.content_hash === read.hash)) {
        await step("unchanged", read); return true;
      }
      if (!read.text || !read.hash) throw new AppError("The provider returned no content for a new source.", 502);
      const itemId = saved?.id ?? randomUUID(), documentId = saved?.document_id ?? itemId;
      const samePending = pending?.data?.content_hash === read.hash;
      const revision = samePending ? pending!.data!.revision : randomUUID();
      const path = `organizations/${connection.organization_id}/documents/${documentId}/${revision}/source.md`;
      const chunks = await splitKnowledge(read.text), counts = await tokenCounts(chunks.map((c) => c.content));
      const bytes = Buffer.from(read.text);
      if (!samePending) {
        const uploaded = await db.storage.from("support-documents").upload(path, bytes, { contentType: "text/markdown", upsert: false }); integrationError(uploaded.error);
      }
      try {
        await step("prepare", { ...read, text: undefined, itemId, revision, path, size: bytes.length, manifest: chunks.map((c, n) => ({ ...c, token_count: counts[n] })) });
      } catch (error) {
        // A response can be lost after commit. Only queue files positively known
        // to be unreferenced; cleanup rechecks both tables before removal.
        if (!samePending) await db.from("integration_file_gc").upsert({ path });
        throw error;
      }
    }
    return true;
  } catch (error) {
    if (error instanceof AppError && !(error instanceof EmbeddingFailure) && error.status === 404) await step("missing");
    else if (error instanceof AppError && !(error instanceof EmbeddingFailure) && [400,413,422].includes(error.status) && task.payload.type !== "list") await step("rejected", { error: error.message });
    else if (error instanceof AppError && error.status === 409) await step("wait", { delay: 15 }).catch(() => {});
    else {
      const status = error instanceof AppError ? error.status : 502;
      const message = error instanceof AppError ? error.message : "The connector failed to read this source. Check its configuration and permissions.";
      const retry = error instanceof ConnectorError ? error.retryAfter : error instanceof EmbeddingFailure && error.retryAfterMs ? error.retryAfterMs / 1000 : Math.min(3600, 30 * 2 ** task.attempts);
      await step("error", { error: message, delay: Math.ceil(retry), reauth: !(error instanceof EmbeddingFailure) && (status === 401 || status === 403) }).catch(() => {});
    }
    return true;
  }
}
export async function cleanIntegrationFiles() {
  const db = integrationDatabase(), result = await db.from("integration_file_gc").select("path").order("created_at").limit(20);
  integrationError(result.error);
  for (const { path } of result.data ?? []) {
    if (!/^organizations\/[0-9a-f-]{36}\/documents\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[^/]+$/.test(path)) continue;
    const [doc, job] = await Promise.all([db.from("documents").select("id").eq("file_path", path).limit(1), db.from("document_index_jobs").select("document_id").eq("file_path", path).limit(1)]);
    if (doc.error || job.error) continue;
    if (doc.data.length || job.data.length) { await db.from("integration_file_gc").delete().eq("path", path); continue; }
    const removed = await db.storage.from("support-documents").remove([path]);
    if (!removed.error) await db.from("integration_file_gc").delete().eq("path", path);
  }
}
