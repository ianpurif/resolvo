import "server-only";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { checkDatabaseError } from "@/lib/supabase/server";
import { AppError } from "@/lib/config";
import type { Organization } from "@/types";
export interface TenantContext {
  db: SupabaseClient;
  user: User;
  organization: Organization;
  role: "owner" | "member";
}
export function requireKnowledgeOwner(context: TenantContext) {
  if (context.role !== "owner") throw new AppError("Only workspace owners can change company knowledge.", 403);
}
export async function resolveIdentity(db: SupabaseClient) {
  const { data, error } = await db.auth.getUser();
  if (error || !data.user || data.user.app_metadata.provider !== "google")
    throw new AppError("Sign in with Google to continue.", 401);
  return { db, user: data.user };
}
export async function findWorkspace(
  identity: Awaited<ReturnType<typeof resolveIdentity>>,
): Promise<TenantContext | null> {
  const result = await identity.db
    .from("organization_members")
    .select("role,organizations!inner(id,name,industry,created_at)")
    .eq("user_id", identity.user.id)
    .maybeSingle();
  checkDatabaseError(result.error, "resolve your workspace");
  if (!result.data) return null;
  const organization = result.data.organizations as unknown as Organization;
  if (!organization?.id || !["owner", "member"].includes(result.data.role))
    throw new AppError("Workspace access was denied.", 403);
  return { ...identity, organization, role: result.data.role };
}

export async function resolveWorkspace(
  identity: Awaited<ReturnType<typeof resolveIdentity>>,
): Promise<TenantContext> {
  const context = await findWorkspace(identity);
  if (!context) throw new AppError("Create your company workspace first.", 403);
  return context;
}
