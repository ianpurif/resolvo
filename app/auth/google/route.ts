import { NextResponse } from "next/server";
import { sessionDatabase } from "@/lib/supabase/server";
import { authConfiguration } from "@/lib/config";
import { apiError, requireSameOrigin } from "@/lib/api";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const db = await sessionDatabase();
    const { data, error } = await db.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: authConfiguration().origin + "/auth/callback",
        skipBrowserRedirect: true,
      },
    });
    if (error || !data.url)
      return NextResponse.redirect(
        authConfiguration().origin + "/login?error=oauth",
        303,
      );
    return NextResponse.redirect(data.url, 303);
  } catch (error) {
    return apiError(error);
  }
}
