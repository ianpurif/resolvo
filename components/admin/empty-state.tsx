import { Inbox } from "lucide-react";

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <Inbox className="size-5" strokeWidth={1.4} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
