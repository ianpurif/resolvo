import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { authConfiguration, AppError } from "@/lib/config";
export async function sessionDatabase() {
  const config = authConfiguration();
  const jar = await cookies();
  return createServerClient(config.url, config.key, {
    cookieOptions: {
      httpOnly: true,
      secure: config.origin.startsWith("https:"),
      sameSite: "lax",
      path: "/",
    },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (items) => {
        try {
          for (const { name, value, options } of items)
            jar.set(name, value, options);
        } catch {
          /* Server Components are read-only; proxy refreshes their session. */
        }
      },
    },
  });
}
export function checkDatabaseError(
  error: { message: string; code?: string } | null,
  action: string,
) {
  if (error) {
    console.error(`[database] ${action} failed (${error.code ?? "unknown"})`);
    throw new AppError(`We couldn't ${action}. Please try again.`, 502);
  }
}
