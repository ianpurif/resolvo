import {
  ArrowUpRight,
  BookOpen,
  Check,
  LockKeyhole,
  LogOut,
} from "lucide-react";
import Link from "next/link";
import { requireWorkspacePage } from "@/lib/auth";
import { configuration } from "@/lib/config";
import { PageHeading } from "@/components/admin/page-heading";
import { Button } from "@/components/ui/button";

export default async function SettingsPage() {
  const context = await requireWorkspacePage();
  const ready = configuration().ready;
  return (
    <div className="max-w-4xl">
      <PageHeading
        eyebrow="Account & workspace"
        title="Settings"
        description="The details that make this space yours."
      />
      <section className="settings-section">
        <header>
          <h2>Your account</h2>
          <p>Your sign-in and personal conversation history.</p>
        </header>
        <div className="surface p-6">
          <div className="flex items-center gap-4">
            <div
              className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-[#b7d0db] bg-[#eaf3f7] text-lg font-medium text-[#315c70]"
              aria-hidden="true"
            >
              {context.user.email?.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground">
                Signed in with Google
              </p>
              <p className="mt-2 break-all text-sm font-medium">
                {context.user.email}
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-5 border-t border-dashed pt-5">
            <p className="flex max-w-xs items-start gap-2 text-[11px] leading-6 text-muted-foreground">
              <LockKeyhole className="mt-1 size-3.5 shrink-0" />
              Your conversation history is private to your account.
            </p>
            <form action="/auth/signout" method="post">
              <Button variant="outline">
                <LogOut className="size-3.5" />
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </section>
      <section className="settings-section">
        <header>
          <h2>Company workspace</h2>
          <p>Your company’s shared knowledge and assistant connection.</p>
        </header>
        <div className="surface p-6">
          <dl className="settings-details">
            {[
              ["Company", context.organization.name],
              ["Industry", context.organization.industry],
              ["Your role", context.role === "owner" ? "Owner" : "Member"],
              [
                "Assistant connection",
                ready ? "Configured" : "Needs administrator setup",
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex flex-wrap items-center justify-between gap-3"
              >
                <dt>{label}</dt>
                <dd className="mt-0!">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-6 border-t border-dashed pt-5">
            <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Check className="size-3.5 text-primary" />
              Knowledge is shared within your company.
            </p>
            <Link
              href="/admin/knowledge"
              className="mt-5 flex items-center gap-2 text-xs font-semibold text-primary"
            >
              <BookOpen className="size-3.5" />
              Manage knowledge
              <ArrowUpRight className="ml-auto size-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
