import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sessionDatabase } from "@/lib/supabase/server";
import { authConfiguration } from "@/lib/config";
import { apiError, requireSameOrigin } from "@/lib/api";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const db = await sessionDatabase();
    const { error } = await db.auth.signOut({ scope: "global" });
    // Always remove this browser's session, even if the provider is unavailable.
    const jar = await cookies();
    for (const cookie of jar.getAll())
      if (cookie.name.startsWith("sb-")) jar.delete(cookie.name);
    const response = NextResponse.redirect(
      authConfiguration().origin + (error ? "/login?error=signout" : "/login"),
      303,
    );
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Clear-Site-Data", '"cache", "storage"');
    return response;
  } catch (error) {
    return apiError(error);
  }
}
