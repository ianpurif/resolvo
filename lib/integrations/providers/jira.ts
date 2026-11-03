import { AppError } from "@/lib/config";
import { enc, setting } from "../provider-utils";
import { collectionConnector } from "./collection";
function adf(value: unknown): string {
  if (Array.isArray(value)) return value.map(adf).join("\n");
  if (!value || typeof value !== "object") return typeof value === "string" ? value : "";
  const node = value as { text?: string; content?: unknown };
  return node.text || adf(node.content);
}
export const jira = collectionConnector({
  definition: { id: "jira", name: "Jira", category: "Project management", auth: ["basic", "token"],
    description: "Issues in a Jira Cloud project: summaries, descriptions, status and labels. Use email plus an API token.",
    fields: [{ key: "baseUrl", label: "Atlassian site URL", required: true, placeholder: "https://company.atlassian.net" }, { key: "project", label: "Project key", required: true }] },
  base: (ctx) => setting(ctx, "baseUrl"),
  listPath(ctx, cursor) { const project = setting(ctx, "project"); if (!/^[A-Za-z0-9_-]+$/.test(project)) throw new AppError("Enter a Jira project key.", 400);
    return `/rest/api/3/search/jql?jql=${enc(`project = "${project}" ORDER BY key`)}&fields=summary,description,status,labels,updated&maxResults=100${cursor ? `&nextPageToken=${enc(cursor)}` : ""}`; },
  readPath: (_ctx, id) => `/rest/api/3/issue/${enc(id)}?fields=summary,description,status,labels,updated`,
  page: (value) => { const v = value as { issues: unknown[]; nextPageToken?: string }; return { records: v.issues, cursor: v.nextPageToken }; },
  document(value, ctx) { const v = value as { id: string; key: string; fields: { summary: string; description?: unknown; status?: { name: string }; labels?: string[]; updated?: string } };
    return { id: v.id, name: `${v.key}: ${v.fields.summary}`, url: `${setting(ctx, "baseUrl").replace(/\/$/, "")}/browse/${enc(v.key)}`, version: v.fields.updated,
      text: `Issue: ${v.key}\nSummary: ${v.fields.summary}\nStatus: ${v.fields.status?.name ?? ""}\nLabels: ${(v.fields.labels ?? []).join(", ")}\n\n${adf(v.fields.description)}` }; },
});
