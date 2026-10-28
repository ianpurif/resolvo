export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading your workspace"
      className="space-y-8"
    >
      <div className="space-y-4">
        <div className="skeleton h-3 w-36 rounded" />
        <div className="skeleton h-10 w-64 rounded-lg" />
        <div className="skeleton h-3 w-48 rounded" />
      </div>
      <div className="skeleton h-40 rounded-xl" />
      <div className="grid grid-cols-2 gap-7">
        <div className="skeleton h-56 rounded-xl" />
        <div className="skeleton h-56 rounded-xl" />
      </div>
      <p className="text-xs text-muted-foreground">Gathering your workspace…</p>
    </div>
  );
}
