import "server-only";
import { AppError } from "@/lib/config";
import type { Connector, ConnectorConfig } from "./types";
import { googleDrive } from "./providers/google-drive";
import { microsoftFiles } from "./providers/microsoft-files";
import { github } from "./providers/github";
import { customApi, website } from "./providers/custom";
import { mcp } from "./providers/mcp";
import { notion } from "./providers/notion";
import { slackConnector } from "./providers/slack";
const connectors = new Map<string, Connector>([googleDrive, microsoftFiles, github, notion, slackConnector, customApi, website, mcp].map((c) => [c.id, c]));
export function connector(id: string) {
  const result = connectors.get(id);
  if (!result) throw new AppError("This connector is not installed. Use Custom REST API or MCP for another service.", 400);
  return result;
}
export function catalog() { return [...connectors.values()].map((c) => ({ id: c.id, name: c.name, category: c.category, description: c.description, auth: c.auth, fields: c.fields })); }
export function validateConfig(id: string, config: ConnectorConfig) {
  const provider = connector(id);
  const allowed = new Set(provider.fields.map((f) => f.key));
  for (const field of provider.fields) if (field.required && !config[field.key]?.trim()) throw new AppError(`Enter ${field.label}.`, 400);
  for (const [key, value] of Object.entries(config)) {
    if (!allowed.has(key)) throw new AppError(`Unknown connector setting: ${key}.`, 400);
    if (/^https?:\/\//.test(value) && /[?&](?:access_token|api_key|apikey|token|secret|key)=/i.test(value))
      throw new AppError("Put credentials in the authentication fields, not in URLs.", 400);
  }
  return config;
}
