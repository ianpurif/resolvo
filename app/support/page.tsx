import type { Metadata } from "next";
import { configuration } from "@/lib/config";
import { SupportChat } from "@/components/chat/support-chat";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Support" };

export default function SupportPage() {
  return <SupportChat ready={configuration().ready} />;
}
