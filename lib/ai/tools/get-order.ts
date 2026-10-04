import "server-only";
import { tool } from "@langchain/core/tools";
import { database, checkDatabaseError } from "@/lib/supabase/server";
import { getOrderSchema } from "@/lib/validations";
import type { Order } from "@/types";

export function getOrderTool(orders: Map<string, Order>) {
  return tool(async ({ orderNumber }) => {
    try {
      const result = await database().from("orders").select("*").eq("order_number", orderNumber).maybeSingle();
      checkDatabaseError(result.error, "look up this order");
      if (!result.data) return JSON.stringify({ found: false, orderNumber, message: "This order could not be found. Ask the customer to check the number." });
      orders.set(orderNumber, result.data);
      return JSON.stringify({ found: true, order: result.data });
    } catch {
      return JSON.stringify({ error: "Order lookup is temporarily unavailable. Do not claim the order is missing or invent details." });
    }
  }, { name: "getOrder", description: "Look up a real order using its ORD number. Use before answering order-specific questions and before creating an order-linked ticket. Includes recorded status, tracking, delivery date and email. Never expose the customer's email or name unprompted.", schema: getOrderSchema });
}
