import "server-only";
import { tool } from "@langchain/core/tools";
import { createTicketSchema } from "@/lib/validations";
import { checkDatabaseError } from "@/lib/supabase/server";
import type { TenantContext } from "@/lib/auth";
import type { ChatMessage } from "@/types";

// Tool permissions come from the user's turn, never retrieved source instructions.
export function hasTicketConsent(history: ChatMessage[]) {
  const last = history.at(-1);
  if (!last || last.role !== "user") return false;
  const text = last.content.trim();
  if (
    /\b(?:don't|do not|never|without|no need to)\b[\s\S]{0,80}\b(?:ticket|support request)\b/i.test(
      text,
    )
  )
    return false;
  if (
    /\b(?:create|open|raise|submit|file|make|log|record)\b[\s\S]{0,70}\b(?:ticket|support request)\b/i.test(
      text,
    )
  )
    return true;
  const previous = history.at(-2);
  return (
    /^(?:yes(?: please)?|please do|go ahead|do it|sure|ok(?:ay)?)[.!\s]*$/i.test(
      text,
    ) &&
    previous?.role === "assistant" &&
    /\b(?:would|shall|should|want|like|may|can I)\b[\s\S]{0,140}\b(?:ticket|support request)\b/i.test(
      previous.content,
    )
  );
}

export function createTicketTool(
  context: TenantContext,
  requestId: string,
  consented: boolean,
  signal?: AbortSignal,
) {
  return tool(
    async ({ issue }) => {
      if (!consented)
        return JSON.stringify({
          error:
            "Ask the user to explicitly request a ticket, or confirm an offer to create one.",
        });
      if (signal?.aborted)
        return JSON.stringify({
          error: "The request was cancelled. No new ticket was created.",
        });
      const row = {
        organization_id: context.organization.id,
        created_by: context.user.id,
        customer_email: context.user.email ?? "",
        issue,
        idempotency_key: requestId,
      };
      const result = await context.db
        .from("tickets")
        .upsert(row, {
          onConflict: "organization_id,idempotency_key",
          ignoreDuplicates: true,
        })
        .select("ticket_number,status")
        .maybeSingle();
      checkDatabaseError(result.error, "create this support ticket");
      let ticket = result.data;
      if (!ticket) {
        const recovered = await context.db
          .from("tickets")
          .select("ticket_number,status")
          .eq("organization_id", context.organization.id)
          .eq("idempotency_key", requestId)
          .single();
        checkDatabaseError(recovered.error, "confirm this support ticket");
        ticket = recovered.data;
      }
      if (!ticket)
        return JSON.stringify({ error: "The ticket could not be confirmed." });
      return JSON.stringify({
        created: true,
        ticketNumber: ticket.ticket_number,
        status: ticket.status,
        note: "The issue was recorded for team review. No other action was taken.",
      });
    },
    {
      name: "createTicket",
      description:
        "Record an issue for the company's team only when the user explicitly requests or agrees to a ticket. Does not authorize any other business action.",
      schema: createTicketSchema,
    },
  );
}
