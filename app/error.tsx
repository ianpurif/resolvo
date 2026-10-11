"use client";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";

export default function AppError({
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  return (
    <main
      id="main-content"
      className="flex min-h-[80dvh] flex-col items-center justify-center px-6 text-center"
    >
      <Brand />
      <h1 className="mt-8 text-2xl font-medium tracking-tight">
        We couldn’t open your workspace.
      </h1>
      <p className="mt-3 max-w-sm text-sm leading-7 text-muted-foreground">
        Try again in a moment. If this continues, contact your workspace
        administrator.
      </p>
      <div className="mt-6 flex items-center gap-4">
        <Button onClick={retry}>Try again</Button>
        <Link href="/login" className="text-xs text-primary">
          Return to sign-in
        </Link>
      </div>
    </main>
  );
}
