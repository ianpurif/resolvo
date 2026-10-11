import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { sessionDatabase } from "@/lib/supabase/server";
import { AppError } from "@/lib/config";
import {
  resolveIdentity,
  resolveWorkspace,
  findWorkspace,
} from "./auth-context";
export type { TenantContext } from "./auth-context";
export const requireIdentity = cache(async () =>
  resolveIdentity(await sessionDatabase()),
);
export const requireTenant = cache(async () =>
  resolveWorkspace(await requireIdentity()),
);
export async function requireWorkspacePage() {
  try {
    const context = await findWorkspace(await requireIdentity());
    if (!context) redirect("/onboarding");
    return context;
  } catch (error) {
    if (error instanceof AppError && error.status === 401) redirect("/login");
    if (error instanceof AppError && error.status === 403)
      redirect("/onboarding");
    if (error instanceof AppError && error.status === 503)
      redirect("/login?error=setup");
    throw error;
  }
}
