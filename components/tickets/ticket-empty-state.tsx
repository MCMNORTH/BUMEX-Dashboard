"use client";

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
};

export function TicketEmptyState({ role, filterData }: TicketEmptyStateProps) {
  const canCreate = role === "admin" || role === "manager" || role === "supervisor";
  const { t } = useI18n();

  return (
    <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
      <CardContent className="flex flex-col items-center gap-5 px-6 py-16 text-center">
        <div className="flex size-16 items-center justify-center rounded-[26px] border border-border/70 bg-background/45 text-primary shadow-[var(--shadow-soft)]">
          <PanelsTopLeft className="size-7" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-[-0.04em]">{t("tickets.emptyState.title", "No tickets matched the current view")}</h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            {t("tickets.emptyState.description", "Refine the filters, broaden the search scope, or create a new ticket to start tracking operational work.")}
          </p>
        </div>
        {canCreate ? (
          <TicketForm
            mode="create"
            role={role}
            filterData={filterData}
            triggerLabel="Create ticket"
            triggerIcon="plus"
          />
        ) : (
          <Button variant="secondary" className="rounded-full px-5" disabled>
            {t("tickets.emptyState.noAccess", "No create access")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
