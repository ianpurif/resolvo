import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenant } from "@/lib/auth";
import { apiError, requireSameOrigin } from "@/lib/api";
import { readBoundedJson } from "@/lib/bounded-json";
import { ownedConnection, configureConnection, integrationError, integrationDatabase } from "@/lib/integrations/database";
type Params = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Params) {
  try {
    const context = await requireTenant(), id = z.uuid().parse((await params).id), connection = await ownedConnection(context, id);
    const offset = Math.max(0, Number(new URL(request.url).searchParams.get("offset")) || 0);
    const [items, selections] = await Promise.all([
      context.db.from("integration_items").select("id,external_id,name,source_url,document_id,updated_at,last_error", { count: "exact" }).eq("connection_id", id).eq("organization_id", context.organization.id).order("name").range(offset, offset + 49),
      context.db.from("integration_selections").select("external_id,name,kind").eq("connection_id", id).eq("organization_id", context.organization.id),
    ]);
    integrationError(items.error); integrationError(selections.error);
    const db = integrationDatabase();
    const [total, complete, indexed] = await Promise.all([
      db.from("integration_tasks").select("id", { count: "exact", head: true }).eq("connection_id", id),
      db.from("integration_tasks").select("id", { count: "exact", head: true }).eq("connection_id", id).eq("done", true),
      context.db.from("documents").select("id", { count: "exact", head: true }).eq("integration_connection_id", id).gt("chunk_count", 0),
    ]);
    for (const result of [total, complete, indexed]) integrationError(result.error);
    return NextResponse.json({ connection: { id: connection.id, provider: connection.provider, name: connection.name, visibility: connection.visibility,
      status: connection.status, sync_interval_minutes: connection.sync_interval_minutes, next_sync_at: connection.next_sync_at, last_sync_at: connection.last_sync_at,
      last_error: connection.last_error, generation: connection.generation }, items: items.data, total: items.count, selections: selections.data,
      progress: { total: total.count ?? 0, completed: complete.count ?? 0, indexed: indexed.count ?? 0 } });
  } catch (error) { return apiError(error); }
}
export async function PATCH(request: Request, { params }: Params) {
  try { requireSameOrigin(request); const context = await requireTenant();
    const input = z.object({ visibility: z.enum(["private", "workspace"]).optional(), interval: z.number().int().min(15).max(1440).optional() }).strict().parse(await readBoundedJson(request));
    await configureConnection(context, z.uuid().parse((await params).id), "settings", input);
    return NextResponse.json({ saved: true });
  } catch (error) { return apiError(error); }
}
export async function DELETE(request: Request, { params }: Params) {
  try { requireSameOrigin(request); const context = await requireTenant();
    await configureConnection(context, z.uuid().parse((await params).id), "disconnect");
    return NextResponse.json({ disconnected: true });
  } catch (error) { return apiError(error); }
}
