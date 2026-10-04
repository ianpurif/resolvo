"use client";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminError({ reset }: { error: Error; reset: () => void }) {
  return <div className="mx-auto flex max-w-lg flex-col items-center rounded-xl border bg-white p-10 text-center"><AlertCircle className="mb-4 size-7 text-amber-600" /><h1 className="text-lg font-medium">We couldn’t load your workspace.</h1><p className="mt-3 text-sm leading-7 text-muted-foreground">Check your Supabase connection and make sure the migration has been applied, then try again.</p><Button onClick={reset} className="mt-5">Try again</Button></div>;
}
