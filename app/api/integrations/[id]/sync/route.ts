import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenant } from "@/lib/auth";
import { apiError, requireSameOrigin } from "@/lib/api";
import { configureConnection, ownedConnection } from "@/lib/integrations/database";
import { syncOne } from "@/lib/integrations/sync";
export const maxDuration = 90;
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { requireSameOrigin(request); const context = await requireTenant(), id = z.uuid().parse((await params).id);
    await ownedConnection(context, id);
    if (new URL(request.url).searchParams.get("advance") !== "true") await configureConnection(context, id, "sync");
    const advanced = await syncOne(id);
    return NextResponse.json({ advanced });
  } catch (error) { return apiError(error); }
}
