import "server-only";
import { createClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/config";
import type { TenantContext } from "@/lib/auth";
import type { Connection } from "./types";
export function integrationDatabase() {
  const url = process.env.SUPABASE_URL?.trim(), key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new AppError("Configure the server Supabase key to use integrations.", 503);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export function integrationError(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (["42P01", "42883", "PGRST202", "PGRST205", "42703"].includes(error.code ?? ""))
    throw new AppError("Apply the integration migrations in supabase/migrations before connecting accounts.", 503);
  if (/lease expired|task expired|capacity|in progress/.test(error.message)) throw new AppError("Synchronization is busy. Saved work will retry shortly.", 409);
  if (/not found|access denied|owners|disconnected/.test(error.message)) throw new AppError("Integration access was denied or the account was disconnected.", 403);
  console.error("[integrations] Database operation failed", error.code ?? "unknown");
  throw new AppError("The integration could not be saved. Retry the operation.", 502);
}
export async function ownedConnection(context: TenantContext, id: string) {
  const result = await context.db.from("integration_connections").select("*").eq("id", id)
    .eq("organization_id", context.organization.id).eq("created_by", context.user.id).maybeSingle();
  integrationError(result.error);
  if (!result.data) throw new AppError("Integration not found.", 404);
  return result.data as Connection;
}
export async function configureConnection(context: TenantContext, id: string, action: string, data: object = {}) {
  await ownedConnection(context, id);
  const result = await integrationDatabase().rpc("configure_integration", { p_connection: id, p_organization: context.organization.id, p_user: context.user.id, p_action: action, p_data: data });
  integrationError(result.error);
}
