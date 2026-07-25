"use client";

import { useI18n } from "@/components/layout/i18n-provider";
import { ErrorState } from "@/components/layout/error-state";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const { locale } = useI18n();

  return (
    <ErrorState
      error={error}
      retry={unstable_retry}
      title={locale === "fr" ? "Cette section de l’espace n’a pas pu se charger" : "This workspace section failed to load"}
      description={
        locale === "fr"
          ? "La vue actuelle a rencontré un problème inattendu. Réessayez pour recharger la section sans quitter l’espace."
          : "The current view hit an unexpected issue. Retry to refresh the section without leaving the workspace."
      }
      label={locale === "fr" ? "Récupération de section" : "Section recovery"}
      retryLabel={locale === "fr" ? "Réessayer" : "Try again"}
    />
  );
}
