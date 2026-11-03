import { AppError } from "@/lib/config";
import { enc, setting } from "../provider-utils";
import type { ConnectorContext } from "../types";
import { collectionConnector } from "./collection";
function identifiers(ctx: ConnectorContext) { const table = setting(ctx, "table"), key = ctx.config.primaryKey || "id";
  if (![table,key].every((v) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(v))) throw new AppError("Use simple table and primary key identifiers.", 400); return { table, key }; }
export const supabase = collectionConnector({
  definition: { id: "supabase", name: "Supabase / PostgREST", category: "Databases", auth: ["token"], description: "Read table rows through the project's HTTPS data API. Source permissions are those of the supplied key; no SQL is executed.",
    fields: [{ key: "baseUrl", label: "Project API URL", required: true, placeholder: "https://project.supabase.co" }, { key: "table", label: "Table name", required: true }, { key: "primaryKey", label: "Unique primary key column", placeholder: "id" }, { key: "titleField", label: "Title column (optional)" }, { key: "recordUrlTemplate", label: "Original record URL template (optional {id})" }] },
  base: (ctx) => setting(ctx, "baseUrl"),
  headers: (ctx) => { const token = ctx.credential.token || ""; return { apikey: token, ...(token.split(".").length === 3 ? { Authorization: `Bearer ${token}` } : {}) }; },
  listPath(ctx, cursor) { const { table,key } = identifiers(ctx); return `/rest/v1/${table}?select=*&order=${key}.asc&limit=100${cursor ? `&${key}=gt.${enc(cursor)}` : ""}`; },
  readPath(ctx, id) { const { table,key } = identifiers(ctx); return `/rest/v1/${table}?select=*&${key}=eq.${enc(id)}&limit=1`; },
  page: (value, ctx) => { const rows = value as Record<string, unknown>[]; return { records: rows, cursor: rows.length === 100 ? String(rows.at(-1)![identifiers(ctx).key]) : undefined }; },
  document: (value, ctx) => { const row = (Array.isArray(value) ? value[0] : value) as Record<string, unknown> | undefined;
    if (!row) throw new AppError("This database row was removed or is no longer accessible.", 404);
    const id = row[identifiers(ctx).key]; if (id === undefined || id === null) throw new AppError("Every selected row needs a unique non-null primary key.", 422);
    return { id: String(id), name: String(row[ctx.config.titleField || "name"] || `${ctx.config.table}: ${id}`), url: ctx.config.recordUrlTemplate?.replace("{id}", enc(String(id))), text: `${ctx.config.table} record ${id}\n${JSON.stringify(row, null, 2)}` }; },
});
