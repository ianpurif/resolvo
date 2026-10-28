export type ConnectorAuth = "oauth2" | "token" | "basic" | "service-account" | "none";
export type ConnectorConfig = Record<string, string>;
export interface Credential {
  webhookSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  token?: string;
  username?: string;
  password?: string;
  serviceAccount?: { client_email: string; private_key: string };
  oauth?: { tokenUrl: string; clientId: string; clientSecret: string; scope: string; basic?: boolean };
}
export interface RemoteItem {
  id: string;
  name: string;
  kind: "container" | "document";
  url?: string;
  version?: string;
}
export interface RemotePage { items: RemoteItem[]; cursor?: string }
export interface RemoteDocument {
  name: string;
  text?: string;
  url?: string;
  version?: string;
}
export interface ConnectorContext {
  config: ConnectorConfig;
  credential: Credential;
  request: ConnectorRequest;
}
export interface ConnectorResponse { status: number; headers: Record<string, string>; bytes: Buffer }
export type ConnectorRequest = (url: string, options?: {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  // Explicitly permitted, credential-free downloads only. Each hop is validated.
  redirect?: boolean;
  manualRedirect?: boolean;
}) => Promise<ConnectorResponse>;
export interface Connector {
  id: string;
  name: string;
  category: string;
  description: string;
  auth: ConnectorAuth[];
  fields: { key: string; label: string; placeholder?: string; required?: boolean }[];
  list(context: ConnectorContext, parent?: string, cursor?: string): Promise<RemotePage>;
  read(context: ConnectorContext, id: string, previousVersion?: string): Promise<RemoteDocument>;
}
export interface Connection {
  id: string;
  organization_id: string;
  created_by: string;
  provider: string;
  name: string;
  config: ConnectorConfig;
  visibility: "private" | "workspace";
  status: "connected" | "error" | "reauth" | "disconnected";
  sync_interval_minutes: number;
  next_sync_at: string;
  last_sync_at: string | null;
  last_error: string | null;
  generation: string | null;
  lease: string | null;
  lease_until: string | null;
}
