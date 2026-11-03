import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError } from "@/lib/config";
import type { TenantContext } from "@/lib/auth";
import { connector, validateConfig } from "./registry";
import { connectorRequest } from "./http";
import { seal } from "./credentials";
import { credentialFor, oauthInputSchema } from "./oauth";
import { integrationDatabase, integrationError } from "./database";
import type { Connection, ConnectorContext, Credential } from "./types";
export const connectionInput = z.object({
  provider: z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/), name: z.string().trim().min(1).max(160),
  config: z.record(z.string().max(80), z.string().max(8192)).default({}), visibility: z.enum(["private", "workspace"]).default("private"),
  authentication: z.object({ mode: z.enum(["none", "token", "basic", "service-account", "oauth2"]), token: z.string().max(16000).optional(), username: z.string().max(320).optional(), password: z.string().max(16000).optional(),
    serviceAccount: z.object({ client_email: z.email(), private_key: z.string().min(64).max(16000) }).optional(), oauth: oauthInputSchema.optional(), webhookSecret: z.string().min(32).max(256).optional() }).strict(),
}).strict();
export const selectionInput = z.object({ items: z.array(z.object({ id: z.string().min(1).max(2048), name: z.string().min(1).max(160), kind: z.enum(["container", "document"]) }).strict()) }).strict();
export type ConnectionInput = z.infer<typeof connectionInput>;
export function validateConnection(context: TenantContext, input: ConnectionInput) {
  const provider = connector(input.provider);
  if (!provider.auth.includes(input.authentication.mode)) throw new AppError("This authentication method is not supported by the connector.", 400);
  if (input.visibility === "workspace" && context.role !== "owner") throw new AppError("Only workspace owners can share connected knowledge.", 403);
  validateConfig(input.provider, input.config);
}
export async function connectorContext(connection: Connection): Promise<ConnectorContext> {
  if (["disconnected", "reauth"].includes(connection.status)) throw new AppError("Reconnect this account before reading sources.", 401);
  const started = Date.now(); let calls = 0;
  return { config: connection.config, credential: await credentialFor(connection), request: async (url, options) => {
    if (++calls > 40 || Date.now() - started > 55_000) throw new AppError("This source takes too long to read in one request. Select smaller sources.", 422);
    return connectorRequest(url, options);
  } };
}
export async function persistConnection(context: TenantContext, input: ConnectionInput, credential: Credential, id = randomUUID()) {
  validateConnection(context, input);
  const scope = `${context.organization.id}/${id}`;
  const encrypted = seal(credential, scope);
  const result = await integrationDatabase().rpc("create_integration", { p_organization: context.organization.id, p_user: context.user.id, p_id: id,
    p_provider: input.provider, p_name: input.name, p_config: input.config, p_visibility: input.visibility, p_ciphertext: encrypted });
  integrationError(result.error);
  return id;
}
export async function connectWithCredential(context: TenantContext, input: ConnectionInput) {
  validateConnection(context, input);
  const auth = input.authentication;
  if (auth.mode === "oauth2") throw new AppError("Start the OAuth authorization flow to connect this account.", 400);
  if (auth.mode === "token" && !auth.token?.trim() || auth.mode === "basic" && (!auth.username || !auth.password) || auth.mode === "service-account" && !auth.serviceAccount)
    throw new AppError("Enter the required authentication credentials.", 400);
  const credential: Credential = auth.mode === "token" ? { token: auth.token!.trim() } : auth.mode === "basic" ? { username: auth.username, password: auth.password }
    : auth.mode === "service-account" ? { serviceAccount: auth.serviceAccount } : {};
  credential.webhookSecret = auth.webhookSecret;
  // Validate remotely before claiming a connection. No source content is indexed.
  // Service accounts need the durable encrypted row for short-lived token caching.
  if (auth.mode !== "service-account") await connector(input.provider).list({ config: input.config, credential, request: connectorRequest });
  const id = await persistConnection(context, input, credential);
  if (auth.mode === "service-account") {
    try {
      const connection = { id, organization_id: context.organization.id, config: input.config, provider: input.provider, status: "connected" } as Connection;
      await connector(input.provider).list(await connectorContext(connection));
    } catch (error) {
      await integrationDatabase().rpc("configure_integration", { p_connection: id, p_organization: context.organization.id, p_user: context.user.id, p_action: "disconnect" });
      throw error;
    }
  }
  return id;
}
