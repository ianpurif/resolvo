import { cn } from "@/lib/utils";

const labels: Record<string, string> = { processing: "Processing", shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled", open: "Open", in_progress: "In progress", resolved: "Resolved", ready: "Indexed", failed: "Failed" };
export function StatusBadge({ status, preview = false }: { status: string; preview?: boolean }) {
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium", preview ? "bg-stone-100 text-stone-600" : {
    "bg-emerald-50 text-emerald-700": ["delivered", "resolved", "ready"].includes(status),
    "bg-blue-50 text-blue-700": ["shipped", "in_progress"].includes(status),
    "bg-amber-50 text-amber-700": ["processing", "open"].includes(status),
    "bg-stone-100 text-stone-500": status === "cancelled",
    "bg-red-50 text-red-700": status === "failed",
  })}><span className="size-1.5 rounded-full bg-current" />{preview ? "Sample file" : labels[status] ?? status}</span>;
}
