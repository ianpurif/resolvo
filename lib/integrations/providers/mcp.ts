import { AppError } from "@/lib/config";
import { authHeaders, item, setting, sourceUrl } from "../provider-utils";
import { checkResponse } from "../http";
import type { Connector, ConnectorContext } from "../types";
type Rpc = { id?: string; result?: Record<string, unknown>; error?: unknown };
const sessions = new WeakMap<ConnectorContext, Promise<{ id?: string; version: string }>>();
async function rpc(ctx: ConnectorContext, method: string, params: unknown, session?: { id?: string; version: string }) {
  const id = crypto.randomUUID();
  const response = checkResponse(await ctx.request(setting(ctx, "endpoint"), {
    method: "POST", headers: { ...authHeaders(ctx), "Content-Type": "application/json", Accept: "application/json, text/event-stream",
      ...(session ? { "MCP-Protocol-Version": session.version } : {}), ...(session?.id ? { "Mcp-Session-Id": session.id } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", ...(method.startsWith("notifications/") ? {} : { id }), method, params }),
  }));
  if (method.startsWith("notifications/")) return { result: {}, sessionId: response.headers["mcp-session-id"] };
  let messages: Rpc[];
  try {
    const raw = response.bytes.toString("utf8");
    messages = response.headers["content-type"]?.includes("text/event-stream")
      ? raw.split(/\r?\n\r?\n/).filter((v) => /^data:/m.test(v)).map((v) => JSON.parse(v.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n")))
      : [JSON.parse(raw)];
  } catch { throw new AppError("The MCP server returned an invalid response.", 502); }
  const message = messages.find((m) => m.id === id);
  if (!message || message.error || !message.result) throw new AppError("The MCP resource request failed. Check the server's resource permissions.", 502);
  return { result: message.result, sessionId: response.headers["mcp-session-id"] };
}
async function session(ctx: ConnectorContext) {
  if (!sessions.has(ctx)) sessions.set(ctx, (async () => {
    const init = await rpc(ctx, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "Resolvo", version: "1.0.0" } });
    const version = String(init.result.protocolVersion);
    if (!["2025-03-26", "2025-06-18", "2025-11-25"].includes(version) || !(init.result.capabilities as Record<string, unknown>)?.resources)
      throw new AppError("Use an MCP server supporting Streamable HTTP resources and protocol 2025-03-26, 2025-06-18 or 2025-11-25.", 422);
    const result = { id: init.sessionId, version };
    await rpc(ctx, "notifications/initialized", {}, result);
    return result;
  })());
  return sessions.get(ctx)!;
}
export const mcp: Connector = {
  id: "mcp", name: "MCP server", category: "Custom & databases", auth: ["none", "token", "oauth2"],
  description: "Read resources from a Streamable HTTP MCP server. No tools or remote code are executed.",
  fields: [{ key: "endpoint", label: "MCP HTTPS endpoint", required: true }, { key: "sourceUrlTemplate", label: "Original URL template (optional {id})" }],
  async list(ctx, _parent, cursor) {
    const { result } = await rpc(ctx, "resources/list", cursor ? { cursor } : {}, await session(ctx));
    const resources = result.resources as { uri: string; name: string; title?: string }[];
    if (!Array.isArray(resources)) throw new AppError("The MCP server returned no resource list.", 502);
    return { items: resources.map((r) => item(r.uri, r.title || r.name, "document", r.uri)), cursor: typeof result.nextCursor === "string" ? result.nextCursor : undefined };
  },
  async read(ctx, id) {
    const { result } = await rpc(ctx, "resources/read", { uri: id }, await session(ctx));
    const contents = result.contents as { text?: string; blob?: string }[];
    if (!Array.isArray(contents) || contents.some((c) => typeof c.text !== "string")) throw new AppError("This MCP resource is not text. Expose a text resource to index it.", 422);
    return { name: id.slice(0, 160), text: contents.map((c) => c.text).join("\n\n"), url: sourceUrl(ctx.config.sourceUrlTemplate?.replace("{id}", encodeURIComponent(id)) || id) };
  },
};
