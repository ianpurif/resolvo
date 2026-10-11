import { apiError, requireSameOrigin } from "@/lib/api";
import { AppError, requireAIConfiguration } from "@/lib/config";
import { requireTenant } from "@/lib/auth";
import { checkDatabaseError } from "@/lib/supabase/server";
import { chatInputSchema } from "@/lib/validations";
import { runSupportAgent } from "@/lib/ai/graph";
import { readBoundedJson } from "@/lib/bounded-json";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const context = await requireTenant();
    requireAIConfiguration();
    const input = chatInputSchema.parse(await readBoundedJson(request));
    const { db, organization } = context;
    if (input.conversationId) {
      const owned = await db
        .from("conversations")
        .select("id")
        .eq("id", input.conversationId)
        .eq("organization_id", organization.id)
        .eq("created_by", context.user.id)
        .maybeSingle();
      checkDatabaseError(owned.error, "open this conversation");
      if (!owned.data) throw new AppError("Conversation not found.", 404);
    }
    const previous = await db
      .from("chat_requests")
      .select("conversation_id")
      .eq("id", input.requestId)
      .eq("organization_id", organization.id)
      .maybeSingle();
    checkDatabaseError(previous.error, "check this message");
    if (previous.data) {
      const owned = await db
        .from("conversations")
        .select("id")
        .eq("id", previous.data.conversation_id)
        .eq("organization_id", organization.id)
        .eq("created_by", context.user.id)
        .maybeSingle();
      checkDatabaseError(owned.error, "check this conversation");
      if (!owned.data) throw new AppError("Conversation not found.", 404);
    }
    const started = await db.rpc("begin_chat_request", {
      p_id: input.requestId,
      p_conversation_id: input.conversationId,
      p_content: input.message,
    });
    if (started.error) {
      if (started.error.message.includes("in progress"))
        throw new AppError(
          "A response is already in progress. Please wait.",
          409,
        );
      if (started.error.message.includes("not found"))
        throw new AppError("Conversation not found.", 404);
      if (started.error.message.includes("limit"))
        throw new AppError(
          "Your workspace's request limit was reached. Wait a minute and retry.",
          429,
        );
      if (started.error.message.includes("mismatch"))
        throw new AppError(
          "This request does not match the original message.",
          409,
        );
      checkDatabaseError(started.error, "start this conversation");
    }
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let open = true;
        const emit = (type: string, data: unknown) => {
          if (open && !request.signal.aborted) {
            try {
              controller.enqueue(
                encoder.encode(
                  "data: " +
                    JSON.stringify({ type, ...(data as object) }) +
                    "\n\n",
                ),
              );
            } catch {
              open = false;
            }
          }
        };
        try {
          if (started.data.message) {
            emit("done", started.data);
            return;
          }
          const conversationId = started.data.conversationId as string;
          emit("status", {
            text: "Searching your company's knowledge…",
            conversationId,
          });
          const history = await db
            .from("messages")
            .select("*")
            .eq("organization_id", organization.id)
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: false })
            .limit(20);
          checkDatabaseError(history.error, "load the conversation");
          const signal = AbortSignal.any([
            request.signal,
            AbortSignal.timeout(105000),
          ]);
          const answer = await runSupportAgent(
            context,
            (history.data ?? []).reverse(),
            input.requestId,
            (text) => emit("draft", { text }),
            signal,
          );
          const completed = await db.rpc("finish_chat_request", {
            p_id: input.requestId,
            p_content: answer.content,
            p_sources: answer.sources,
          });
          checkDatabaseError(completed.error, "save this response");
          emit("done", completed.data);
        } catch (error) {
          const failed = await db
            .from("chat_requests")
            .update({ status: "failed", updated_at: new Date().toISOString() })
            .eq("organization_id", organization.id)
            .eq("id", input.requestId)
            .eq("status", "processing");
          if (failed.error)
            console.error("[chat] Failed request status could not be saved");
          emit("error", {
            error:
              error instanceof AppError
                ? error.message
                : "The assistant could not finish. Please retry.",
          });
        } finally {
          open = false;
          try {
            controller.close();
          } catch {}
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
