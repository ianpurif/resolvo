import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenant } from "@/lib/auth";
import { apiError, requireSameOrigin } from "@/lib/api";
import { readBoundedJson } from "@/lib/bounded-json";
import { ownedConnection, configureConnection } from "@/lib/integrations/database";
import { connector } from "@/lib/integrations/registry";
import { connectorContext, selectionInput } from "@/lib/integrations/service";
type Params = { params: Promise<{ id: string }> };
export const maxDuration = 60;
export async function GET(request: Request, { params }: Params) {
  try {
    const connection = await ownedConnection(await requireTenant(), z.uuid().parse((await params).id));
    const query = new URL(request.url).searchParams;
    const parent = z.string().max(2048).optional().parse(query.get("parent") ?? undefined), cursor = z.string().max(8192).optional().parse(query.get("cursor") ?? undefined);
    return NextResponse.json(await connector(connection.provider).list(await connectorContext(connection), parent, cursor));
  } catch (error) { return apiError(error); }
}
export async function PUT(request: Request, { params }: Params) {
  try { requireSameOrigin(request); const context = await requireTenant();
    const input = selectionInput.parse(await readBoundedJson(request, 262144));
    await configureConnection(context, z.uuid().parse((await params).id), "selections", input);
    return NextResponse.json({ saved: true });
  } catch (error) { return apiError(error); }
}
