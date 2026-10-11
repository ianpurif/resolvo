import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
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
  return (
    <main className="grid min-h-dvh place-items-center bg-[#f4f6f1] px-5">
      <section className="w-full max-w-md rounded-2xl border bg-white p-8 shadow-sm">
        <Brand />
        <h1 className="mt-9 text-3xl font-medium tracking-tight">
          Your company’s knowledge.
          <br />
          One trusted workspace.
        </h1>
        <p className="mt-4 text-sm leading-7 text-muted-foreground">
          Connect your sources, find grounded answers, and keep your team’s
          knowledge together.
        </p>
        {(!configured || error) && (
          <p
            role="alert"
            className="mt-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
          >
            {!configured
              ? "Configure Supabase authentication and the application URL before signing in."
              : error === "signout"
                ? "Your local session was cleared. The authentication provider could not confirm sign-out on other devices."
                : "Sign-in could not finish. Check the Google provider and callback settings, then try again."}
          </p>
        )}
        <form action="/auth/google" method="post" className="mt-8">
          <Button className="w-full" disabled={!configured}>
            Continue with Google
          </Button>
        </form>
        <p className="mt-5 text-xs leading-6 text-muted-foreground">
          Private knowledge and conversation history are available only to
          members of your company workspace.
        </p>
      </section>
    </main>
  );
}
