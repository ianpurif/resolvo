"use client";

import { useEffect } from "react";
import { toast } from "sonner";

export function AuthNotice({
  message,
  warning = false,
}: {
  message: string;
  warning?: boolean;
}) {
  useEffect(() => {
    if (message)
      (warning ? toast.warning : toast.error)(message, { id: "auth-notice" });
  }, [message, warning]);
  return message ? (
    <p
      role="alert"
      className="mt-5 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm leading-6 text-amber-900"
    >
      {message}
    </p>
  ) : null;
}
