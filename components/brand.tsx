import Image from "next/image";
import { cn } from "@/lib/utils";

export function Brand({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-2", className)}>
      <span
        className="brand-mark relative inline-block size-9 shrink-0 overflow-hidden"
        aria-hidden="true"
      >
        <Image
          src="/resolvo-logo.png"
          alt=""
          fill
          sizes="160px"
          loading="eager"
          className="scale-[1.85] object-contain"
        />
      </span>
      {!compact && (
        <span className="brand-wordmark text-[23px] font-semibold tracking-[-0.065em]">
          resolvo<span className="text-primary">.</span>
        </span>
      )}
    </span>
  );
}
