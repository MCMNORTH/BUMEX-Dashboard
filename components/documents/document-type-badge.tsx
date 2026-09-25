"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/layout/i18n-provider";
import type { DocumentType } from "@/types/document";

const labels: Record<DocumentType, string> = {
  contract: "Contract",
  invoice: "Invoice",
  receipt: "Receipt",
  bank_transfer: "Bank transfer",
  proposal: "Proposal",
  report: "Report",
  meeting_note: "Meeting note",
  technical_document: "Technical",
  legal_document: "Legal",
  other: "Other",
};

export function DocumentTypeBadge({ type }: { type: DocumentType }) {
  const { locale } = useI18n();
  const frenchLabels: Record<DocumentType, string> = { contract: "Contrat", invoice: "Facture", receipt: "Reçu", bank_transfer: "Virement bancaire", proposal: "Proposition", report: "Rapport", meeting_note: "Compte rendu", technical_document: "Technique", legal_document: "Juridique", other: "Autre" };
  return (
    <Badge variant="secondary" className="rounded-full px-3 py-1">
      {locale === "fr" ? frenchLabels[type] : labels[type]}
    </Badge>
  );
}
