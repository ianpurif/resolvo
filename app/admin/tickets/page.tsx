import { getWorkspace } from "@/lib/supabase/queries";
import { PageHeading } from "@/components/admin/page-heading";
import { TicketsTable } from "@/components/admin/tickets-table";

export default async function TicketsPage() {
  const data = await getWorkspace();
  return <><PageHeading eyebrow="A human touch, when it matters" title="Your support inbox." description="Customer issues, captured by your assistant and ready for your team." /><TicketsTable tickets={data.tickets} /></>;
}
