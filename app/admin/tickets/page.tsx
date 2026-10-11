import { getWorkspace } from "@/lib/supabase/queries";
import { TicketsTable } from "@/components/admin/tickets-table";
import { PageHeading } from "@/components/admin/page-heading";
export default async function TicketsPage() {
  const data = await getWorkspace();
  return (
    <>
      <PageHeading
        eyebrow="Team follow-up"
        title="Support tickets"
        description="Issues raised in your company’s workspace."
      />
      <TicketsTable tickets={data.tickets} />
    </>
  );
}
