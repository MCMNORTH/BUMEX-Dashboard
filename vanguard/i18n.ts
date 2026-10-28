export type Lang = 'fr' | 'en';

const dict: Record<string, [string, string]> = {
  tower: ['Tour', 'Tower'], flat: ['Plat', 'Flat'], floor: ['Étage', 'Floor'], penthouse: ['Penthouse', 'Penthouse'],
  enter: ["Entrer dans l'étage", 'Enter the floor'], back_tower: ['Échap · Tour', 'Esc · Tower'], close: ['Échap · Fermer', 'Esc · Close'],
  search_ph: ['Rechercher un client, une facture, un compte… (Ctrl+K)', 'Search a customer, an invoice, an account… (Ctrl+K)'],
  fiscal_year: ['Exercice', 'Fiscal year'], role: ['Rôle', 'Role'], reset: ['Recharger les données', 'Reload the data'] /* [bumex-one] */, lang: ['EN', 'FR'],
  partner: ['Associé', 'Partner'], manager: ['Manager', 'Manager'], accountant: ['Comptable', 'Accountant'], staff: ['Collaborateur', 'Staff'], intern: ['Stagiaire', 'Intern'], admin: ['Administrateur', 'Administrator'], raf: ['Responsable administratif et financier', 'Finance & administration lead'],
  room_bank: ['Trésorerie', 'Treasury'], room_accounting: ['Comptabilité', 'Accounting'], room_clients: ['Clients', 'Clients'], room_suppliers: ['Fournisseurs', 'Suppliers'],
  room_missions: ['Missions', 'Engagements'], room_assets: ['Immobilisations', 'Fixed assets'], room_hr: ['Ressources humaines', 'Human resources'], room_tax: ['Fiscalité', 'Tax'], room_penthouse: ['Holding · consolidé', 'Holding · consolidated'],
  sig_cash: ['Trésorerie vs seuil', 'Cash vs threshold'], sig_overdue: ['Créances en retard', 'Overdue receivables'], sig_late: ['Missions en retard', 'Late engagements'], sig_drafts: ['Écritures non comptabilisées', 'Unposted entries'],
  legend: ['Légende des signaux', 'Signal legend'], legend_text: ['Fenêtres allumées = postes occupés · ligne de plancher : vert dans les seuils, ambre attention, rouge action requise, éteinte = étage non autorisé.', 'Lit windows = occupied desks · slab line: green within thresholds, amber attention, red action required, off = unauthorised floor.'],
  group: ['Groupe BUMEX · 8 entités', 'BUMEX Group · 8 entities'], hovered: ['Étage survolé', 'Hovered floor'], alerts: ["Alertes du jour · groupe", "Today's alerts · group"],
  cash: ['Trésorerie', 'Cash'], threshold: ['Seuil', 'Threshold'], overdue: ['Créances en retard', 'Overdue receivables'], invoices_n: ['factures', 'invoices'], over90: ['au-delà de 90 j', 'beyond 90 days'],
  late_eng: ['Missions en retard', 'Late engagements'], drafts: ['Écritures en brouillon', 'Draft entries'], unmatched: ['lignes de banque en attente', 'bank lines pending'], present: ["Présents à l'étage", 'Present on the floor'],
  revenue: ["Chiffre d'affaires", 'Revenue'], result: ['Résultat', 'Result'], receivables: ['Créances ouvertes', 'Open receivables'], payables: ['Dettes fournisseurs', 'Supplier payables'],
  decor_title: ['Ce que montre le décor', 'What the decor shows'], periods: ['Périodes', 'Periods'], open: ['Ouverte', 'Open'], soft: ['Clôture douce', 'Soft-closed'], locked: ['Verrouillée', 'Locked'], closed: ['Clôturé', 'Closed'],
  shortcuts: ['Raccourcis', 'Shortcuts'], ok: ['OK', 'OK'], action: ['Action', 'Action'], attention: ['Attention', 'Attention'], todo: ['À traiter', 'To do'],
  no_webgl: ["Votre navigateur n'a pas d'accélération 3D : mode Plat activé.", 'Your browser has no 3D acceleration: Flat mode enabled.'],
  entities: ['Entités', 'Entities'], rooms: ['Salles', 'Rooms'], phase2: ['phase 2', 'phase 2'], demo_note: ['Données de la base ERP du groupe · chaque modification est enregistrée sur le serveur', 'ERP database of the group · every change is saved on the server'] /* [bumex-one] */,
  tab_entry: ['Saisie', 'Entry'], tab_journals: ['Journaux', 'Journals'], tab_gl: ['Grand livre', 'General ledger'], tab_tb: ['Balance', 'Trial balance'], tab_closing: ['Clôture', 'Closing'], tab_coa: ['Plan comptable', 'Chart of accounts'], tab_integrity: ['Intégrité', 'Integrity'],
  tab_invoices: ['Factures', 'Invoices'], tab_new_invoice: ['Nouvelle facture', 'New invoice'], tab_payments: ['Encaissements', 'Receipts'], tab_aging: ['Balance âgée', 'Aging'], tab_dunning: ['Relances', 'Dunning'], tab_customers: ['Fiches', 'Customers'],
  tab_accounts: ['Comptes', 'Accounts'], tab_recon: ['Rapprochement', 'Reconciliation'], tab_import: ['Import relevé', 'Statement import'], tab_forecast: ['Prévision', 'Forecast'], tab_payables: ['Fournisseurs à payer', 'Payables'], tab_loans: ['Emprunts', 'Loans'],
  delete_confirm: ['Confirmer la suppression', 'Confirm the deletion'], delete_reason: ['Motif de la suppression', 'Reason for the deletion'], delete_request: ['Demander la suppression', 'Request the deletion'], delete_now: ['Supprimer définitivement', 'Delete permanently'],
  delete_note_partner: ['Vous êtes habilité : la suppression est immédiate et tracée dans l\'historique avec son motif.', 'You are authorised: the deletion is immediate and logged with its reason.'], delete_note_other: ['Votre rôle ne supprime pas directement : un associé ou l\'administrateur devra approuver la demande.', 'Your role cannot delete directly: a partner or the administrator will have to approve the request.'],
  post: ['Comptabiliser', 'Post'], keep_draft: ['Garder en brouillon', 'Keep as draft'], delete: ['Supprimer', 'Delete'], edit: ['Modifier', 'Edit'], reverse: ['Extourner', 'Reverse'], validate: ['Valider et comptabiliser', 'Validate and post'],
  date: ['Date', 'Date'], journal: ['Journal', 'Journal'], label: ['Libellé', 'Label'], currency: ['Devise', 'Currency'], rate: ['Taux', 'Rate'], account: ['Compte', 'Account'], debit: ['Débit', 'Debit'], credit: ['Crédit', 'Credit'], dimension: ['Dimension', 'Dimension'],
  balanced: ['équilibrée', 'balanced'], unbalanced: ['déséquilibrée', 'unbalanced'], total: ['Total', 'Total'], status: ['Statut', 'Status'], amount: ['Montant', 'Amount'], customer: ['Client', 'Customer'], due: ['Échéance', 'Due'], open_amount: ['Reste dû', 'Open'],
  posted: ['Comptabilisée', 'Posted'], draft: ['Brouillon', 'Draft'], reversed: ['Extournée', 'Reversed'], paid: ['Payée', 'Paid'],
  hash_ok: ['Hash OK', 'Hash OK'], hash_bad: ['Chaîne rompue', 'Chain broken'],
  // sidebar
  nav_myday: ['Ma journée', 'My day'], nav_mywork: ['Mon travail', 'My work'], grp_work: ['Travail', 'Work'], grp_modules: ['Modules', 'Modules'], nav_time: ['Temps', 'Time'], nav_inbox: ['Notifications', 'Notifications'], /* [bumex-one] */ nav_overview: ["Vue d'ensemble", 'Overview'], nav_floors: ['Immeuble · étages', 'Building · floors'], nav_tasks: ['Tâches', 'Tasks'], nav_archives: ['Archives', 'Archives'], nav_reports: ['Rapports', 'Reports'], nav_settings: ['Paramètres', 'Settings'],
  nav_modules: ['Modules', 'Modules'], nav_work: ['Pilotage', 'Operations'], collapse: ['Réduire', 'Collapse'], expand: ['Développer', 'Expand'],
  // command bar
  bar_tasks: ['Tâches', 'Tasks'], bar_active: ['actives', 'active'], bar_progress: ['Avancement', 'Progress'], bar_done_of: ['terminées', 'done'], bar_engagements: ['Missions', 'Engagements'], bar_ongoing: ['en cours', 'ongoing'],
  bar_deadlines: ['Échéances', 'Deadlines'], bar_upcoming: ['à 7 jours', 'within 7 days'], bar_overdue: ['Retard', 'Overdue'], bar_overdue_s: ['tâches en retard', 'overdue tasks'], bar_activity: ['Activité', 'Activity'], bar_alerts: ['Alertes', 'Alerts'],
  bar_scope_group: ['Groupe', 'Group'], bar_next: ['Prochaines échéances', 'Next deadlines'], bar_recent: ['Activité récente', 'Recent activity'], bar_all: ['Tout voir', 'See all'], bar_none: ['Rien à signaler', 'Nothing to report'],
  // rooms and navigation
  room_reception: ['Accueil', 'Reception'], room_board: ['Salle du conseil', 'Boardroom'], room_meeting: ['Salle de réunion', 'Meeting room'], room_office: ['Direction', 'Directors'], room_corridor: ['Couloir', 'Corridor'],
  room_off: ['accès non autorisé · lumière éteinte', 'no access · lights off'],
  open_module: ['Ouvrir le module', 'Open the module'], focus_room: ['Voir la salle', 'View the room'], back_overview: ["Vue d'ensemble", 'Overview'], back_floor: ["Vue de l'étage", 'Floor view'], rack_view: ['Rayonnage', 'Archive rack'],
  current_floor: ['Étage sélectionné', 'Selected floor'], click_floor: ['Cliquer un étage pour entrer', 'Click a floor to enter'], explore: ['Explorer', 'Explore'],
  // archive
  arc_title: ['Archives · dossiers de mission', 'Archives · engagement files'], arc_search: ['Rechercher une référence, un client, une mission…', 'Search a reference, a client, an engagement…'], arc_ref: ['Référence', 'Reference'], arc_date: ["Date d'archivage", 'Archive date'],
  arc_retention: ['Conservation jusqu\'au', 'Retention until'], arc_place: ['Emplacement', 'Location'], arc_bay: ['Baie', 'Bay'], arc_shelf: ['Étagère', 'Shelf'], arc_slot: ['Case', 'Slot'], arc_box: ['Boîte', 'Box'], arc_binder: ['Classeur', 'Binder'],
  arc_archived: ['Archivé', 'Archived'], arc_retrieved: ['Sorti', 'Retrieved'], arc_pending: ['Fin de conservation', 'Retention ended'], arc_destroyed: ['Détruit', 'Destroyed'], arc_all: ['Tous', 'All'],
  arc_retrieve: ['Sortir la boîte', 'Take the box out'], arc_return: ['Remettre en place', 'Put back'], arc_destroy: ['Détruire', 'Destroy'], arc_open_eng: ['Ouvrir la mission', 'Open the engagement'], arc_queue: ['À archiver', 'To archive'], arc_archive_now: ['Archiver sur le rayonnage', 'Archive on the rack'],
  arc_boxes: ['boîtes', 'boxes'], arc_used: ['cases occupées', 'slots used'], arc_notes: ['Notes', 'Notes'], arc_by: ['par', 'by'], arc_select: ['Cliquer une boîte du rayonnage ou une ligne de la liste', 'Click a box on the rack or a row of the list'],
  arc_empty: ['Aucun dossier ne correspond', 'No file matches'], arc_on_rack: ['sur le rayonnage', 'on the rack'],
  // tasks
  tsk_title: ['Tâches', 'Tasks'], tsk_new: ['Nouvelle tâche', 'New task'], tsk_all: ['Toutes', 'All'], tsk_open: ['Ouvertes', 'Open'], tsk_done: ['Terminées', 'Done'], tsk_overdue: ['En retard', 'Overdue'], tsk_mine: ['Échéance', 'Due'],
  tsk_complete: ['Terminer', 'Complete'], tsk_reopen: ['Rouvrir', 'Reopen'], tsk_start: ['Démarrer', 'Start'], tsk_assignee: ['Responsable', 'Assignee'], tsk_module: ['Module', 'Module'], tsk_priority: ['Priorité', 'Priority'], tsk_engagement: ['Mission', 'Engagement'],
  tsk_todo: ['À faire', 'To do'], tsk_in_progress: ['En cours', 'In progress'], tsk_done_s: ['Terminée', 'Done'], tsk_low: ['Basse', 'Low'], tsk_normal: ['Normale', 'Normal'], tsk_high: ['Haute', 'High'], tsk_create: ['Créer la tâche', 'Create the task'], tsk_title_ph: ['Titre de la tâche', 'Task title'],
  tsk_detail: ['Détail de la tâche', 'Task detail'], tsk_created: ['Créée le', 'Created'], tsk_completed: ['Terminée le', 'Completed'], tsk_notes: ['Notes', 'Notes'],
  // reports and settings
  rep_title: ['Rapports', 'Reports'], rep_sub: ['Chaque rapport ouvre le module où il est produit, sur le bon onglet', 'Each report opens the module that produces it, on the right tab'],
  set_title: ['Paramètres', 'Settings'], set_display: ['Affichage', 'Display'], set_quality: ['Qualité 3D', '3D quality'], set_shadows: ['Ombres portées', 'Cast shadows'], set_ao: ['Occlusion ambiante', 'Ambient occlusion'], set_people: ['Personnages animés', 'Animated people'],
  set_session: ['Session', 'Session'], set_data: ['Données', 'Data'], set_entity: ['Entité courante', 'Current entity'], set_lang: ['Langue', 'Language'], set_coa: ['Plan comptable', 'Chart of accounts'], set_coa_sub: ['Comptes, codes taxe et règles par entité', 'Accounts, tax codes and rules per entity'],
  set_quality_sub: ['Baisser la qualité sur une tablette ou un portable sans carte graphique', 'Lower the quality on a tablet or a laptop without a graphics card'],
  overview_title: ['Vue d\'ensemble', 'Overview'],
};

export function makeT(lang: Lang) {
  return (key: string): string => {
    const e = dict[key];
    if (!e) return key;
    return lang === 'fr' ? e[0] : e[1];
  };
}

export const ROOM_KEYS = ['bank', 'accounting', 'clients', 'suppliers', 'missions', 'assets', 'hr', 'tax'] as const;
// Rooms are the 3D spaces; the last four are modules without a room of their own (opened from the sidebar or the bar).
export type Room = (typeof ROOM_KEYS)[number] | 'penthouse' | 'tasks' | 'archives' | 'reports' | 'settings' | 'myday' | 'mywork' | 'time' | 'inbox' | 'overview'; // [bumex-one] overview: vanguard/one/Overview.tsx, myday: vanguard/one/MyDay.tsx, time: vanguard/one/Time.tsx, inbox: vanguard/one/Inbox.tsx
export const MODULE_ROOMS = ['tasks', 'archives', 'reports', 'settings'] as const;
