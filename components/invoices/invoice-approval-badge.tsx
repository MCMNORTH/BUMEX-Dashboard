"use client";

import { LockKeyhole, RotateCcw, ShieldCheck } from "lucide-react";

import { useI18n } from "@/components/layout/i18n-provider";
import { Badge } from "@/components/ui/badge";

export function InvoiceApprovalBadge({ status, changesRequested = false }: { status: "pending" | "approved"; changesRequested?: boolean }) {
  const { locale } = useI18n();
  const approved = status === "approved";

  return (
    <Badge variant="outline" className={`rounded-full px-3 py-1 ${approved ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-100" : changesRequested ? "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-100" : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-100"}`}>
      {approved ? <ShieldCheck className="mr-1.5 size-3.5" /> : changesRequested ? <RotateCcw className="mr-1.5 size-3.5" /> : <LockKeyhole className="mr-1.5 size-3.5" />}
      {approved ? (locale === "fr" ? "Validée" : "Approved") : changesRequested ? (locale === "fr" ? "À corriger" : "Changes requested") : (locale === "fr" ? "À valider" : "Awaiting approval")}
    </Badge>
  );
}
