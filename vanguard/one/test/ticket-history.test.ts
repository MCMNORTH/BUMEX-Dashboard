import { describe, expect, it } from 'vitest';

import { ago, describeHistory, type HistoryContext } from '../ticket-history';

const fr = (f: string) => f;
const ctx: HistoryContext = {
  say: fr,
  person: (id) => ({ emp: 'Ahmed Ba', mgr: 'Mariem Sow' })[id] ?? null,
  mission: (id) => (id === 'p1' ? 'Mission Un' : null),
  stageTone: (name) => (name === 'Done' ? 'done' : 'in_progress'),
};

describe('ticket history', () => {
  it('tells a stage change with its lozenges and reason', () => {
    expect(describeHistory('Moved ticket from To merge to Done', { field: 'stage', from: 'To merge', to: 'Done', reason: 'ok' }, ctx)).toEqual({
      verb: "a modifié l'état", from: { text: 'To merge', tone: 'in_progress' }, to: { text: 'Done', tone: 'done' }, note: 'ok',
    });
  });

  it("reads BUMEX One's older stage changes, without a field name", () => {
    expect(describeHistory('Moved ticket from À faire to En cours', { kind: 'status_change', from: 'À faire', to: 'En cours' }, ctx)).toMatchObject({ verb: "a modifié l'état", to: { text: 'En cours' } });
  });

  it('names people, hours, dates, labels and empty values', () => {
    expect(describeHistory('Changed assignee_id', { field: 'assignee_id', from: null, to: 'emp' }, ctx)).toMatchObject({ from: { text: 'Aucun' }, to: { text: 'Ahmed Ba' } });
    expect(describeHistory('Changed estimated_hours', { field: 'estimated_hours', from: 4, to: 6.5 }, ctx)).toMatchObject({ verb: "a mis à jour l'estimation", from: { text: '4 h' }, to: { text: '6,5 h' } });
    expect(describeHistory('Changed due_date', { field: 'due_date', from: null, to: '2026-11-30' }, ctx)).toMatchObject({ to: { text: '30/11/2026' } });
    expect(describeHistory('Changed labels', { field: 'labels', from: [], to: ['RH', 'Démo'] }, ctx)).toMatchObject({ from: { text: 'Aucun' }, to: { text: 'RH, Démo' } });
  });

  it('tells links both ways, sub-tasks and the creation', () => {
    expect(describeHistory('Added link', { field: 'link', link: 'blocks', direction: 'in', other_key: 'AUD-1' }, ctx)).toMatchObject({ verb: 'a ajouté un lien', to: { text: 'est bloqué par AUD-1' } });
    expect(describeHistory('Completed sub-task Relire', {}, ctx).verb).toBe('a terminé la sous-tâche « Relire »');
    expect(describeHistory('Created ticket X', { kind: 'create' }, ctx).verb).toBe('a créé le ticket');
  });

  it('says how long ago', () => {
    const now = Date.parse('2026-10-27T12:00:00Z');
    expect(ago('2026-10-27T11:59:30Z', now, fr)).toBe("à l'instant");
    expect(ago('2026-06-20T12:00:00Z', now, fr)).toBe('il y a 4 mois');
    expect(ago('2026-10-25T12:00:00Z', now, fr)).toBe('il y a 2 jours');
  });
});
