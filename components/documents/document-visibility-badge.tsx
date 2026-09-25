"use client";

import { ShieldCheck, ShieldEllipsis, ShieldUser, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/layout/i18n-provider";
import type { DocumentVisibility } from "@/types/document";

const config: Record<
  DocumentVisibility,
  { label: string; className: string; Icon: typeof ShieldCheck }
> = {
  internal: {
    label: "Internal",
    className: "border-sky-400/30 bg-sky-400/12 text-sky-100",
    Icon: ShieldUser,
  },
  management: {
    label: "Management",
    className: "border-indigo-400/30 bg-indigo-400/12 text-indigo-100",
    Icon: ShieldCheck,
  },
  shareholders: {
    label: "Shareholders",
    className: "border-amber-400/30 bg-amber-400/12 text-amber-100",
    Icon: Users,
  },
  restricted: {
    label: "Restricted",
    className: "border-rose-400/30 bg-rose-400/12 text-rose-100",
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
