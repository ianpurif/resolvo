import type { ChatMessage } from "@/types";

export type StreamEvent = {
  type: "status" | "draft" | "done" | "error";
  text?: string;
  error?: string;
  conversationId?: string;
  message?: ChatMessage;
};

// Decode complete SSE frames, including UTF-8 characters split across network chunks.
export async function consumeChatStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: StreamEvent) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  function frames() {
    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data) onEvent(JSON.parse(data) as StreamEvent);
    }
    if (buffer.length > 1_000_000)
      throw new Error("The response could not be read. Please retry.");
  }
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(
        /\r\n/g,
        "\n",
      );
      frames();
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      buffer += "\n\n";
      frames();
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
