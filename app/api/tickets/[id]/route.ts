import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenant } from "@/lib/auth";
import { apiError, requireSameOrigin } from "@/lib/api";
import { AppError } from "@/lib/config";
import { ticketStatusSchema } from "@/lib/validations";
import { checkDatabaseError } from "@/lib/supabase/server";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    requireSameOrigin(request);
    const context = await requireTenant();
    const id = z.uuid().parse((await params).id);
    const input = z
      .object({ status: ticketStatusSchema })
      .strict()
      .parse(await request.json());
    const result = await context.db
      .from("tickets")
      .update({ status: input.status })
      .eq("organization_id", context.organization.id)
      .eq("id", id)
      .select("id")
      .maybeSingle();
    checkDatabaseError(result.error, "update this ticket");
    if (!result.data) throw new AppError("Ticket not found.", 404);
    return NextResponse.json({ updated: true });
  } catch (error) {
    return apiError(error);
  }
}
