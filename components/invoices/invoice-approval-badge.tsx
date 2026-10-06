"use client";

import { LockKeyhole, RotateCcw, ShieldCheck } from "lucide-react";

import { useI18n } from "@/components/layout/i18n-provider";
import { Badge } from "@/components/ui/badge";

export function InvoiceApprovalBadge({ status, changesRequested = false }: { status: "pending" | "approved"; changesRequested?: boolean }) {
  const { locale } = useI18n();
  const approved = status === "approved";

  return (
    <Badge variant="outline" className={`rounded-full px-3 py-1 ${approved ? "border-success/35 bg-success/10 text-success dark:border-success/20 dark:bg-success/10 dark:text-success" : changesRequested ? "border-danger/35 bg-danger/10 text-danger dark:border-danger/20 dark:bg-danger/10 dark:text-danger" : "border-warning/35 bg-warning/10 text-warning dark:border-warning/20 dark:bg-warning/10 dark:text-warning"}`}>
      {approved ? <ShieldCheck className="mr-1.5 size-3.5" /> : changesRequested ? <RotateCcw className="mr-1.5 size-3.5" /> : <LockKeyhole className="mr-1.5 size-3.5" />}
      {approved ? (locale === "fr" ? "Validée" : "Approved") : changesRequested ? (locale === "fr" ? "À corriger" : "Changes requested") : (locale === "fr" ? "À valider" : "Awaiting approval")}
    </Badge>
  );
}
