export type OrderStatus = "processing" | "shipped" | "delivered" | "cancelled";
export type TicketStatus = "open" | "in_progress" | "resolved";

export interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  status: OrderStatus;
  tracking_number: string | null;
  estimated_delivery: string | null;
  delivered_at: string | null;
  created_at: string;
}

export interface Ticket {
  id: string;
  ticket_number: string;
  order_number: string | null;
  customer_email: string;
  issue: string;
  status: TicketStatus;
  created_at: string;
}

export interface KnowledgeDocument {
  id: string;
  name: string;
  file_path: string;
  mime_type: string;
  size_bytes: number;
  chunk_count: number;
  status: "processing" | "ready" | "failed";
  error_message: string | null;
  created_at: string;
}

export interface Source {
  id: string;
  title: string;
  excerpt: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  sources: Source[];
  created_at: string;
}

export interface Conversation {
  id: string;
  customer_identifier: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceData {
  orders: Order[];
  tickets: Ticket[];
  documents: KnowledgeDocument[];
  conversations: Conversation[];
  preview: boolean;
}
