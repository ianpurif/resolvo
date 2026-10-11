import { BookOpen, Check, LockKeyhole, LogOut } from "lucide-react";
import Link from "next/link";
import { requireWorkspacePage } from "@/lib/auth";
import { configuration } from "@/lib/config";

export default async function SettingsPage() {
  const context = await requireWorkspacePage();
  const ready = configuration().ready;
  return (
    <div className="max-w-2xl">
      <h1 className="mb-8 text-3xl font-medium tracking-[-.045em]">Settings</h1>
      <section className="overflow-hidden rounded-2xl border bg-white">
        <h2 className="border-b px-6 py-5 text-sm font-semibold">
          Your account
        </h2>
        <div className="space-y-5 p-6 text-xs">
          <div>
            <p className="text-muted-foreground">Signed in with Google</p>
            <p className="mt-2 text-sm">{context.user.email}</p>
          </div>
          <p className="flex items-center gap-2 text-muted-foreground">
            <LockKeyhole className="size-3.5" />
            Your conversation history is private to your account.
          </p>
          <form action="/auth/signout" method="post">
            <button className="flex items-center gap-2 rounded-lg border px-4 py-2.5">
              <LogOut className="size-3.5" />
              Sign out
            </button>
          </form>
        </div>
      </section>
      <section className="mt-6 overflow-hidden rounded-2xl border bg-white">
        <h2 className="border-b px-6 py-5 text-sm font-semibold">
          Company workspace
        </h2>
        <dl className="grid gap-6 p-6 text-xs sm:grid-cols-2">
          {[
            ["Company", context.organization.name],
            ["Industry", context.organization.industry],
            ["Your role", context.role === "owner" ? "Owner" : "Member"],
            [
              "Assistant connection",
              ready ? "Configured" : "Needs administrator setup",
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="mt-2 font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="border-t p-6">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Check className="size-3.5 text-primary" />
            Knowledge is shared within your company.
          </p>
          <Link
            href="/admin/knowledge"
            className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-primary"
          >
            <BookOpen className="size-3.5" />
            Manage knowledge
          </Link>
        </div>
      </section>
    </div>
  );
}
