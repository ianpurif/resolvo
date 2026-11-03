import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authConfiguration } from "@/lib/config";
import {
  declaredKnowledgeBodySize,
  MAX_KNOWLEDGE_REQUEST_SIZE,
  UPLOAD_SIZE_ERROR,
} from "@/lib/knowledge-limits";
export async function proxy(request: NextRequest) {
  // These endpoints authenticate their own scheduler/HMAC credentials. Never
  // exempt other integration routes from the normal verified-user session.
  if (request.nextUrl.pathname === "/api/integrations/worker" || /^\/api\/integrations\/webhooks\/[0-9a-f-]{36}$/.test(request.nextUrl.pathname))
    return NextResponse.next({ request });
  const api = request.nextUrl.pathname.startsWith("/api/");
  if (
    ["POST", "PATCH"].includes(request.method) &&
    /^\/api\/knowledge(?:\/[^/]+)?$/.test(request.nextUrl.pathname)
  ) {
    const size = declaredKnowledgeBodySize(request.headers);
    if (
      size !== null &&
      (!Number.isFinite(size) || size > MAX_KNOWLEDGE_REQUEST_SIZE)
    )
      return NextResponse.json(
        {
          error: Number.isFinite(size)
            ? UPLOAD_SIZE_ERROR
            : "Invalid Content-Length.",
        },
        {
          status: Number.isFinite(size) ? 413 : 400,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
  }
  let config;
  try {
    config = authConfiguration();
  } catch {
    return api
      ? NextResponse.json(
          { error: "Authentication is not configured." },
          { status: 503 },
        )
      : NextResponse.redirect(new URL("/login?error=setup", request.url));
  }
  let response = NextResponse.next({ request });
  const db = createServerClient(config.url, config.key, {
    cookieOptions: {
      httpOnly: true,
      secure: config.origin.startsWith("https:"),
      sameSite: "lax",
      path: "/",
    },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        for (const { name, value } of items) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of items)
          response.cookies.set(name, value, options);
      },
    },
  });
  const { data, error } = await db.auth.getClaims();
  if (
    error ||
    !data?.claims ||
    data.claims.app_metadata?.provider !== "google"
  ) {
    const denied = api
      ? NextResponse.json(
          { error: "Sign in with Google to continue." },
          { status: 401 },
        )
      : NextResponse.redirect(new URL("/login", request.url));
    for (const cookie of response.cookies.getAll()) denied.cookies.set(cookie);
    denied.headers.set("Cache-Control", "private, no-store");
    return denied;
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/support/:path*",
    "/onboarding/:path*",
    "/api/:path*",
  ],
};
