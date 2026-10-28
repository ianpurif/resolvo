import { authHeaders, documentText, enc, item, json, readableFile } from "../provider-utils";
import type { Connector } from "../types";
type Entry = { id: string; name: string; type: string; sha1?: string; sequence_id?: string };
const base = "https://api.box.com/2.0";
export const box: Connector = {
  id: "box", name: "Box", category: "Cloud storage", auth: ["oauth2", "token"], fields: [],
  description: "Box folders and readable files using OAuth or an authorized access token.",
  async list(ctx, parent, cursor) {
    const page = await json<{ entries: Entry[]; next_marker?: string }>(ctx, `${base}/folders/${enc(parent || "0")}/items?usemarker=true&limit=100&fields=id,type,name,sha1,sequence_id${cursor ? `&marker=${enc(cursor)}` : ""}`);
    return { items: page.entries.filter((f) => f.type === "folder" || f.type === "file" && readableFile(f.name)).map((f) => item(f.id, f.name, f.type === "folder" ? "container" : "document", `https://app.box.com/${f.type}/${f.id}`, f.sha1 || f.sequence_id)), cursor: page.next_marker };
  },
  async read(ctx, id, previous) {
    const f = await json<Entry>(ctx, `${base}/files/${enc(id)}?fields=id,name,sha1,sequence_id`);
    const meta = { name: f.name, url: `https://app.box.com/file/${enc(id)}`, version: f.sha1 || f.sequence_id };
    if (previous && previous === meta.version) return meta;
    let download = await ctx.request(`${base}/files/${enc(id)}/content`, { headers: authHeaders(ctx), manualRedirect: true });
    if (download.status === 302 && download.headers.location) download = await ctx.request(download.headers.location, { redirect: true });
    return { ...meta, text: await documentText(f.name, download) };
  },
};
