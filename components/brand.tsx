import { Command } from "lucide-react";
import { cn } from "@/lib/utils";

export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return <span className={cn("inline-flex items-center gap-2.5", className)}>
    <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-white"><Command className="size-5" strokeWidth={2.3} /></span>
    {!compact && <span className="text-xl font-semibold tracking-[-0.045em]">resolvo<span className="text-primary">.</span></span>}
  </span>;
}
