import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenant } from "@/lib/auth";
import { getConversation } from "@/lib/supabase/queries";
import { apiError } from "@/lib/api";
import { AppError } from "@/lib/config";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireTenant();
    const result = await getConversation(
      context,
      z.uuid().parse((await params).id),
    );
    if (!result.conversation)
      throw new AppError("Conversation not found.", 404);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
