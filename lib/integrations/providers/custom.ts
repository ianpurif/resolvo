import { AppError } from "@/lib/config";
import { extractWebsite } from "@/lib/rag/website";
import { item, json, setting, sourceUrl } from "../provider-utils";
import { sameOriginUrl } from "../http";
import type { Connector } from "../types";
export function field(value: unknown, path: string): unknown {
  if (!path || path === "$") return value;
  return path.replace(/^\$\./, "").split(".").reduce<unknown>((node, key) => {
    if (["__proto__", "constructor", "prototype"].includes(key)) throw new AppError("Invalid field path.", 400);
    return node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined;
  }, value);
}
function str(value: unknown): string { return typeof value === "string" || typeof value === "number" ? String(value) : ""; }
function template(base: string, path: string, variables: Record<string, string>) {
  return sameOriginUrl(base, path.replace(/\{(id|parent|cursor)\}/g, (_, key: string) => encodeURIComponent(variables[key] ?? "")));
}
export const customApi: Connector = {
  id: "custom-api", name: "Custom REST API", category: "Custom & databases", auth: ["none", "token", "basic", "oauth2"],
  description: "Any HTTPS JSON API: map its list, detail, pagination and source fields. No provider allowlist.",
  fields: [
    { key: "baseUrl", label: "API base URL", required: true, placeholder: "https://api.example.com/" },
    { key: "listPath", label: "List URL template", required: true, placeholder: "/documents?parent={parent}&cursor={cursor}" },
    { key: "readPath", label: "Detail URL template", required: true, placeholder: "/documents/{id}" },
    { key: "itemsPath", label: "Items field ($ for root array)", placeholder: "data" },
    { key: "idPath", label: "ID field", placeholder: "id" }, { key: "namePath", label: "Title field", placeholder: "name" },
    { key: "textPath", label: "Content field ($ for complete JSON)", placeholder: "text" },
    { key: "urlPath", label: "Original URL field", placeholder: "url" }, { key: "versionPath", label: "Revision field", placeholder: "updated_at" },
    { key: "kindPath", label: "Folder type field (container or folder)" },
    { key: "nextPath", label: "Next cursor field (optional)" },
    { key: "authHeader", label: "API key header (default Authorization)" },
    { key: "authScheme", label: "Authorization scheme (default Bearer)" },
  ],
  async list(ctx, parent, cursor) {
    const data = await json<unknown>(ctx, template(setting(ctx, "baseUrl"), setting(ctx, "listPath"), { parent: parent ?? "", cursor: cursor ?? "" }));
    const rows = field(data, ctx.config.itemsPath || "$");
    if (!Array.isArray(rows)) throw new AppError("The API items field must resolve to an array.", 422);
    const next = ctx.config.nextPath ? str(field(data, ctx.config.nextPath)) : undefined;
    if (cursor && next === cursor) throw new AppError("The API returned the same pagination cursor. Fix the list mapping.", 422);
    return { items: rows.map((row) => item(str(field(row, ctx.config.idPath || "id")), str(field(row, ctx.config.namePath || "name")),
      ["folder", "container"].includes(str(field(row, ctx.config.kindPath || "kind"))) ? "container" : "document",
      str(field(row, ctx.config.urlPath || "url")), str(field(row, ctx.config.versionPath || "updated_at")) || undefined)), cursor: next || undefined };
  },
  async read(ctx, id, previous) {
    const data = await json<unknown>(ctx, template(setting(ctx, "baseUrl"), setting(ctx, "readPath"), { id }));
    const version = str(field(data, ctx.config.versionPath || "updated_at")) || undefined;
    const value = field(data, ctx.config.textPath || "text");
    const meta = { name: str(field(data, ctx.config.namePath || "name")) || id, url: sourceUrl(str(field(data, ctx.config.urlPath || "url"))), version };
    if (version && previous === version) return meta;
    if (value === undefined || value === null) throw new AppError("The configured content field is missing. Fix the API mapping.", 422);
    return { ...meta, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) };
  },
};
export const website: Connector = {
  id: "website", name: "Websites", category: "Web", auth: ["none"],
  description: "Automatically refresh selected public HTML or text pages. Separate URLs with newlines.",
  fields: [{ key: "urls", label: "Public page URLs (one per line)", required: true }],
  async list(ctx) { return { items: setting(ctx, "urls").split(/\s+/).filter(Boolean).map((url) => item(url, url, "document", url)) }; },
  async read(_ctx, id) { const page = await extractWebsite(id); return { name: page.name, text: page.text, url: page.locator }; },
};
