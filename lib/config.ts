import "server-only";
const required = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "APP_URL",
  "DEEPSEEK_API_KEY",
  "VOYAGE_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;
export function configuration() {
  const missing = required.filter((name) => !process.env[name]?.trim());
  return { ready: !missing.length, missing };
}
export function authConfiguration() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  const origin = process.env.APP_URL?.trim();
  if (!url || !key || !origin)
    throw new AppError("Workspace authentication is not configured.", 503);
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new AppError("Workspace URL is not configured correctly.", 503);
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    (process.env.NODE_ENV === "production" &&
      parsed.protocol !== "https:" &&
      parsed.hostname !== "localhost" &&
      parsed.hostname !== "127.0.0.1")
  )
    throw new AppError("Use an HTTPS workspace URL in production.", 503);
  if (
    key === process.env.SUPABASE_SERVICE_ROLE_KEY ||
    key.startsWith("sb_secret_")
  )
    throw new AppError(
      "Authentication requires a publishable key, not a service key.",
      503,
    );
  if (key.split(".").length === 3) {
    try {
      if (
        JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString())
          .role !== "anon"
      )
        throw new Error();
    } catch {
      throw new AppError(
        "Authentication requires a publishable or anon key.",
        503,
      );
    }
  }
  return { url, key, origin: parsed.origin };
}
export function requireAIConfiguration() {
  if (
    !process.env.DEEPSEEK_API_KEY?.trim() ||
    !process.env.VOYAGE_API_KEY?.trim() ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  )
    throw new AppError("The AI providers are not configured.", 503);
}
export class AppError extends Error {
  constructor(
    message: string,
    public status = 500,
  ) {
    super(message);
  }
}
