import "server-only";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { database } from "@/lib/supabase/server";
import { embeddings } from "./embeddings";

export function vectorStore(inputType: "document" | "query") {
  return new SupabaseVectorStore(embeddings(inputType), {
    client: database(),
    tableName: "document_chunks",
    queryName: "match_document_chunks",
    upsertBatchSize: 32,
  });
}
