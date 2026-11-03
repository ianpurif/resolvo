import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { integrationError } from "@/lib/integrations/database";
export async function GET(request: Request) {
  try {
    const context = await requireTenant(), query = new URL(request.url).searchParams;
    const offset = Math.max(0, Number(query.get("offset")) || 0);
    const result = await context.db.rpc("knowledge_source_metadata", { p_offset: offset, p_limit: 101 }); integrationError(result.error);
    return NextResponse.json({ sources: result.data.slice(0, 100), hasMore: result.data.length > 100 });
  } catch (error) { return apiError(error); }
}
