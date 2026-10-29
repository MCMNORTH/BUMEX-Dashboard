// [bumex-one] The board's and the list's filters and groups, as Jira's toolbar has them (vanguard/one/Tasks.tsx,
// Board.tsx): a search on the title, key and labels; people; priorities, types, labels; the due date; "my tickets";
// the stages, by name across the boards (2026-10-28).
// Pure: the tickets and the day come in. Shared by the Tasks room and My work (2026-10-29): both draw the same toolbar,
// list and board (WorkToolbar.tsx, TicketList.tsx, Board.tsx) on tickets of this shape.

import type { MyWorkTicket } from '@/lib/erp/vanguard/work-items';

export type DueFilter = 'all' | 'late' | 'week' | 'none';
export type GroupBy = 'none' | 'assignee' | 'priority' | 'mission';

export type WorkFilters = {
  search: string;
  people: string[]; // assignee ids; '' is "unassigned"
  priorities: string[];
  types: string[];
  labels: string[];
  stages: string[]; // stageFilterKey()s
  noEstimate: boolean; // open tickets without an estimate
  due: DueFilter;
  mine: boolean;
  groupBy: GroupBy;
};

export const NO_FILTERS: WorkFilters = { search: '', people: [], priorities: [], types: [], labels: [], stages: [], noEstimate: false, due: 'all', mine: false, groupBy: 'none' };

export type FilterTicket = {
  title: string;
  dueDate: string; // '9999-12-31' when none
  status: string;
  searchText?: string; // more words the search finds it by (My work: its mission's code and name)
  ticket: { assignee_id: string | null; priority: string; type: string; key: string; labels: string[]; stage_name?: string | null; status?: string; estimated_hours?: number | null };
};

/** A stage, whatever board it is on: its name folded, or the status on the built-in boards. */
export const stageFilterKey = (t: FilterTicket) => (t.ticket.stage_name ? `s:${fold(t.ticket.stage_name).trim()}` : `c:${t.ticket.status ?? t.status}`);

export const NO_DUE_DATE = '9999-12-31';
export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('fr');

export function sundayOf(today: string) {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
}

export function activeFilterCount(f: WorkFilters) {
  return f.priorities.length + f.types.length + f.labels.length + (f.stages?.length ?? 0) + (f.noEstimate ? 1 : 0) + (f.due !== 'all' ? 1 : 0) + (f.mine ? 1 : 0);
}

export const isFiltered = (f: WorkFilters) => Boolean(f.search.trim()) || f.people.length > 0 || activeFilterCount(f) > 0;

export function applyFilters<T extends FilterTicket>(tickets: T[], f: WorkFilters, me: string, today: string): T[] {
  const words = fold(f.search).split(/\s+/).filter(Boolean);
  const sunday = sundayOf(today);
  return tickets.filter((t) => {
    if (words.length) {
      const hay = fold(`${t.title} ${t.ticket.key} ${t.ticket.labels.join(' ')} ${t.searchText ?? ''}`);
      if (!words.every((w) => hay.includes(w))) return false;
    }
    if (f.mine && t.ticket.assignee_id !== me) return false;
    if (f.people.length && !f.people.includes(t.ticket.assignee_id ?? '')) return false;
    if (f.priorities.length && !f.priorities.includes(t.ticket.priority === 'normal' ? 'medium' : t.ticket.priority)) return false;
    if (f.types.length && !f.types.includes(t.ticket.type)) return false;
    if (f.labels.length && !f.labels.some((l) => t.ticket.labels.includes(l))) return false;
    if (f.stages?.length && !f.stages.includes(stageFilterKey(t))) return false;
    if (f.noEstimate && (t.status === 'done' || Number(t.ticket.estimated_hours ?? 0) > 0)) return false;
    const open = t.status !== 'done';
    if (f.due === 'late' && !(open && t.dueDate !== NO_DUE_DATE && t.dueDate < today)) return false;
    if (f.due === 'week' && !(t.dueDate !== NO_DUE_DATE && t.dueDate >= today && t.dueDate <= sunday)) return false;
    if (f.due === 'none' && t.dueDate !== NO_DUE_DATE) return false;
    return true;
  });
}

const PRIORITY_ORDER = ['urgent', 'high', 'medium', 'low'];

export type GroupLabels = { unassigned: string; priority: (p: string) => string; mission: (id: string | undefined) => string };

/** The lanes of a grouped board or list: a key, a label, its tickets; in a stable order. */
export function groupTickets<T extends FilterTicket & { assignee: string; engagementId?: string }>(
  tickets: T[],
  by: GroupBy,
  labels: GroupLabels,
): { key: string; label: string; items: T[] }[] {
  if (by === 'none') return [{ key: 'all', label: '', items: tickets }];
  const groups = new Map<string, { key: string; label: string; items: T[] }>();
  for (const t of tickets) {
    const key = by === 'assignee' ? (t.ticket.assignee_id ?? '') : by === 'priority' ? (t.ticket.priority === 'normal' ? 'medium' : t.ticket.priority) : (t.engagementId ?? '');
    const label = by === 'assignee' ? (t.ticket.assignee_id ? t.assignee : labels.unassigned) : by === 'priority' ? labels.priority(key) : labels.mission(t.engagementId);
    const group = groups.get(key) ?? { key, label, items: [] };
    group.items.push(t);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => {
    if (by === 'priority') return PRIORITY_ORDER.indexOf(a.key) - PRIORITY_ORDER.indexOf(b.key);
    if (!a.key) return 1;
    if (!b.key) return -1;
    return a.label.localeCompare(b.label, 'fr');
  });
}

/**
 * The list a figure of the floor's overview opens (vanguard/one/Overview.tsx): "overdue", "week", "unassigned",
 * "blocked", "unestimated", "done"; the other filters cleared, the grouping kept.
 */
export function quickFilters<T extends FilterTicket>(tab: string | null | undefined, base: WorkFilters, tickets: T[]): WorkFilters | null {
  const clean: WorkFilters = { ...NO_FILTERS, groupBy: base.groupBy };
  const keysOf = (status: string) => [...new Set(tickets.filter((t) => (t.ticket.status ?? t.status) === status).map(stageFilterKey))];
  switch (tab) {
    case 'overdue': return { ...clean, due: 'late' };
    case 'week': return { ...clean, due: 'week' };
    case 'unassigned': return { ...clean, people: [''] };
    case 'unestimated': return { ...clean, noEstimate: true };
    case 'blocked': return { ...clean, stages: keysOf('blocked') };
    case 'done': return { ...clean, stages: keysOf('done') };
    default: return null;
  }
}

// board or list, as the person last chose it (asked on 2026-10-28), remembered in this browser per place ('tasks', 'mywork')
export type WorkView = 'board' | 'list';
const viewKey = (place: string) => `bumex-vanguard-view:${place}`;
export function readView(place: string, fallback: WorkView): WorkView {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(viewKey(place)) : null;
    return raw === 'board' || raw === 'list' ? raw : fallback;
  } catch {
    return fallback;
  }
}
export function writeView(place: string, view: WorkView) {
  try { window.localStorage.setItem(viewKey(place), view); } catch { /* storage off: it stays for the visit */ }
}

// ---- a ticket as the board, the list and the toolbar draw it ----

/** What the shared board, list and toolbar need of a ticket: the Tasks room's TicketTask fits it as it is. */
export type WorkTicket = FilterTicket & {
  id: string;
  assignee: string; // the assignee's name ('—' when none)
  engagementId?: string; // its mission (the engagement's id, which is the project's)
  ticket: FilterTicket['ticket'] & {
    project_id: string;
    status: string;
    stage_id: string | null;
    stage_name: string | null;
    reporter_id: string | null;
    estimated_hours: number | null;
    logged_minutes: number;
  };
};

/** My work's ticket (lib/erp/vanguard/work-items.ts) in that shape, carrying the original. */
export type MyCard = WorkTicket & { item: MyWorkTicket };

export function workTicketOf(t: MyWorkTicket, mission?: { code: string; name: string } | null): MyCard {
  return {
    id: t.id,
    title: t.title,
    dueDate: t.dueDate ?? NO_DUE_DATE,
    status: t.status === 'done' || t.status === 'archived' ? 'done' : t.status,
    assignee: t.assigneeName ?? '—',
    engagementId: t.projectId,
    searchText: mission ? `${mission.code} ${mission.name}` : (t.projectName ?? ''),
    ticket: {
      assignee_id: t.assigneeId,
      reporter_id: t.reporterId,
      priority: t.priority,
      type: t.type,
      key: t.key ?? '',
      labels: t.labels,
      stage_id: t.stageId,
      stage_name: t.stageName,
      status: t.status,
      project_id: t.projectId,
      estimated_hours: t.estimatedHours,
      logged_minutes: t.loggedMinutes,
    },
    item: t,
  };
}

/** My work's figures: how many open tickets each quick filter keeps, counted by that very filter. */
export function quickCounts<T extends FilterTicket>(open: T[], me: string, today: string) {
  const count = (f: Partial<WorkFilters>) => applyFilters(open, { ...NO_FILTERS, ...f }, me, today).length;
  return { late: count({ due: 'late' }), week: count({ due: 'week' }), unestimated: count({ noEstimate: true }) };
}

// a toolbar's choices, remembered in this browser under a key ('bumex-vanguard-tasks:<floor>', 'bumex-vanguard-mywork')
export function readFilters(key: string): WorkFilters {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
    return raw ? { ...NO_FILTERS, ...JSON.parse(raw) } : NO_FILTERS;
  } catch {
    return NO_FILTERS;
  }
}
export function writeFilters(key: string, filters: WorkFilters) {
  try { window.localStorage.setItem(key, JSON.stringify(filters)); } catch { /* storage off: they stay for the visit */ }
}
