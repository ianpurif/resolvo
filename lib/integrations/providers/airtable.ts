import { enc, setting } from "../provider-utils";
import type { ConnectorContext } from "../types";
import { collectionConnector } from "./collection";
const table = (ctx: ConnectorContext) => `/v0/${enc(setting(ctx, "baseId"))}/${enc(setting(ctx, "tableId"))}`;
export const airtable = collectionConnector({
  definition: { id: "airtable", name: "Airtable", category: "Databases", auth: ["token"], description: "Records and field values from an Airtable table. Use a personal access token with data.records:read.",
    fields: [{ key: "baseId", label: "Base ID", required: true }, { key: "tableId", label: "Table ID", required: true }, { key: "titleField", label: "Title field name (optional)" }] },
  base: () => "https://api.airtable.com", listPath: (ctx, cursor) => `${table(ctx)}?pageSize=100${cursor ? `&offset=${enc(cursor)}` : ""}`, readPath: (ctx, id) => `${table(ctx)}/${enc(id)}`,
  page: (value) => { const v = value as { records: unknown[]; offset?: string }; return { records: v.records, cursor: v.offset }; },
  document: (value, ctx) => { const v = value as { id: string; fields: Record<string, unknown> }; const title = ctx.config.titleField ? v.fields[ctx.config.titleField] : Object.values(v.fields)[0];
    return { id: v.id, name: typeof title === "string" ? title : `Airtable ${v.id}`, url: `https://airtable.com/${enc(setting(ctx,"baseId"))}/${enc(setting(ctx,"tableId"))}/${enc(v.id)}`, text: `Airtable record ${v.id}\n${JSON.stringify(v.fields, null, 2)}` }; },
});
