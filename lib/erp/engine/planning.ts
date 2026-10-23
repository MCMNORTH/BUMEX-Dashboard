import type { State, Id, ISODate, Assignment, Employee, Engagement } from './types';
import { DomainError } from './types';
import { addDays, daysBetween } from './money';
import { nextId, audit, requireRole, PARTNER_ROLES } from './core';

// Planning: assignments of the HR module's people to engagements, with dates and a load. The calendar shows
// who is on what each week, who is free, and where two assignments overlap.

export interface AssignmentInput {
  entityId: Id;
  engagementId: Id;
  employeeId: Id;
  start: ISODate;
  end: ISODate;
  load?: number;
  role?: string;
}

export function assign(state: State, input: AssignmentInput): [State, Assignment] {
  requireRole(state, [...PARTNER_ROLES, 'manager'], "d'affecter un collaborateur");
  const eng = state.engagements.find((e) => e.id === input.engagementId && e.entityId === input.entityId);
  if (!eng) throw new DomainError('not_found', 'Mission inconnue');
  const emp = state.employees.find((e) => e.id === input.employeeId && e.entityId === input.entityId);
  if (!emp) throw new DomainError('not_found', 'Collaborateur inconnu');
  if (emp.status !== 'active') throw new DomainError('inactive', 'Collaborateur sorti des effectifs');
  if (input.end < input.start) throw new DomainError('dates', 'La fin précède le début');
  const load = input.load ?? 1;
  if (!(load > 0 && load <= 1)) throw new DomainError('load', 'Charge entre 10 % et 100 %');
  if (state.assignments.some((a) => a.engagementId === eng.id && a.employeeId === emp.id && a.start <= input.end && a.end >= input.start)) throw new DomainError('duplicate', `${emp.initials} est déjà affecté à ${eng.code} sur ces dates`);
  const [s1, id] = nextId(state, 'asg');
  const a: Assignment = { id, entityId: input.entityId, engagementId: eng.id, employeeId: emp.id, start: input.start, end: input.end, load, role: input.role };
  const staff = eng.staff.includes(emp.initials) ? eng.staff : [...eng.staff.filter((x) => x !== '—'), emp.initials];
  const s: State = { ...s1, assignments: [...s1.assignments, a], engagements: s1.engagements.map((e) => (e.id === eng.id ? { ...e, staff } : e)) };
  return [audit(s, 'assignment', id, 'I', `${emp.initials} affecté à ${eng.code} du ${input.start} au ${input.end} (${Math.round(load * 100)} %)`, input.entityId), a];
}

export function updateAssignment(state: State, id: Id, patch: Partial<Pick<Assignment, 'start' | 'end' | 'load' | 'role'>>): [State, Assignment] {
  requireRole(state, [...PARTNER_ROLES, 'manager'], 'de modifier une affectation');
  const a = state.assignments.find((x) => x.id === id);
  if (!a) throw new DomainError('not_found', 'Affectation inconnue');
  const next = { ...a, ...patch };
  if (next.end < next.start) throw new DomainError('dates', 'La fin précède le début');
  if (!(next.load > 0 && next.load <= 1)) throw new DomainError('load', 'Charge entre 10 % et 100 %');
  return [audit({ ...state, assignments: state.assignments.map((x) => (x.id === id ? next : x)) }, 'assignment', id, 'U', `Affectation modifiée · ${next.start} → ${next.end}`, a.entityId), next];
}

export function removeAssignment(state: State, id: Id): State {
  requireRole(state, [...PARTNER_ROLES, 'manager'], 'de retirer une affectation');
  const a = state.assignments.find((x) => x.id === id);
  if (!a) throw new DomainError('not_found', 'Affectation inconnue');
  const emp = state.employees.find((e) => e.id === a.employeeId);
  const others = state.assignments.filter((x) => x.id !== id);
  const stillOn = others.some((x) => x.engagementId === a.engagementId && x.employeeId === a.employeeId);
  const engagements = stillOn || !emp ? state.engagements : state.engagements.map((e) => (e.id === a.engagementId ? { ...e, staff: e.staff.filter((s) => s !== emp.initials) } : e));
  return audit({ ...state, assignments: others, engagements }, 'assignment', id, 'D', `Affectation retirée · ${emp?.initials ?? ''}`, a.entityId);
}

export interface WeekCell {
  weekStart: ISODate;
  load: number; // sum of loads of the assignments active that week
  assignments: { assignment: Assignment; engagement: Engagement }[];
  overlap: boolean; // more than one engagement on the same week, or load > 1
}

export interface EmployeePlan {
  employee: Employee;
  weeks: WeekCell[];
  loadNow: number; // today's load
  status: 'free' | 'assigned' | 'overloaded';
  nextFree?: ISODate;
  assignments: { assignment: Assignment; engagement: Engagement }[];
}

export interface Calendar {
  weeks: ISODate[];
  rows: EmployeePlan[];
  engagements: { engagement: Engagement; assigned: number }[];
  free: number;
  assigned: number;
  overloaded: number;
  conflicts: { employee: Employee; weekStart: ISODate; engagements: string[] }[];
}

function monday(iso: ISODate): ISODate {
  const d = new Date(iso + 'T00:00:00Z');
  const day = d.getUTCDay() || 7;
  return addDays(iso, 1 - day);
}

// A week grid from the Monday of `from`, `weeks` columns wide, for every active employee of the entity.
export function planningCalendar(state: State, entityId: Id, from = state.today, weeks = 12): Calendar {
  const start = monday(from);
  const cols = Array.from({ length: weeks }, (_, i) => addDays(start, i * 7));
  const employees = state.employees.filter((e) => e.entityId === entityId && e.status === 'active').sort((a, b) => (a.lastName < b.lastName ? -1 : 1));
  const engagementsById = new Map(state.engagements.map((e) => [e.id, e]));
  const conflicts: Calendar['conflicts'] = [];
  const rows: EmployeePlan[] = employees.map((employee) => {
    const mine = state.assignments.filter((a) => a.employeeId === employee.id).map((assignment) => ({ assignment, engagement: engagementsById.get(assignment.engagementId)! })).filter((x) => x.engagement);
    const cells: WeekCell[] = cols.map((weekStart) => {
      const weekEnd = addDays(weekStart, 6);
      const active = mine.filter((x) => x.assignment.start <= weekEnd && x.assignment.end >= weekStart);
      const load = active.reduce((s, x) => s + x.assignment.load, 0);
      const overlap = active.length > 1 || load > 1.001;
      if (overlap) conflicts.push({ employee, weekStart, engagements: active.map((x) => x.engagement.code) });
      return { weekStart, load, assignments: active, overlap };
    });
    const today = mine.filter((x) => x.assignment.start <= state.today && x.assignment.end >= state.today);
    const loadNow = today.reduce((s, x) => s + x.assignment.load, 0);
    const future = mine.filter((x) => x.assignment.end >= state.today).sort((a, b) => (a.assignment.end < b.assignment.end ? 1 : -1));
    return { employee, weeks: cells, loadNow, status: loadNow === 0 ? 'free' : loadNow > 1.001 ? 'overloaded' : 'assigned', nextFree: future.length ? addDays(future[0].assignment.end, 1) : state.today, assignments: mine.sort((a, b) => (a.assignment.start < b.assignment.start ? -1 : 1)) };
  });
  const engagements = state.engagements
    .filter((e) => e.entityId === entityId && e.status !== 'completed')
    .map((engagement) => ({ engagement, assigned: new Set(state.assignments.filter((a) => a.engagementId === engagement.id && a.end >= state.today).map((a) => a.employeeId)).size }));
  return { weeks: cols, rows, engagements, free: rows.filter((r) => r.status === 'free').length, assigned: rows.filter((r) => r.status === 'assigned').length, overloaded: rows.filter((r) => r.status === 'overloaded').length, conflicts };
}

// Who is free for the whole of a period, who is partly loaded, who is full.
export function availability(state: State, entityId: Id, from: ISODate, to: ISODate): { employee: Employee; load: number; free: boolean; busyDays: number }[] {
  const days = Math.max(1, daysBetween(from, to) + 1);
  return state.employees
    .filter((e) => e.entityId === entityId && e.status === 'active')
    .map((employee) => {
      const mine = state.assignments.filter((a) => a.employeeId === employee.id && a.start <= to && a.end >= from);
      let busyDays = 0;
      let loadDays = 0;
      for (const a of mine) {
        const s = a.start > from ? a.start : from;
        const e = a.end < to ? a.end : to;
        const n = daysBetween(s, e) + 1;
        busyDays += n;
        loadDays += n * a.load;
      }
      return { employee, load: Math.round((loadDays / days) * 100) / 100, free: mine.length === 0, busyDays: Math.min(days, busyDays) };
    })
    .sort((a, b) => a.load - b.load);
}
