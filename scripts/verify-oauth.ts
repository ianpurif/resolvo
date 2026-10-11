import { authConfiguration, AppError } from "../lib/config";
import { inspectGoogleOAuth } from "../lib/auth/oauth-diagnostics";

async function main() {
  const result = await inspectGoogleOAuth(authConfiguration());
  console.log(
    "Resolvo callback (Supabase Redirect URLs): " + result.appCallback,
  );
  console.log(
    "Google callback (Google Authorized redirect URIs): " +
      result.googleCallback,
  );
  console.log(
    "Google OAuth client ID (public identifier): " + result.googleClientId,
  );
  console.log("PASS Supabase OAuth initialization and PKCE");
  if (result.googleError) {
    console.error("FAIL Google authorization: " + result.googleError);
    if (result.googleError === "redirect_uri_mismatch")
      console.error(
        "Google Cloud Console → Google Auth Platform → Clients → edit the client above → Authorized redirect URIs: add the exact Google callback above and save. Confirm the same web client ID/secret in Supabase's Google provider.",
      );
    process.exitCode = 1;
  } else if (result.readyForInteractiveLogin) {
    console.log(
      "PASS Google accepted the redirect and reached its sign-in page.",
    );
    console.log(
      "Finish Google sign-in in your browser to verify consent, the session exchange and dashboard access.",
    );
  } else {
    console.error(
      "UNVERIFIED Google did not reach an identifiable sign-in page.",
    );
    process.exitCode = 1;
  }
}
main().catch((error) => {
  console.error(
    error instanceof AppError
      ? error.message
      : "OAuth verification could not finish. Check configuration and network availability.",
  );
  process.exitCode = 1;
});
