import type { State, Id, Role, AppUser, DeletionRequest, Session } from './types';
import { DomainError, MODULE_KEYS } from './types';
import { nextId, audit, POSTING_ROLES } from './core';
import { sha256 } from './sha256';

// Access: a role gives default modules, then each person is narrowed to entities and modules by the admin.
// Deletions of business data are confirmed with a reason; partners and admins execute, other roles file a request.

export const ROLE_LABEL_FR: Record<Role, string> = { admin: 'Administrateur', partner: 'Associé', raf: 'Responsable administratif et financier', manager: 'Manager', accountant: 'Comptable', staff: 'Collaborateur', intern: 'Stagiaire' };

export const ROLE_DEFAULT_MODULES: Record<Role, string[] | '*'> = {
  admin: '*',
  partner: '*',
  raf: '*',
  manager: ['accounting', 'bank', 'clients', 'suppliers', 'missions', 'assets', 'hr', 'tax', 'archives', 'tasks', 'reports'],
  accountant: ['accounting', 'bank', 'clients', 'suppliers', 'assets', 'tax', 'archives', 'tasks', 'reports'],
  staff: ['missions', 'tasks', 'archives'],
  intern: ['missions', 'tasks'],
};

// Who may approve, manage access, decide deletions (posting roles live in core.ts)
export const APPROVER_ROLES: Role[] = ['admin', 'partner'];
export const ACCESS_ADMIN_ROLES: Role[] = ['admin'];

export function isAccessAdmin(state: State): boolean {
  return ACCESS_ADMIN_ROLES.includes(state.session.role);
}

export function canDecideDeletions(state: State): boolean {
  return APPROVER_ROLES.includes(state.session.role);
}

export function requireAccessAdmin(state: State) {
  if (!isAccessAdmin(state)) throw new DomainError('forbidden', "Gestion des accès réservée à l'administrateur");
}

export function sessionFor(user: AppUser): Session {
  return { userId: user.id, actorId: user.id, actorName: user.name, role: user.role, entityIds: user.entityIds, modules: user.modules };
}

export interface UserInput {
  name: string;
  email: string;
  role: Role;
  entityIds: Id[] | '*';
  modules?: string[] | '*';
  employeeId?: Id;
  status?: AppUser['status'];
}

function validateUser(state: State, input: UserInput, selfId?: Id) {
  if (!input.name.trim()) throw new DomainError('user_name', 'Le nom est obligatoire');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email.trim())) throw new DomainError('user_email', 'Adresse e-mail invalide');
  if (state.users.some((u) => u.id !== selfId && u.email.toLowerCase() === input.email.trim().toLowerCase())) throw new DomainError('user_exists', 'Un compte existe déjà pour cette adresse');
  if (input.entityIds !== '*') {
    if (!input.entityIds.length) throw new DomainError('user_entities', 'Choisir au moins une entité');
    for (const e of input.entityIds) if (!state.entities.some((x) => x.id === e)) throw new DomainError('entity_missing', `Entité inconnue ${e}`);
  }
  if (input.modules && input.modules !== '*') for (const m of input.modules) if (!(MODULE_KEYS as readonly string[]).includes(m)) throw new DomainError('user_modules', `Module inconnu ${m}`);
}

// The admin creates the account and gets the invitation link to send; the person activates it to sign in.
export function createUser(state: State, input: UserInput): [State, AppUser] {
  requireAccessAdmin(state);
  validateUser(state, input);
  const [s1, id] = nextId(state, 'usr');
  const token = sha256(`${id}|${input.email}|${s1.seq}|${state.today}`).slice(0, 24);
  const user: AppUser = {
    id,
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    role: input.role,
    entityIds: input.entityIds,
    modules: input.modules ?? ROLE_DEFAULT_MODULES[input.role],
    status: input.status ?? 'invited',
    inviteToken: input.status === 'active' ? undefined : token,
    invitedAt: state.today,
    activatedAt: input.status === 'active' ? state.today : undefined,
    createdBy: state.session.actorId,
    employeeId: input.employeeId,
  };
  return [audit({ ...s1, users: [...s1.users, user] }, 'app_user', id, 'I', `Compte créé · ${user.name} · ${ROLE_LABEL_FR[user.role]}`), user];
}

export function updateUserAccess(state: State, userId: Id, patch: Partial<UserInput>): [State, AppUser] {
  requireAccessAdmin(state);
  const u = state.users.find((x) => x.id === userId);
  if (!u) throw new DomainError('user_missing', 'Compte inconnu');
  const merged: UserInput = { name: patch.name ?? u.name, email: patch.email ?? u.email, role: patch.role ?? u.role, entityIds: patch.entityIds ?? u.entityIds, modules: patch.modules ?? (patch.role && patch.role !== u.role && !patch.modules ? ROLE_DEFAULT_MODULES[patch.role] : u.modules), employeeId: patch.employeeId ?? u.employeeId };
  validateUser(state, merged, userId);
  if (u.id === state.session.userId && merged.role !== 'admin' && u.role === 'admin' && state.users.filter((x) => x.role === 'admin' && x.status !== 'disabled').length === 1) throw new DomainError('last_admin', 'Impossible de retirer le dernier administrateur');
  const next: AppUser = { ...u, name: merged.name.trim(), email: merged.email.trim().toLowerCase(), role: merged.role, entityIds: merged.entityIds, modules: merged.modules ?? ROLE_DEFAULT_MODULES[merged.role], employeeId: merged.employeeId };
  let s: State = { ...state, users: state.users.map((x) => (x.id === userId ? next : x)) };
  if (s.session.userId === userId) s = { ...s, session: sessionFor(next) };
  return [audit(s, 'app_user', userId, 'U', `Accès modifiés · ${next.name} · ${ROLE_LABEL_FR[next.role]} · ${next.entityIds === '*' ? 'toutes entités' : next.entityIds.length + ' entité(s)'} · ${next.modules === '*' ? 'tous modules' : next.modules.length + ' module(s)'}`), next];
}

export function setUserStatus(state: State, userId: Id, status: AppUser['status']): [State, AppUser] {
  requireAccessAdmin(state);
  const u = state.users.find((x) => x.id === userId);
  if (!u) throw new DomainError('user_missing', 'Compte inconnu');
  if (u.id === state.session.userId && status === 'disabled') throw new DomainError('self_disable', 'Impossible de désactiver son propre compte');
  const next: AppUser = { ...u, status, inviteToken: status === 'invited' ? u.inviteToken ?? sha256(`${u.id}|${state.seq}|${state.today}`).slice(0, 24) : u.inviteToken };
  return [audit({ ...state, users: state.users.map((x) => (x.id === userId ? next : x)) }, 'app_user', userId, 'U', `Compte ${status === 'disabled' ? 'désactivé' : status === 'active' ? 'réactivé' : 'réinvité'} · ${u.name}`), next];
}

// The invitation link carries the token; opening it activates the account and signs the person in.
export function activateInvite(state: State, token: string): [State, AppUser] {
  const u = state.users.find((x) => x.inviteToken === token);
  if (!u) throw new DomainError('invite_invalid', "Lien d'invitation invalide ou déjà utilisé");
  if (u.status === 'disabled') throw new DomainError('user_disabled', 'Compte désactivé');
  const next: AppUser = { ...u, status: 'active', activatedAt: state.today, inviteToken: undefined };
  const s: State = { ...state, users: state.users.map((x) => (x.id === u.id ? next : x)), session: sessionFor(next) };
  return [audit(s, 'app_user', u.id, 'U', `Compte activé · ${u.name}`), next];
}

export function signInAs(state: State, userId: Id): State {
  const u = state.users.find((x) => x.id === userId);
  if (!u) throw new DomainError('user_missing', 'Compte inconnu');
  if (u.status === 'disabled') throw new DomainError('user_disabled', 'Compte désactivé');
  return { ...state, session: sessionFor(u) };
}

// ---- deletions -------------------------------------------------------------------------------------------

export const PROTECTED_TABLES = ['customer', 'supplier', 'employee', 'asset', 'engagement', 'loan', 'account', 'app_user', 'task', 'archive', 'assignment'] as const;
export type ProtectedTable = (typeof PROTECTED_TABLES)[number];

export type DeletionExecutor = (state: State, rowId: Id) => State;

// Each protected table says how to delete one of its rows and what blocks the deletion.
export const DELETION_EXECUTORS: Record<ProtectedTable, DeletionExecutor> = {
  customer: (s, id) => {
    if (s.salesInvoices.some((i) => i.customerId === id)) throw new DomainError('in_use', 'Client avec des factures : désactiver au lieu de supprimer');
    if (s.engagements.some((e) => e.customerId === id)) throw new DomainError('in_use', 'Client avec des missions : désactiver au lieu de supprimer');
    return { ...s, customers: s.customers.filter((c) => c.id !== id) };
  },
  supplier: (s, id) => {
    if (s.supplierInvoices.some((i) => i.supplierId === id)) throw new DomainError('in_use', 'Fournisseur avec des factures : désactiver au lieu de supprimer');
    return { ...s, suppliers: s.suppliers.filter((c) => c.id !== id) };
  },
  employee: (s, id) => {
    if (s.payrollRuns.some((r) => r.lines.some((l) => l.employeeId === id))) throw new DomainError('in_use', 'Collaborateur présent dans une paie : clôturer la fiche au lieu de supprimer');
    return { ...s, employees: s.employees.filter((e) => e.id !== id), assignments: s.assignments.filter((a) => a.employeeId !== id) };
  },
  asset: (s, id) => {
    const a = s.assets.find((x) => x.id === id);
    if (a && (a.accumulated > 0 || a.acquisitionEntryId)) throw new DomainError('in_use', 'Immobilisation déjà amortie ou comptabilisée : passer par une cession');
    return { ...s, assets: s.assets.filter((x) => x.id !== id) };
  },
  engagement: (s, id) => {
    if (s.salesInvoices.some((i) => i.engagementId === id)) throw new DomainError('in_use', 'Mission facturée : clôturer au lieu de supprimer');
    if (s.archives.some((a) => a.engagementId === id && a.status !== 'destroyed')) throw new DomainError('in_use', 'Mission archivée : détruire la boîte d\'abord');
    return { ...s, engagements: s.engagements.filter((e) => e.id !== id), assignments: s.assignments.filter((a) => a.engagementId !== id), tasks: s.tasks.map((t) => (t.engagementId === id ? { ...t, engagementId: undefined } : t)) };
  },
  loan: (s, id) => {
    if (s.loanPayments.some((p) => p.loanId === id)) throw new DomainError('in_use', 'Emprunt avec des échéances réglées : le clôturer au lieu de le supprimer');
    const l = s.loans.find((x) => x.id === id);
    if (l?.drawdownEntryId) throw new DomainError('in_use', 'Emprunt comptabilisé : extourner le déblocage avant suppression');
    return { ...s, loans: s.loans.filter((x) => x.id !== id) };
  },
  account: (s, id) => {
    const a = s.accounts.find((x) => x.id === id);
    if (!a) throw new DomainError('not_found', 'Compte inconnu');
    if (a.isStatutory) throw new DomainError('statutory', 'Compte statutaire : non supprimable');
    if (s.entries.some((e) => e.lines.some((l) => l.accountId === id))) throw new DomainError('in_use', 'Compte mouvementé : le désactiver au lieu de le supprimer');
    if (s.mappings.some((m) => m.accountId === id)) throw new DomainError('in_use', 'Compte utilisé par un paramétrage (mapping)');
    return { ...s, accounts: s.accounts.filter((x) => x.id !== id) };
  },
  app_user: (s, id) => {
    if (s.session.userId === id) throw new DomainError('self_delete', 'Impossible de supprimer son propre compte');
    return { ...s, users: s.users.filter((u) => u.id !== id) };
  },
  task: (s, id) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }),
  archive: (s, id) => {
    const a = s.archives.find((x) => x.id === id);
    if (!a) throw new DomainError('not_found', 'Archive inconnue');
    return { ...s, archives: s.archives.filter((x) => x.id !== id), engagements: s.engagements.map((e) => (e.archiveId === id ? { ...e, archiveId: undefined } : e)) };
  },
  assignment: (s, id) => ({ ...s, assignments: s.assignments.filter((a) => a.id !== id) }),
};

export interface DeletionResult {
  state: State;
  executed: boolean; // true = deleted now, false = request filed
  request?: DeletionRequest;
}

// Deleting: a reason is always required. Partners and admins delete at once (logged); others file a request.
export function requestDeletion(state: State, input: { table: ProtectedTable; rowId: Id; label: string; reason: string; entityId?: Id }): DeletionResult {
  if (!input.reason.trim() || input.reason.trim().length < 4) throw new DomainError('reason', 'Indiquer le motif de la suppression');
  if (!DELETION_EXECUTORS[input.table]) throw new DomainError('table', 'Table non gérée');
  if (state.deletionRequests.some((r) => r.table === input.table && r.rowId === input.rowId && r.status === 'pending')) throw new DomainError('pending', 'Une demande de suppression est déjà en attente pour cet élément');
  if (canDecideDeletions(state)) {
    // dry run first so that nothing is logged when the row cannot go
    const next = DELETION_EXECUTORS[input.table](state, input.rowId);
    return { state: audit(next, input.table, input.rowId, 'D', `Supprimé · ${input.label} · motif : ${input.reason.trim()}`, input.entityId), executed: true };
  }
  if (!POSTING_ROLES.includes(state.session.role) && !['task', 'assignment'].includes(input.table)) throw new DomainError('forbidden', 'Votre rôle ne permet pas de demander cette suppression');
  // a request: check now that it could be executed, so the approver is not asked for something impossible
  DELETION_EXECUTORS[input.table](state, input.rowId);
  const [s1, id] = nextId(state, 'del');
  const req: DeletionRequest = { id, entityId: input.entityId, table: input.table, rowId: input.rowId, label: input.label, reason: input.reason.trim(), requestedBy: state.session.actorId, requestedByName: state.session.actorName, requestedAt: new Date().toISOString(), status: 'pending' };
  return { state: audit({ ...s1, deletionRequests: [...s1.deletionRequests, req] }, 'deletion_request', id, 'I', `Demande de suppression · ${input.label} · motif : ${req.reason}`, input.entityId), executed: false, request: req };
}

export function decideDeletion(state: State, requestId: Id, decision: 'approved' | 'rejected', note?: string): State {
  if (!canDecideDeletions(state)) throw new DomainError('forbidden', 'Décision réservée à un associé ou à l\'administrateur');
  const req = state.deletionRequests.find((r) => r.id === requestId);
  if (!req) throw new DomainError('not_found', 'Demande inconnue');
  if (req.status !== 'pending') throw new DomainError('state', 'Demande déjà traitée');
  if (req.requestedBy === state.session.actorId) throw new DomainError('segregation', 'Le demandeur ne peut pas approuver sa propre demande');
  const decided: DeletionRequest = { ...req, status: decision, decidedBy: state.session.actorId, decidedAt: new Date().toISOString(), decisionNote: note };
  let s: State = { ...state, deletionRequests: state.deletionRequests.map((r) => (r.id === requestId ? decided : r)) };
  if (decision === 'approved') {
    s = DELETION_EXECUTORS[req.table as ProtectedTable](s, req.rowId);
    s = audit(s, req.table, req.rowId, 'D', `Supprimé sur approbation · ${req.label} · motif : ${req.reason}`, req.entityId);
  }
  return audit(s, 'deletion_request', requestId, 'U', `Demande ${decision === 'approved' ? 'approuvée' : 'rejetée'} · ${req.label}${note ? ' · ' + note : ''}`, req.entityId);
}

export function pendingDeletions(state: State, entityId?: Id | null): DeletionRequest[] {
  return state.deletionRequests.filter((r) => r.status === 'pending' && (!entityId || r.entityId === entityId || !r.entityId));
}
