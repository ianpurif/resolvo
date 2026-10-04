import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireSameOrigin } from "@/lib/api";
import { AppError } from "@/lib/config";
import { database, checkDatabaseError } from "@/lib/supabase/server";
import { ticketStatusSchema } from "@/lib/validations";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const id = z.uuid().parse((await params).id);
    const { status } = z.object({ status: ticketStatusSchema }).parse(await request.json());
    const updated = await database().from("tickets").update({ status }).eq("id", id).select("id,status").maybeSingle();
    checkDatabaseError(updated.error, "update this ticket");
    if (!updated.data) throw new AppError("This ticket could not be found.", 404);
    return NextResponse.json({ ticket: updated.data });
  } catch (error) { return apiError(error); }
}
