"use client";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminError({
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  return (
    <div className="surface mx-auto flex max-w-lg flex-col items-center p-8 text-center sm:p-12">
      <span className="empty-state-icon">
        <AlertCircle className="size-6 text-amber-700" />
      </span>
      <h1 className="editorial text-[32px] leading-tight">
        We couldn’t load your workspace.
      </h1>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">
        Please try again. If this continues, contact your workspace
        administrator.
      </p>
      <Button onClick={retry} className="mt-5">
        Try again
      </Button>
    </div>
  );
}
