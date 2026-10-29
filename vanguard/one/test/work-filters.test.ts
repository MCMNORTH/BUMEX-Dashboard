import { describe, expect, it, vi } from 'vitest';

import { NO_FILTERS, activeFilterCount, applyFilters, groupTickets, quickCounts, readFilters, workTicketOf, writeFilters } from '../work-filters';
import type { MyWorkTicket } from '@/lib/erp/vanguard/work-items';

const today = '2026-10-28'; // a Wednesday; Sunday is 2026-11-01
const t = (title: string, key: string, assignee: string | null, priority: string, dueDate: string, extra: Partial<{ type: string; labels: string[]; status: string; engagementId: string }> = {}) => ({
  title, dueDate, status: extra.status ?? 'todo', assignee: assignee ? `Person ${assignee}` : '—', engagementId: extra.engagementId,
  ticket: { assignee_id: assignee, priority, type: extra.type ?? 'task', key, labels: extra.labels ?? [] },
});
const tickets = [
  t('Revue des comptes', 'AUD-1', 'emp', 'high', '2026-10-20', { labels: ['RH'] }),
  t('Lettre de mission', 'AUD-2', 'mgr', 'low', '2026-10-30', { type: 'bug', engagementId: 'm2' }),
  t('Inventaire', 'AUD-3', null, 'normal', '9999-12-31', { engagementId: 'm1' }),
  t('Clôture', 'AUD-4', 'emp', 'urgent', '2026-11-20', { status: 'done' }),
];
const titles = (list: { title: string }[]) => list.map((x) => x.title);

describe('work filters', () => {
  it('searches titles, keys and labels, accents aside', () => {
    expect(titles(applyFilters(tickets, { ...NO_FILTERS, search: 'cloture' }, 'emp', today))).toEqual(['Clôture']);
    expect(titles(applyFilters(tickets, { ...NO_FILTERS, search: 'aud-2' }, 'emp', today))).toEqual(['Lettre de mission']);
    expect(titles(applyFilters(tickets, { ...NO_FILTERS, search: 'rh' }, 'emp', today))).toEqual(['Revue des comptes']);
  });

  it('filters by people (unassigned too), mine, priority (normal is medium), type and due', () => {
    expect(titles(applyFilters(tickets, { ...NO_FILTERS, people: [''] }, 'emp', today))).toEqual(['Inventaire']);
    expect(titles(applyFilters(tickets, { ...NO_FILTERS, mine: true }, 'emp', today))).toEqual(['Revue des comptes', 'Clôture']);
    expect(titles(applyFilters(tickets, { ...NO_FILTERS, priorities: ['medium'] }, 'emp', today))).toEqual(['Inventaire']);
    expect(titles(applyFilters(tickets, { ...NO_FILTERS, types: ['bug'] }, 'emp', today))).toEqual(['Lettre de mission']);
    expect(titles(applyFilters(tickets, { ...NO_FILTERS, due: 'late' }, 'emp', today))).toEqual(['Revue des comptes']);
    expect(titles(applyFilters(tickets, { ...NO_FILTERS, due: 'week' }, 'emp', today))).toEqual(['Lettre de mission']);
    expect(titles(applyFilters(tickets, { ...NO_FILTERS, due: 'none' }, 'emp', today))).toEqual(['Inventaire']);
    expect(activeFilterCount({ ...NO_FILTERS, priorities: ['low'], due: 'late', mine: true })).toBe(3);
  });

  it('groups by assignee (unassigned last), by priority in order, by mission', () => {
    const labels = { unassigned: 'Non assigné', priority: (p: string) => p, mission: (id: string | undefined) => id ?? 'Sans mission' };
    expect(groupTickets(tickets, 'assignee', labels).map((g) => [g.label, g.items.length])).toEqual([['Person emp', 2], ['Person mgr', 1], ['Non assigné', 1]]);
    expect(groupTickets(tickets, 'priority', labels).map((g) => g.key)).toEqual(['urgent', 'high', 'medium', 'low']);
    expect(groupTickets(tickets, 'mission', labels).map((g) => g.label)).toEqual(['m1', 'm2', 'Sans mission']);
  });
});

// My work's tickets on the Tasks room's parts (2026-10-29)
const item = (over: Partial<MyWorkTicket> = {}): MyWorkTicket => ({
  id: 't1', key: 'AUD-9', title: 'Circularisation des tiers', type: 'task', projectId: 'p1', projectName: 'Audit légal 2025', status: 'in_progress',
  stageId: 'in_progress', stageName: 'Terrain', assigneeId: 'emp', reporterId: 'mgr', priority: 'high', dueDate: '2026-10-27', dueState: 'overdue',
  estimatedHours: null, loggedMinutes: 0, labels: [], assigneeName: 'Ahmed Ba', updatedAt: '2026-10-28T08:00:00Z', ...over,
});

describe("My work's tickets", () => {
  it('take the shape the board and the list read', () => {
    const card = workTicketOf(item({ dueDate: null, key: null, status: 'archived' }), { code: 'M-003', name: 'Commissariat aux comptes' });
    expect(card).toMatchObject({ dueDate: '9999-12-31', status: 'done', assignee: 'Ahmed Ba', engagementId: 'p1', ticket: { key: '', stage_name: 'Terrain', project_id: 'p1' } });
    expect(card.item.id).toBe('t1');
  });

  it('are found by their mission, its code or its name', () => {
    const cards = [workTicketOf(item(), { code: 'M-003', name: 'Commissariat aux comptes' }), workTicketOf(item({ id: 't2', title: 'Autre' }), null)];
    expect(titles(applyFilters(cards, { ...NO_FILTERS, search: 'm-003' }, 'emp', today))).toEqual(['Circularisation des tiers']);
    expect(titles(applyFilters(cards, { ...NO_FILTERS, search: 'commissariat' }, 'emp', today))).toEqual(['Circularisation des tiers']);
    expect(titles(applyFilters(cards, { ...NO_FILTERS, search: 'audit legal' }, 'emp', today))).toEqual(['Autre']);
  });

  it('are counted by the very filters the figures turn on', () => {
    const open = [
      workTicketOf(item({ id: 'a', dueDate: '2026-10-20' })),
      workTicketOf(item({ id: 'b', dueDate: '2026-10-30', estimatedHours: 4 })),
      workTicketOf(item({ id: 'c', dueDate: null, estimatedHours: 2 })),
    ];
    const counts = quickCounts(open, 'emp', today);
    expect(counts).toEqual({ late: 1, week: 1, unestimated: 1 });
    expect(applyFilters(open, { ...NO_FILTERS, due: 'late' }, 'emp', today).length).toBe(counts.late);
  });

  it('keep their filters only where storage works', () => {
    expect(readFilters('bumex-vanguard-mywork')).toEqual(NO_FILTERS);
  });

  it('read back the filters kept, over the defaults (a shape from before keeps the new keys), and the defaults when unreadable', () => {
    const kept = new Map<string, string>();
    vi.stubGlobal('window', { localStorage: { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v) } });
    try {
      writeFilters('mine', { ...NO_FILTERS, due: 'late', priorities: ['high'], groupBy: 'mission' });
      expect(readFilters('mine')).toEqual({ ...NO_FILTERS, due: 'late', priorities: ['high'], groupBy: 'mission' });
      kept.set('older', JSON.stringify({ due: 'week', people: ['u1'] }));
      expect(readFilters('older')).toEqual({ ...NO_FILTERS, due: 'week', people: ['u1'] });
      kept.set('broken', '{"due":');
      expect(readFilters('broken')).toEqual(NO_FILTERS);
      expect(readFilters('never')).toEqual(NO_FILTERS);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
