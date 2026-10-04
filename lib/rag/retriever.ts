import "server-only";
import { z } from "zod";
import { vectorStore } from "./vector-store";
import type { Source } from "@/types";

const metadataSchema = z.object({ documentId: z.uuid(), title: z.string(), source: z.string() });

export async function retrieveKnowledge(query: string) {
  const results = await vectorStore("query").similaritySearchWithScore(query, 5);
  return results.flatMap(([document, score]) => {
    const metadata = metadataSchema.safeParse(document.metadata);
    if (score < 0.35 || !metadata.success) return [];
    const source: Source = { id: metadata.data.documentId, title: metadata.data.title, excerpt: document.pageContent.slice(0, 500) };
    return [{ source, content: document.pageContent }];
  });
}
