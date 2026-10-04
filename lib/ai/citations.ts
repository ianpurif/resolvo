import type { Source } from "@/types";

// Only tool-returned source IDs can become UI citations.
export function resolveCitations(text: string, retrieved: Map<string, Source>) {
  const used = new Map<string, Source>();
  const content = text.replace(/\[\[source:([^\]]+)\]\]/g, (_, id: string) => {
    const source = retrieved.get(id);
    if (source) used.set(id, source);
    return "";
  }).replace(/^\s*Sources?:.*$/gim, "").replace(/[ \t]+\n/g, "\n").trim();
  return { content, sources: [...used.values()] };
}
