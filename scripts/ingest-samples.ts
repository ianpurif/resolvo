import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { configuration } from "../lib/config";
import { database, checkDatabaseError } from "../lib/supabase/server";
import { ingestDocument } from "../lib/rag/ingest";

async function main() {
  const config = configuration();
  if (!config.databaseReady || !process.env.VOYAGE_API_KEY?.trim()) throw new Error("Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and VOYAGE_API_KEY in .env.local first.");
  const folder = resolve(process.cwd(), "sample-data");
  const existing = await database().from("documents").select("name,status");
  checkDatabaseError(existing.error, "check existing knowledge");
  for (const filename of (await readdir(folder)).filter((name) => name.endsWith(".md")).sort()) {
    const bytes = await readFile(resolve(folder, filename));
    const title = bytes.toString("utf8").match(/^#\s+(.+)$/m)?.[1];
    if (existing.data?.some((document) => document.name === title && document.status === "ready")) {
      console.log(`Already indexed: ${title}`); continue;
    }
    const result = await ingestDocument(new File([bytes], filename, { type: "text/markdown" }));
    console.log(`Indexed: ${result.name} (${result.chunk_count} chunks)`);
  }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Sample ingestion failed."); process.exitCode = 1; });
