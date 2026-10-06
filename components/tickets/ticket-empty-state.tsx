"use client";

import Link from "next/link";
import { PanelsTopLeft } from "lucide-react";

import { useI18n } from "@/components/layout/i18n-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { TicketFiltersData } from "@/types/ticket";
import type { AppRole } from "@/types/auth";
import { TicketForm } from "@/components/tickets/ticket-form";

type TicketEmptyStateProps = {
  role: AppRole;
  filterData: TicketFiltersData;
  /** When filters are active, the useful next step is clearing them rather than creating a ticket. */
  clearFiltersHref?: string;
};

export function TicketEmptyState({ role, filterData, clearFiltersHref }: TicketEmptyStateProps) {
  const canCreate = role === "admin" || role === "manager" || role === "supervisor";
  const { t } = useI18n();

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 px-6 py-12 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <PanelsTopLeft className="size-6" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold">
            {clearFiltersHref
              ? t("tickets.emptyState.filteredTitle", "No tickets match these filters")
              : t("tickets.emptyState.title", "No tickets yet")}
          </h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            {clearFiltersHref
              ? t("tickets.emptyState.filteredDescription", "Try another quick filter or clear the filters to see every ticket.")
              : t("tickets.emptyState.description", "Create a ticket to start tracking work.")}
          </p>
        </div>
        {clearFiltersHref ? (
          <Button asChild variant="secondary">
            <Link href={clearFiltersHref} scroll={false}>{t("common.actions.clearFilters", "Clear filters")}</Link>
          </Button>
        ) : canCreate ? (
          <TicketForm
            mode="create"
            role={role}
            filterData={filterData}
            triggerLabel={t("common.actions.createTicket", "Create ticket")}
            triggerIcon="plus"
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
