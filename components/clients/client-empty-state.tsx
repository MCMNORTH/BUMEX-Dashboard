"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";

import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/layout/i18n-provider";

export function ClientEmptyState() {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  return (
    <EmptyState
      title={isFr ? "Aucun client ne correspond aux filtres actuels" : "No clients match the current workspace filters"}
      description={isFr ? "Modifiez les filtres ou créez un nouveau client pour alimenter cet espace." : "Adjust the portfolio filters or create a new client account to populate this module."}
      label={isFr ? "Portefeuille clients" : "Client portfolio"}
      icon={Building2}
      actions={
        <Button asChild variant="secondary" className="rounded-full px-5">
          <Link href="/clients">{isFr ? "Voir tous les clients" : "View all clients"}</Link>
        </Button>
      }
    />
  );
}
