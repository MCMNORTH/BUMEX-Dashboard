// [bumex-one] The board's and the list's filters and groups, as Jira's toolbar has them (vanguard/one/Tasks.tsx,
// Board.tsx): a search on the title, key and labels; people; priorities, types, labels; the due date; "my tickets".
// Pure: the tickets and the day come in.

export type DueFilter = 'all' | 'late' | 'week' | 'none';
export type GroupBy = 'none' | 'assignee' | 'priority' | 'mission';

export type WorkFilters = {
  search: string;
  people: string[]; // assignee ids; '' is "unassigned"
  priorities: string[];
  types: string[];
  labels: string[];
  due: DueFilter;
  mine: boolean;
  groupBy: GroupBy;
};

export const NO_FILTERS: WorkFilters = { search: '', people: [], priorities: [], types: [], labels: [], due: 'all', mine: false, groupBy: 'none' };

export type FilterTicket = {
  title: string;
  dueDate: string; // '9999-12-31' when none
  status: string;
  ticket: { assignee_id: string | null; priority: string; type: string; key: string; labels: string[] };
};

const NO_DUE_DATE = '9999-12-31';
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('fr');

export function sundayOf(today: string) {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
}

export function activeFilterCount(f: WorkFilters) {
  return f.priorities.length + f.types.length + f.labels.length + (f.due !== 'all' ? 1 : 0) + (f.mine ? 1 : 0);
}

export const isFiltered = (f: WorkFilters) => Boolean(f.search.trim()) || f.people.length > 0 || activeFilterCount(f) > 0;

export function applyFilters<T extends FilterTicket>(tickets: T[], f: WorkFilters, me: string, today: string): T[] {
  const words = fold(f.search).split(/\s+/).filter(Boolean);
  const sunday = sundayOf(today);
  return tickets.filter((t) => {
    if (words.length) {
      const hay = fold(`${t.title} ${t.ticket.key} ${t.ticket.labels.join(' ')}`);
      if (!words.every((w) => hay.includes(w))) return false;
    }
    if (f.mine && t.ticket.assignee_id !== me) return false;
    if (f.people.length && !f.people.includes(t.ticket.assignee_id ?? '')) return false;
    if (f.priorities.length && !f.priorities.includes(t.ticket.priority === 'normal' ? 'medium' : t.ticket.priority)) return false;
    if (f.types.length && !f.types.includes(t.ticket.type)) return false;
    if (f.labels.length && !f.labels.some((l) => t.ticket.labels.includes(l))) return false;
    const open = t.status !== 'done';
    if (f.due === 'late' && !(open && t.dueDate !== NO_DUE_DATE && t.dueDate < today)) return false;
    if (f.due === 'week' && !(t.dueDate !== NO_DUE_DATE && t.dueDate >= today && t.dueDate <= sunday)) return false;
    if (f.due === 'none' && t.dueDate !== NO_DUE_DATE) return false;
    return true;
  });
}

const PRIORITY_ORDER = ['urgent', 'high', 'medium', 'low'];

/** The lanes of a grouped board or list: a key, a label, its tickets; in a stable order. */
export function groupTickets<T extends FilterTicket & { assignee: string; engagementId?: string }>(
  tickets: T[],
  by: GroupBy,
  labels: { unassigned: string; priority: (p: string) => string; mission: (id: string | undefined) => string },
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
