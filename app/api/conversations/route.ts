import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenant } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { checkDatabaseError } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const context = await requireTenant();
    const offset = z.coerce
      .number()
      .int()
      .min(0)
      .max(100000)
      .parse(new URL(request.url).searchParams.get("offset") ?? 0);
    const result = await context.db
      .from("conversations")
      .select("id,title,updated_at,created_at", { count: "exact" })
      .eq("organization_id", context.organization.id)
      .eq("created_by", context.user.id)
      .order("updated_at", { ascending: false })
      .order("id")
      .range(offset, offset + 29);
    checkDatabaseError(result.error, "load conversation history");
    return NextResponse.json(
      {
        conversations: result.data ?? [],
        hasMore: (result.count ?? 0) > offset + (result.data?.length ?? 0),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
