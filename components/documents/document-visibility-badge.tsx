"use client";

import { ShieldCheck, ShieldEllipsis, ShieldUser, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/layout/i18n-provider";
import type { DocumentVisibility } from "@/types/document";
import { toneBadge } from "@/components/ui/tone";

const config: Record<
  DocumentVisibility,
  { label: string; className: string; Icon: typeof ShieldCheck }
> = {
  internal: {
    label: "Internal",
    className: toneBadge.neutral,
    Icon: ShieldUser,
  },
  management: {
    label: "Management",
    className: toneBadge.neutral,
    Icon: ShieldCheck,
  },
  shareholders: {
    label: "Shareholders",
    className: toneBadge.neutral,
    Icon: Users,
  },
  restricted: {
    label: "Restricted",
    className: toneBadge.neutral,
    Icon: ShieldEllipsis,
  },
};

export function DocumentVisibilityBadge({ visibility }: { visibility: DocumentVisibility }) {
  const { locale } = useI18n();
  const item = config[visibility];
  const Icon = item.Icon;
  const frenchLabels: Record<DocumentVisibility, string> = { internal: "Interne", management: "Direction", shareholders: "Actionnaires", restricted: "Accès restreint" };

  return (
    <Badge variant="outline" className={`rounded-full px-3 py-1 ${item.className}`}>
      <Icon className="mr-1.5 size-3.5" />
      {locale === "fr" ? frenchLabels[visibility] : item.label}
    </Badge>
  );
}
