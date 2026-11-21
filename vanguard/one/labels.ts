// What the application stores (codes, English sentences of the activity log, table names) said in the person's
// language (asked on 2026-11-20: "partially_paid", "employee", "Moved ticket from…" were shown as they are stored).
//   valueLabel('invoice', 'partially_paid', say)   → « Partiellement payée » / "Partially paid"
//   activityText('Created project Audit', metadata, say) → « Mission créée : « Audit » »
//   activityDetail(metadata, say)                    → « Priorité : Basse → Haute »
// A French label agrees with what it qualifies (une facture payée, un contrat signé): values are grouped by kind.

export type Say = (fr: string, en: string) => string;
type Pair = [string, string];

/** A label starts with a capital, as Fluent's do: « lundi 16 nov. » → « Lundi 16 nov. » (dates as French writes them). */
export const cap = (text: string) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);
type Words = Record<string, Pair>;

export type ValueKind =
  | 'ticket' | 'project' | 'milestone' | 'contract' | 'invoice' | 'payment' | 'transfer' | 'client' | 'document'
  | 'role' | 'member' | 'priority' | 'method' | 'category' | 'visibility' | 'contract_type' | 'client_type'
  | 'document_type' | 'project_kind' | 'availability';

const ROLES: Words = { admin: ['Administrateur', 'Administrator'], manager: ['Manager', 'Manager'], supervisor: ['Superviseur', 'Supervisor'], employee: ['Collaborateur', 'Employee'], shareholder: ['Actionnaire', 'Shareholder'], partner: ['Associé', 'Partner'], raf: ['RAF', 'Finance manager'], accountant: ['Comptable', 'Accountant'], staff: ['Collaborateur', 'Staff'], intern: ['Stagiaire', 'Intern'], system: ['Système', 'System'] };

const KINDS: Record<ValueKind, Words> = {
  ticket: { backlog: ['Backlog', 'Backlog'], todo: ['À faire', 'To do'], in_progress: ['En cours', 'In progress'], review: ['En revue', 'In review'], blocked: ['Bloqué', 'Blocked'], done: ['Terminé', 'Done'], archived: ['Archivé', 'Archived'] },
  project: { draft: ['Brouillon', 'Draft'], planned: ['Planifiée', 'Planned'], active: ['Active', 'Active'], on_hold: ['En pause', 'On hold'], completed: ['Terminée', 'Completed'], cancelled: ['Annulée', 'Cancelled'] },
  milestone: { planned: ['Planifié', 'Planned'], in_progress: ['En cours', 'In progress'], completed: ['Terminé', 'Completed'], delayed: ['En retard', 'Delayed'], cancelled: ['Annulé', 'Cancelled'] },
  contract: { draft: ['Brouillon', 'Draft'], under_review: ['En revue', 'Under review'], signed: ['Signé', 'Signed'], active: ['Actif', 'Active'], expired: ['Expiré', 'Expired'], cancelled: ['Annulé', 'Cancelled'], archived: ['Archivé', 'Archived'] },
  invoice: { draft: ['Brouillon', 'Draft'], sent: ['Envoyée', 'Sent'], partially_paid: ['Partiellement payée', 'Partially paid'], paid: ['Payée', 'Paid'], overdue: ['En retard', 'Overdue'], cancelled: ['Annulée', 'Cancelled'], archived: ['Archivée', 'Archived'] },
  payment: { expected: ['Attendu', 'Expected'], received: ['Reçu', 'Received'], late: ['En retard', 'Late'], cancelled: ['Annulé', 'Cancelled'], reconciled: ['Rapproché', 'Reconciled'] },
  transfer: { planned: ['Prévu', 'Planned'], pending: ['En attente', 'Pending'], sent: ['Envoyé', 'Sent'], confirmed: ['Confirmé', 'Confirmed'], failed: ['Échoué', 'Failed'], cancelled: ['Annulé', 'Cancelled'] },
  client: { prospect: ['Prospect', 'Prospect'], active: ['Actif', 'Active'], inactive: ['Inactif', 'Inactive'], suspended: ['Suspendu', 'Suspended'], archived: ['Archivé', 'Archived'] },
  document: { active: ['Actif', 'Active'], archived: ['Archivé', 'Archived'], deleted: ['Supprimé', 'Deleted'] },
  role: ROLES,
  member: { ...ROLES, owner: ['Responsable', 'Owner'], member: ['Membre', 'Member'], lead: ['Chef de mission', 'Lead'], viewer: ['Lecteur', 'Viewer'] }, // a mission's own roles, else the person's
  priority: { low: ['Basse', 'Low'], normal: ['Moyenne', 'Medium'], medium: ['Moyenne', 'Medium'], high: ['Haute', 'High'], urgent: ['Urgente', 'Urgent'], critical: ['Critique', 'Critical'] },
  method: { cash: ['Espèces', 'Cash'], bank_transfer: ['Virement', 'Bank transfer'], check: ['Chèque', 'Check'], mobile_money: ['Mobile money', 'Mobile money'], card: ['Carte', 'Card'], other: ['Autre', 'Other'] },
  category: { supplier: ['Fournisseur', 'Supplier'], salary: ['Salaire', 'Salary'], subcontractor: ['Sous-traitant', 'Subcontractor'], software: ['Logiciel', 'Software'], hosting: ['Hébergement', 'Hosting'], taxes: ['Impôts et taxes', 'Taxes'], rent: ['Loyer', 'Rent'], other: ['Autre', 'Other'] },
  visibility: { private: ['Privée', 'Private'], team: ['Équipe', 'Team'], management: ['Direction', 'Management'], shareholders: ['Actionnaires', 'Shareholders'], internal: ['Interne', 'Internal'], restricted: ['Restreinte', 'Restricted'], public: ['Publique', 'Public'] },
  contract_type: { development: ['Développement', 'Development'], maintenance: ['Maintenance', 'Maintenance'], consulting: ['Conseil', 'Consulting'], support: ['Support', 'Support'], hosting: ['Hébergement', 'Hosting'], audit: ['Audit', 'Audit'], other: ['Autre', 'Other'] },
  client_type: { company: ['Entreprise', 'Company'], public_institution: ['Institution publique', 'Public institution'], ngo: ['ONG', 'NGO'], individual: ['Particulier', 'Individual'], other: ['Autre', 'Other'] },
  document_type: { contract: ['Contrat', 'Contract'], invoice: ['Facture', 'Invoice'], receipt: ['Reçu', 'Receipt'], bank_transfer: ['Virement', 'Bank transfer'], proposal: ['Proposition', 'Proposal'], report: ['Rapport', 'Report'], meeting_note: ['Compte rendu', 'Meeting note'], technical_document: ['Document technique', 'Technical document'], legal_document: ['Document juridique', 'Legal document'], other: ['Autre', 'Other'] },
  project_kind: { client_mission: ['Mission client', 'Client mission'], institutional_partnership: ['Partenariat institutionnel', 'Institutional partnership'], internal_product: ['Produit interne', 'Internal product'], internal_tool: ['Outil interne', 'Internal tool'] },
  availability: { available: ['Disponible', 'Available'], busy: ['Occupé', 'Busy'], overloaded: ['Surchargé', 'Overloaded'], away: ['Absent', 'Away'], inactive: ['Inactif', 'Inactive'] },
};

// a code no list knows: its words, as a label ("on_hold" → "On hold")
const humane = (value: string) => {
  const words = value.replace(/_/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : value;
};

/** A stored code (a status, a role, a type…) as its label. */
export function valueLabel(kind: ValueKind, value: string | null | undefined, say: Say): string {
  if (value === null || value === undefined || value === '') return '—';
  const pair = KINDS[kind][value];
  return pair ? say(...pair) : humane(value);
}

// what the activity log calls the things it follows (BUMEX One's entity types)
const ENTITIES: Words = {
  profile: ['Profil', 'Profile'], user: ['Utilisateur', 'User'], team: ['Équipe', 'Team'], finance: ['Finances', 'Finance'], shareholder: ['Actionnaire', 'Shareholder'],
  client: ['Client', 'Client'], project: ['Mission', 'Mission'], milestone: ['Jalon', 'Milestone'], task: ['Ticket', 'Ticket'], ticket: ['Ticket', 'Ticket'],
  contract: ['Contrat', 'Contract'], invoice: ['Facture', 'Invoice'], receipt: ['Reçu', 'Receipt'], document: ['Document', 'Document'], payment: ['Paiement', 'Payment'],
  transfer: ['Virement', 'Transfer'], settings: ['Paramètres', 'Settings'], report: ['Rapport', 'Report'], comment: ['Commentaire', 'Comment'], note: ['Note', 'Note'],
};
export const entityLabel = (type: string, say: Say) => (ENTITIES[type] ? say(...ENTITIES[type]) : humane(type));

// the ERP's tables, as its audit log names them (db/erp/migrations)
const TABLES: Words = {
  access_grant: ['Droit d’accès', 'Access grant'], account: ['Compte', 'Account'], account_mapping: ['Correspondance de compte', 'Account mapping'], activity: ['Activité', 'Activity'],
  allocation: ['Lettrage', 'Allocation'], app_user: ['Utilisateur', 'User'], approval: ['Approbation', 'Approval'], archive_record: ['Archive', 'Archive'], asset: ['Immobilisation', 'Fixed asset'],
  asset_category: ['Catégorie d’immobilisation', 'Asset category'], asset_disposal: ['Cession d’immobilisation', 'Asset disposal'], assignment: ['Affectation', 'Assignment'],
  bank_account: ['Compte bancaire', 'Bank account'], bank_rule: ['Règle bancaire', 'Bank rule'], bank_statement: ['Relevé bancaire', 'Bank statement'], bank_transaction: ['Opération bancaire', 'Bank transaction'],
  board: ['Tableau', 'Board'], client: ['Client', 'Client'], comment: ['Commentaire', 'Comment'], contract: ['Contrat', 'Contract'], credit_note: ['Avoir', 'Credit note'], credit_note_line: ['Ligne d’avoir', 'Credit note line'],
  customer: ['Client', 'Customer'], customer_payment: ['Encaissement', 'Customer payment'], deletion_request: ['Demande de suppression', 'Deletion request'], depreciation_run: ['Dotation aux amortissements', 'Depreciation run'],
  document: ['Document', 'Document'], dunning_run: ['Relance', 'Dunning run'], employee: ['Collaborateur', 'Employee'], engagement: ['Mission', 'Mission'], engagement_staff: ['Équipe de mission', 'Mission staff'],
  engagement_stage: ['Étape de mission', 'Mission stage'], entity: ['Entité', 'Entity'], fiscal_year: ['Exercice', 'Fiscal year'], fx_rate: ['Taux de change', 'Exchange rate'], journal: ['Journal', 'Journal'],
  journal_entry: ['Écriture', 'Journal entry'], journal_line: ['Ligne d’écriture', 'Journal line'], loan: ['Emprunt', 'Loan'], loan_instalment: ['Échéance d’emprunt', 'Loan instalment'], loan_payment: ['Remboursement d’emprunt', 'Loan payment'],
  milestone: ['Jalon', 'Milestone'], note: ['Note', 'Note'], payment_run: ['Campagne de paiement', 'Payment run'], payroll_line: ['Ligne de paie', 'Payroll line'], payroll_run: ['Paie', 'Payroll run'], period: ['Période', 'Period'],
  person: ['Personne', 'Person'], rate_card: ['Grille tarifaire', 'Rate card'], sales_invoice: ['Facture', 'Sales invoice'], sales_invoice_line: ['Ligne de facture', 'Invoice line'], subtask: ['Sous-tâche', 'Sub-task'],
  supplier: ['Fournisseur', 'Supplier'], supplier_invoice: ['Facture fournisseur', 'Supplier invoice'], supplier_invoice_line: ['Ligne de facture fournisseur', 'Supplier invoice line'], supplier_payment: ['Paiement fournisseur', 'Supplier payment'],
  task: ['Ticket', 'Ticket'], task_link: ['Lien entre tickets', 'Ticket link'], tax_code: ['Code de taxe', 'Tax code'], tax_return: ['Déclaration fiscale', 'Tax return'], tax_rule: ['Règle fiscale', 'Tax rule'],
  time_entry: ['Temps saisi', 'Time entry'], timesheet_week: ['Feuille de temps', 'Timesheet'], user_access: ['Accès', 'Access'], numbering_policy: ['Numérotation', 'Numbering'],
};
export const tableLabel = (table: string, say: Say) => (TABLES[table] ? say(...TABLES[table]) : humane(table));

// a field the log says was changed: its name, and the change said as a whole
const FIELDS: Record<string, [string, string, string, string]> = {
  status: ['État', 'Status', 'État modifié', 'Status changed'], stage: ['Étape', 'Stage', 'Étape modifiée', 'Stage changed'],
  assignee_id: ['Assigné', 'Assignee', 'Assigné modifié', 'Assignee changed'], reporter_id: ['Rapporteur', 'Reporter', 'Rapporteur modifié', 'Reporter changed'],
  priority: ['Priorité', 'Priority', 'Priorité modifiée', 'Priority changed'], type: ['Type', 'Type', 'Type modifié', 'Type changed'],
  estimated_hours: ['Estimation', 'Estimate', 'Estimation modifiée', 'Estimate changed'], due_date: ['Échéance', 'Due date', 'Échéance modifiée', 'Due date changed'],
  labels: ['Étiquettes', 'Labels', 'Étiquettes modifiées', 'Labels changed'], title: ['Titre', 'Title', 'Titre modifié', 'Title changed'], name: ['Nom', 'Name', 'Nom modifié', 'Name changed'],
  notes: ['Description', 'Description', 'Description modifiée', 'Description changed'], description: ['Description', 'Description', 'Description modifiée', 'Description changed'],
  engagement_id: ['Mission', 'Mission', 'Mission modifiée', 'Mission changed'], project_id: ['Mission', 'Mission', 'Mission modifiée', 'Mission changed'], key: ['Clé', 'Key', 'Clé modifiée', 'Key changed'],
  start_date: ['Début', 'Start date', 'Date de début modifiée', 'Start date changed'], end_date: ['Fin', 'End date', 'Date de fin modifiée', 'End date changed'],
  deadline: ['Échéance', 'Deadline', 'Échéance modifiée', 'Deadline changed'], amount: ['Montant', 'Amount', 'Montant modifié', 'Amount changed'],
  visibility: ['Visibilité', 'Visibility', 'Visibilité modifiée', 'Visibility changed'], document_type: ['Type de document', 'Document type', 'Type de document modifié', 'Document type changed'],
  client_id: ['Client', 'Client', 'Client modifié', 'Client changed'], budget: ['Budget', 'Budget', 'Budget modifié', 'Budget changed'], progress: ['Avancement', 'Progress', 'Avancement modifié', 'Progress changed'],
  signed_date: ['Date de signature', 'Signed date', 'Date de signature modifiée', 'Signed date changed'], renewal_date: ['Renouvellement', 'Renewal date', 'Date de renouvellement modifiée', 'Renewal date changed'],
  contact_email: ['E-mail de contact', 'Contact e-mail', 'E-mail de contact modifié', 'Contact e-mail changed'], capacity: ['Capacité', 'Capacity', 'Capacité modifiée', 'Capacity changed'],
  availability: ['Disponibilité', 'Availability', 'Disponibilité modifiée', 'Availability changed'],
};
export const fieldLabel = (field: string, say: Say) => (FIELDS[field] ? say(FIELDS[field][0], FIELDS[field][1]) : humane(field));
const fieldChanged = (field: string, say: Say) => (FIELDS[field] ? say(FIELDS[field][2], FIELDS[field][3]) : say(`${humane(field)} modifié`, `${humane(field)} changed`));

const quote = (text: string, say: Say) => say(`« ${text} »`, `“${text}”`);
const day = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split('-').reverse().join('/') : iso);
const statusKind = (entity: string | undefined): ValueKind =>
  entity === 'project' ? 'project' : entity === 'milestone' ? 'milestone' : entity === 'contract' ? 'contract' : entity === 'client' ? 'client' : entity === 'invoice' ? 'invoice' : 'ticket';

type Rule = [RegExp, (m: RegExpExecArray, say: Say) => string];
// every sentence the application writes in work.activity (lib/*/service.ts, lib/mail, db 0012), most specific first
const RULES: Rule[] = [
  [/^Created ticket (.+) from an e-mail$/, (m, say) => say(`Ticket créé depuis un e-mail : ${quote(m[1], say)}`, `Ticket created from an e-mail: ${quote(m[1], say)}`)],
  [/^Created ticket (.+)$/, (m, say) => say(`Ticket créé : ${quote(m[1], say)}`, `Ticket created: ${quote(m[1], say)}`)],
  [/^Updated ticket (.+)$/, (m, say) => say(`Ticket modifié : ${quote(m[1], say)}`, `Ticket updated: ${quote(m[1], say)}`)],
  [/^Moved ticket from (.+) to (.+)$/, (m, say) => say(`Ticket déplacé de ${m[1]} vers ${m[2]}`, `Ticket moved from ${m[1]} to ${m[2]}`)],
  [/^Moved ticket to (.+)$/, (m, say) => say(`Ticket déplacé vers ${valueLabel('ticket', m[1], say)}`, `Ticket moved to ${valueLabel('ticket', m[1], say)}`)],
  [/^Moved task to unscheduled$/, (_, say) => say('Tâche sans échéance', 'Task unscheduled')],
  [/^Moved task to (.+)$/, (m, say) => say(`Tâche replanifiée au ${day(m[1])}`, `Task moved to ${day(m[1])}`)],
  [/^Changed ([a-z_]+)$/, (m, say) => fieldChanged(m[1], say)],
  [/^Added comment$/, (_, say) => say('Commentaire ajouté', 'Comment added')],
  [/^Edited comment$/, (_, say) => say('Commentaire modifié', 'Comment edited')],
  [/^Deleted comment$/, (_, say) => say('Commentaire supprimé', 'Comment deleted')],
  [/^Created note$/, (_, say) => say('Note créée', 'Note created')],
  [/^Updated note$/, (_, say) => say('Note modifiée', 'Note updated')],
  [/^Archived note$/, (_, say) => say('Note archivée', 'Note archived')],
  [/^Pinned executive note$/, (_, say) => say('Note de direction épinglée', 'Executive note pinned')],
  [/^Executive note updated$/, (_, say) => say('Note de direction modifiée', 'Executive note updated')],
  [/^Pinned note$/, (_, say) => say('Note épinglée', 'Note pinned')],
  [/^Unpinned note$/, (_, say) => say('Note désépinglée', 'Note unpinned')],
  [/^Added link$/, (_, say) => say('Lien ajouté', 'Link added')],
  [/^Removed link$/, (_, say) => say('Lien retiré', 'Link removed')],
  [/^Added (.+) sub-tasks$/, (m, say) => say(`${m[1]} sous-tâches ajoutées`, `${m[1]} sub-tasks added`)],
  [/^Added sub-task (.+)$/, (m, say) => say(`Sous-tâche ajoutée : ${quote(m[1], say)}`, `Sub-task added: ${quote(m[1], say)}`)],
  [/^Completed sub-task (.+)$/, (m, say) => say(`Sous-tâche terminée : ${quote(m[1], say)}`, `Sub-task completed: ${quote(m[1], say)}`)],
  [/^Reopened sub-task (.+)$/, (m, say) => say(`Sous-tâche rouverte : ${quote(m[1], say)}`, `Sub-task reopened: ${quote(m[1], say)}`)],
  [/^Removed sub-task (.+)$/, (m, say) => say(`Sous-tâche supprimée : ${quote(m[1], say)}`, `Sub-task removed: ${quote(m[1], say)}`)],
  [/^Unassigned sub-task (.+)$/, (m, say) => say(`Sous-tâche ${quote(m[1], say)} désassignée`, `Sub-task ${quote(m[1], say)} unassigned`)],
  [/^Cleared the due date of sub-task (.+)$/, (m, say) => say(`Échéance de la sous-tâche ${quote(m[1], say)} retirée`, `Due date of sub-task ${quote(m[1], say)} cleared`)],
  [/^Assigned sub-task (.+) to (.+)$/, (m, say) => say(`Sous-tâche ${quote(m[1], say)} assignée à ${m[2]}`, `Sub-task ${quote(m[1], say)} assigned to ${m[2]}`)],
  [/^Set the due date of sub-task (.+) to (.+)$/, (m, say) => say(`Échéance de la sous-tâche ${quote(m[1], say)} : ${day(m[2])}`, `Sub-task ${quote(m[1], say)} due ${day(m[2])}`)],
  [/^Created project (.+)$/, (m, say) => say(`Mission créée : ${quote(m[1], say)}`, `Mission created: ${quote(m[1], say)}`)],
  [/^Updated project (start date|deadline)$/, (m, say) => (m[1] === 'deadline' ? say('Échéance de la mission modifiée', 'Mission deadline changed') : say('Date de début de la mission modifiée', 'Mission start date changed'))],
  [/^Updated project (.+)$/, (m, say) => say(`Mission modifiée : ${quote(m[1], say)}`, `Mission updated: ${quote(m[1], say)}`)],
  [/^Renamed project to (.+)$/, (m, say) => say(`Mission renommée : ${quote(m[1], say)}`, `Mission renamed: ${quote(m[1], say)}`)],
  [/^Changed project status to (.+)$/, (m, say) => say(`État de la mission : ${valueLabel('project', m[1], say)}`, `Mission status: ${valueLabel('project', m[1], say)}`)],
  [/^Added (.+) to the team$/, (m, say) => say(`${m[1]} rejoint l’équipe`, `${m[1]} added to the team`)],
  [/^Removed a member from the team$/, (_, say) => say('Un membre quitte l’équipe', 'A member removed from the team')],
  [/^Removed (.+) from the team$/, (m, say) => say(`${m[1]} quitte l’équipe`, `${m[1]} removed from the team`)],
  [/^Created milestone (.+)$/, (m, say) => say(`Jalon créé : ${quote(m[1], say)}`, `Milestone created: ${quote(m[1], say)}`)],
  [/^Updated milestone deadline$/, (_, say) => say('Échéance du jalon modifiée', 'Milestone deadline changed')],
  [/^Updated milestone (.+)$/, (m, say) => say(`Jalon modifié : ${quote(m[1], say)}`, `Milestone updated: ${quote(m[1], say)}`)],
  [/^Renamed milestone to (.+)$/, (m, say) => say(`Jalon renommé : ${quote(m[1], say)}`, `Milestone renamed: ${quote(m[1], say)}`)],
  [/^Completed milestone$/, (_, say) => say('Jalon terminé', 'Milestone completed')],
  [/^Marked milestone as delayed$/, (_, say) => say('Jalon marqué en retard', 'Milestone marked as delayed')],
  [/^Changed milestone status to (.+)$/, (m, say) => say(`État du jalon : ${valueLabel('milestone', m[1].replace(/ /g, '_'), say)}`, `Milestone status: ${valueLabel('milestone', m[1].replace(/ /g, '_'), say)}`)],
  [/^Created client (.+)$/, (m, say) => say(`Client créé : ${quote(m[1], say)}`, `Client created: ${quote(m[1], say)}`)],
  [/^Updated client contact email$/, (_, say) => say('E-mail de contact du client modifié', 'Client contact e-mail changed')],
  [/^Updated client (.+)$/, (m, say) => say(`Client modifié : ${quote(m[1], say)}`, `Client updated: ${quote(m[1], say)}`)],
  [/^Renamed client to (.+)$/, (m, say) => say(`Client renommé : ${quote(m[1], say)}`, `Client renamed: ${quote(m[1], say)}`)],
  [/^Archived client$/, (_, say) => say('Client archivé', 'Client archived')],
  [/^Changed client type to (.+)$/, (m, say) => say(`Type du client : ${valueLabel('client_type', m[1], say)}`, `Client type: ${valueLabel('client_type', m[1], say)}`)],
  [/^Changed client status to (.+)$/, (m, say) => say(`État du client : ${valueLabel('client', m[1], say)}`, `Client status: ${valueLabel('client', m[1], say)}`)],
  [/^Unlinked client$/, (_, say) => say('Client dissocié', 'Client unlinked')],
  [/^Created contract (.+)$/, (m, say) => say(`Contrat créé : ${quote(m[1], say)}`, `Contract created: ${quote(m[1], say)}`)],
  [/^Updated contract amount$/, (_, say) => say('Montant du contrat modifié', 'Contract amount changed')],
  [/^Updated contract (.+)$/, (m, say) => say(`Contrat modifié : ${quote(m[1], say)}`, `Contract updated: ${quote(m[1], say)}`)],
  [/^Renamed contract to (.+)$/, (m, say) => say(`Contrat renommé : ${quote(m[1], say)}`, `Contract renamed: ${quote(m[1], say)}`)],
  [/^Archived contract$/, (_, say) => say('Contrat archivé', 'Contract archived')],
  [/^Contract signed$/, (_, say) => say('Contrat signé', 'Contract signed')],
  [/^Contract expired$/, (_, say) => say('Contrat expiré', 'Contract expired')],
  [/^Changed contract status to (.+)$/, (m, say) => say(`État du contrat : ${valueLabel('contract', m[1], say)}`, `Contract status: ${valueLabel('contract', m[1], say)}`)],
  [/^Updated signed date$/, (_, say) => say('Date de signature modifiée', 'Signed date changed')],
  [/^Updated renewal date$/, (_, say) => say('Date de renouvellement modifiée', 'Renewal date changed')],
  [/^Uploaded document (.+)$/, (m, say) => say(`Document déposé : ${quote(m[1], say)}`, `Document uploaded: ${quote(m[1], say)}`)],
  [/^Deleted document$/, (_, say) => say('Document supprimé', 'Document deleted')],
  [/^Archived document$/, (_, say) => say('Document archivé', 'Document archived')],
  [/^Restored document$/, (_, say) => say('Document restauré', 'Document restored')],
  [/^Updated document metadata$/, (_, say) => say('Informations du document modifiées', 'Document details changed')],
  [/^Renamed document to (.+)$/, (m, say) => say(`Document renommé : ${quote(m[1], say)}`, `Document renamed: ${quote(m[1], say)}`)],
  [/^Changed document type to (.+)$/, (m, say) => say(`Type du document : ${valueLabel('document_type', m[1], say)}`, `Document type: ${valueLabel('document_type', m[1], say)}`)],
  [/^Changed visibility to (.+)$/, (m, say) => say(`Visibilité : ${valueLabel('visibility', m[1], say)}`, `Visibility: ${valueLabel('visibility', m[1], say)}`)],
  [/^Viewed document$/, (_, say) => say('Document consulté', 'Document viewed')],
  [/^Viewed invoice PDF$/, (_, say) => say('PDF de la facture consulté', 'Invoice PDF viewed')],
  [/^Downloaded invoice PDF$/, (_, say) => say('PDF de la facture téléchargé', 'Invoice PDF downloaded')],
  [/^Updated profile (.+)$/, (m, say) => say(`Profil modifié : ${m[1]}`, `Profile updated: ${m[1]}`)],
  [/^Availability changed$/, (_, say) => say('Disponibilité modifiée', 'Availability changed')],
  [/^Capacity changed$/, (_, say) => say('Capacité modifiée', 'Capacity changed')],
  [/^Archived$/, (_, say) => say('Archivé', 'Archived')],
  [/^Reopened$/, (_, say) => say('Rouvert', 'Reopened')],
  [/^Completed$/, (_, say) => say('Terminé', 'Completed')],
];

/** A line of the activity log in the person's language: "Mission créée : « Audit 2026 »". */
export function activityText(action: string, say: Say): string {
  for (const [pattern, text] of RULES) {
    const m = pattern.exec(action);
    if (m) return text(m, say);
  }
  return action;
}

// the summaries the services write in English ("Client created"…): what the sentence already says; another summary
// (a move's reason, a note's title) is the person's own words, shown as written
const FIXED = /^(?:[A-Z][a-z-]+(?: [a-z-]+)*) (?:created|updated|archived|added|edited|deleted|completed|reopened|changed|removed|delayed)(?: from an e-mail)?$|(?:joined|left) the team$/;

const shown = (field: string, value: unknown, entity: string | undefined, say: Say): string | null => {
  if (value === null || value === undefined || value === '') return say('Aucun', 'None');
  const text = String(value);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(text)) return null; // a person's or a mission's id: the sentence names the change, not the id
  if (field === 'status' || field === 'stage') return valueLabel(statusKind(entity), text, say);
  if (field === 'priority') return valueLabel('priority', text, say);
  if (field === 'visibility') return valueLabel('visibility', text, say);
  if (field === 'document_type') return valueLabel('document_type', text, say);
  if (typeof value === 'boolean') return value ? say('Oui', 'Yes') : say('Non', 'No');
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return day(text);
  if (/^-?\d+(\.\d+)?$/.test(text)) return say(text.replace('.', ','), text);
  return text;
};

/** What a line of the log adds to its sentence: the change of a field ("Priorité : Basse → Haute"), or the words
 *  someone wrote (a move's reason). */
export function activityDetail(metadata: Record<string, unknown> | null | undefined, say: Say, entity?: string): string {
  if (!metadata) return '';
  const field = typeof metadata.field === 'string' ? metadata.field : null;
  if (field) {
    const from = shown(field, metadata.from, entity, say);
    const to = shown(field, metadata.to, entity, say);
    const change = from !== null && to !== null ? ` : ${from} → ${to}` : '';
    return `${fieldLabel(field, say)}${say(change, change.replace(' : ', ': '))}`;
  }
  const summary = typeof metadata.summary === 'string' ? metadata.summary.trim() : '';
  return summary && !FIXED.test(summary) ? summary : '';
}
