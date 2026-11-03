import { ConnectorError } from "../http";
import { enc, item, json, setting } from "../provider-utils";
import type { Connector, ConnectorContext, RemoteItem } from "../types";
type Message = { ts: string; text?: string; user?: string; reply_count?: number; edited?: { ts: string }; thread_ts?: string };
type SlackPage = { ok: boolean; error?: string; channels?: { id: string; name: string }[]; messages?: Message[]; response_metadata?: { next_cursor?: string }; has_more?: boolean };
async function slack(ctx: ConnectorContext, method: string, params: Record<string, string>) {
  const data = await json<SlackPage>(ctx, `https://slack.com/api/${method}?${new URLSearchParams(params)}`);
  if (!data.ok) throw new ConnectorError(data.error === "ratelimited" ? "Slack rate limit reached. Synchronization will retry." : "Slack denied the request. Use a user token with channel read and history permissions.", data.error === "ratelimited" ? 429 : data.error === "message_not_found" ? 404 : 403);
  if (data.has_more && !data.response_metadata?.next_cursor) throw new ConnectorError("Slack returned incomplete pagination.", 502);
  return data;
}
function link(ctx: ConnectorContext, channel: string, ts: string) { return `${setting(ctx, "workspaceUrl").replace(/\/$/, "")}/archives/${enc(channel)}/p${ts.replace(".", "")}`; }
export const slackConnector: Connector = {
  id: "slack", name: "Slack", category: "Communication", auth: ["token"],
  description: "Channels, messages and thread replies. Use a user token with channels:read, groups:read and history scopes.",
  fields: [{ key: "workspaceUrl", label: "Workspace URL", required: true, placeholder: "https://yourcompany.slack.com" }],
  async list(ctx, parent, cursor) {
    if (!parent) { const data = await slack(ctx, "conversations.list", { types: "public_channel,private_channel", exclude_archived: "true", limit: "100", ...(cursor ? { cursor } : {}) });
      return { items: (data.channels ?? []).map((c) => item(c.id, `#${c.name}`, "container")), cursor: data.response_metadata?.next_cursor || undefined }; }
    const [channel, thread] = parent.split("|");
    const data = await slack(ctx, thread ? "conversations.replies" : "conversations.history", { channel, limit: "15", ...(thread ? { ts: thread } : {}), ...(cursor ? { cursor } : {}) });
    const items: RemoteItem[] = [];
    for (const message of data.messages ?? []) {
      if (thread && message.ts === thread) continue;
      items.push(item(`${channel}|${thread || message.ts}|${message.ts}`, message.text?.slice(0, 100) || `Message ${message.ts}`, "document", link(ctx, channel, message.ts), message.edited?.ts || message.ts));
      if (!thread && message.reply_count) items.push(item(`${channel}|${message.ts}`, `Thread: ${message.text?.slice(0, 80) || message.ts}`, "container"));
    }
    return { items, cursor: data.response_metadata?.next_cursor || undefined };
  },
  async read(ctx, id, previous) {
    const [channel, thread, ts] = id.split("|");
    const data = await slack(ctx, thread === ts ? "conversations.history" : "conversations.replies", { channel, ...(thread === ts ? {} : { ts: thread }), oldest: ts, latest: ts, inclusive: "true", limit: "1" });
    const message = data.messages?.find((m) => m.ts === ts);
    if (!message) throw new ConnectorError("This Slack message was deleted or is no longer accessible.", 404);
    const version = message.edited?.ts || message.ts;
    return { name: message.text?.slice(0, 100) || "Slack message", url: link(ctx, channel, ts), version,
      text: version === previous ? undefined : `Slack message\nAuthor ID: ${message.user || "unknown"}\nTimestamp: ${ts}\n\n${message.text || ""}` };
  },
};
