import { AppError } from "@/lib/config";
import { authHeaders, documentText, enc, item, json, readableFile } from "../provider-utils";
import type { Connector } from "../types";
type DriveFile = { id: string; name: string; mimeType: string; webViewLink?: string; version?: string; trashed?: boolean };
const base = "https://www.googleapis.com/drive/v3";
const fields = "id,name,mimeType,webViewLink,version,trashed";
const folder = "application/vnd.google-apps.folder";
export const googleDrive: Connector = {
  id: "google-drive", name: "Google Drive", category: "Cloud storage",
  description: "Files, folders, Google Docs, Sheets and Slides, including shared drives.",
  auth: ["oauth2", "token", "service-account"],
  fields: [{ key: "driveId", label: "Shared drive ID (optional)" }],
  async list(ctx, parent, cursor) {
    const q = new URLSearchParams({ q: `'${(parent || ctx.config.driveId || "root").replace(/['\\]/g, "\\$&")}' in parents and trashed = false`,
      pageSize: "100", fields: `nextPageToken,incompleteSearch,files(${fields})`, supportsAllDrives: "true", includeItemsFromAllDrives: "true" });
    if (cursor) q.set("pageToken", cursor);
    if (ctx.config.driveId) { q.set("driveId", ctx.config.driveId); q.set("corpora", "drive"); }
    const data = await json<{ files: DriveFile[]; nextPageToken?: string; incompleteSearch?: boolean }>(ctx, `${base}/files?${q}`);
    if (data.incompleteSearch) throw new AppError("Drive could not return a complete listing. Connect a specific shared drive.", 422);
    return { items: data.files.filter((f) => f.mimeType === folder || /^application\/vnd\.google-apps\.(document|spreadsheet|presentation|drawing)$/.test(f.mimeType) || readableFile(f.name)).map((f) => item(f.id, f.name, f.mimeType === folder ? "container" : "document", f.webViewLink, f.version)), cursor: data.nextPageToken };
  },
  async read(ctx, id, previous) {
    const f = await json<DriveFile>(ctx, `${base}/files/${enc(id)}?fields=${fields}&supportsAllDrives=true`);
    if (f.trashed) throw new AppError("The Drive file was deleted.", 404);
    const meta = { name: f.name, url: f.webViewLink || `https://drive.google.com/file/d/${enc(id)}/view`, version: f.version };
    if (previous && previous === f.version) return meta;
    const type = f.mimeType.split(".").at(-1);
    let name = f.name, path = `${base}/files/${enc(id)}?alt=media&supportsAllDrives=true`;
    if (f.mimeType.startsWith("application/vnd.google-apps.")) {
      if (!["document", "spreadsheet", "presentation", "drawing"].includes(type ?? "")) throw new AppError("This Google Workspace file type cannot be exported as readable knowledge.", 422);
      const pdf = type === "spreadsheet" || type === "drawing";
      path = `${base}/files/${enc(id)}/export?mimeType=${enc(pdf ? "application/pdf" : "text/plain")}`;
      name += pdf ? ".pdf" : ".txt";
    }
    return { ...meta, text: await documentText(name, await ctx.request(path, { headers: authHeaders(ctx) })) };
  },
};
