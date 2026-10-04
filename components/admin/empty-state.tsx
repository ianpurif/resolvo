import { Inbox } from "lucide-react";

export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="flex min-h-[230px] flex-col items-center justify-center px-6 py-10 text-center"><div className="mb-4 flex size-11 items-center justify-center rounded-xl border bg-muted/50"><Inbox className="size-5 text-[#83927c]" strokeWidth={1.5} /></div><h3 className="text-sm font-medium">{title}</h3><p className="mt-2 max-w-xs text-xs leading-6 text-muted-foreground">{description}</p></div>;
}
