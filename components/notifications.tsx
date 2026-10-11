"use client";

import { Toaster } from "sonner";
import { toast } from "sonner";
import { useEffect } from "react";
import { CircleCheck, CircleAlert, Info, LoaderCircle } from "lucide-react";

export function Notifications() {
  useEffect(() => {
    if (document.cookie.split("; ").includes("resolvo-signed-in=1")) {
      toast.success("You’re signed in", { id: "signed-in" });
      document.cookie = "resolvo-signed-in=; Max-Age=0; Path=/; SameSite=Lax";
    }
  }, []);
  return (
    <Toaster
      position="top-center"
      offset={20}
      mobileOffset={{ top: 80, left: 16, right: 16, bottom: 16 }}
      visibleToasts={2}
      closeButton
      icons={{
        success: <CircleCheck className="size-4 text-emerald-300" />,
        error: <CircleAlert className="size-4 text-rose-300" />,
        warning: <CircleAlert className="size-4 text-amber-300" />,
        info: <Info className="size-4 text-teal-200" />,
        loading: <LoaderCircle className="size-4 animate-spin" />,
      }}
      toastOptions={{ className: "island-toast", duration: 4000 }}
    />
  );
}
