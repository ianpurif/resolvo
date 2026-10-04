import "server-only";
import { tool } from "@langchain/core/tools";
import { database, checkDatabaseError } from "@/lib/supabase/server";
import { createTicketSchema } from "@/lib/validations";
import type { Order, Ticket } from "@/types";

export function createTicketTool(requestId: string, orders: Map<string, Order>) {
  return tool(async ({ orderNumber, customerEmail, issue }) => {
    const order = orderNumber ? orders.get(orderNumber) : undefined;
    if (orderNumber && !order) return JSON.stringify({ error: "Use getOrder to verify this order first. Never create a ticket for an order that was not found." });
    const email = customerEmail ?? order?.customer_email;
    if (!email) return JSON.stringify({ error: "Ask the customer for their email address before creating this ticket." });
    try {
      const db = database();
      const inserted = await db.from("tickets").insert({ order_number: orderNumber ?? null, customer_email: email, issue, idempotency_key: requestId }).select().single();
      let ticket: Ticket;
      if (inserted.error?.code === "23505") {
        const previous = await db.from("tickets").select("*").eq("idempotency_key", requestId).single();
        checkDatabaseError(previous.error, "recover this support ticket");
        ticket = previous.data;
      } else {
        checkDatabaseError(inserted.error, "create this support ticket");
        ticket = inserted.data;
      }
      return JSON.stringify({ created: true, ticketNumber: ticket.ticket_number, orderNumber: ticket.order_number, status: ticket.status, issue: ticket.issue, note: "A ticket has been created for team review. No refund, return, replacement or cancellation has been approved." });
    } catch {
      return JSON.stringify({ error: "Ticket creation failed. Tell the customer it could not be confirmed. Retrying this request is safe." });
    }
  }, { name: "createTicket", description: "Persist one support ticket per customer message. Only use when the customer explicitly requests or agrees to a ticket. Verify linked orders with getOrder first. Email may be omitted when a verified order supplies it. Returns a real SUP ticket number; does not approve refunds or modify orders.", schema: createTicketSchema });
}
