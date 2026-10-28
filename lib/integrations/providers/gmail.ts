import { AppError } from "@/lib/config";
import { extractVisibleText } from "@/lib/rag/website";
import { enc, item, json } from "../provider-utils";
import type { Connector, ConnectorContext } from "../types";
const base = "https://gmail.googleapis.com/gmail/v1/users/me";
type Part = { mimeType?: string; filename?: string; headers?: { name: string; value: string }[]; body?: { data?: string; attachmentId?: string }; parts?: Part[] };
type Message = { id: string; threadId: string; historyId?: string; payload?: Part };
const header = (part: Part | undefined, name: string) => part?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
const link = (m: Message) => `https://mail.google.com/mail/u/0/#all/${enc(m.threadId)}`;
async function bodyText(ctx: ConnectorContext, id: string, part: Part): Promise<string> {
  if (part.filename) return ""; // Attachments are not mailbox knowledge by default.
  if (part.parts?.length) {
    if (part.mimeType === "multipart/alternative") {
      const plain = part.parts.find((p) => p.mimeType === "text/plain");
      if (plain) return bodyText(ctx, id, plain);
      const html = part.parts.find((p) => p.mimeType === "text/html");
      if (html) return bodyText(ctx, id, html);
    }
    const text = [];
    for (const child of part.parts) text.push(await bodyText(ctx, id, child));
    return text.filter(Boolean).join("\n\n");
  }
  if (!["text/plain", "text/html"].includes(part.mimeType ?? "")) return "";
  const data = part.body?.data ?? (part.body?.attachmentId ? (await json<{ data: string }>(ctx, `${base}/messages/${enc(id)}/attachments/${enc(part.body.attachmentId)}`)).data : "");
  const charset = /charset=["']?([^;"'\s]+)/i.exec(header(part, "content-type"))?.[1] ?? "utf-8";
  let text: string;
  try { text = new TextDecoder(charset, { fatal: true }).decode(Buffer.from(data, "base64url")); }
  catch { throw new AppError("This email uses an unsupported text encoding.", 422); }
  return part.mimeType === "text/html" ? extractVisibleText(text).text : text;
}
export const gmail: Connector = {
  id: "gmail", name: "Gmail", category: "Email", auth: ["oauth2", "token"],
  description: "Select labels or individual messages from Gmail and Google Workspace. Reads message bodies without sending mail or importing attachments.",
  fields: [{ key: "query", label: "Optional Gmail search filter", placeholder: "after:2025/01/01 -in:spam -in:trash" }],
  async list(ctx, parent, cursor) {
    if (!parent) {
      const data = await json<{ labels: { id: string; name: string }[] }>(ctx, `${base}/labels`);
      return { items: data.labels.map((l) => item(`label:${l.id}`, l.name, "container")) };
    }
    if (!parent.startsWith("label:")) throw new AppError("Select a Gmail label.", 400);
    const query = new URLSearchParams({ labelIds: parent.slice(6), maxResults: "20" });
    if (ctx.config.query) query.set("q", ctx.config.query);
    if (cursor) query.set("pageToken", cursor);
    const data = await json<{ messages?: { id: string }[]; nextPageToken?: string }>(ctx, `${base}/messages?${query}`);
    const items = [];
    for (const message of data.messages ?? []) {
      const m = await json<Message>(ctx, `${base}/messages/${enc(message.id)}?format=metadata&metadataHeaders=Subject`);
      items.push(item(`message:${m.id}`, header(m.payload, "Subject") || "Untitled email", "document", link(m), m.historyId));
    }
    return { items, cursor: data.nextPageToken };
  },
  async read(ctx, external, previous) {
    if (!external.startsWith("message:")) throw new AppError("Select a Gmail message.", 400);
    const id = external.slice(8), m = await json<Message>(ctx, `${base}/messages/${enc(id)}?format=full`);
    const meta = { name: header(m.payload, "Subject") || "Untitled email", url: link(m), version: m.historyId };
    if (previous && previous === m.historyId) return meta;
    const body = m.payload ? await bodyText(ctx, id, m.payload) : "";
    if (!body.trim()) throw new AppError("This email has no readable message body. Attachments are not imported.", 422);
    return { ...meta, text: `Subject: ${meta.name}\nFrom: ${header(m.payload, "From")}\nTo: ${header(m.payload, "To")}\nDate: ${header(m.payload, "Date")}\n\n${body}` };
  },
};
