import type { Source } from "@/types";
import { z } from "zod";

export class CitationValidationError extends Error {
  constructor(public readonly reason: "unknown_source" | "uncited_claim") {
    super("The answer could not be grounded in the selected evidence.");
  }
}

export function citationMap(sources: Source[]) {
  const map = new Map<string, Source>();
  const documents = new Map<string, Source[]>();
  for (const source of sources) {
    map.set(source.chunkId ?? source.id, source);
    documents.set(source.id, [...(documents.get(source.id) ?? []), source]);
  }
  // Older integrations may cite document IDs. An alias is safe only when a
  // single selected passage establishes exactly which excerpt was used.
  for (const [id, passages] of documents) if (passages.length === 1) map.set(id, passages[0]);
  return map;
}
const uncertainty = /^(?:I (?:don't|do not|cannot|can't) (?:know|find|determine|confirm|verify|have)|(?:(?:The|Your|Our|These) )?(?:(?:provided|retrieved|selected|indexed|available) )?(?:sources?|evidence|knowledge|documents?|passages?).{0,80}(?:do not|don't|does not|doesn't|lack|insufficient|not (?:provide|contain|specify|state|establish)))/i;
export function inspectCitationGrounding(text: string, retrieved: Map<string, Source>) {
  const unknown = [...text.matchAll(/\[\[source:([^\]]+)\]\]/g)].filter((m) => !retrieved.has(m[1]));
  const paragraphs = text.trim().split(/\n\s*\n|\n(?=\s*(?:[-*+] |\d+\. ))/).filter(Boolean);
  let uncited = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    const block = paragraphs[i].trim();
    if (/^#{1,6}\s+[^\n]+$/.test(block) || /^\[\[source:[^\]]+\]\](?:\s*\[\[source:[^\]]+\]\])*[.\s]*$/.test(block)) continue;
    const next = paragraphs[i + 1]?.trim() ?? "";
    const cited = [...(block + (/^\[\[source:/.test(next) ? next : "")).matchAll(/\[\[source:([^\]]+)\]\]/g)].some((m) => retrieved.has(m[1]));
    // A colon-ended list introduction belongs to its following list. Every
    // item must carry a known citation; do not invent or attach a source to
    // the caption. This accepts normal Markdown group citation placement.
    const listItems: string[] = [];
    if (block.endsWith(":")) for (const paragraph of paragraphs.slice(i + 1)) {
      if (!/^\s*(?:[-*+] |\d+\. )/.test(paragraph)) break;
      listItems.push(paragraph);
    }
    const citedList = listItems.length > 0 && listItems.every((item) => [...item.matchAll(/\[\[source:([^\]]+)\]\]/g)].some((m) => retrieved.has(m[1])));
    if (!cited && !citedList && !uncertainty.test(block)) uncited++;
  }
  return { unknown: unknown.length, uncited };
}

// Provenance/placement validation is structural, not a claim of semantic
// entailment. Independent evaluations must check the actual cited text.
export function resolveCitations(text: string, retrieved: Map<string, Source>, options: { strict?: boolean; numbered?: boolean } = {}) {
  if (options.strict) {
    const audit = inspectCitationGrounding(text, retrieved);
    if (audit.unknown) throw new CitationValidationError("unknown_source");
    if (audit.uncited) throw new CitationValidationError("uncited_claim");
  }
  const used = new Map<string, Source>();
  const content = text.replace(/\[\[source:([^\]]+)\]\]/g, (_, id: string) => {
    const source = retrieved.get(id);
    if (!source) return "";
    const key = source.chunkId ?? source.id;
    if (!used.has(key)) used.set(key, source);
    return options.numbered ? `[${[...used.keys()].indexOf(key) + 1}]` : "";
  }).replace(/^\s*Sources?:.*$/gim, "").replace(/[ \t]+\n/g, "\n").trim();
  return { content, sources: [...used.values()] };
}

export function groundedDraft(text: string, retrieved: Map<string, Source>) {
  const markers = [...text.matchAll(/\[\[source:[^\]]+\]\]/g)];
  const last = markers.at(-1);
  if (!last) return "";
  try { return resolveCitations(text.slice(0, last.index + last[0].length), retrieved, { strict: true, numbered: true }).content; }
  catch { return ""; }
}

const repairSchema = z.object({ paragraphs: z.array(z.object({
  text: z.string().trim().min(1).max(6000), sourceIds: z.array(z.string()).max(12),
}).strict()).min(1).max(20) }).strict();

// Citations are assigned by the model in explicit fields, never guessed from
// the draft or attached by matching words. Empty source lists remain subject
// to the same uncertainty/claim checks as ordinary generated paragraphs.
export function parseCitationRepair(json: string, retrieved: Map<string, Source>) {
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new CitationValidationError("uncited_claim"); }
  const parsed = repairSchema.safeParse(value);
  if (!parsed.success) throw new CitationValidationError("uncited_claim");
  return parsed.data.paragraphs.map((paragraph) => {
    if (paragraph.text.includes("[[source:") || paragraph.sourceIds.some((id) => !retrieved.has(id))) throw new CitationValidationError("unknown_source");
    const markers = [...new Set(paragraph.sourceIds)].map((id) => `[[source:${id}]]`).join(" ");
    return paragraph.text + (markers ? (paragraph.text.endsWith("```") ? "\n\n" : " ") + markers : "");
  }).join("\n\n");
}
