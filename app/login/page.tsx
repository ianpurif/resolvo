import Link from "next/link";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { Brand } from "@/components/brand";
import { GoogleButton } from "@/components/auth/google-button";
import { AuthNotice } from "@/components/auth/auth-notice";
import { configuration } from "@/lib/config";

export const dynamic = "force-dynamic";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const configured = configuration().missing.every(
    (name) =>
      !["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "APP_URL"].includes(name),
  );
  const message = !configured
    ? "Sign-in is temporarily unavailable. Please try again later."
    : error === "signout"
      ? "You’re signed out here. Sign-out on other devices could not be confirmed."
      : error
        ? "Sign-in didn’t finish. Please try Google again."
        : "";
  return (
    <main
      id="main-content"
      className="auth-page relative flex min-h-dvh flex-col bg-[#f6f8f7] px-6"
    >
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between py-7">
        <Link href="/" aria-label="Resolvo home">
          <Brand />
        </Link>
        <Link
          href="/"
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="size-3.5" />
          Back to home
        </Link>
      </header>
      <section className="relative mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center pb-24 text-center">
        <Brand compact className="mx-auto mb-7 [&_.brand-mark]:size-16" />
        <h1 className="text-[34px] font-semibold tracking-[-0.055em]">
          Welcome to Resolvo
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Your knowledge. A conversation away.
        </p>
        <div className="mt-9">
          <GoogleButton disabled={!configured} />
        </div>
        <AuthNotice message={message} warning={error === "signout"} />
        <p className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <LockKeyhole className="size-3.5" />A private workspace for your
          company
        </p>
      </section>
      <footer className="pb-7 text-center text-[11px] text-muted-foreground">
        Company knowledge, thoughtfully connected.
      </footer>
    </main>
  );
}
