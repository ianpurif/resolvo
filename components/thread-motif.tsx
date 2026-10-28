import { cn } from "@/lib/utils";

/** A small stitched signature shared by the editorial and workspace surfaces. */
export function ThreadMotif({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 72"
      fill="none"
      aria-hidden="true"
      className={cn("thread-motif", className)}
    >
      {[0, 4, 8, 12, 16].map((offset) => (
        <path
          key={offset}
          d={`M 4 ${20 + offset} C 38 ${20 + offset}, 40 ${56 - offset}, 64 ${56 - offset} S 88 ${16 + offset}, 116 ${16 + offset}`}
          stroke="currentColor"
          strokeWidth="1.2"
        />
      ))}
      {[0, 4, 8, 12, 16].map((offset) => (
        <path
          key={offset}
          d={`M 4 ${52 - offset} C 38 ${52 - offset}, 40 ${16 + offset}, 64 ${16 + offset} S 88 ${56 - offset}, 116 ${56 - offset}`}
          stroke="currentColor"
          strokeWidth="1.2"
          strokeDasharray="2 2"
          opacity=".6"
        />
      ))}
    </svg>
  );
}
