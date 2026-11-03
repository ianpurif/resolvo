import { extractVisibleText } from "@/lib/rag/website";
import { enc, setting } from "../provider-utils";
import { collectionConnector } from "./collection";
export const confluence = collectionConnector({
  definition: { id: "confluence", name: "Confluence", category: "Productivity", auth: ["basic", "token"],
    description: "Confluence Cloud pages and storage-format body text. Optionally restrict to a space ID.",
    fields: [{ key: "baseUrl", label: "Atlassian site URL", required: true, placeholder: "https://company.atlassian.net" }, { key: "spaceId", label: "Space ID (optional)" }] },
  base: (ctx) => setting(ctx, "baseUrl"),
  listPath: (ctx, cursor) => cursor || `/wiki/api/v2/pages?limit=100${ctx.config.spaceId ? `&space-id=${enc(ctx.config.spaceId)}` : ""}`,
  readPath: (_ctx, id) => `/wiki/api/v2/pages/${enc(id)}?body-format=storage`,
  page: (value) => { const v = value as { results: unknown[]; _links?: { next?: string } }; return { records: v.results, cursor: v._links?.next }; },
  document: (value, ctx) => { const v = value as { id: string; title: string; version?: { number: number }; body?: { storage?: { value: string } } };
    return { id: v.id, name: v.title, version: v.version ? String(v.version.number) : undefined,
      url: `${setting(ctx, "baseUrl").replace(/\/$/, "")}/wiki/pages/viewpage.action?pageId=${enc(v.id)}`,
      text: v.body?.storage ? `# ${v.title}\n\n${extractVisibleText(v.body.storage.value).text}` : undefined }; },
});
