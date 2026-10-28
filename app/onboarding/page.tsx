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
    <main
      id="main-content"
      className="auth-page recovery-page grid min-h-dvh place-items-center px-5 py-12"
    >
      <section className="w-full max-w-md rounded-xl border border-[#cbdce5] bg-white p-7 shadow-[0_20px_80px_#1537460a] sm:p-9">
        <Brand />
        <p className="eyebrow mt-9">A place for your company</p>
        <h1 className="editorial mt-5 text-[40px] leading-[1.08]">
          Make room for your knowledge
        </h1>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          Create your company’s private workspace.
        </p>
        <OnboardingForm />
      </section>
    </main>
  );
}
