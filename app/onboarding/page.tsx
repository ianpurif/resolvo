import { redirect } from "next/navigation";
import { requireIdentity } from "@/lib/auth";
import { findWorkspace } from "@/lib/auth-context";
import { AppError } from "@/lib/config";
import { Brand } from "@/components/brand";
import { OnboardingForm } from "@/components/onboarding-form";
export const dynamic = "force-dynamic";
export default async function OnboardingPage() {
  let identity;
  try {
    identity = await requireIdentity();
  } catch (error) {
    if (error instanceof AppError && error.status === 401) redirect("/login");
    throw error;
  }
  if (await findWorkspace(identity)) redirect("/dashboard");
  return (
    <main className="grid min-h-dvh place-items-center bg-[#f4f6f1] px-5">
      <section className="w-full max-w-md rounded-2xl border bg-white p-8">
        <Brand />
        <h1 className="mt-8 text-2xl font-medium">
          Create your company workspace
        </h1>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          Start with an empty, private knowledge base. Your company’s sources
          define what the assistant knows.
        </p>
        <OnboardingForm />
      </section>
    </main>
  );
}
