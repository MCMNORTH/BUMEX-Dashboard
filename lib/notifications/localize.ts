// The notifications the application writes are stored in English (lib/tickets, lib/projects, lib/roadmap, lib/mail,
// lib/notifications/service.ts); shown, they are said in the person's language (asked on 2026-11-20). The alerts
// (lib/alerts) are written in the person's language already, and anything else is shown as written.
// French that does not guess the person's gender: « On vous a assigné… » rather than « Vous êtes assigné(e)… ».

type Locale = "fr" | "en";
type Rule = [RegExp, (m: RegExpExecArray) => string];

const TITLES: Record<string, string> = {
  "New sub-task assignment": "Nouvelle sous-tâche assignée",
  "New ticket assignment": "Nouveau ticket assigné",
  "Ticket reassigned": "Ticket réassigné",
  "New ticket created": "Nouveau ticket créé",
  "Ticket status updated": "État du ticket modifié",
  "Ticket updated": "Ticket modifié",
  "Milestone delayed": "Jalon en retard",
  "Milestone completed": "Jalon terminé",
  "Reconnect Outlook": "Reconnectez Outlook",
  "New ticket from an e-mail": "Nouveau ticket depuis un e-mail",
  "New e-mail reply": "Nouvelle réponse par e-mail",
  "Added to a project team": "Ajout à l’équipe d’une mission",
  "Project ownership assigned": "Mission confiée",
  "Project ownership updated": "Responsable de mission modifié",
  "Project status updated": "État de la mission modifié",
  "You were mentioned": "On vous a mentionné",
};

// stages and statuses as the services write them into a sentence ("in progress", "on hold")
const STATES: Record<string, string> = {
  backlog: "Backlog", todo: "À faire", "to do": "À faire", "in progress": "En cours", review: "En revue", blocked: "Bloqué", done: "Terminé", archived: "Archivé",
  draft: "Brouillon", active: "Active", "on hold": "En pause", completed: "Terminée", cancelled: "Annulée",
};
const state = (text: string) => STATES[text.trim().toLowerCase()] ?? text;

const THIS: Record<string, string> = {
  task: "ce ticket", ticket: "ce ticket", project: "cette mission", client: "ce client", contract: "ce contrat", document: "ce document",
  milestone: "ce jalon", invoice: "cette facture", note: "cette note",
};

const BODIES: Rule[] = [
  [/^You are assigned the sub-task “(.+)” on (.+)\.$/, (m) => `La sous-tâche « ${m[1]} » vous est assignée sur ${m[2]}.`],
  [/^You were assigned to (.+)\.$/, (m) => `On vous a assigné ${m[1]}.`],
  [/^You are now assigned to (.+)\.$/, (m) => `On vous a assigné ${m[1]}.`],
  [/^(.+) was added to the operational queue\.$/, (m) => `${m[1]} a été ajouté à la file de travail.`],
  [/^(.+) has new operational updates\.$/, (m) => `${m[1]} a été mis à jour.`],
  [/^(.+) was marked as delayed\.$/, (m) => `${m[1]} est marqué en retard.`],
  [/^(.+) was marked as completed\.$/, (m) => `${m[1]} est marqué terminé.`],
  [/^(.+) was added from an e-mail\.$/, (m) => `${m[1]} a été ajouté depuis un e-mail.`],
  [/^(.+) moved to (.+)\.$/, (m) => `${m[1]} est passé à ${state(m[2])}.`],
  [/^Vanguard can no longer read your inbox for tickets\. Sign in to Microsoft again in Settings, My account\.$/, () => "Vanguard ne peut plus lire votre boîte de réception pour les tickets. Reconnectez-vous à Microsoft dans Paramètres › Mon compte."],
  [/^(.+) replied on (.+?): (.*)$/, (m) => `${m[1]} a répondu sur ${m[2]} : ${m[3]}`],
  [/^You were added to the (.+) team\.$/, (m) => `On vous a ajouté à l’équipe de ${m[1]}.`],
  [/^You are now the owner of (.+)\.$/, (m) => `Vous êtes désormais responsable de ${m[1]}.`],
  [/^You were mentioned in a comment on this (.+)\.$/, (m) => `On vous a mentionné dans un commentaire sur ${THIS[m[1]] ?? "cet élément"}.`],
  [/^(.+), from (.+)\.$/, (m) => `${m[1]}, de ${m[2]}.`],
];

const ENGLISH_STATES: Record<string, string> = { "in progress": "In progress", "on hold": "On hold", todo: "To do", review: "In review" };

/** A notification's title and text in the person's language. */
export function localizeNotification(notification: { title: string; body: string }, locale: Locale): { title: string; body: string } {
  if (locale !== "fr") {
    // English as written, a status said as a label ("moved to in progress." → "moved to In progress.")
    const moved = /^(.+) moved to (.+)\.$/.exec(notification.body);
    const label = moved ? ENGLISH_STATES[moved[2].trim().toLowerCase()] : undefined;
    return { title: notification.title, body: moved && label ? `${moved[1]} moved to ${label}.` : notification.body };
  }
  const title = TITLES[notification.title] ?? notification.title;
  for (const [pattern, text] of BODIES) {
    const m = pattern.exec(notification.body);
    if (m) return { title, body: text(m) };
  }
  return { title, body: notification.body };
}

const TYPES: Record<string, [string, string]> = {
  mention: ["Mention", "Mention"], assignment: ["Affectation", "Assignment"], status_change: ["Statut", "Status"], comment: ["Commentaire", "Comment"],
  deadline: ["Échéance", "Deadline"], overdue: ["Retard", "Overdue"], payment_due: ["Paiement", "Payment due"], contract_due: ["Contrat", "Contract due"], system: ["Système", "System"],
};

/** A notification's kind, as a label ("payment_due" → « Paiement » / "Payment due"). */
export function notificationTypeLabel(type: string, locale: Locale): string {
  const pair = TYPES[type];
  if (pair) return locale === "fr" ? pair[0] : pair[1];
  const words = type.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** How pressing it is, as a label. */
export const severityLabel = (severity: "critical" | "warning", locale: Locale) =>
  severity === "critical" ? (locale === "fr" ? "Critique" : "Critical") : locale === "fr" ? "Alerte" : "Warning";
