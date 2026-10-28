import Link from "next/link";
import Image from "next/image";
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
    <main id="main-content" className="auth-layout">
      <aside className="auth-art" aria-label="Connected knowledge">
        <Image
          src="/art/knowledge-weave.webp"
          alt="A sculpture of interwoven blue and teal threads"
          fill
          sizes="50vw"
          className="object-cover"
        />
        <div className="auth-art-caption">
          <p className="eyebrow mb-5 text-[#b2d9de]!">
            Many sources. A shared understanding.
          </p>
          <h2>
            A little more context.
            <br />
            <em>A lot more clarity.</em>
          </h2>
          <p>Your company’s knowledge, thoughtfully connected.</p>
        </div>
      </aside>
      <div className="auth-content">
        <header>
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
        <section className="auth-form-section">
          <p className="eyebrow">Your next chapter</p>
          <h1>Welcome to Resolvo</h1>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            Sign in to your company’s knowledge workspace.
          </p>
          <div className="mt-9">
            <GoogleButton disabled={!configured} />
          </div>
          <AuthNotice message={message} warning={error === "signout"} />
          <p className="auth-rule flex items-center gap-2 text-[11px] text-muted-foreground">
            <LockKeyhole className="size-3.5" />A private workspace for your
            company
          </p>
        </section>
        <footer className="pb-1 text-[10px] text-muted-foreground">
          Company knowledge, thoughtfully connected.
        </footer>
      </div>
    </main>
  );
}
