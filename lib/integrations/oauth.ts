import "server-only";
import { createHash, randomBytes, sign } from "node:crypto";
import { z } from "zod";
import { AppError, authConfiguration } from "@/lib/config";
import { connectorRequest, integrationUrl, responseJson } from "./http";
import { integrationDatabase, integrationError } from "./database";
import { seal, unseal } from "./credentials";
import type { Connection, Credential } from "./types";
export const oauthInputSchema = z.object({ authorizationUrl: z.url(), tokenUrl: z.url(), clientId: z.string().min(1).max(2048), clientSecret: z.string().max(4096).default(""), scope: z.string().max(2048).default(""), basic: z.boolean().optional() }).strict();
export type OAuthConfig = z.infer<typeof oauthInputSchema> & { pkce?: boolean; extra?: Record<string, string> };
export function configuredOAuth(provider: string): OAuthConfig | null {
  const definitions: Record<string, { prefix: string; authorizationUrl: string; tokenUrl: string; scope: string; extra?: Record<string, string> }> = {
    "google-drive": { prefix: "GOOGLE", authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth", tokenUrl: "https://oauth2.googleapis.com/token", scope: "https://www.googleapis.com/auth/drive.readonly", extra: { access_type: "offline", prompt: "consent" } },
    "microsoft-files": { prefix: "MICROSOFT", authorizationUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize", tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token", scope: "offline_access Files.Read.All Sites.Read.All" },
    github: { prefix: "GITHUB", authorizationUrl: "https://github.com/login/oauth/authorize", tokenUrl: "https://github.com/login/oauth/access_token", scope: "repo read:user" },
  };
  const d = definitions[provider];
  if (!d) return null;
  const clientId = process.env[`INTEGRATION_${d.prefix}_CLIENT_ID`]?.trim(), clientSecret = process.env[`INTEGRATION_${d.prefix}_CLIENT_SECRET`]?.trim();
  return clientId && clientSecret ? { ...d, clientId, clientSecret, pkce: true } : null;
}
export function oauthCallback() { return `${authConfiguration().origin}/api/integrations/oauth/callback`; }
export function stateHash(state: string) { return createHash("sha256").update(state).digest("hex"); }
export function authorizationRequest(config: OAuthConfig) {
  const state = randomBytes(32).toString("base64url"), verifier = randomBytes(48).toString("base64url");
  const url = integrationUrl(config.authorizationUrl);
  integrationUrl(config.tokenUrl);
  for (const [key, value] of Object.entries({ response_type: "code", client_id: config.clientId, redirect_uri: oauthCallback(), scope: config.scope, state, ...config.extra })) url.searchParams.set(key, value);
  if (config.pkce !== false) { url.searchParams.set("code_challenge", createHash("sha256").update(verifier).digest("base64url")); url.searchParams.set("code_challenge_method", "S256"); }
  return { state, verifier, url: url.href };
}
const tokenSchema = z.object({ access_token: z.string().min(1), refresh_token: z.string().optional(), expires_in: z.coerce.number().positive().optional(), token_type: z.string().optional() });
async function tokenRequest(config: NonNullable<Credential["oauth"]>, params: Record<string, string>, previous?: Credential): Promise<Credential> {
  const body = new URLSearchParams({ ...params, client_id: config.clientId, ...(config.basic ? {} : { client_secret: config.clientSecret }) });
  const response = responseJson<unknown>(await connectorRequest(config.tokenUrl, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded", ...(config.basic ? { Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}` } : {}) }, body: body.toString() }));
  const result = tokenSchema.safeParse(response);
  if (!result.success) throw new AppError("The provider did not issue an access token. Check the OAuth app configuration and reconnect.", 401);
  if (result.data.token_type && result.data.token_type.toLowerCase() !== "bearer") throw new AppError("This provider's token type is not supported by the connector.", 422);
  return { ...previous, accessToken: result.data.access_token, refreshToken: result.data.refresh_token ?? previous?.refreshToken, expiresAt: result.data.expires_in ? Date.now() + result.data.expires_in * 1000 : undefined, oauth: config };
}
export async function exchangeCode(config: OAuthConfig, code: string, verifier: string) {
  return tokenRequest(config, { grant_type: "authorization_code", code, redirect_uri: oauthCallback(), ...(config.pkce !== false ? { code_verifier: verifier } : {}) });
}
export async function credentialFor(connection: Connection): Promise<Credential> {
  const db = integrationDatabase(), scope = `${connection.organization_id}/${connection.id}`;
  const saved = await db.from("integration_credentials").select("ciphertext").eq("connection_id", connection.id).maybeSingle();
  integrationError(saved.error);
  if (!saved.data) throw new AppError("Reconnect this integration to restore its credentials.", 401);
  let credential = unseal<Credential>(saved.data.ciphertext, scope);
  if (credential.serviceAccount) {
    const account = credential.serviceAccount, now = Math.floor(Date.now() / 1000);
    if (connection.provider !== "google-drive") throw new AppError("Service accounts are supported by the Google Drive connector.", 400);
    const unsigned = [Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url"), Buffer.from(JSON.stringify({ iss: account.client_email, scope: "https://www.googleapis.com/auth/drive.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })).toString("base64url")].join(".");
    if (!credential.accessToken || !credential.expiresAt || credential.expiresAt < Date.now() + 60_000) {
      const assertion = `${unsigned}.${sign("RSA-SHA256", Buffer.from(unsigned), account.private_key).toString("base64url")}`;
      const response = tokenSchema.parse(responseJson<unknown>(await connectorRequest("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString() })));
      credential = { ...credential, accessToken: response.access_token, expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000 };
      const updated = await db.rpc("save_integration_credential", { p_connection: connection.id, p_ciphertext: seal(credential, scope) }); integrationError(updated.error);
    }
  } else if (credential.expiresAt && credential.expiresAt < Date.now() + 60_000) {
    if (!credential.refreshToken || !credential.oauth) throw new AppError("This access token expired. Reconnect the account.", 401);
    const refresh = await db.rpc("claim_integration_refresh", { p_connection: connection.id }); integrationError(refresh.error);
    if (!refresh.data) throw new AppError("This account's credentials are refreshing. Retry shortly.", 409);
    const locked = unseal<Credential>(refresh.data.ciphertext, scope);
    try {
      credential = locked.expiresAt && locked.expiresAt > Date.now() + 60_000 ? locked
        : await tokenRequest(locked.oauth!, { grant_type: "refresh_token", refresh_token: locked.refreshToken! }, locked);
      const updated = await db.rpc("finish_integration_refresh", { p_connection: connection.id, p_lease: refresh.data.lease, p_ciphertext: seal(credential, scope) }); integrationError(updated.error);
    } catch (error) {
      await db.rpc("finish_integration_refresh", { p_connection: connection.id, p_lease: refresh.data.lease, p_ciphertext: null });
      throw error;
    }
  }
  return credential;
}
