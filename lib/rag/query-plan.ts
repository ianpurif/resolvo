import type { ChatMessage } from "@/types";

export type RetrievalMode = "fact" | "comparison" | "summary";
export interface RetrievalPlan {
  question: string;
  query: string;
  lexicalQuery: string;
  mode: RetrievalMode;
  historyStart: number;
  followUp: boolean;
  preferredDocuments: string[];
  maxPassages: number;
  characterBudget: number;
}

// Language-level cues only: no corpus facts, organizations or entity lists.
const stopWords = new Set("a an the is are was were be been being do does did can could should would may might must will shall have has had what which who whom whose when where why how and or of to for in on at by with from as about please tell me give explain describe information know according available all each these those this that it its they them their he she his her i we our you your compare versus vs summarize summarise summary overview document documents file files company knowledge base".split(" "));
export function searchTerms(text: string) {
  return [...new Set((text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}_./-]*/gu) ?? [])
    .filter((word) => !stopWords.has(word) && word.length > 1))].slice(0, 48);
}
export function isReferentialQuestion(text: string) {
  if (/^(?:new topic|unrelated|separately|switch(?:ing)? topics?|different question)\b/i.test(text.trim())) return false;
  const short = text.split(/\s+/).length <= 28;
  if (!short) return false;
  if (/^(?:and\b|also\b|what about\b|how about\b|why\??$|when\??$|who\??$|yes\b|please do\b)/i.test(text.trim())) return true;
  const reference = /\b(?:it|its|they|them|their|those|that one|this one|the same|he|she|his|her)\b/i.exec(text);
  // An explicit subject before a possessive usually makes the question stand
  // alone (e.g. a named product followed by "its limits"). Prefer a fresh topic
  // over importing old evidence when the wording is ambiguous.
  return Boolean(reference && searchTerms(text.slice(0, reference.index)).length <= 1);
}
export function planRetrieval(history: Pick<ChatMessage, "role" | "content" | "sources">[]): RetrievalPlan {
  let latest = history.length - 1;
  while (latest >= 0 && history[latest].role !== "user") latest--;
  const question = (history[latest]?.content ?? "").trim().slice(0, 4000);
  const followUp = latest > 0 && isReferentialQuestion(question);
  let historyStart = Math.max(0, latest);
  if (followUp) {
    // Find the most recent independent user question. A chain of short followups
    // inherits that anchor, never the entire conversation or assistant facts.
    const lower = Math.max(0, latest - 10);
    for (let i = latest - 1; i >= lower; i--) {
      if (history[i].role !== "user") continue;
      historyStart = i;
      if (!isReferentialQuestion(history[i].content)) break;
    }
  }
  const contextQuestions = followUp ? history.slice(historyStart, latest)
    .filter((m) => m.role === "user").map((m) => m.content.trim()).join("\n").slice(0, 1800) : "";
  const query = contextQuestions ? `${contextQuestions}\nFollow-up question: ${question}` : question;
  const previous = followUp ? history.slice(historyStart, latest).filter((m) => m.role === "assistant").at(-1) : undefined;
  const preferredDocuments = [...new Set((previous?.sources ?? []).map((s) => s.id)
    .filter((id) => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)))].slice(0, 8);
  const mode: RetrievalMode = /\b(?:summari[sz]e|summary|overview|key (?:points|themes)|outline)\b/i.test(question)
    ? "summary" : /\b(?:compare|comparison|versus|vs\.?|differences?|similarities?|both)\b/i.test(question)
      ? "comparison" : "fact";
  return { question, query, lexicalQuery: searchTerms(query).join(" "), mode, historyStart, followUp,
    preferredDocuments, maxPassages: mode === "summary" ? 12 : mode === "comparison" ? 8 : 6,
    characterBudget: mode === "summary" ? 14400 : mode === "comparison" ? 9600 : 7200 };
}
