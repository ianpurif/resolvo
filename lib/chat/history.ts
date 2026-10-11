import type { Conversation } from "@/types";

export type SavedConversation = Pick<
  Conversation,
  "id" | "title" | "updated_at" | "created_at"
>;
export function groupConversations(
  conversations: SavedConversation[],
  now = new Date(),
) {
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const yesterday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 1,
  ).getTime();
  const week = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 7,
  ).getTime();
  const month = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 30,
  ).getTime();
  const groups = new Map<string, SavedConversation[]>();
  for (const item of [...conversations].sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at),
  )) {
    const time = Date.parse(item.updated_at);
    const label =
      time >= today
        ? "Today"
        : time >= yesterday
          ? "Yesterday"
          : time >= week
            ? "Previous 7 days"
            : time >= month
              ? "Previous 30 days"
              : "Older";
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  return [...groups].map(([label, items]) => ({ label, items }));
}
