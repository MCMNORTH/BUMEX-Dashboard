import type { State, Id, ISODate, Task, TaskPriority, TaskStatus, AuditRow } from './types';
import { DomainError } from './types';
import { nextId, audit } from './core';
import { addDays, addMonths } from './money';
import { aging } from './sales';
import { cashPosition } from './bank';
import { loanSchedule } from './loans';

// Tasks: the operational work items behind the command bar. Every figure shown there comes from here.

export interface TaskInput {
  entityId: Id;
  title: string;
  module: string;
  assignee: string;
  dueDate: ISODate;
  priority?: TaskPriority;
  engagementId?: Id;
  customerId?: Id;
  notes?: string;
  status?: TaskStatus;
  createdAt?: ISODate;
  completedAt?: ISODate;
}

export function createTask(state: State, input: TaskInput): [State, Task] {
  if (!input.title.trim()) throw new DomainError('task_title', 'Le titre de la tâche est obligatoire');
  if (!state.entities.some((e) => e.id === input.entityId)) throw new DomainError('entity_missing', `Entité inconnue ${input.entityId}`);
  if (input.engagementId && !state.engagements.some((e) => e.id === input.engagementId)) throw new DomainError('engagement_missing', 'Mission inconnue');
  const [s1, id] = nextId(state, 'tsk');
  const status = input.status ?? 'todo';
  const task: Task = {
    id,
    entityId: input.entityId,
    title: input.title.trim(),
    module: input.module,
    engagementId: input.engagementId,
    customerId: input.customerId,
    assignee: input.assignee,
    dueDate: input.dueDate,
    status,
    priority: input.priority ?? 'normal',
    createdAt: input.createdAt ?? state.today,
    completedAt: status === 'done' ? input.completedAt ?? state.today : undefined,
    notes: input.notes,
  };
  const s2 = { ...s1, tasks: [...s1.tasks, task] };
  return [audit(s2, 'task', id, 'I', `Tâche créée · ${task.title}`, task.entityId), task];
}

function patchTask(state: State, taskId: Id, patch: Partial<Task>, summary: string): [State, Task] {
  const t = state.tasks.find((x) => x.id === taskId);
  if (!t) throw new DomainError('task_missing', 'Tâche inconnue');
  const next = { ...t, ...patch };
  const s = { ...state, tasks: state.tasks.map((x) => (x.id === taskId ? next : x)) };
  return [audit(s, 'task', taskId, 'U', summary, t.entityId), next];
}

export function startTask(state: State, taskId: Id): [State, Task] {
  const t = state.tasks.find((x) => x.id === taskId);
  if (!t) throw new DomainError('task_missing', 'Tâche inconnue');
  if (t.status === 'done') throw new DomainError('task_done', 'Tâche déjà terminée : la rouvrir d\'abord');
  return patchTask(state, taskId, { status: 'in_progress' }, `Tâche démarrée · ${t.title}`);
}

export function completeTask(state: State, taskId: Id): [State, Task] {
  const t = state.tasks.find((x) => x.id === taskId);
  if (!t) throw new DomainError('task_missing', 'Tâche inconnue');
  if (t.status === 'done') throw new DomainError('task_done', 'Tâche déjà terminée');
  return patchTask(state, taskId, { status: 'done', completedAt: state.today }, `Tâche terminée · ${t.title}`);
}

export function reopenTask(state: State, taskId: Id): [State, Task] {
  const t = state.tasks.find((x) => x.id === taskId);
  if (!t) throw new DomainError('task_missing', 'Tâche inconnue');
  if (t.status !== 'done') throw new DomainError('task_open', 'Tâche déjà ouverte');
  return patchTask(state, taskId, { status: 'todo', completedAt: undefined }, `Tâche rouverte · ${t.title}`);
}

export function updateTask(state: State, taskId: Id, patch: Partial<Pick<Task, 'title' | 'assignee' | 'dueDate' | 'priority' | 'notes' | 'module' | 'engagementId'>>): [State, Task] {
  if (patch.title !== undefined && !patch.title.trim()) throw new DomainError('task_title', 'Le titre de la tâche est obligatoire');
  return patchTask(state, taskId, patch, 'Tâche modifiée');
}

export function deleteTask(state: State, taskId: Id): State {
  const t = state.tasks.find((x) => x.id === taskId);
  if (!t) throw new DomainError('task_missing', 'Tâche inconnue');
  return audit({ ...state, tasks: state.tasks.filter((x) => x.id !== taskId) }, 'task', taskId, 'D', `Tâche supprimée · ${t.title}`, t.entityId);
}

export interface TaskStats {
  scope: 'group' | 'entity';
  total: number;
  done: number;
  active: number; // todo + in_progress
  inProgress: number;
  overdue: number;
  dueSoon: number; // open, due within 7 days (today included)
  progress: number; // 0..1, done / total
  nextDeadlines: Task[]; // open tasks sorted by due date
  overdueTasks: Task[];
  engagementsOngoing: number;
  engagementsPlanned: number;
  engagementsLate: number;
  engagementDeadlines: { id: Id; code: string; name: string; deadline: ISODate; late: boolean }[]; // active, due within 30 days or late
}

export function tasksOf(state: State, entityId?: Id | null): Task[] {
  return entityId ? state.tasks.filter((t) => t.entityId === entityId) : state.tasks;
}

export function taskStats(state: State, entityId?: Id | null): TaskStats {
  const tasks = tasksOf(state, entityId);
  const open = tasks.filter((t) => t.status !== 'done').sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
  const done = tasks.filter((t) => t.status === 'done');
  const soon = addDays(state.today, 7);
  const overdueTasks = open.filter((t) => t.dueDate < state.today);
  const eng = entityId ? state.engagements.filter((e) => e.entityId === entityId) : state.engagements;
  const active = eng.filter((e) => e.status === 'active');
  const horizon = addDays(state.today, 30);
  return {
    scope: entityId ? 'entity' : 'group',
    total: tasks.length,
    done: done.length,
    active: open.length,
    inProgress: open.filter((t) => t.status === 'in_progress').length,
    overdue: overdueTasks.length,
    dueSoon: open.filter((t) => t.dueDate >= state.today && t.dueDate <= soon).length,
    progress: tasks.length ? done.length / tasks.length : 0,
    nextDeadlines: open,
    overdueTasks,
    engagementsOngoing: active.length,
    engagementsPlanned: eng.filter((e) => e.status === 'planned').length,
    engagementsLate: active.filter((e) => e.deadline < state.today).length,
    engagementDeadlines: active
      .filter((e) => e.deadline <= horizon)
      .sort((a, b) => (a.deadline < b.deadline ? -1 : 1))
      .map((e) => ({ id: e.id, code: e.code, name: e.name, deadline: e.deadline, late: e.deadline < state.today })),
  };
}

export function recentActivity(state: State, entityId?: Id | null, n = 8): AuditRow[] {
  const rows = entityId ? state.auditLog.filter((r) => !r.entityId || r.entityId === entityId) : state.auditLog;
  return rows.slice(-n).reverse();
}

export interface Alert {
  kind: 'crit' | 'warn' | 'info';
  code: string;
  text: string;
  module: string; // room to open
  entityId?: Id;
  count: number;
}

// The alerts of the bar: one line per condition that needs a human, with the room where it is handled.
export function alerts(state: State, entityId?: Id | null): Alert[] {
  const out: Alert[] = [];
  const entities = entityId ? state.entities.filter((e) => e.id === entityId) : state.entities;
  for (const e of entities) {
    const ag = aging(state, e.id);
    if (ag.overdueCount) out.push({ kind: ag.over90Count > 0 ? 'crit' : 'warn', code: 'overdue', text: `${ag.overdueCount} facture${ag.overdueCount > 1 ? 's' : ''} en retard${ag.over90Count ? ` · ${ag.over90Count} > 90 j` : ''}`, module: 'clients', entityId: e.id, count: ag.overdueCount });
    const cash = cashPosition(state, e.id);
    if (cash < e.cashThreshold) out.push({ kind: cash < e.cashThreshold * 0.7 ? 'crit' : 'warn', code: 'cash', text: `Trésorerie sous le seuil (${Math.round((cash / Math.max(1, e.cashThreshold)) * 100)} %)`, module: 'bank', entityId: e.id, count: 1 });
    const unmatched = state.bankTransactions.filter((t) => t.status === 'unmatched' && state.bankAccounts.find((b) => b.id === t.bankAccountId)?.entityId === e.id).length;
    if (unmatched) out.push({ kind: 'warn', code: 'unmatched', text: `${unmatched} ligne${unmatched > 1 ? 's' : ''} de banque à rapprocher`, module: 'bank', entityId: e.id, count: unmatched });
    const drafts = state.entries.filter((x) => x.entityId === e.id && x.status === 'draft').length;
    if (drafts) out.push({ kind: 'warn', code: 'drafts', text: `${drafts} écriture${drafts > 1 ? 's' : ''} en brouillon`, module: 'accounting', entityId: e.id, count: drafts });
    const pending = state.supplierInvoices.filter((s) => s.entityId === e.id && s.status === 'pending_approval').length;
    if (pending) out.push({ kind: 'warn', code: 'approvals', text: `${pending} facture${pending > 1 ? 's' : ''} fournisseur à approuver`, module: 'suppliers', entityId: e.id, count: pending });
    const late = state.engagements.filter((x) => x.entityId === e.id && x.status === 'active' && x.deadline < state.today).length;
    if (late) out.push({ kind: late > 3 ? 'crit' : 'warn', code: 'late', text: `${late} mission${late > 1 ? 's' : ''} en retard`, module: 'missions', entityId: e.id, count: late });
    const soft = state.periods.filter((p) => p.entityId === e.id && p.status === 'soft_closed').length;
    if (soft) out.push({ kind: 'info', code: 'soft', text: `${soft} période${soft > 1 ? 's' : ''} en clôture douce à verrouiller`, module: 'accounting', entityId: e.id, count: soft });
    const overdueTasks = state.tasks.filter((t) => t.entityId === e.id && t.status !== 'done' && t.dueDate < state.today).length;
    if (overdueTasks) out.push({ kind: 'warn', code: 'tasks', text: `${overdueTasks} tâche${overdueTasks > 1 ? 's' : ''} en retard`, module: 'tasks', entityId: e.id, count: overdueTasks });
    const toArchive = state.engagements.filter((x) => x.entityId === e.id && x.status === 'completed' && !x.archiveId).length;
    if (toArchive) out.push({ kind: 'info', code: 'archive', text: `${toArchive} dossier${toArchive > 1 ? 's' : ''} terminé${toArchive > 1 ? 's' : ''} à archiver`, module: 'archives', entityId: e.id, count: toArchive });
    const retention = state.archives.filter((a) => a.entityId === e.id && a.status === 'archived' && a.retentionUntil <= state.today).length;
    if (retention) out.push({ kind: 'info', code: 'retention', text: `${retention} boîte${retention > 1 ? 's' : ''} d'archives en fin de conservation`, module: 'archives', entityId: e.id, count: retention });
    // loans: instalments due and not recorded
    const lateInstalments = state.loans.filter((l) => l.entityId === e.id && l.status === 'active').reduce((n, l) => n + loanSchedule(l, state.loanPayments).filter((i) => !i.paid && i.date <= state.today).length, 0);
    if (lateInstalments) out.push({ kind: 'warn', code: 'instalments', text: `${lateInstalments} échéance${lateInstalments > 1 ? 's' : ''} d'emprunt à enregistrer`, module: 'bank', entityId: e.id, count: lateInstalments });
    // payroll: a past month without a posted run
    if (state.employees.some((x) => x.entityId === e.id && x.status === 'active')) {
      const lastMonth = addMonths(state.today.slice(0, 7) + '-01', -1).slice(0, 7);
      if (!state.payrollRuns.some((r) => r.entityId === e.id && r.month === lastMonth && r.status === 'posted')) out.push({ kind: 'warn', code: 'payroll', text: `Paie ${lastMonth} non comptabilisée`, module: 'hr', entityId: e.id, count: 1 });
    }
    // deletions waiting for a partner
    const deletions = state.deletionRequests.filter((d) => d.status === 'pending' && (!d.entityId || d.entityId === e.id)).length;
    if (deletions && entities.length === 1) out.push({ kind: 'warn', code: 'deletions', text: `${deletions} demande${deletions > 1 ? 's' : ''} de suppression à trancher`, module: 'settings', entityId: e.id, count: deletions });
  }
  if (!entityId) {
    const deletions = state.deletionRequests.filter((d) => d.status === 'pending').length;
    if (deletions) out.push({ kind: 'warn', code: 'deletions', text: `${deletions} demande${deletions > 1 ? 's' : ''} de suppression à trancher`, module: 'settings', count: deletions });
  }
  const order = { crit: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.kind] - order[b.kind]);
}
