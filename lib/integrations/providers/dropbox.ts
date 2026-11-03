import { authHeaders, documentText, item, json, readableFile } from "../provider-utils";
import { ConnectorError, responseJson } from "../http";
import type { Connector } from "../types";
type Entry = { id: string; name: string; ".tag": string; path_display?: string; rev?: string };
const url = (f: Entry) => f.path_display ? `https://www.dropbox.com/home${f.path_display.split("/").map(encodeURIComponent).join("/")}` : undefined;
export const dropbox: Connector = {
  id: "dropbox", name: "Dropbox", category: "Cloud storage", auth: ["oauth2", "token"], fields: [],
  description: "Files and folders available to your Dropbox app. Supports read-only access and refresh tokens.",
  async list(ctx, parent, cursor) {
    const page = await json<{ entries: Entry[]; has_more: boolean; cursor: string }>(ctx, `https://api.dropboxapi.com/2/files/list_folder${cursor ? "/continue" : ""}`,
      cursor ? { cursor } : { path: parent || "", limit: 100, recursive: false });
    return { items: page.entries.filter((f) => f[".tag"] === "folder" || f[".tag"] === "file" && readableFile(f.name)).map((f) => item(f.id, f.name, f[".tag"] === "folder" ? "container" : "document", url(f), f.rev)), cursor: page.has_more ? page.cursor : undefined };
  },
  async read(ctx, id, previous) {
    const response = await ctx.request("https://api.dropboxapi.com/2/files/get_metadata", { method: "POST", headers: { ...authHeaders(ctx), "Content-Type": "application/json" }, body: JSON.stringify({ path: id }) });
    if (response.status === 409 && response.bytes.toString().includes("not_found")) throw new ConnectorError("This Dropbox file was deleted or is no longer accessible.", 404);
    const f = responseJson<Entry>(response), meta = { name: f.name, url: url(f), version: f.rev };
    if (previous && previous === f.rev) return meta;
    const download = await ctx.request("https://content.dropboxapi.com/2/files/download", { method: "POST", headers: { ...authHeaders(ctx), "Dropbox-API-Arg": JSON.stringify({ path: id }).replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`) } });
    return { ...meta, text: await documentText(f.name, download) };
  },
};
