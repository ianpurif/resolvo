import { Brand } from "@/components/brand";
export default function ChatLoading() {
  return (
    <main
      id="main-content"
      role="status"
      className="recovery-page flex h-dvh items-center justify-center gap-3 text-xs text-muted-foreground"
    >
      <Brand compact />
      <span className="thinking-dot">Opening your workspace…</span>
    </main>
  );
}
