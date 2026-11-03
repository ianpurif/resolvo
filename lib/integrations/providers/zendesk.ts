import { extractVisibleText } from "@/lib/rag/website";
import { enc, setting } from "../provider-utils";
import { collectionConnector } from "./collection";
export const zendesk = collectionConnector({
  definition: { id: "zendesk", name: "Zendesk", category: "Customer support", auth: ["basic", "token", "none"], description: "Help Center articles accessible to the connected user. For API tokens use email/token as the username.", fields: [{ key: "baseUrl", label: "Zendesk site URL", required: true, placeholder: "https://company.zendesk.com" }] },
  base: (ctx) => setting(ctx, "baseUrl"), listPath: (_ctx, cursor) => cursor || "/api/v2/help_center/articles.json?page[size]=100", readPath: (_ctx, id) => `/api/v2/help_center/articles/${enc(id)}.json`,
  page: (value) => { const v = value as { articles: unknown[]; links?: { next?: string }; next_page?: string; meta?: { has_more?: boolean } }; return { records: v.articles, cursor: v.meta?.has_more === false ? undefined : v.links?.next || v.next_page || undefined }; },
  document: (value) => { const outer = value as { article?: unknown }; const v = (outer.article || value) as { id: number; title: string; body?: string; html_url: string; updated_at?: string };
    return { id: String(v.id), name: v.title, url: v.html_url, version: v.updated_at, text: v.body === undefined ? undefined : `# ${v.title}\n\n${extractVisibleText(v.body).text}` }; },
});
