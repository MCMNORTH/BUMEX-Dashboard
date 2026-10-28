import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import type { Id } from '@bumex/domain';
import { useStore } from '../store';
import { Icon } from '../ui/common';
import { Select } from '../ui/Select';
import { MissionForm, canEditMissions, dueIn, kindLabel, missionPriority, missionStatus, type Mission } from './Missions';
import { useSay } from './say';
import type { TicketTask } from './Tasks';
import { fold, readView, writeView, type WorkView } from './work-filters';
import { Avatar, Lozenge, PriorityIcon, hoursText } from './work-ui';

// [bumex-one] The Missions room's first tab (asked on 2026-10-28: "the engagement pages are not good"): the floor's
// missions as cards grouped by status, or as a list (the choice remembered in this browser), with search and filters
// and the figures that matter: what is running, what is late, the tickets behind and the hours. A mission opens on its
// page (Mission.tsx). The work in progress to invoice and the finished files moved to the "Facturation" tab.

type Scope = 'open' | 'completed' | 'all';
type Sort = 'deadline' | 'name' | 'progress';
const ORDER = ['active', 'planned', 'on_hold', 'completed'];
const NO_DUE_DATE = '9999-12-31';
const dmy = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

type Row = { m: Mission; client: string; open: number; late: number; total: number; done: number; due: ReturnType<typeof dueIn>; past: boolean; over: boolean };

export function MissionList({ entityId }: { entityId: Id }) {
  const { state, ui, setUi, openRoom } = useStore();
  const say = useSay();
  const today = state.today;
  const me = state.session.userId;
  const [view, setView] = useState<WorkView>(() => readView('missions', 'board'));
  const [scope, setScope] = useState<Scope>('open');
  const [search, setSearch] = useState('');
  const [client, setClient] = useState('');
  const [lead, setLead] = useState('');
  const [mine, setMine] = useState(false);
  const [lateOnly, setLateOnly] = useState(false);
  const [sort, setSort] = useState<Sort>('deadline');
  const [creating, setCreating] = useState(false);

  const missions = useMemo(() => (state.engagements as Mission[]).filter((e) => e.entityId === entityId), [state.engagements, entityId]);
  const rows: Row[] = useMemo(() => {
    const tickets = state.tasks.filter((x) => x.entityId === entityId && 'ticket' in x) as TicketTask[];
    return missions.map((m) => {
      const mine = tickets.filter((x) => x.engagementId === m.id);
      const open = mine.filter((x) => x.status !== 'done');
      const late = open.filter((x) => x.dueDate !== NO_DUE_DATE && x.dueDate < today).length;
      const finished = m.status === 'completed';
      return {
        m,
        client: state.customers.find((c) => c.id === m.customerId)?.name ?? '',
        open: open.length,
        late,
        total: mine.length,
        done: mine.length - open.length,
        due: finished ? null : dueIn(m.deadline, today, say),
        past: !finished && m.deadline < today,
        over: m.budgetHours > 0 && m.actualHours > m.budgetHours,
      };
    });
  }, [missions, state.tasks, state.customers, entityId, today, say]);

  // a mission picked elsewhere (the search, the building, the archive rack) opens on its page
  useEffect(() => {
    const id = ui.focusEngagementId;
    if (!id) return;
    const m = missions.find((x) => x.id === id);
    setUi({ focusEngagementId: null });
    if (m?.projectId) openRoom('missions', `mission:${m.projectId}`);
  }, [ui.focusEngagementId, missions, setUi, openRoom]);

  const clients = [...new Map(rows.filter((r) => r.client).map((r) => [r.m.customerId, r.client])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const leads = [...new Map(missions.filter((m) => m.ownerId).map((m) => [m.ownerId!, m.ownerName ?? m.ownerId!])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const words = fold(search).split(/\s+/).filter(Boolean);
  const inScope = rows.filter((r) => (scope === 'all' ? true : scope === 'completed' ? r.m.status === 'completed' : r.m.status !== 'completed'));
  const shown = inScope
    .filter((r) => !client || r.m.customerId === client)
    .filter((r) => !lead || r.m.ownerId === lead)
    .filter((r) => !mine || r.m.ownerId === me || (r.m.team ?? []).includes(state.session.actorName) || state.tasks.some((x) => x.engagementId === r.m.id && (x as TicketTask).ticket?.assignee_id === me))
    .filter((r) => !lateOnly || r.past || r.late > 0)
    .filter((r) => !words.length || words.every((w) => fold(`${r.m.name} ${r.m.code} ${r.client} ${r.m.ownerName ?? ''}`).includes(w)))
    .sort((a, b) => (sort === 'name' ? a.m.name.localeCompare(b.m.name) : sort === 'progress' ? (b.m.progress ?? 0) - (a.m.progress ?? 0) : a.m.deadline.localeCompare(b.m.deadline)));

  const running = rows.filter((r) => r.m.status === 'active');
  const lateMissions = rows.filter((r) => r.past);
  const lateTickets = rows.filter((r) => r.m.status !== 'completed').reduce((s, r) => s + r.late, 0);
  const logged = running.reduce((s, r) => s + r.m.actualHours, 0);
  const budget = running.reduce((s, r) => s + r.m.budgetHours, 0);
  const filtered = Boolean(search.trim() || client || lead || mine || lateOnly);
  const open = (m: Mission) => m.projectId && openRoom('missions', `mission:${m.projectId}`);
  const pickView = (v: WorkView) => { setView(v); writeView('missions', v); };
  const canCreate = canEditMissions(state.session.role);

  return (
    <div className="ms">
      <div className="ov-figs">
        <button className="ov-fig" onClick={() => { setScope('open'); setLateOnly(false); }}><span className="ov-fig-v">{running.length}</span><span className="ov-fig-l">{say('Missions en cours', 'Active missions')}</span></button>
        <button className={`ov-fig ${lateMissions.length ? 'crit' : 'good'}`} onClick={() => { setScope('open'); setLateOnly(!lateOnly); }} aria-pressed={lateOnly}>
          <span className="ov-fig-v">{lateMissions.length}</span><span className="ov-fig-l">{say('Échéance dépassée', 'Past deadline')}</span>
        </button>
        <button className={`ov-fig ${lateTickets ? 'warn' : 'good'}`} onClick={() => openRoom('tasks', 'overdue')}><span className="ov-fig-v">{lateTickets}</span><span className="ov-fig-l">{say('Tickets en retard', 'Overdue tickets')}</span></button>
        <div className="ov-fig"><span className="ov-fig-v">{hoursText(logged, say)}</span><span className="ov-fig-l">{budget ? say(`saisies sur ${Math.round(budget)} h budgétées`, `logged of ${Math.round(budget)} h budgeted`) : say('saisies sur les missions en cours', 'logged on active missions')}</span></div>
      </div>

      <div className="ms-toolbar">
        <div className="wk-search ms-search">
          <Icon name="search" size={14} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={say('Rechercher une mission, un client…', 'Search a mission, a client…')} aria-label={say('Rechercher', 'Search')} />
        </div>
        <div className="seg-mini" role="tablist" aria-label={say('Missions', 'Missions')}>
          {([['open', say('Actives', 'Open'), rows.filter((r) => r.m.status !== 'completed').length], ['completed', say('Terminées', 'Completed'), rows.filter((r) => r.m.status === 'completed').length], ['all', say('Toutes', 'All'), rows.length]] as [Scope, string, number][]).map(([k, label, n]) => (
            <button key={k} role="tab" aria-selected={scope === k} className={scope === k ? 'on' : ''} onClick={() => setScope(k)}>{label} <span className="muted">{n}</span></button>
          ))}
        </div>
        {clients.length > 1 && (
          <Select className="in ms-filter" value={client} onChange={(e) => setClient(e.target.value)} aria-label="Client">
            <option value="">{say('Tous les clients', 'Every client')}</option>
            {clients.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </Select>
        )}
        {leads.length > 1 && (
          <Select className="in ms-filter" value={lead} onChange={(e) => setLead(e.target.value)} aria-label={say('Responsable', 'Lead')}>
            <option value="">{say('Tous les responsables', 'Every lead')}</option>
            {leads.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </Select>
        )}
        <button className={`btn sm ${mine ? 'primary' : ''}`} onClick={() => setMine(!mine)} aria-pressed={mine}>{say('Mes missions', 'My missions')}</button>
        {filtered && <button className="linkish small" onClick={() => { setSearch(''); setClient(''); setLead(''); setMine(false); setLateOnly(false); }}>{say('Effacer les filtres', 'Clear filters')}</button>}
        <div className="ms-toolbar-r">
          {view === 'board' && (
            <Select className="in ms-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label={say('Trier', 'Sort')}>
              <option value="deadline">{say('Par échéance', 'By deadline')}</option>
              <option value="name">{say('Par nom', 'By name')}</option>
              <option value="progress">{say('Par avancement', 'By progress')}</option>
            </Select>
          )}
          <div className="seg-mini">
            <button className={view === 'board' ? 'on' : ''} onClick={() => pickView('board')}>{say('Cartes', 'Cards')}</button>
            <button className={view === 'list' ? 'on' : ''} onClick={() => pickView('list')}>{say('Liste', 'List')}</button>
          </div>
          {canCreate && <button className="btn sm primary" onClick={() => setCreating(true)}><Icon name="plus" size={13} /> {say('Nouvelle mission', 'New mission')}</button>}
        </div>
      </div>

      {creating && <MissionForm entityId={entityId} projectId={null} onClose={(saved) => { setCreating(false); if (saved) openRoom('missions', `mission:${saved}`); }} />}

      {!shown.length ? (
        <div className="ms-empty">
          <b>{filtered ? say('Aucune mission ne correspond.', 'No mission matches.') : scope === 'completed' ? say('Aucune mission terminée.', 'No completed mission.') : say('Aucune mission sur cet étage.', 'No mission on this floor.')}</b>
          {!filtered && scope !== 'completed' && canCreate && <button className="btn sm primary" onClick={() => setCreating(true)}><Icon name="plus" size={13} /> {say('Créer la première', 'Create the first one')}</button>}
        </div>
      ) : view === 'board' ? (
        ORDER.map((status) => {
          const group = shown.filter((r) => r.m.status === status);
          if (!group.length) return null;
          const [label, tone] = missionStatus(status, say);
          return (
            <section key={status} className="ms-group">
              <h2 className="ms-group-h"><Lozenge tone={tone}>{label}</Lozenge><span className="muted">{group.length}</span></h2>
              <div className="ms-cards">{group.map((r) => <MissionCard key={r.m.id} row={r} onOpen={() => open(r.m)} />)}</div>
            </section>
          );
        })
      ) : (
        <div className="card flush ms-tablewrap">
          <table className="ms-table">
            <thead>
              <tr>
                <th><button className="wk-sort" onClick={() => setSort('name')}>{say('Mission', 'Mission')}{sort === 'name' ? ' ↓' : ''}</button></th>
                <th>{say('Statut', 'Status')}</th>
                <th>{say('Responsable', 'Lead')}</th>
                <th><button className="wk-sort" onClick={() => setSort('progress')}>{say('Avancement', 'Progress')}{sort === 'progress' ? ' ↓' : ''}</button></th>
                <th><button className="wk-sort" onClick={() => setSort('deadline')}>{say('Échéance', 'Deadline')}{sort === 'deadline' ? ' ↓' : ''}</button></th>
                <th className="num">{say('Tickets', 'Tickets')}</th>
                <th className="num">{say('Heures', 'Hours')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const [label, tone] = missionStatus(r.m.status, say);
                return (
                  <tr key={r.m.id} className="click" onClick={() => open(r.m)}>
                    <td className="ms-table-name"><b>{r.m.name}</b><div className="small muted"><span className="mono">{r.m.code}</span>{r.client ? ` · ${r.client}` : ''}</div></td>
                    <td><Lozenge tone={tone}>{label}</Lozenge></td>
                    <td className="small">{r.m.ownerName ? <span className="ms-lead"><Avatar name={r.m.ownerName} size={20} /> {r.m.ownerName}</span> : '—'}</td>
                    <td><Progress value={r.m.progress ?? 0} /></td>
                    <td className="small"><span className="mono">{dmy(r.m.deadline)}</span>{r.due && <div className={r.due.late ? 'ms-late' : r.due.soon ? 'ms-soon' : 'muted'}>{r.due.text}</div>}</td>
                    <td className="num small">{r.open} {say('ouverts', 'open')}{r.late > 0 && <div className="ms-late">{r.late} {say('en retard', 'late')}</div>}</td>
                    <td className={`num small ${r.over ? 'ms-late' : ''}`}>{hoursText(r.m.actualHours, say)}{r.m.budgetHours ? ` / ${Math.round(r.m.budgetHours)} h` : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Progress({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return <span className="ms-progress" title={`${v} %`}><span className="ms-progress-bar"><i style={{ width: `${v}%` }} className={v >= 100 ? 'full' : ''} /></span><span className="ms-progress-v">{v} %</span></span>;
}

function MissionCard({ row, onOpen }: { row: Row; onOpen: () => void }) {
  const say = useSay();
  const { m } = row;
  const team = m.team ?? [];
  const priority = missionPriority(m.priority);
  const key = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } };
  return (
    <article className={`ms-card ${row.past ? 'late' : ''}`} role="link" tabIndex={0} onClick={onOpen} onKeyDown={key} aria-label={m.name}>
      <div className="ms-card-top">
        <span className="ms-code mono">{m.code}</span>
        {priority && <PriorityIcon priority={priority} say={say} />}
        {row.past && <span className="tag late">{say('échéance dépassée', 'past deadline')}</span>}
        {row.over && <span className="tag late">{say('budget dépassé', 'over budget')}</span>}
        {m.projectId && (
          <button className="btn sm ghost ms-card-board" title={say('Ouvrir le tableau', 'Open the board')} aria-label={say('Ouvrir le tableau', 'Open the board')}
            onClick={(e) => { e.stopPropagation(); useStore.getState().openRoom('tasks', `board:${m.id}`); }}><Icon name="tasks" size={14} /></button>
        )}
      </div>
      <h3 className="ms-card-name">{m.name}</h3>
      <div className="ms-card-client">{row.client || say('Sans client (interne)', 'No client (internal)')}{m.projectKind ? ` · ${kindLabel(m.projectKind, say)}` : ''}</div>
      <Progress value={m.progress ?? 0} />
      <div className="ms-card-facts">
        <span title={say('Échéance', 'Deadline')}><Icon name="calendar" size={14} /> <span className="mono">{dmy(m.deadline)}</span>{row.due && <b className={row.due.late ? 'ms-late' : row.due.soon ? 'ms-soon' : 'muted'}> · {row.due.text}</b>}</span>
        <span title={say('Tickets', 'Tickets')}><Icon name="tasks" size={14} /> {row.total ? `${row.done}/${row.total}` : '0'}{row.late > 0 && <b className="ms-late"> · {row.late} {say('en retard', 'late')}</b>}</span>
        <span title={say('Heures saisies / budget', 'Hours logged / budget')} className={row.over ? 'ms-late' : ''}><Icon name="clock" size={14} /> {hoursText(m.actualHours, say)}{m.budgetHours ? ` / ${Math.round(m.budgetHours)} h` : ''}</span>
      </div>
      <div className="ms-card-foot">
        <span className="ms-avatars">
          {team.slice(0, 4).map((n) => <Avatar key={n} name={n} size={24} />)}
          {team.length > 4 && <span className="ms-more">+{team.length - 4}</span>}
        </span>
        {m.ownerName && <span className="small muted ms-lead" title={say('Responsable', 'Lead')}>{m.ownerName}</span>}
      </div>
    </article>
  );
}
