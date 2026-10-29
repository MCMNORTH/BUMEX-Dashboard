import { Fragment, useState, type KeyboardEvent } from 'react';
import { remainingHours } from '@/lib/work/load';
import type { TicketStatus } from '@/types/ticket';
import { useStore } from '../store';
import { PRIORITY, label } from './Tasks';
import { NO_DUE_DATE, groupTickets, type GroupBy, type GroupLabels, type WorkTicket } from './work-filters';
import { Avatar, PriorityIcon, TypeIcon, hoursText } from './work-ui';
import { StageSelect, stageTicketOf } from './stages';
import { QuickLogButton } from './QuickLog';
import type { MissionTag } from './Board';
import type { Say } from './ticket-history';

// The tickets as a list, as Jira lists them (asked on 2026-10-27), shared by the Tasks room and My work (2026-10-29):
// sortable columns, groups, each ticket's stage changed in place among its own board's stages. The Tasks room shows
// the assignee; My work, where every ticket is the person's own, the mission and a clock to log time. A row opens the
// ticket. On a phone a row becomes a short block (vanguard/work.css).

export type ListColumn = 'key' | 'title' | 'status' | 'priority' | 'assignee' | 'mission' | 'estimate' | 'due' | 'labels' | 'log';
type SortKey = 'key' | 'title' | 'status' | 'priority' | 'assignee' | 'mission' | 'estimate' | 'due';
export type ListChange = { id: string; stage: { id: string; name: string; status: TicketStatus } };

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, normal: 2, low: 3 };
const STATUS_RANK = ['backlog', 'todo', 'in_progress', 'review', 'blocked', 'done'];
export const sumHours = (list: WorkTicket[]) => list.reduce((s, x) => s + remainingHours(x.ticket), 0);

export function TicketList<T extends WorkTicket>({ tickets, columns, groupBy, groupLabels, defaultSort, onOpen, onChanged, missionOf, done, say }: {
  tickets: T[];
  columns: ListColumn[];
  groupBy: GroupBy;
  groupLabels: GroupLabels;
  defaultSort: { key: SortKey; up: boolean } | null; // null: the order given (My work: the most pressing first)
  onOpen: (id: string) => void;
  onChanged: (change?: ListChange) => void | Promise<void>; // a stage picked (its picker waits for it), or time logged
  missionOf?: (x: T) => (MissionTag & { other?: string | null }) | null;
  done?: T[]; // recently done, under the others, folded
  say: Say;
}) {
  const [sort, setSort] = useState(defaultSort);
  const [showDone, setShowDone] = useState(false);
  const num = (k: string) => Number(/-(\d+)$/.exec(k)?.[1] ?? 0);
  const value = (x: T, key: SortKey): string | number => {
    switch (key) {
      case 'key': return num(x.ticket.key);
      case 'title': return x.title.toLocaleLowerCase('fr');
      case 'status': return STATUS_RANK.indexOf(x.ticket.status);
      case 'priority': return PRIORITY_RANK[x.ticket.priority] ?? 2;
      case 'assignee': return x.ticket.assignee_id ? x.assignee.toLocaleLowerCase('fr') : '￿';
      case 'mission': return (missionOf?.(x)?.code ?? '').toLocaleLowerCase('fr');
      case 'estimate': return Number(x.ticket.estimated_hours ?? 0);
      case 'due': return x.dueDate;
    }
  };
  const sorted = sort
    ? [...tickets].sort((a, b) => {
      const [va, vb] = [value(a, sort.key), value(b, sort.key)];
      return (va < vb ? -1 : va > vb ? 1 : 0) * (sort.up ? 1 : -1);
    })
    : tickets;
  const groups = groupTickets(sorted, groupBy, groupLabels);
  const sortable = new Set<ListColumn>(['key', 'title', 'status', 'priority', 'assignee', 'mission', 'estimate', 'due']);
  const TITLES: Record<ListColumn, [string, string]> = {
    key: ['Clé', 'Key'], title: ['Résumé', 'Summary'], status: ['État', 'Status'], priority: ['Priorité', 'Priority'], assignee: ['Assigné', 'Assignee'],
    mission: ['Mission', 'Mission'], estimate: ['Estimation', 'Estimate'], due: ['Échéance', 'Due'], labels: ['Étiquettes', 'Labels'], log: ['', ''],
  };
  const head = (col: ListColumn) => {
    const text = say(...TITLES[col]);
    if (!sortable.has(col)) return <th key={col} className={`c-${col}`}>{text}</th>;
    const key = col as SortKey;
    const on = sort?.key === key;
    return (
      <th key={col} className={`c-${col} ${col === 'estimate' ? 'num' : ''}`} aria-sort={on ? (sort!.up ? 'ascending' : 'descending') : undefined}>
        <button className="wk-sort" onClick={() => setSort({ key, up: on ? !sort!.up : true })}>{text}{on && <span aria-hidden="true">{sort!.up ? ' ↑' : ' ↓'}</span>}</button>
      </th>
    );
  };
  return (
    <div className="card flush wk-list">
      <table>
        <thead><tr>{columns.map(head)}</tr></thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g.key}>
              {groupBy !== 'none' && <tr className="wk-grouprow"><td colSpan={columns.length}><b>{g.label}</b> <span className="muted">· {g.items.length} · {hoursText(sumHours(g.items), say)}</span></td></tr>}
              {g.items.map((x) => <Row key={x.id} x={x} columns={columns} missionOf={missionOf} onOpen={onOpen} onChanged={onChanged} say={say} />)}
            </Fragment>
          ))}
          {!tickets.length && <tr><td colSpan={columns.length} className="muted" style={{ padding: 18 }}>{say('Aucun ticket ne correspond.', 'No ticket matches.')}</td></tr>}
          {done && done.length > 0 && (
            <>
              <tr className="wk-grouprow wk-donerow">
                <td colSpan={columns.length}>
                  <button className="linkish" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>{showDone ? '▾' : '▸'} {say('Terminés récemment', 'Recently done')} · {done.length}</button>
                </td>
              </tr>
              {showDone && done.map((x) => <Row key={x.id} x={x} columns={columns} missionOf={missionOf} onOpen={onOpen} onChanged={onChanged} say={say} />)}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Row<T extends WorkTicket>({ x, columns, missionOf, onOpen, onChanged, say }: {
  x: T; columns: ListColumn[]; missionOf?: (x: T) => (MissionTag & { other?: string | null }) | null; onOpen: (id: string) => void; onChanged: (change?: ListChange) => void | Promise<void>; say: Say;
}) {
  const today = useStore((s) => s.state.today);
  const done = x.status === 'done';
  const late = !done && x.dueDate !== NO_DUE_DATE && x.dueDate < today;
  const est = Number(x.ticket.estimated_hours ?? 0);
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  const key = (e: KeyboardEvent) => { if (e.target === e.currentTarget && e.key === 'Enter') onOpen(x.id); };
  const cell = (col: ListColumn) => {
    switch (col) {
      case 'key': return <td key={col} className="c-key nowrap"><span className="wk-keycell"><TypeIcon type={x.ticket.type} say={say} /> <span className={`mono ${done ? 'wk-done' : ''}`}>{x.ticket.key}</span></span></td>;
      case 'title': return <td key={col} className={`c-title ${done ? 'wk-done' : ''}`}>{x.title}</td>;
      case 'status': return <td key={col} className="c-status" onClick={stop} onKeyDown={stop}><StageSelect ticket={stageTicketOf(x)} onMoved={(stage) => onChanged({ id: x.id, stage })} /></td>;
      case 'priority': return <td key={col} className="c-priority"><span className="wk-inline"><PriorityIcon priority={x.ticket.priority} say={say} /> <span className="c-word">{label(PRIORITY[x.ticket.priority], x.ticket.priority, say)}</span></span></td>;
      case 'assignee': return <td key={col} className="c-assignee"><span className="wk-inline"><Avatar name={x.ticket.assignee_id ? x.assignee : null} size={22} /> <span className="c-word">{x.ticket.assignee_id ? x.assignee : <span className="muted">{say('Non assigné', 'Unassigned')}</span>}</span></span></td>;
      case 'mission': {
        const m = missionOf?.(x);
        return (
          <td key={col} className="c-mission">
            {/* on a phone the code stands for the mission; one without a code keeps its name there */}
            {m ? <span className="wk-mission" title={m.name}>{m.code && <span className="tag mission">{m.code}</span>} <span className={`wk-mission-n ${m.code ? 'c-word' : ''}`}>{m.name}</span>{m.other && <span className="tag mw-other">{m.other}</span>}</span> : <span className="muted">—</span>}
          </td>
        );
      }
      case 'estimate': return <td key={col} className="c-estimate num">{est ? hoursText(est, say) : <span className="muted">—</span>}{x.ticket.logged_minutes > 0 && <div className="small muted c-spent">{hoursText(x.ticket.logged_minutes / 60, say)} {say('passées', 'spent')}</div>}</td>;
      case 'due': return <td key={col} className={`c-due nowrap ${late ? 'late' : ''}`}>{x.dueDate === NO_DUE_DATE ? '—' : x.dueDate.split('-').reverse().join('/')}</td>;
      case 'labels': return <td key={col} className="c-labels"><div className="wk-tags">{x.ticket.labels.map((l) => <span key={l} className="tag">{l}</span>)}</div></td>;
      case 'log': return <td key={col} className="c-log" onClick={stop} onKeyDown={stop}>{!done && <QuickLogButton ticketId={x.id} onSaved={() => onChanged()} />}</td>;
    }
  };
  return (
    <tr className="click" tabIndex={0} onClick={() => onOpen(x.id)} onKeyDown={key}>
      {columns.map(cell)}
    </tr>
  );
}
