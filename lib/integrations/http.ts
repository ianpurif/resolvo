import "server-only";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { AppError } from "@/lib/config";
import { isPublicAddress, validateWebsiteUrl } from "@/lib/rag/website";
import type { ConnectorRequest, ConnectorResponse } from "./types";

export class ConnectorError extends AppError {
  constructor(message: string, status: number, public retryAfter = 60) { super(message, status); }
}
export function integrationUrl(value: string) {
  const url = validateWebsiteUrl(value);
  if (url.protocol !== "https:") throw new AppError("Integration endpoints must use public HTTPS.", 400);
  return url;
}
export function hasUrlCredentials(value: string) {
  try {
    const url = new URL(value, "https://connector.invalid");
    return Boolean(url.username || url.password) || [...url.searchParams.keys()].some((key) => /^(access_token|refresh_token|api_key|apikey|x-api-key|token|secret|key|authorization|x-amz-signature|x-amz-credential|x-amz-security-token|sig)$/i.test(key));
  } catch { return false; }
}
export function sameOriginUrl(base: string, value: string) {
  const url = integrationUrl(new URL(value, base).href);
  if (url.origin !== integrationUrl(base).origin) throw new AppError("A provider returned a URL outside its API origin.", 502);
  return url.href;
}
export async function publicAddresses(host: string, signal: AbortSignal) {
  const records = await new Promise<{ address: string; family: number }[]>((resolve, reject) => {
    const abort = () => reject(new ConnectorError("Integration DNS request timed out.", 504));
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    (isIP(host) ? Promise.resolve([{ address: host, family: isIP(host) }]) : lookup(host, { all: true }))
      .then(resolve, () => reject(new ConnectorError("Integration host could not be resolved.", 502)))
      .finally(() => signal.removeEventListener("abort", abort));
  });
  if (!records.length || records.some((r) => !isPublicAddress(r.address)))
    throw new AppError("Private and reserved network addresses cannot be connected.", 400);
  return records;
}
export const connectorRequest: ConnectorRequest = async (value, options = {}) => {
  const signal = AbortSignal.timeout(20_000);
  let url = integrationUrl(value);
  for (let hop = 0; hop <= 3; hop++) {
    const addresses = await publicAddresses(url.hostname.replace(/^\[|\]$/g, ""), signal);
    const result = await new Promise<ConnectorResponse>((resolve, reject) => {
      const req = request(url, {
        method: options.method ?? "GET", signal,
        headers: { "User-Agent": "ResolvoConnectors/1.0", "Accept-Encoding": "identity", Accept: "application/json", ...options.headers },
        lookup: (_host, opts, callback) => {
          if (opts.all) callback(null, addresses);
          else { const ip = addresses.find((r) => !opts.family || opts.family === r.family) ?? addresses[0]; callback(null, ip.address, ip.family); }
        },
      }, (res) => {
        const chunks: Buffer[] = []; let size = 0;
        const headers = Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : v ?? ""]));
        res.on("data", (part: Buffer) => {
          size += part.length;
          if (size > 4 * 1024 * 1024) { res.destroy(); reject(new ConnectorError("This source exceeds the 4 MB import limit. Select a smaller source.", 413)); }
          else chunks.push(part);
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 502, headers, bytes: Buffer.concat(chunks) }));
        res.on("error", () => reject(new ConnectorError("Integration download was interrupted.", 502)));
      });
      req.on("error", () => reject(new ConnectorError("Integration request failed or timed out.", 502)));
      req.end(options.body);
    });
    if (result.status >= 300 && result.status < 400 && result.headers.location) {
      if (options.manualRedirect) return result;
      if (!options.redirect || options.body || options.method === "POST" || Object.keys(options.headers ?? {}).some((k) => /authorization|token|key|cookie/i.test(k)))
        throw new ConnectorError("The provider redirected an authenticated request. Check its API endpoint.", 502);
      url = integrationUrl(new URL(result.headers.location, url).href); continue;
    }
    return result;
  }
  throw new ConnectorError("The provider returned too many redirects.", 502);
};
export function checkResponse(response: ConnectorResponse) {
  if (response.status >= 200 && response.status < 300) return response;
  const retry = response.headers["retry-after"];
  const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : retry ? (Date.parse(retry) - Date.now()) / 1000 : 60;
  const status = response.status;
  throw new ConnectorError(status === 401 ? "Authorization expired. Reconnect this account."
    : status === 403 ? "The provider denied access. Check the account's permissions."
      : status === 404 ? "The source was deleted or is no longer accessible."
        : status === 429 ? "Provider rate limit reached. Synchronization will retry automatically."
          : `The provider returned HTTP ${status}.`, status, Math.max(1, Math.min(86400, Number.isFinite(seconds) ? seconds : 60)));
}
export function responseJson<T>(response: ConnectorResponse): T {
  checkResponse(response);
  try { return JSON.parse(response.bytes.toString("utf8")) as T; }
  catch { throw new ConnectorError("The provider returned invalid JSON.", 502); }
}
