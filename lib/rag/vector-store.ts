import "server-only";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { embeddings } from "./embeddings";
import type { TenantContext } from "@/lib/auth";
export function vectorStore(context: TenantContext) {
  return new SupabaseVectorStore(embeddings("query"), {
    client: context.db,
    tableName: "document_chunks",
    queryName: "match_document_chunks",
    filter: { organizationId: context.organization.id },
  });
}
