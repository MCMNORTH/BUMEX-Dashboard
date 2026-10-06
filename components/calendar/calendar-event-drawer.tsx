"use client";

import Link from "next/link";
import { ArrowUpRight, CalendarRange, FolderKanban, UserRound } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/components/layout/i18n-provider";
import { Badge } from "@/components/ui/badge";
import type { CalendarEvent } from "@/types/calendar";

export function CalendarEventDrawer({
  event,
  open,
  onOpenChange,
}: {
  event: CalendarEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { locale } = useI18n();
  const tr = (fr: string, en: string) => (locale === "fr" ? fr : en);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="left-auto right-0 top-0 h-full w-full max-w-xl translate-x-0 translate-y-0 rounded-none border-l border-border bg-popover/96 p-0 shadow-[var(--shadow-elevated)]">
        {event ? (
          <div className="flex h-full flex-col">
            <DialogHeader className="border-b border-border/65 px-6 py-6">
              <Badge variant="secondary" className="w-fit">
                {event.type.replaceAll("_", " ")}
              </Badge>
              <DialogTitle className="text-2xl tracking-[-0.04em]">{event.title}</DialogTitle>
              <DialogDescription>
                {tr("Détail de l’événement, avec un lien vers l’élément d’origine.", "Event details, with a link back to the original record.")}
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border/65 bg-background/38 p-4">
                  <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{tr("Date", "Date")}</p>
                  <p className="mt-2 flex items-center gap-2 text-sm font-medium">
                    <CalendarRange className="size-4 text-primary" />
                    {event.date}
                  </p>
                </div>
                {event.status ? (
                  <div className="rounded-xl border border-border/65 bg-background/38 p-4">
                    <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{tr("Statut", "Status")}</p>
                    <p className="mt-2 text-sm font-medium">{event.status.replaceAll("_", " ")}</p>
                  </div>
                ) : null}
              </div>

              <div className="space-y-3">
                {event.projectName ? (
                  <div className="rounded-xl border border-border/65 bg-background/38 p-4">
                    <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{tr("Projet", "Project")}</p>
                    <p className="mt-2 flex items-center gap-2 text-sm font-medium">
                      <FolderKanban className="size-4 text-primary" />
                      {event.projectName}
                    </p>
                    {event.clientName ? <p className="mt-1 text-xs text-muted-foreground">{event.clientName}</p> : null}
                  </div>
                ) : null}

                {event.assigneeName ? (
                  <div className="rounded-xl border border-border/65 bg-background/38 p-4">
                    <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{tr("Responsable", "Owner")}</p>
                    <p className="mt-2 flex items-center gap-2 text-sm font-medium">
                      <UserRound className="size-4 text-primary" />
                      {event.assigneeName}
                    </p>
                  </div>
                ) : null}

                {event.description ? (
                  <div className="rounded-xl border border-border/65 bg-background/38 p-4">
                    <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{tr("Contexte", "Context")}</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{event.description}</p>
                  </div>
                ) : null}
              </div>
            </div>

            {event.href ? (
              <div className="border-t border-border/65 px-6 py-5">
                <Link
                  href={event.href}
                  className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  {tr("Ouvrir l’élément", "Open record")}
                  <ArrowUpRight className="ml-2 size-4" />
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

