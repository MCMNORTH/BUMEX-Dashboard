"use client";

import { Archive, LibraryBig } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/layout/i18n-provider";

export function ArchiveStatusBadge({ isArchived }: { isArchived: boolean }) {
  const { locale } = useI18n();
  return (
    <Badge
      variant="outline"
      className={`rounded-full px-3 py-1 ${
        isArchived
          ? "border-border/70 bg-background/50 text-foreground/85"
          : "border-emerald-400/30 bg-emerald-400/12 text-emerald-100"
      }`}
    >
      {isArchived ? <Archive className="mr-1.5 size-3.5" /> : <LibraryBig className="mr-1.5 size-3.5" />}
      {isArchived ? (locale === "fr" ? "Archivé" : "Archived") : (locale === "fr" ? "Actif" : "Active")}
    </Badge>
  );
}
