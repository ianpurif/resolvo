export function PageHeading({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: React.ReactNode }) {
  return <div className="mb-8 flex flex-wrap items-end justify-between gap-5"><div><div className="mb-2 text-[10px] font-semibold tracking-[.15em] text-primary uppercase">{eyebrow}</div><h1 className="text-[29px] leading-tight font-medium tracking-[-.04em]">{title}</h1><p className="mt-3 text-xs leading-6 text-muted-foreground">{description}</p></div>{children}</div>;
}
