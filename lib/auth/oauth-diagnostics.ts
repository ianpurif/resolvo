import "server-only";
import { createServerClient } from "@supabase/ssr";
import { AppError, type authConfiguration } from "@/lib/config";

export interface GoogleOAuthDiagnostic {
  appCallback: string;
  googleCallback: string;
  googleClientId: string;
  pkceReady: boolean;
  googleError: string | null;
  readyForInteractiveLogin: boolean;
}

// This read-only probe starts a fresh OAuth request without a browser/user session.
// It follows Google's public redirects only; it never exchanges a code or logs state.
export async function inspectGoogleOAuth(
  config: ReturnType<typeof authConfiguration>,
): Promise<GoogleOAuthDiagnostic> {
  const appCallback = new URL("/auth/callback", config.origin).href;
  let verifierCreated = false;
  const db = createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => [],
      setAll: (items) => {
        verifierCreated ||= items.some((item) =>
          item.name.includes("code-verifier"),
        );
      },
    },
  });
  const { data, error } = await db.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: appCallback, skipBrowserRedirect: true },
  });
  if (error || !data.url)
    throw new AppError("Supabase could not initialize Google OAuth.", 502);
  const authorize = new URL(data.url);
  const pkceReady =
    verifierCreated &&
    authorize.searchParams.get("code_challenge_method") === "s256" &&
    Boolean(authorize.searchParams.get("code_challenge")) &&
    authorize.searchParams.get("redirect_to") === appCallback;
  if (!pkceReady)
    throw new AppError(
      "The OAuth request is missing its callback or PKCE challenge.",
      502,
    );
  const signal = AbortSignal.timeout(20000);
  const response = await fetch(authorize, { redirect: "manual", signal });
  const location = response.headers.get("location");
  if (![302, 303, 307].includes(response.status) || !location)
    throw new AppError(
      "Supabase did not redirect to Google. Check Authentication → Sign In / Providers → Google.",
      502,
    );
  let google = new URL(location, authorize);
  const googleCallback = google.searchParams.get("redirect_uri") ?? "";
  const googleClientId = google.searchParams.get("client_id") ?? "";
  if (!googleCallback || !googleClientId)
    throw new AppError(
      "The Google request is missing its client ID or redirect URI.",
      502,
    );
  const result: GoogleOAuthDiagnostic = {
    appCallback,
    googleCallback,
    googleClientId,
    pkceReady,
    googleError: null,
    readyForInteractiveLogin: false,
  };
  for (let hop = 0; hop < 5; hop++) {
    if (
      google.protocol !== "https:" ||
      google.hostname !== "accounts.google.com"
    )
      throw new AppError(
        "Supabase returned an unexpected Google authorization destination.",
        502,
      );
    const reply = await fetch(google, { redirect: "manual", signal });
    const next = reply.headers.get("location");
    if (next && [301, 302, 303, 307, 308].includes(reply.status)) {
      google = new URL(next, google);
      continue;
    }
    const body = await reply.text();
    // Google serves OAuth errors as HTTP 200 pages as well as HTTP 400.
    const errorCode = body.match(
      /data-error-code=["']([a-zA-Z0-9_]+)["']/,
    )?.[1];
    result.googleError =
      errorCode ??
      (body.includes("redirect_uri_mismatch")
        ? "redirect_uri_mismatch"
        : null) ??
      (google.pathname.includes("/error") ? "oauth_error" : null) ??
      (!reply.ok ? "http_" + reply.status : null);
    result.readyForInteractiveLogin =
      !result.googleError && /\/signin\//.test(google.pathname) && reply.ok;
    return result;
  }
  throw new AppError(
    "Google redirected too many times to verify OAuth configuration.",
    502,
  );
}
