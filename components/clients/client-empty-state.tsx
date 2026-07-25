import Link from "next/link";
import { Building2 } from "lucide-react";

import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";

export function ClientEmptyState() {
  return (
    <EmptyState
      title="No clients match the current workspace filters"
      description="Adjust the portfolio filters or create a new client account to populate this module."
      label="Client portfolio"
      icon={Building2}
      actions={
        <Button asChild variant="secondary" className="rounded-full px-5">
          <Link href="/clients">View all clients</Link>
        </Button>
      }
    />
  );
}
