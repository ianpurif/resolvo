"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { friendlyError } from "@/lib/client-errors";
import { Button } from "@/components/ui/button";
export function OnboardingForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const fields = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fields.get("name"),
          industry: fields.get("industry"),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      toast.success("Your workspace is ready");
      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      toast.error(
        friendlyError(
          error,
          "Could not create your workspace. Check your connection and try again.",
        ),
      );
      setError(
        friendlyError(
          error,
          "Could not create your workspace. Check your connection and try again.",
        ),
      );
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="mt-7 space-y-5">
      <label className="block text-sm">
        Company name
        <input
          name="name"
          required
          minLength={2}
          maxLength={120}
          className="field mt-2"
          disabled={busy}
        />
      </label>
      <label className="block text-sm">
        Industry
        <input
          name="industry"
          required
          minLength={2}
          maxLength={80}
          placeholder="Your company’s industry"
          className="field mt-2"
          disabled={busy}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <Button disabled={busy} className="w-full">
        {busy ? "Creating workspace…" : "Create company workspace"}
      </Button>
    </form>
  );
}
