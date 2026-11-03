import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/auth";
import { apiError, requireSameOrigin } from "@/lib/api";
import { readBoundedJson } from "@/lib/bounded-json";
import { AppError, authConfiguration } from "@/lib/config";
import { connectionInput, validateConnection } from "@/lib/integrations/service";
import { authorizationRequest, configuredOAuth, stateHash } from "@/lib/integrations/oauth";
import { integrationDatabase, integrationError } from "@/lib/integrations/database";
import { seal } from "@/lib/integrations/credentials";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request); const context = await requireTenant();
    const input = connectionInput.parse(await readBoundedJson(request, 65536)); validateConnection(context, input);
    if (input.authentication.mode !== "oauth2") throw new AppError("Choose OAuth authorization.", 400);
    const oauth = configuredOAuth(input.provider) ?? input.authentication.oauth;
    if (!oauth) throw new AppError("Configure the provider's OAuth application or enter a custom OAuth client.", 503);
    const auth = authorizationRequest(oauth), hash = stateHash(auth.state), db = integrationDatabase();
    await db.from("integration_oauth_states").delete().lt("expires_at", new Date().toISOString());
    const result = await db.from("integration_oauth_states").insert({ state_hash: hash, organization_id: context.organization.id, user_id: context.user.id,
      ciphertext: seal({ input, oauth, verifier: auth.verifier }, `${context.organization.id}/${context.user.id}/${hash}`), expires_at: new Date(Date.now() + 600000).toISOString() });
    integrationError(result.error);
    const response = NextResponse.json({ authorizationUrl: auth.url });
    response.cookies.set("resolvo-integration-state", auth.state, { httpOnly: true, secure: authConfiguration().origin.startsWith("https:"), sameSite: "lax", path: "/api/integrations/oauth", maxAge: 600 });
    return response;
  } catch (error) { return apiError(error); }
}
