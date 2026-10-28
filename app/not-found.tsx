import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Brand } from "@/components/brand";

export default function NotFound() {
  return (
    <main
      id="main-content"
      className="recovery-page flex min-h-dvh flex-col items-center justify-center px-6 py-12 text-center"
    >
      <Brand />
      <span className="recovery-number mt-10" aria-hidden="true">
        404
      </span>
      <h1 className="editorial mt-5 text-[38px] leading-tight">
        A thread we couldn’t find.
      </h1>
      <p className="mt-4 max-w-xs text-sm leading-7 text-muted-foreground">
        This page isn’t here. Your workspace is a good place to start again.
      </p>
      <Link className="action-button mt-8" href="/support">
        Back to your workspace <ArrowUpRight />
      </Link>
    </main>
  );
}
