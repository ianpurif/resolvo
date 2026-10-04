import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { AppError } from "@/lib/config";
import { getConversation } from "@/lib/supabase/queries";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = z.uuid().parse((await params).id);
    const data = await getConversation(id);
    if (!data.conversation) throw new AppError("This conversation could not be found.", 404);
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
