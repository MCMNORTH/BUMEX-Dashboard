import Link from "next/link";

import { FINANCE_ARCHIVED } from "@/lib/finance/archive";
import { getCurrentLocale } from "@/lib/i18n/server";

// The old finance records are an archive (lib/finance/archive.ts): every finance page says so, and where the books
// are kept now.
export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const fr = (await getCurrentLocale()) === "fr";

  return (
    <>
      {FINANCE_ARCHIVED ? (
        <div role="status" className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
          <p className="font-medium">{fr ? "Archive · lecture seule" : "Archive · read only"}</p>
          <p className="text-muted-foreground">
            {fr
              ? "Ces factures, encaissements, virements et relevés datent d’avant l’ERP. La facturation, les règlements et la banque se tiennent désormais dans "
              : "These invoices, payments, transfers and statements predate the ERP. Billing, payments and banking are now kept in "}
            <Link href="/vanguard" className="font-medium underline">
              Vanguard
            </Link>
            {fr ? " (salles Clients, Fournisseurs et Banque)." : " (Clients, Suppliers and Bank rooms)."}
          </p>
        </div>
      ) : null}
      {children}
    </>
  );
}
