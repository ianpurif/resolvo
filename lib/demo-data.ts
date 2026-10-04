import type { WorkspaceData } from "@/types";

const day = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400000).toISOString();
const future = (days: number) => new Date(Date.now() + days * 86400000).toISOString();

// Read-only UI fixtures. Never used by the agent or by mutation endpoints.
export function previewData(): WorkspaceData {
  return {
    preview: true,
    orders: [
      { id: "1001", order_number: "ORD-1001", customer_name: "Alex Morgan", customer_email: "alex@example.com", status: "processing", tracking_number: null, estimated_delivery: future(5), delivered_at: null, created_at: day(1) },
      { id: "1002", order_number: "ORD-1002", customer_name: "Jamie Chen", customer_email: "jamie@example.com", status: "shipped", tracking_number: "NS-784109235", estimated_delivery: future(2), delivered_at: null, created_at: day(3) },
      { id: "1003", order_number: "ORD-1003", customer_name: "Taylor Reed", customer_email: "taylor@example.com", status: "delivered", tracking_number: "NS-784109181", estimated_delivery: day(2), delivered_at: day(2), created_at: day(7) },
      { id: "1004", order_number: "ORD-1004", customer_name: "Jordan Lee", customer_email: "jordan@example.com", status: "cancelled", tracking_number: null, estimated_delivery: null, delivered_at: null, created_at: day(4) },
      { id: "1025", order_number: "ORD-1025", customer_name: "Sam Rivera", customer_email: "sam@example.com", status: "delivered", tracking_number: "NS-784108810", estimated_delivery: day(12), delivered_at: day(12), created_at: day(17) },
    ],
    tickets: [],
    conversations: [],
    documents: ["Return Policy", "Refund Policy", "Shipping Policy", "Warranty Policy", "Frequently Asked Questions"].map((name, i) => ({
      id: `sample-${i}`, name, file_path: `sample-data/${name.toLowerCase().replaceAll(" ", "-")}.md`, mime_type: "text/markdown", size_bytes: 1200, chunk_count: 0, status: "ready", error_message: null, created_at: day(2),
    })),
  };
}
