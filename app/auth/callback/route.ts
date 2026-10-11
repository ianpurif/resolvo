import { NextResponse } from "next/server";
import { sessionDatabase } from "@/lib/supabase/server";
import { authConfiguration } from "@/lib/config";
import { findWorkspace } from "@/lib/auth-context";
export async function GET(request: Request) {
  const origin = authConfiguration().origin;
  const db = await sessionDatabase();
  const code = new URL(request.url).searchParams.get("code");
  if (code) {
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data } = await db.auth.getUser();
      if (data.user?.app_metadata.provider === "google") {
        const context = await findWorkspace({ db, user: data.user });
        const response = NextResponse.redirect(
          origin + (context ? "/dashboard" : "/onboarding"),
          303,
        );
        response.cookies.set("resolvo-signed-in", "1", {
          path: "/",
          maxAge: 30,
          sameSite: "lax",
          secure: origin.startsWith("https:"),
        });
        return response;
      }
      await db.auth.signOut({ scope: "local" });
    }
  }
  return NextResponse.redirect(origin + "/login?error=oauth", 303);
}
