import { parseFormattedNumber } from "@/lib/formatters";
import type { Locale } from "@/lib/i18n/config";
import type { ProjectFormValues } from "@/types/project";

// The rules of a project's form: BUMEX One's project pages and Vanguard's missions (lib/erp/vanguard/mission-actions.ts).
export function validateProjectValues(values: ProjectFormValues, locale: Locale = "en") {
  const say = (fr: string, en: string) => (locale === "fr" ? fr : en);
  const isInternalProject = values.project_kind === "internal_product" || values.project_kind === "internal_tool";

  if (!values.name || !values.owner_id || !values.status || !values.project_kind) {
    return say("Nom, responsable, statut et type de projet sont obligatoires.", "Project name, owner, status, and project type are required.");
  }

  if (!isInternalProject && !values.client_id) {
    return say("Choisissez le client ou le partenaire du projet.", "Select the external client or partner linked to this project.");
  }

  if (!values.description) {
    return say("Ajoutez une courte description pour que l'équipe comprenne le projet.", "Add a short description so the team can understand the project at a glance.");
  }

  if (values.start_date && values.end_date && values.end_date < values.start_date) {
    return say("La fin doit être après le début.", "End date must be after start date.");
  }

  if (values.budget_amount && parseFormattedNumber(values.budget_amount) === null) {
    return say("Le budget doit être un nombre.", "Budget amount must be a valid number.");
  }

  if (values.manual_progress) {
    const progress = Number(values.manual_progress);
    if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
      return say("L'avancement est un nombre entier de 0 à 100.", "Project progress must be a whole number between 0 and 100.");
    }
  }

  return null;
}
