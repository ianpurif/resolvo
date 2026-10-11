import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

export const INDEX_POLICY_VERSION = 2;
export interface KnowledgeChunk {
  content: string;
  chunk_index: number;
  start_offset: number;
  end_offset: number;
  section: string | null;
}
// Preserve the established size/overlap. Metadata comes solely from source text.
export async function splitKnowledge(text: string): Promise<KnowledgeChunk[]> {
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1200, chunkOverlap: 200 });
  const contents = await splitter.splitText(text);
  const headings = [...text.matchAll(/^#{1,6}\s+(.+)$/gm)].map((match) => ({ offset: match.index, title: match[1].trim().slice(0, 160) }));
  let previous = -1;
  return contents.map((content, chunk_index) => {
    const start_offset = text.indexOf(content, previous + 1);
    if (start_offset < 0) throw new Error("Chunk is not an exact source span.");
    previous = start_offset;
    return { content, chunk_index, start_offset, end_offset: start_offset + content.length,
      section: headings.filter((heading) => heading.offset <= start_offset).at(-1)?.title ?? null };
  });
}
