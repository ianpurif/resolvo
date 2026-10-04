import { configuration } from "../lib/config";
import { database, checkDatabaseError } from "../lib/supabase/server";
import { reindexDocument } from "../lib/rag/ingest";
import type { KnowledgeDocument } from "../types";

async function main() {
  if (!configuration().databaseReady || !process.env.VOYAGE_API_KEY?.trim()) {
    throw new Error("Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and VOYAGE_API_KEY in .env.local first.");
  }
  const db = database();
  let count = 0;
  // Process one failed document at a time. Successful documents are skipped on rerun.
  // Stop on failure so an unsuccessful document cannot cause an infinite retry loop.
  while (true) {
    const pending = await db.from("documents").select("*").eq("status", "failed")
      .order("created_at").order("id").limit(1).maybeSingle();
    checkDatabaseError(pending.error, "read knowledge awaiting re-indexing");
    if (!pending.data) break;
    const document = pending.data as KnowledgeDocument;
    const original = await db.storage.from("support-documents").download(document.file_path);
    checkDatabaseError(original.error, "download the original knowledge file");
    if (!original.data) throw new Error("The original knowledge file is missing. Delete and upload the document again.");
    const filename = document.file_path.split("/").at(-1)!;
    const result = await reindexDocument(document, new File([original.data], filename, { type: document.mime_type }));
    console.log(`Re-indexed: ${result.name} (${result.chunk_count} chunks)`);
    count++;
  }
  console.log(`Re-indexing complete: ${count} documents.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Knowledge re-indexing failed.");
  process.exitCode = 1;
});
