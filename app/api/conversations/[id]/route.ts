import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenant } from "@/lib/auth";
import { getConversation } from "@/lib/supabase/queries";
import { apiError, requireSameOrigin } from "@/lib/api";
import { AppError } from "@/lib/config";
import { checkDatabaseError } from "@/lib/supabase/server";
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

async function mutate(
  request: Request,
  params: Promise<{ id: string }>,
  remove: boolean,
) {
  try {
    requireSameOrigin(request);
    const context = await requireTenant();
    const id = z.uuid().parse((await params).id);
    const title = remove
      ? null
      : z
          .object({ title: z.string().trim().min(1).max(120) })
          .strict()
          .parse(await request.json()).title;
    const result = await context.db.rpc("manage_conversation", {
      p_id: id,
      p_title: title,
      p_delete: remove,
    });
    if (result.error?.message.includes("not found"))
      throw new AppError("Conversation not found.", 404);
    if (result.error?.message.includes("in progress"))
      throw new AppError(
        "An answer is still in progress. Try again once it finishes.",
        409,
      );
    if (result.error?.code === "PGRST202")
      throw new AppError(
        "Conversation actions are temporarily unavailable. Please contact your workspace administrator.",
        503,
      );
    checkDatabaseError(
      result.error,
      remove ? "delete this conversation" : "rename this conversation",
    );
    return NextResponse.json(
      remove ? result.data : { conversation: result.data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return mutate(request, params, false);
}
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return mutate(request, params, true);
}
