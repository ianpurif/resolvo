import { AppError } from "@/lib/config";
import { documentText, enc, item, json, pageUrl, readableFile } from "../provider-utils";
import type { Connector } from "../types";
const base = "https://graph.microsoft.com/v1.0";
type DriveItem = { id: string; name: string; folder?: object; webUrl?: string; eTag?: string; deleted?: object; "@microsoft.graph.downloadUrl"?: string };
function parts(id: string) {
  const [drive, file] = id.split("|");
  if (!drive || !file) throw new AppError("Invalid Microsoft source identifier.", 400);
  return { drive: enc(drive), file: enc(file) };
}
export const microsoftFiles: Connector = {
  id: "microsoft-files", name: "OneDrive & SharePoint", category: "Cloud storage",
  description: "Select Microsoft 365 drives, folders, PDF, Word and text files.", auth: ["oauth2", "token"],
  fields: [{ key: "siteId", label: "SharePoint site ID (optional)" }],
  async list(ctx, parent, cursor) {
    if (!parent) {
      const path = ctx.config.siteId ? `/sites/${enc(ctx.config.siteId)}/drives` : "/me/drives";
      const data = await json<{ value: { id: string; name: string; webUrl?: string }[]; "@odata.nextLink"?: string }>(ctx, pageUrl(base + "/", base + path, cursor));
      return { items: data.value.map((d) => item(`${d.id}|root`, d.name, "container", d.webUrl)), cursor: data["@odata.nextLink"] };
    }
    const { drive, file } = parts(parent);
    const path = `${base}/drives/${drive}/${file === "root" ? "root" : `items/${file}`}/children?$top=100`;
    const data = await json<{ value: DriveItem[]; "@odata.nextLink"?: string }>(ctx, pageUrl(base + "/", path, cursor));
    return { items: data.value.filter((f) => f.folder || readableFile(f.name)).map((f) => item(`${decodeURIComponent(drive)}|${f.id}`, f.name, f.folder ? "container" : "document", f.webUrl, f.eTag)), cursor: data["@odata.nextLink"] };
  },
  async read(ctx, id, previous) {
    const { drive, file } = parts(id);
    const f = await json<DriveItem>(ctx, `${base}/drives/${drive}/items/${file}`);
    if (f.deleted) throw new AppError("This Microsoft file was deleted.", 404);
    const meta = { name: f.name, url: f.webUrl, version: f.eTag };
    if (previous && previous === f.eTag) return meta;
    const download = f["@microsoft.graph.downloadUrl"];
    if (!download) throw new AppError("Microsoft did not grant download access to this file.", 403);
    // Graph grants a short-lived download URL. Never forward the Graph token.
    return { ...meta, text: await documentText(f.name, await ctx.request(download, { redirect: true })) };
  },
};
