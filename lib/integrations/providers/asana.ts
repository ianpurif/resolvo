import { enc, setting } from "../provider-utils";
import { collectionConnector } from "./collection";
const fields = "name,notes,completed,due_on,modified_at,permalink_url";
export const asana = collectionConnector({
  definition: { id: "asana", name: "Asana", category: "Project management", auth: ["token"], description: "Project tasks, descriptions, completion and due dates. Select all tasks to pick up new additions.", fields: [{ key: "projectId", label: "Asana project ID", required: true }] },
  base: () => "https://app.asana.com",
  listPath: (ctx, cursor) => `/api/1.0/projects/${enc(setting(ctx, "projectId"))}/tasks?limit=100&opt_fields=${fields}${cursor ? `&offset=${enc(cursor)}` : ""}`,
  readPath: (_ctx, id) => `/api/1.0/tasks/${enc(id)}?opt_fields=${fields}`,
  page: (value) => { const v = value as { data: unknown[]; next_page?: { offset: string } }; return { records: v.data, cursor: v.next_page?.offset }; },
  document: (value) => { const outer = value as { data?: unknown }; const v = (outer.data || value) as { gid: string; name: string; notes?: string; completed?: boolean; due_on?: string; modified_at?: string; permalink_url?: string };
    return { id: v.gid, name: v.name, url: v.permalink_url, version: v.modified_at, text: `Task: ${v.name}\nCompleted: ${v.completed}\nDue: ${v.due_on || "Not set"}\n\n${v.notes || ""}` }; },
});
