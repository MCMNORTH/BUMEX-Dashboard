import { Badge } from "@/components/ui/badge";
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
  return (
    <Badge variant="secondary" className="rounded-full px-3 py-1">
      {labels[type]}
    </Badge>
  );
}
