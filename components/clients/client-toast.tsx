"use client";

import { QueryToast } from "@/components/ui/query-toast";
import { useI18n } from "@/components/layout/i18n-provider";

const toastMessages: Record<string, { title: string; description: string; tone: "success" | "error" }> = {
  "client-created": {
    title: "Client created",
    description: "The client profile has been added to the portfolio.",
    tone: "success",
  },
  "client-updated": {
    title: "Client updated",
    description: "The latest client changes are now visible across the workspace.",
    tone: "success",
  },
  "client-archived": {
    title: "Client archived",
    description: "The client was archived successfully.",
    tone: "success",
  },
  "client-archive-error": {
    title: "Archive failed",
    description: "The client could not be archived with your current access.",
    tone: "error",
  },
} as const;

export function ClientToast() {
  const { locale } = useI18n();
  const messages = locale === "fr" ? {
    "client-created": { title: "Client créé", description: "La fiche client a été ajoutée au portefeuille.", tone: "success" as const },
    "client-updated": { title: "Client mis à jour", description: "Les modifications sont maintenant visibles dans l’espace de travail.", tone: "success" as const },
    "client-archived": { title: "Client archivé", description: "Le client a été archivé avec succès.", tone: "success" as const },
    "client-archive-error": { title: "Archivage impossible", description: "Ce client ne peut pas être archivé avec vos droits actuels.", tone: "error" as const },
  } : toastMessages;
  return <QueryToast messages={messages} />;
}
