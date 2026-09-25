"use client";

import { QueryToast } from "@/components/ui/query-toast";

const toastMessages: Record<string, { title: string; description: string; tone: "success" | "error" }> = {
  "invoice-created": { title: "Invoice created", description: "The invoice record has been added successfully.", tone: "success" },
  "invoice-updated": { title: "Invoice updated", description: "The latest invoice changes are now live.", tone: "success" },
  "invoice-deleted": { title: "Invoice deleted", description: "The invoice record was removed from the tracker.", tone: "success" },
  "invoice-delete-error": { title: "Delete failed", description: "The invoice could not be deleted with your current access.", tone: "error" },
  "invoice-delete-approved-error": { title: "Suppression protégée", description: "Une facture validée ne peut être supprimée que par un administrateur.", tone: "error" },
  "receipt-created": { title: "Receipt created", description: "The receipt record has been linked successfully.", tone: "success" },
  "invoice-sent": { title: "Invoice sent", description: "The invoice email has been sent to the selected recipient.", tone: "success" },
  "invoice-approved": { title: "Facture validée", description: "Le PDF peut maintenant être téléchargé et envoyé au client.", tone: "success" },
  "invoice-approval-error": { title: "Validation impossible", description: "Seul un administrateur peut valider cette facture.", tone: "error" },
  "invoice-changes-requested": { title: "Corrections demandées", description: "Le créateur de la facture a reçu votre demande et son motif.", tone: "success" },
  "invoice-changes-error": { title: "Demande incomplète", description: "Ajoutez un motif clair d’au moins cinq caractères.", tone: "error" },
  "invoice-reminder-sent": { title: "Relance envoyée", description: "Les administrateurs ont reçu un rappel de validation.", tone: "success" },
  "invoice-reminder-limited": { title: "Relance déjà envoyée", description: "Une seule relance est autorisée toutes les 24 heures.", tone: "error" },
  "invoice-reminder-error": { title: "Relance impossible", description: "Cette facture ne peut pas être relancée avec votre accès actuel.", tone: "error" },
  "invoice-revoked": { title: "Validation retirée", description: "La facture est de nouveau verrouillée et son créateur a été informé.", tone: "success" },
  "invoice-revoke-error": { title: "Retrait impossible", description: "Indiquez un motif clair pour retirer cette validation.", tone: "error" },
};

export function InvoiceToast() {
  return <QueryToast messages={toastMessages} />;
}
