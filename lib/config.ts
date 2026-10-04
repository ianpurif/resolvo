import "server-only";

const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "DEEPSEEK_API_KEY", "VOYAGE_API_KEY"] as const;

export function configuration() {
  const missing = required.filter((name) => !process.env[name]?.trim());
  return { ready: missing.length === 0, databaseReady: Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()), missing };
}

export function requireConfiguration() {
  if (!configuration().ready) {
    throw new AppError("Support is being set up. Please try again once the workspace is connected.", 503);
  }
}

export class AppError extends Error {
  constructor(message: string, public status = 500) { super(message); }
}
