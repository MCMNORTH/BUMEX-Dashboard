// [bumex-one] A ticket's history as Jira tells it (vanguard/one/Ticket.tsx): "X a modifié l'état", then the change,
// "To merge → Done". The lines come from work.activity: the database writes one per changed field (0012,
// work.task_history), the application the stage changes, the creation and the sub-tasks (lib/tickets/*).

export type Say = (fr: string, en: string) => string;

export type HistoryValue = { text: string; tone?: 'todo' | 'in_progress' | 'review' | 'blocked' | 'done' | 'archived' | 'plain' };
export type HistoryLine = { verb: string; from?: HistoryValue | null; to?: HistoryValue | null; note?: string };

export type HistoryContext = {
  say: Say;
  person: (id: string) => string | null;
  mission: (id: string) => string | null;
  stageTone: (name: string) => HistoryValue['tone'];
};

const STATUS: Record<string, [string, string]> = { backlog: ['Backlog', 'Backlog'], todo: ['À faire', 'To do'], in_progress: ['En cours', 'In progress'], review: ['En revue', 'In review'], blocked: ['Bloqué', 'Blocked'], done: ['Terminé', 'Done'], archived: ['Archivé', 'Archived'] };
const PRIORITY: Record<string, [string, string]> = { low: ['Basse', 'Low'], normal: ['Moyenne', 'Medium'], medium: ['Moyenne', 'Medium'], high: ['Haute', 'High'], urgent: ['Urgente', 'Urgent'] };
const TYPE: Record<string, [string, string]> = { task: ['Tâche', 'Task'], bug: ['Anomalie', 'Bug'], feature: ['Évolution', 'Feature'], support: ['Support', 'Support'], client_request: ['Demande client', 'Client request'], internal: ['Interne', 'Internal'] };
export const LINK_WORDS: Record<string, { out: [string, string]; in: [string, string] }> = {
  relates: { out: ['concerne', 'relates to'], in: ['concerne', 'relates to'] },
  blocks: { out: ['bloque', 'blocks'], in: ['est bloqué par', 'is blocked by'] },
  duplicates: { out: ['duplique', 'duplicates'], in: ['est dupliqué par', 'is duplicated by'] },
  action_item: { out: ['a pour action', 'has action item'], in: ['est l’action de', 'is action item of'] },
};

const str = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v));
const none = (say: Say): HistoryValue => ({ text: say('Aucun', 'None'), tone: 'plain' });
const value = (v: unknown, map?: (s: string) => string): HistoryValue | null => {
  const s = str(v);
  return s === null ? null : { text: map ? map(s) : s, tone: 'plain' };
};
const date = (v: unknown) => {
  const s = str(v);
  return s ? s.slice(0, 10).split('-').reverse().join('/') : null;
};
const hours = (v: unknown, say: Say) => {
  const n = Number(v);
  return v === null || v === undefined || Number.isNaN(n) ? null : `${say(String(n).replace('.', ','), String(n))} h`;
};

export function describeHistory(action: string, metadata: Record<string, unknown>, ctx: HistoryContext): HistoryLine {
  const { say } = ctx;
  // BUMEX One's older stage changes carry no field name
  const field = str(metadata.field) ?? (metadata.kind === 'status_change' && (metadata.from || metadata.to) ? 'stage' : null);
  const pair = (from: HistoryValue | null, to: HistoryValue | null) => ({ from: from ?? none(say), to: to ?? none(say) });
  switch (field) {
    case 'stage': {
      const from = str(metadata.from);
      const to = str(metadata.to);
      return { verb: say("a modifié l'état", 'changed the status'), from: from ? { text: from, tone: ctx.stageTone(from) } : none(say), to: to ? { text: to, tone: ctx.stageTone(to) } : none(say), note: str(metadata.reason) ?? undefined };
    }
    case 'status': {
      const label = (s: string | null): HistoryValue => (s ? { text: say(...(STATUS[s] ?? [s, s])), tone: (s in STATUS ? s : 'plain') as HistoryValue['tone'] } : none(say));
      return { verb: say("a modifié l'état", 'changed the status'), from: label(str(metadata.from)), to: label(str(metadata.to)) };
    }
    case 'assignee_id':
      return { verb: say("a modifié l'assigné", 'changed the assignee'), ...pair(value(metadata.from, (id) => ctx.person(id) ?? '—'), value(metadata.to, (id) => ctx.person(id) ?? '—')) };
    case 'reporter_id':
      return { verb: say('a modifié le rapporteur', 'changed the reporter'), ...pair(value(metadata.from, (id) => ctx.person(id) ?? '—'), value(metadata.to, (id) => ctx.person(id) ?? '—')) };
    case 'priority':
      return { verb: say('a modifié la priorité', 'changed the priority'), ...pair(value(metadata.from, (p) => say(...(PRIORITY[p] ?? [p, p]))), value(metadata.to, (p) => say(...(PRIORITY[p] ?? [p, p])))) };
    case 'type':
      return { verb: say('a modifié le type', 'changed the type'), ...pair(value(metadata.from, (t) => say(...(TYPE[t] ?? [t, t]))), value(metadata.to, (t) => say(...(TYPE[t] ?? [t, t])))) };
    case 'estimated_hours':
      return { verb: say("a mis à jour l'estimation", 'updated the estimate'), ...pair(value(hours(metadata.from, say)), value(hours(metadata.to, say))) };
    case 'due_date':
      return { verb: say("a modifié l'échéance", 'changed the due date'), ...pair(value(date(metadata.from)), value(date(metadata.to))) };
    case 'labels': {
      const list = (v: unknown) => (Array.isArray(v) && v.length ? { text: v.join(', '), tone: 'plain' as const } : null);
      return { verb: say('a mis à jour les étiquettes', 'updated the labels'), ...pair(list(metadata.from), list(metadata.to)) };
    }
    case 'title':
      return { verb: say('a renommé le ticket', 'renamed the ticket'), ...pair(value(metadata.from), value(metadata.to)) };
    case 'notes':
      return { verb: say('a mis à jour la description', 'updated the description') };
    case 'engagement_id':
    case 'project_id':
      return { verb: say('a déplacé le ticket vers une autre mission', 'moved the ticket to another mission'), ...pair(value(metadata.from, (id) => ctx.mission(id) ?? '—'), value(metadata.to, (id) => ctx.mission(id) ?? '—')) };
    case 'key':
      return { verb: say('a changé le ticket d’étage', 'moved the ticket to another floor'), ...pair(value(metadata.from), value(metadata.to)) };
    case 'link': {
      const words = LINK_WORDS[str(metadata.link) ?? ''] ?? LINK_WORDS.relates;
      const relation = say(...words[metadata.direction === 'in' ? 'in' : 'out']);
      return metadata.removed
        ? { verb: say('a retiré un lien', 'removed a link'), from: { text: `${relation} ${str(metadata.other_key) ?? ''}`.trim(), tone: 'plain' } }
        : { verb: say('a ajouté un lien', 'added a link'), to: { text: `${relation} ${str(metadata.other_key) ?? ''}`.trim(), tone: 'plain' } };
    }
  }
  if (metadata.kind === 'create') return { verb: say('a créé le ticket', 'created the ticket') };
  // the sub-tasks' lines (lib/tickets/subtasks.ts), said in the person's language
  const sub = /^(Added|Completed|Reopened|Removed) sub-task (.+)$/.exec(action);
  if (sub) {
    const verbs: Record<string, [string, string]> = { Added: ['a ajouté la sous-tâche', 'added the sub-task'], Completed: ['a terminé la sous-tâche', 'completed the sub-task'], Reopened: ['a rouvert la sous-tâche', 'reopened the sub-task'], Removed: ['a retiré la sous-tâche', 'removed the sub-task'] };
    return { verb: `${say(...verbs[sub[1]])} « ${sub[2]} »` };
  }
  const added = /^Added (\d+) sub-tasks$/.exec(action);
  if (added) return { verb: say(`a ajouté ${added[1]} sous-tâches`, `added ${added[1]} sub-tasks`) };
  if (/sub-task/.test(action)) return { verb: say('a modifié une sous-tâche', 'changed a sub-task'), note: action };
  return { verb: action };
}

/** "il y a 4 mois", "à l'instant": how long ago, as Jira says it. */
export function ago(iso: string, now: number, say: Say) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  const unit = (n: number, fr: string, frs: string, en: string) => say(`il y a ${n} ${n > 1 ? frs : fr}`, `${n} ${en}${n > 1 ? 's' : ''} ago`);
  if (s < 60) return say("à l'instant", 'just now');
  if (s < 3600) return unit(Math.floor(s / 60), 'minute', 'minutes', 'minute');
  if (s < 86400) return unit(Math.floor(s / 3600), 'heure', 'heures', 'hour');
  if (s < 86400 * 30) return unit(Math.floor(s / 86400), 'jour', 'jours', 'day');
  if (s < 86400 * 365) return unit(Math.floor(s / (86400 * 30)), 'mois', 'mois', 'month');
  return unit(Math.floor(s / (86400 * 365)), 'an', 'ans', 'year');
}
