import { getWorkspace } from "@/lib/supabase/queries";
import { PageHeading } from "@/components/admin/page-heading";
import { OrdersTable } from "@/components/admin/orders-table";

export default async function OrdersPage() {
  const data = await getWorkspace();
  return <><PageHeading eyebrow="Every order has a story" title="Keep things moving." description="Order status, delivery details, and customer information, all in one place." /><OrdersTable orders={data.orders} /></>;
}
