import { cn } from "@/lib/utils";

const labels: Record<string, string> = {
  processing: "Indexing",
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  ready: "Indexed",
  failed: "Failed",
};
export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md border border-current/10 px-2 py-1 text-[10px] font-medium",
        {
          "bg-teal-50 text-teal-800": ["resolved", "ready"].includes(status),
          "bg-blue-50 text-blue-700": status === "in_progress",
          "bg-amber-50 text-amber-700": ["processing", "open"].includes(status),
          "bg-red-50 text-red-700": status === "failed",
        },
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {labels[status] ?? status}
    </span>
  );
}
