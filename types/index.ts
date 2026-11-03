export type TicketStatus = "open" | "in_progress" | "resolved";
export interface Organization {
  id: string;
  name: string;
  industry: string;
  created_at: string;
}
export interface DataSource {
  id: string;
  organization_id: string;
  name: string;
  kind: "file" | "website" | "manual";
  locator: string | null;
  last_indexed_at: string | null;
  last_error: string | null;
  created_at: string;
}
export interface Ticket {
  id: string;
  organization_id: string;
  ticket_number: string;
  customer_email: string;
  issue: string;
  status: TicketStatus;
  created_at: string;
}
export interface KnowledgeDocument {
  integration_connection_id?: string | null;
  id: string;
  organization_id: string;
  data_source_id: string;
  name: string;
  file_path: string;
  mime_type: string;
  size_bytes: number;
  chunk_count: number;
  status: "processing" | "ready" | "failed";
  error_message: string | null;
  active_revision: string;
  indexing_token: string | null;
  content_hash: string | null;
  index_policy_version?: number;
  index_total?: number;
  index_completed?: number;
  index_next_attempt_at?: string | null;
  created_at: string;
  updated_at: string;
}
export interface Source {
  url?: string;
  platform?: string;
  id: string;
  title: string;
  excerpt: string;
  chunkId?: string;
  revision?: string;
  chunkIndex?: number;
  startOffset?: number;
  endOffset?: number;
  section?: string;
}
export interface ChatMessage {
  request_id?: string | null;
  id: string;
  organization_id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  sources: Source[];
  created_at: string;
}
export interface Conversation {
  id: string;
  organization_id: string;
  customer_identifier: string;
  title: string;
  created_at: string;
  updated_at: string;
}
export interface WorkspaceData {
  tickets: Ticket[];
  documents: KnowledgeDocument[];
  sources: DataSource[];
  conversations: Conversation[];
  counts: {
    documents: number;
    knowledge: number;
    sources: number;
    conversations: number;
    tickets: number;
  };
}
