import "server-only";
import { createClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/config";

export function database() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new AppError("Connect Supabase to use this feature.", 503);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function checkDatabaseError(error: { message: string } | null, action: string) {
  if (error) {
    // Do not return provider payloads, database internals, or secrets to the browser.
    console.error(`[database] ${action} failed`);
    throw new AppError(`We couldn't ${action}. Please try again.`, 502);
  }
}
