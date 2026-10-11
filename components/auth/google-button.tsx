"use client";

import Image from "next/image";
import { useState } from "react";
import { LoaderCircle } from "lucide-react";

export function GoogleButton({ disabled = false }: { disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <form action="/auth/google" method="post" onSubmit={() => setBusy(true)}>
      <button
        className="google-button"
        disabled={disabled || busy}
        aria-busy={busy}
      >
        {busy ? (
          <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
        ) : (
          <Image
            src="/google-g.png"
            alt=""
            width={20}
            height={20}
            style={{ height: "auto" }}
            className="w-5 shrink-0"
          />
        )}
        <span>{busy ? "Connecting to Google…" : "Continue with Google"}</span>
      </button>
    </form>
  );
}
