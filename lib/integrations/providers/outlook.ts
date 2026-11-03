import { AppError } from "@/lib/config";
import { extractVisibleText } from "@/lib/rag/website";
import { enc, item, json, pageUrl } from "../provider-utils";
import type { Connector, ConnectorContext } from "../types";
const base = "https://graph.microsoft.com/v1.0";
const headers = { Prefer: 'IdType="ImmutableId", outlook.body-content-type="text"' };
type Folder = { id: string; displayName: string };
type Mail = { id: string; subject: string; webLink?: string; changeKey?: string; receivedDateTime?: string; body?: { content: string; contentType: string }; from?: { emailAddress: { name?: string; address: string } }; toRecipients?: { emailAddress: { address: string } }[] };
const account = (ctx: ConnectorContext) => ctx.config.mailbox ? `/users/${enc(ctx.config.mailbox)}` : "/me";
export const outlook: Connector = {
  id: "outlook", name: "Outlook Mail", category: "Email", auth: ["oauth2", "token"],
  description: "Microsoft 365 and Outlook mail folders and message bodies. Does not send mail or import attachments.",
  fields: [{ key: "mailbox", label: "Mailbox user ID or email (optional; default your mailbox)" }],
  async list(ctx, parent, cursor) {
    const root = `${base}${account(ctx)}`;
    if (parent?.startsWith("contents:")) {
      const path = `${root}/mailFolders/${enc(parent.slice(9))}/messages?$top=50&$select=id,subject,webLink,changeKey`;
      const data = await json<{ value: Mail[]; "@odata.nextLink"?: string }>(ctx, pageUrl(base, path, cursor), undefined, headers);
      return { items: data.value.map((m) => item(`message:${m.id}`, m.subject || "Untitled email", "document", m.webLink, m.changeKey)), cursor: data["@odata.nextLink"] };
    }
    if (parent && !parent.startsWith("folder:")) throw new AppError("Select an Outlook mail folder.", 400);
    const path = parent ? `${root}/mailFolders/${enc(parent.slice(7))}/childFolders?$top=50` : `${root}/mailFolders?$top=50`;
    const data = await json<{ value: Folder[]; "@odata.nextLink"?: string }>(ctx, pageUrl(base, path, cursor), undefined, headers);
    return { items: [...(parent && !cursor ? [item(`contents:${parent.slice(7)}`, "Messages in this folder", "container")] : []), ...data.value.map((f) => item(`folder:${f.id}`, f.displayName, "container"))], cursor: data["@odata.nextLink"] };
  },
  async read(ctx, id, previous) {
    if (!id.startsWith("message:")) throw new AppError("Select an Outlook message.", 400);
    const m = await json<Mail>(ctx, `${base}${account(ctx)}/messages/${enc(id.slice(8))}?$select=id,subject,webLink,changeKey,receivedDateTime,from,toRecipients,body`, undefined, headers);
    const meta = { name: m.subject || "Untitled email", url: m.webLink, version: m.changeKey };
    if (previous && previous === m.changeKey) return meta;
    const body = m.body?.contentType.toLowerCase() === "html" ? extractVisibleText(m.body.content).text : m.body?.content ?? "";
    if (!body.trim()) throw new AppError("This email has no readable body. Attachments are not imported.", 422);
    return { ...meta, text: `Subject: ${meta.name}\nFrom: ${m.from?.emailAddress.address ?? ""}\nTo: ${m.toRecipients?.map((r) => r.emailAddress.address).join(", ") ?? ""}\nReceived: ${m.receivedDateTime ?? ""}\n\n${body}` };
  },
};
