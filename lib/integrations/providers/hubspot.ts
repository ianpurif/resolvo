import { AppError } from "@/lib/config";
import { enc, setting } from "../provider-utils";
import type { ConnectorContext } from "../types";
import { collectionConnector } from "./collection";
const objects: Record<string, { type: string; properties: string }> = {
  contacts: { type: "0-1", properties: "firstname,lastname,email,phone,company,jobtitle" },
  companies: { type: "0-2", properties: "name,domain,industry,description,phone,city,country" },
  deals: { type: "0-3", properties: "dealname,description,amount,dealstage,closedate" },
  tickets: { type: "0-5", properties: "subject,content,hs_pipeline_stage,hs_ticket_priority" },
};
function object(ctx: ConnectorContext) { const key = ctx.config.objectType || "contacts"; if (!objects[key]) throw new AppError("Choose contacts, companies, deals or tickets.", 400); return { key, ...objects[key] }; }
export const hubspot = collectionConnector({
  definition: { id: "hubspot", name: "HubSpot", category: "CRM", auth: ["token"], description: "Contacts, companies, deals or tickets using a private app token with the matching CRM read scope.",
    fields: [{ key: "portalId", label: "HubSpot account ID", required: true }, { key: "objectType", label: "Object type", placeholder: "contacts, companies, deals or tickets" }] },
  base: () => "https://api.hubapi.com",
  listPath(ctx, cursor) { const o = object(ctx); return `/crm/v3/objects/${o.key}?limit=100&properties=${o.properties}${cursor ? `&after=${enc(cursor)}` : ""}`; },
  readPath(ctx, id) { const o = object(ctx); return `/crm/v3/objects/${o.key}/${enc(id)}?properties=${o.properties}`; },
  page: (value) => { const v = value as { results: unknown[]; paging?: { next?: { after: string } } }; return { records: v.results, cursor: v.paging?.next?.after }; },
  document: (value, ctx) => { const v = value as { id: string; properties: Record<string, string | null>; updatedAt?: string; archived?: boolean };
    if (v.archived) throw new AppError("This HubSpot record was archived.", 404);
    const p = v.properties; return { id: v.id, name: p.name || p.dealname || p.subject || [p.firstname,p.lastname].filter(Boolean).join(" ") || `HubSpot ${v.id}`,
      url: `https://app.hubspot.com/contacts/${enc(setting(ctx, "portalId"))}/record/${object(ctx).type}/${enc(v.id)}`, version: v.updatedAt,
      text: `HubSpot ${object(ctx).key} record ${v.id}\n${Object.entries(p).map(([k, val]) => `${k}: ${val ?? ""}`).join("\n")}` }; },
});
