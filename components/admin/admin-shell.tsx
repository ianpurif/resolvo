"use client";
import { usePathname, useRouter } from "next/navigation";
import {
  WorkspaceFrame,
  useHistoryPagination,
} from "@/components/workspace/workspace-frame";
import type { SavedConversation } from "@/lib/chat/history";
import type { Organization } from "@/types";

export function AdminShell({
  children,
  organization,
  email,
  initialConversations,
  initialHasMore,
}: {
  children: React.ReactNode;
  organization: Organization;
  email: string;
  initialConversations: SavedConversation[];
  initialHasMore: boolean;
}) {
  const path = usePathname();
  const router = useRouter();
  const history = useHistoryPagination(initialConversations, initialHasMore);
  const titles: Record<string, string> = {
    "/dashboard": "Workspace",
    "/admin/knowledge": "Knowledge",
    "/admin/integrations": "Integrations",
    "/admin/conversations": "Conversations",
    "/admin/tickets": "Support tickets",
    "/admin/settings": "Settings",
  };
  return (
    <WorkspaceFrame
      organization={organization}
      email={email}
      title={titles[path] ?? "Workspace"}
      conversations={history.conversations}
      hasMore={history.hasMore}
      loadingMore={history.loadingMore}
      onLoadMore={() => void history.loadMore()}
      onRename={(item) => {
        history.setConversations((previous) =>
          previous.map((old) => (old.id === item.id ? item : old)),
        );
        router.refresh();
      }}
      onDelete={(id) => {
        history.setConversations((previous) =>
          previous.filter((item) => item.id !== id),
        );
        router.refresh();
      }}
    >
      {children}
    </WorkspaceFrame>
  );
}
