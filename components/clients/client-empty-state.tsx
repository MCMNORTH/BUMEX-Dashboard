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
      title={isFr ? "Aucune relation externe ne correspond aux filtres" : "No external relationships match these filters"}
      description={isFr ? "Modifiez les filtres ou ajoutez un client ou partenaire externe." : "Adjust the filters or add an external client or partner."}
      label={isFr ? "Relations externes" : "External relations"}
      icon={Building2}
      actions={
        <Button asChild variant="secondary" className="rounded-full px-5">
          <Link href="/clients">{isFr ? "Voir toutes les relations" : "View all relationships"}</Link>
        </Button>
      }
    />
  );
}
