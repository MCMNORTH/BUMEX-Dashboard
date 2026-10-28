import { describe, expect, it } from 'vitest';

import { NO_FILTERS, activeFilterCount, applyFilters, groupTickets } from '../work-filters';

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
