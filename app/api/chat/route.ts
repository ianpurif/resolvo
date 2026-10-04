import { NextResponse } from "next/server";
import { apiError, requireSameOrigin } from "@/lib/api";
import { AppError, requireConfiguration } from "@/lib/config";
import { database, checkDatabaseError } from "@/lib/supabase/server";
import { chatInputSchema } from "@/lib/validations";
import { runSupportAgent } from "@/lib/ai/graph";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  let activeRequestId: string | undefined;
  try {
    requireSameOrigin(request);
    requireConfiguration();
    const input = chatInputSchema.parse(await request.json());
    const db = database();
    const started = await db.rpc("begin_chat_request", { p_id: input.requestId, p_conversation_id: input.conversationId, p_content: input.message });
    if (started.error) {
      if (started.error.message.includes("in progress")) throw new AppError("A response is already in progress. Please wait a moment.", 409);
      if (started.error.message.includes("not found")) throw new AppError("This conversation could not be found. Start a new conversation.", 404);
      if (started.error.message.includes("mismatch")) throw new AppError("This request doesn't match the original message. Start a new request.", 409);
      checkDatabaseError(started.error, "start this conversation");
    }
    if (started.data.message) return NextResponse.json(started.data);
    activeRequestId = input.requestId;
    const conversationId: string = started.data.conversationId;
    const history = await db.from("messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(40);
    checkDatabaseError(history.error, "load conversation history");
    const answer = await runSupportAgent((history.data ?? []).reverse(), input.requestId);
    const completed = await db.rpc("finish_chat_request", { p_id: input.requestId, p_content: answer.content, p_sources: answer.sources });
    checkDatabaseError(completed.error, "save this response");
    return NextResponse.json(completed.data);
  } catch (error) {
    if (activeRequestId) {
      const failed = await database().from("chat_requests").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", activeRequestId).eq("status", "processing");
      if (failed.error) console.error("[chat] Could not mark request for retry");
    }
    return apiError(error);
  }
}
