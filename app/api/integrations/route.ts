import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/auth";
import { apiError, requireSameOrigin } from "@/lib/api";
import { readBoundedJson } from "@/lib/bounded-json";
import { connectionInput, connectWithCredential } from "@/lib/integrations/service";
import { catalog } from "@/lib/integrations/registry";
import { encryptionReady } from "@/lib/integrations/credentials";
import { integrationError } from "@/lib/integrations/database";
import { configuredOAuth } from "@/lib/integrations/oauth";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const context = await requireTenant();
    const offset = Math.max(0, Number(new URL(request.url).searchParams.get("offset")) || 0);
    const result = await context.db.from("integration_connections").select("id,provider,name,visibility,status,sync_interval_minutes,next_sync_at,last_sync_at,last_error,generation,created_at", { count: "exact" })
      .eq("organization_id", context.organization.id).eq("created_by", context.user.id).order("created_at", { ascending: false }).range(offset, offset + 24);
    integrationError(result.error);
    return NextResponse.json({ connections: result.data, total: result.count, ready: encryptionReady(), canShare: context.role === "owner",
      platforms: catalog().map((c) => ({ ...c, oauthConfigured: Boolean(configuredOAuth(c.id)) })) });
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try { requireSameOrigin(request); const context = await requireTenant();
    const id = await connectWithCredential(context, connectionInput.parse(await readBoundedJson(request, 65536)));
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) { return apiError(error); }
}
