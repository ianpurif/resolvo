import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/auth";
import { authConfiguration, AppError } from "@/lib/config";
import { stateHash, exchangeCode, type OAuthConfig } from "@/lib/integrations/oauth";
import { unseal } from "@/lib/integrations/credentials";
import { integrationDatabase, integrationError } from "@/lib/integrations/database";
import { persistConnection, type ConnectionInput } from "@/lib/integrations/service";
export const runtime = "nodejs";
export async function GET(request: Request) {
  let success = false;
  try {
    const context = await requireTenant(), params = new URL(request.url).searchParams;
    const state = params.get("state"), code = params.get("code"), jar = await cookies();
    if (!state || state !== jar.get("resolvo-integration-state")?.value || !code || code.length > 8192 || params.has("error")) throw new AppError("OAuth authorization was cancelled or expired.", 400);
    const hash = stateHash(state);
    const result = await integrationDatabase().from("integration_oauth_states").delete().eq("state_hash", hash)
      .eq("organization_id", context.organization.id).eq("user_id", context.user.id).gt("expires_at", new Date().toISOString()).select("ciphertext").maybeSingle();
    integrationError(result.error);
    if (!result.data) throw new AppError("OAuth authorization expired or was already used.", 400);
    const saved = unseal<{ input: ConnectionInput; oauth: OAuthConfig; verifier: string }>(result.data.ciphertext, `${context.organization.id}/${context.user.id}/${hash}`);
    const credential = await exchangeCode(saved.oauth, code, saved.verifier);
    credential.webhookSecret = saved.input.authentication.webhookSecret;
    await persistConnection(context, saved.input, credential);
    success = true;
  } catch { console.error("[integrations] OAuth callback failed; no tokens or provider responses logged"); }
  const response = NextResponse.redirect(`${authConfiguration().origin}/admin/integrations?oauth=${success ? "connected" : "failed"}`);
  response.cookies.set("resolvo-integration-state", "", { httpOnly: true, sameSite: "lax", secure: authConfiguration().origin.startsWith("https:"), path: "/api/integrations/oauth", maxAge: 0 });
  return response;
}
