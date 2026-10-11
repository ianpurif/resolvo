import { AppError } from "@/lib/config";

// Bounded RFC 4180-style parsing, including quoted delimiters/newlines. Keep
// original files in private Storage; indexed text repeats column names so a
// detached row still has its meaning. Never execute formulas or HTML.
export function delimitedKnowledge(text: string, delimiter: "," | "\t") {
  const rows: string[][] = [];
  let row: string[] = [], value = "", quoted = false, afterQuote = false;
  const cell = () => { row.push(value.trim()); value = ""; afterQuote = false; if (row.length > 128) throw new AppError("Use at most 128 columns in a structured file.", 400); };
  const record = () => { cell(); if (row.some(Boolean)) rows.push(row); row = []; if (rows.length > 10001) throw new AppError("Use at most 10,000 data rows in a structured file.", 400); };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { value += '"'; i++; } else { quoted = false; afterQuote = true; } }
      else value += ch;
    } else if (ch === '"' && !value && !afterQuote) quoted = true;
    else if (ch === delimiter) cell();
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; record(); }
    else if (afterQuote && !/\s/.test(ch)) throw new AppError("The structured file contains a malformed quoted value.", 400);
    else if (!afterQuote) value += ch;
  }
  if (quoted) throw new AppError("The structured file contains an incomplete quoted value.", 400);
  if (value || row.length || afterQuote) record();
  const header = rows.shift();
  if (!header?.length || !rows.length || header.some((h) => !h) || new Set(header).size !== header.length)
    throw new AppError("Provide unique column headers and at least one data row.", 400);
  if (rows.some((r) => r.length !== header.length)) throw new AppError("Every data row must match the column headers.", 400);
  return rows.map((r, index) => `Record ${index + 1}: ${r.map((v, i) => `${header[i]}: ${v}`).join("; ")}`).join("\n\n");
}
export function jsonKnowledge(text: string) {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new AppError("This file contains invalid JSON.", 400); }
  const records: string[] = [];
  let nodes = 0;
  const visit = (value: unknown, path: string, depth: number) => {
    if (++nodes > 50000 || depth > 20) throw new AppError("Simplify JSON files deeper than 20 levels or larger than 50,000 values.", 400);
    if (Array.isArray(value)) { value.forEach((v, i) => visit(v, `${path}[${i}]`, depth + 1)); return; }
    if (value && typeof value === "object") {
      const entries = Object.entries(value);
      const scalar = entries.filter(([, v]) => !v || typeof v !== "object");
      nodes += scalar.length;
      if (nodes > 50000) throw new AppError("Use at most 50,000 values in a JSON file.", 400);
      if (scalar.length) records.push(`${path || "Record"}: ${scalar.map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join("; ")}`);
      entries.filter(([, v]) => v && typeof v === "object").forEach(([k, v]) => visit(v, path ? `${path}.${k}` : k, depth + 1));
      return;
    }
    records.push(`${path || "Value"}: ${JSON.stringify(value)}`);
  };
  visit(data, "", 0);
  return records.join("\n\n");
}
