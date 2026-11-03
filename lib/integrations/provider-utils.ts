import "server-only";
import { AppError } from "@/lib/config";
import { prepareFile, normalizeText } from "@/lib/rag/ingest";
import { extractVisibleText } from "@/lib/rag/website";
import { checkResponse, hasUrlCredentials, responseJson, sameOriginUrl } from "./http";
import type { ConnectorContext, ConnectorResponse, RemoteItem } from "./types";
export const enc = encodeURIComponent;
export function setting(ctx: ConnectorContext, key: string) {
  const value = ctx.config[key]?.trim();
  if (!value) throw new AppError(`Configure ${key} for this integration.`, 400);
  return value;
}
export function authHeaders(ctx: ConnectorContext): Record<string, string> {
  const c = ctx.credential;
  if (c.username !== undefined) return { Authorization: `Basic ${Buffer.from(`${c.username}:${c.password ?? ""}`).toString("base64")}` };
  const token = c.accessToken ?? c.token;
  if (!token) return {};
  const header = ctx.config.authHeader || "Authorization";
  if (!/^(Authorization|X-[A-Za-z0-9-]+|api-key|apikey|PRIVATE-TOKEN)$/.test(header)) throw new AppError("Use Authorization, an API key header, or an X- header.", 400);
  return { [header]: header === "Authorization" ? `${ctx.config.authScheme ?? "Bearer"} ${token}`.trim() : token };
}
export async function json<T>(ctx: ConnectorContext, url: string, body?: unknown, headers: Record<string, string> = {}) {
  return responseJson<T>(await ctx.request(url, { method: body === undefined ? "GET" : "POST",
    headers: { ...authHeaders(ctx), ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body) }));
}
export function pageUrl(base: string, path: string, cursor?: string) { return sameOriginUrl(base, cursor || path); }
export function sourceUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try { const u = new URL(value); return ["https:", "http:"].includes(u.protocol) && !hasUrlCredentials(value) ? u.href : undefined; } catch { return undefined; }
}
export function item(id: string, name: string, kind: RemoteItem["kind"], url?: string, version?: string): RemoteItem {
  if (!id || id.length > 2048) throw new AppError("The provider returned an invalid source identifier.", 502);
  return { id, name: name.slice(0, 160) || id.slice(0, 160), kind, url: sourceUrl(url), version };
}
export async function documentText(name: string, response: ConnectorResponse) {
  checkResponse(response);
  if (/\.html?$/i.test(name) || response.headers["content-type"]?.includes("text/html")) return extractVisibleText(response.bytes.toString("utf8")).text;
  const extension = name.split(".").at(-1)?.toLowerCase();
  if (["pdf", "docx", "csv", "tsv", "json"].includes(extension ?? ""))
    return (await prepareFile(new File([new Uint8Array(response.bytes)], name))).text;
  try { return normalizeText(new TextDecoder("utf-8", { fatal: true }).decode(response.bytes)); }
  catch { throw new AppError("This file is not supported text. Select PDF, DOCX, or a UTF-8 document.", 422); }
}
export function readableFile(name: string) {
  return /\.(pdf|docx|txt|md|mdx|csv|tsv|json|html?|xml|ya?ml|log|sql|[cm]?[jt]sx?|py|rs|go|java|c|cpp|h|css|sh|toml|ini)$/i.test(name) || /^(README|LICENSE|Dockerfile)$/i.test(name);
}
