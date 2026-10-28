import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { addDays, canOpenRoom, floorSignals, type Id } from '@bumex/domain';
import { floorOverviewAction, type FloorOverview, type OverviewPerson } from '@/lib/erp/vanguard/overview-actions';
import { useStore } from '../store';
import type { Room } from '../i18n';
import { Icon, Money } from '../ui/common';
import { PersonPanel } from './Person';
import type { TicketTask } from './Tasks';
import { useSay } from './say';
import { ago, describeHistory, type Say } from './ticket-history';
import { StageLozenge } from './stages';
import { sundayOf } from './work-filters';
import { Avatar, LoadBar, Lozenge, PriorityIcon, TypeIcon, hoursText, levelLabel, type Tone } from './work-ui';

// [bumex-one] The floor at a glance (asked on 2026-10-28), the first page of flat mode and the rail's "Vue d'ensemble":
// its tickets' figures, each opening the list behind it; its people with what they carry here, their load, their week's
// hours and timesheet; the late tickets, the missions to watch, the next 14 days, the money (for whoever may open those
// rooms) and the recent activity. Everything is what the person may already see: the tickets and missions are the
// state's, the people and hours come from floorOverviewAction in their session. A person opens on their page
// (Person.tsx) as the overview's tab "person:<id>", so it needs no HR module.

type Mission = { id: Id; name: string; code: string; deadline: string; status: string; entityId: Id; projectId?: string };
const NO_DUE_DATE = '9999-12-31';
const hm = (m: number) => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
const WEEK: Record<string, [string, string, Tone]> = { draft: ['Brouillon', 'Draft', 'todo'], submitted: ['Envoyée', 'Submitted', 'review'], approved: ['Validée', 'Approved', 'done'], returned: ['À corriger', 'Needs changes', 'blocked'] };
const personOf = (tab?: string | null) => (tab?.startsWith('person:') ? tab.slice(7) : null);

export function OverviewRoom({ entityId, initialTab }: { entityId: Id; initialTab?: string | null }) {
  const say = useSay();
  const entity = useStore((s) => s.state.entities.find((e) => e.id === entityId));
  const [person, setPerson] = useState<string | null>(personOf(initialTab));
  const [seenTab, setSeenTab] = useState(initialTab);
  if (initialTab !== seenTab) {
    setSeenTab(initialTab);
    setPerson(personOf(initialTab));
  }
  return (
    <>
      <div className="sheet-head">
        <h1>{say("Vue d'ensemble", 'Overview')}</h1>
        <span className="small muted">{entity?.name}</span>
      </div>
      <div className="sheet-body">
        {person ? <PersonPanel key={person} personId={person} onClose={() => setPerson(null)} /> : <FloorOverviewBody entityId={entityId} onPerson={setPerson} />}
      </div>
    </>
  );
}

function Figure({ label, value, tone, onClick, hint }: { label: string; value: ReactNode; tone?: 'crit' | 'warn' | 'good'; onClick?: () => void; hint?: string }) {
  return (
    <button className={`ov-fig ${tone ?? ''}`} onClick={onClick} disabled={!onClick} title={hint}>
      <span className="ov-fig-v">{value}</span>
      <span className="ov-fig-l">{label}</span>
    </button>
  );
}

function Block({ title, count, tone, children, extra }: { title: string; count?: number; tone?: 'crit' | 'warn'; children: ReactNode; extra?: ReactNode }) {
  return (
    <section className="card ov-block">
      <div className="mw-block-h"><h2>{title}</h2>{count !== undefined && <span className={`tk-count ${tone ?? ''}`}>{count}</span>}<span className="grow" />{extra}</div>
      {children}
    </section>
  );
}

function FloorOverviewBody({ entityId, onPerson }: { entityId: Id; onPerson: (id: string) => void }) {
  const say = useSay();
  const { state, openRoom } = useStore();
  const loadedAt = useStore((s) => s.loadedAt);
  const [data, setData] = useState<FloorOverview | null | undefined>(undefined);
  const [now] = useState(Date.now);

  useEffect(() => {
    let live = true;
    floorOverviewAction(entityId).then((d) => live && setData(d)).catch(() => live && setData(null));
    return () => { live = false; };
  }, [entityId, loadedAt]);

  const today = state.today;
  const tickets = useMemo(() => state.tasks.filter((x) => x.entityId === entityId && 'ticket' in x) as TicketTask[], [state.tasks, entityId]);
  const missions = useMemo(() => (state.engagements as Mission[]).filter((e) => e.entityId === entityId), [state.engagements, entityId]);
  const open = tickets.filter((x) => x.status !== 'done');
  const late = open.filter((x) => x.dueDate !== NO_DUE_DATE && x.dueDate < today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const blocked = open.filter((x) => x.ticket.status === 'blocked');
  const unassigned = open.filter((x) => !x.ticket.assignee_id);
  const unestimated = open.filter((x) => !(Number(x.ticket.estimated_hours ?? 0) > 0));
  const sunday = sundayOf(today);
  const thisWeek = open.filter((x) => x.dueDate >= today && x.dueDate <= sunday);
  const weekAgo = addDays(today, -7);
  const doneWeek = tickets.filter((x) => x.status === 'done' && (x.completedAt ?? '') >= weekAgo);
  const list = (tab: string) => () => openRoom('tasks', tab);
  const ticket = (id: string) => openRoom('tasks', `ticket:${id}`);
  const mission = (m: Mission) => (m.projectId ? openRoom('missions', `mission:${m.projectId}`) : openRoom('missions'));

  // the missions to watch: past their deadline, with late tickets, or due within two weeks with work left
  const in14 = addDays(today, 14);
  const watch = missions
    .filter((m) => m.status === 'active')
    .map((m) => {
      const mine = tickets.filter((x) => x.engagementId === m.id);
      const left = mine.filter((x) => x.status !== 'done');
      const overdue = left.filter((x) => x.dueDate !== NO_DUE_DATE && x.dueDate < today).length;
      return { m, total: mine.length, left: left.length, overdue, past: m.deadline < today, soon: m.deadline >= today && m.deadline <= in14 };
    })
    .filter((w) => w.past || w.overdue > 0 || (w.soon && w.left > 0))
    .sort((a, b) => Number(b.past) - Number(a.past) || b.overdue - a.overdue || a.m.deadline.localeCompare(b.m.deadline));
  const upcoming = [
    ...open.filter((x) => x.dueDate >= today && x.dueDate <= in14).map((x) => ({ date: x.dueDate, kind: 'ticket' as const, id: x.id, label: x.title, key: x.ticket.key, x })),
    ...missions.filter((m) => m.status === 'active' && m.deadline >= today && m.deadline <= in14).map((m) => ({ date: m.deadline, kind: 'mission' as const, id: m.id, label: m.name, key: m.code, m })),
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 14);

  // the team: what each carries on this floor
  const people = (data?.people ?? []).map((p) => {
    const theirs = open.filter((x) => x.ticket.assignee_id === p.id);
    return {
      p,
      doing: theirs.filter((x) => x.ticket.status === 'in_progress' || x.ticket.status === 'review').length,
      todo: theirs.filter((x) => x.ticket.status === 'todo' || x.ticket.status === 'backlog').length,
      blocked: theirs.filter((x) => x.ticket.status === 'blocked').length,
      late: theirs.filter((x) => x.dueDate !== NO_DUE_DATE && x.dueDate < today).length,
    };
  }).sort((a, b) => (b.p.load?.percent ?? -1) - (a.p.load?.percent ?? -1) || a.p.name.localeCompare(b.p.name, 'fr'));

  // the money, for whoever may open those rooms
  const money = useMemo(() => {
    const may = (room: Room) => canOpenRoom(state, entityId, room);
    if (!may('accounting') && !may('bank') && !may('clients')) return null;
    const f = floorSignals(state, entityId);
    return { f, cash: may('bank') || may('accounting'), receivables: may('clients'), drafts: may('accounting') };
  }, [state, entityId]);

  const names = new Map<string, string>([...(data?.people ?? []).map((p) => [p.id, p.name] as [string, string]), ...tickets.flatMap((x) => (x.ticket.assignee_id ? [[x.ticket.assignee_id, x.assignee] as [string, string]] : []))]);
  const ctx = {
    say,
    person: (id: string) => names.get(id) ?? null,
    mission: (id: string) => (state.engagements as Mission[]).find((e) => e.projectId === id || e.id === id)?.name ?? null,
    stageTone: () => 'plain' as const,
  };
  const lateDays = (due: string) => Math.round((Date.parse(today) - Date.parse(due)) / 86400000);

  return (
    <div className="ov">
      <div className="ov-figs">
        <Figure label={say('Tickets ouverts', 'Open tickets')} value={open.length} onClick={list('open')} />
        <Figure label={say('En retard', 'Overdue')} value={late.length} tone={late.length ? 'crit' : 'good'} onClick={list('overdue')} />
        <Figure label={say('Bloqués', 'Blocked')} value={blocked.length} tone={blocked.length ? 'crit' : undefined} onClick={list('blocked')} />
        <Figure label={say('Non assignés', 'Unassigned')} value={unassigned.length} tone={unassigned.length ? 'warn' : undefined} onClick={list('unassigned')} />
        <Figure label={say('À estimer', 'To estimate')} value={unestimated.length} tone={unestimated.length ? 'warn' : undefined} onClick={list('unestimated')} />
        <Figure label={say('À rendre cette semaine', 'Due this week')} value={thisWeek.length} onClick={list('week')} />
        <Figure label={say('Terminés · 7 jours', 'Done · 7 days')} value={doneWeek.length} tone="good" onClick={list('done')} />
      </div>

      <Block title={say('Équipe', 'Team')} count={people.length}
        extra={data?.week && <span className="small muted">{say('Semaine du', 'Week of')} {data.week.start.split('-').reverse().join('/')}</span>}>
        {data === undefined ? <span className="small muted">{say('Chargement…', 'Loading…')}</span> : data === null ? <div className="banner warn small">{say("L'équipe est indisponible.", 'The team is unavailable.')}</div> : (
          <div className="ov-teamwrap">
            <table className="ov-team">
              <thead><tr><th>{say('Personne', 'Person')}</th><th className="num">{say('En cours', 'Doing')}</th><th className="num">{say('À faire', 'To do')}</th><th className="num">{say('En retard', 'Late')}</th><th>{say('Charge', 'Load')}</th><th>{say('Heures · semaine', 'Hours · week')}</th><th>{say('Feuille', 'Timesheet')}</th></tr></thead>
              <tbody>
                {people.map(({ p, doing, todo, blocked: stuck, late: behind }) => (
                  <tr key={p.id} className="click" onClick={() => onPerson(p.id)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onPerson(p.id); }}>
                    <td><span className="wk-inline"><Avatar name={p.name} size={26} /> <span><b>{p.name}</b><div className="small muted">{p.jobTitle ?? '—'}{!p.home && <> · <span className="tag dim">{say('autre étage', 'other floor')} {p.floor ?? ''}</span></>}</div></span></span></td>
                    <td className="num">{doing}{stuck > 0 && <span className="small" style={{ color: 'var(--crit)' }}> +{stuck} {say('bloqué(s)', 'blocked')}</span>}</td>
                    <td className="num">{todo}</td>
                    <td className="num" style={{ color: behind ? 'var(--crit)' : undefined }}>{behind || '—'}</td>
                    <td className="ov-load">{p.load ? <><LoadBar load={p.load} say={say} compact /><span className={`small loadlvl ${p.load.level}`}>{levelLabel(p.load.level, say)} · {p.load.percent} %</span></> : <span className="muted">—</span>}</td>
                    <td><WeekHours p={p} say={say} /></td>
                    <td>{p.week ? <Lozenge tone={WEEK[p.week.status ?? 'draft'][2]}>{say(...(WEEK[p.week.status ?? 'draft'].slice(0, 2) as [string, string]))}</Lozenge> : <span className="muted">—</span>}</td>
                  </tr>
                ))}
                {!people.length && <tr><td colSpan={7} className="muted" style={{ padding: 14 }}>{say('Personne sur cet étage.', 'No one on this floor.')}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </Block>

      <div className="ov-grid">
        <Block title={say('En retard', 'Overdue')} count={late.length} tone={late.length ? 'crit' : undefined}>
          <div className="mw-rows">
            {late.slice(0, 12).map((x) => (
              <div key={x.id} className="mw-ticket click" onClick={() => ticket(x.id)}>
                <span className="wk-keycell"><TypeIcon type={x.ticket.type} say={say} /> <span className="mono">{x.ticket.key}</span></span>
                <span className="mw-title">{x.title}</span>
                <StageLozenge name={x.ticket.stage_name} status={x.ticket.status} />
                <PriorityIcon priority={x.ticket.priority} say={say} />
                <Avatar name={x.ticket.assignee_id ? x.assignee : null} size={22} title={x.ticket.assignee_id ? x.assignee : say('Non assigné', 'Unassigned')} />
                <span className="mw-due late">{say(`${lateDays(x.dueDate)} j`, `${lateDays(x.dueDate)} d`)}</span>
              </div>
            ))}
            {late.length > 12 && <button className="linkish small" onClick={list('overdue')}>{say(`Voir les ${late.length}`, `See all ${late.length}`)} →</button>}
            {!late.length && <div className="small muted mw-empty">{say('Aucun ticket en retard.', 'No overdue ticket.')}</div>}
          </div>
        </Block>

        <Block title={say('Missions à surveiller', 'Missions to watch')} count={watch.length} tone={watch.some((w) => w.past) ? 'warn' : undefined}>
          <div className="mw-rows">
            {watch.slice(0, 10).map((w) => (
              <div key={w.m.id} className="mw-ticket click" onClick={() => mission(w.m)}>
                <span className="mono small">{w.m.code}</span>
                <span className="mw-title">{w.m.name}</span>
                {w.past && <span className="tag late">{say('échéance dépassée', 'past deadline')}</span>}
                {w.overdue > 0 && <span className="tag late">{w.overdue} {say('en retard', 'late')}</span>}
                <span className="small muted">{w.total ? `${w.total - w.left}/${w.total}` : '—'}</span>
                <span className={`mw-due ${w.past ? 'late' : ''}`}>{w.m.deadline.split('-').reverse().join('/')}</span>
              </div>
            ))}
            {!watch.length && <div className="small muted mw-empty">{say('Toutes les missions sont dans les temps.', 'Every mission is on track.')}</div>}
          </div>
        </Block>

        <Block title={say('Échéances · 14 jours', 'Deadlines · 14 days')} count={upcoming.length}>
          <div className="mw-rows">
            {upcoming.map((u) => (
              <div key={`${u.kind}${u.id}`} className="mw-ticket click" onClick={() => (u.kind === 'ticket' ? ticket(u.id) : mission(u.m))}>
                <span className="mw-due">{u.date.slice(8, 10)}/{u.date.slice(5, 7)}</span>
                {u.kind === 'ticket' ? <TypeIcon type={u.x.ticket.type} say={say} /> : <Icon name="missions" size={15} />}
                <span className="mono small">{u.key}</span>
                <span className="mw-title">{u.label}</span>
                {u.kind === 'ticket' && <Avatar name={u.x.ticket.assignee_id ? u.x.assignee : null} size={20} />}
              </div>
            ))}
            {!upcoming.length && <div className="small muted mw-empty">{say('Rien dans les deux semaines.', 'Nothing in the next two weeks.')}</div>}
          </div>
        </Block>

        {money && (
          <Block title={say('Finances', 'Finance')}>
            <div className="ov-money">
              {money.cash && <button className="ov-fig" onClick={() => openRoom('bank')}><span className="ov-fig-v"><Money v={money.f.cash} /></span><span className="ov-fig-l">{say('Trésorerie', 'Cash')}</span></button>}
              {money.receivables && <button className={`ov-fig ${money.f.overdueCount ? 'warn' : ''}`} onClick={() => openRoom('clients', 'invoices')}><span className="ov-fig-v"><Money v={money.f.overdue} /></span><span className="ov-fig-l">{say(`Créances échues · ${money.f.overdueCount}`, `Overdue receivables · ${money.f.overdueCount}`)}</span></button>}
              {money.drafts && <button className="ov-fig" onClick={() => openRoom('accounting')}><span className="ov-fig-v">{money.f.drafts}</span><span className="ov-fig-l">{say('Écritures en brouillon', 'Draft entries')}</span></button>}
            </div>
          </Block>
        )}

        <Block title={say('Activité récente', 'Recent activity')}>
          <div className="mw-rows">
            {(data?.activity ?? []).map((a) => {
              const line = describeHistory(a.action, a.metadata ?? {}, ctx);
              const go = () => (a.subjectType === 'project' ? openRoom('missions', `mission:${a.subjectId}`) : ticket(a.subjectId));
              return (
                <div key={a.id} className="ov-act click" onClick={go}>
                  <Avatar name={a.who || null} size={22} />
                  <div className="grow">
                    <div className="small"><b>{a.who || say('Système', 'System')}</b> {line.verb}{line.to && <> · {line.from && <span className="muted">{line.from.text} → </span>}{line.to.text}</>}</div>
                    <div className="small muted">{a.key ? <span className="mono">{a.key} </span> : null}{a.title ?? ''} · {ago(a.at, now, say)}</div>
                  </div>
                </div>
              );
            })}
            {data && !data.activity.length && <div className="small muted mw-empty">{say('Aucune activité récente.', 'No recent activity.')}</div>}
          </div>
        </Block>
      </div>
    </div>
  );
}

function WeekHours({ p, say }: { p: OverviewPerson; say: Say }) {
  if (!p.week) return <span className="muted" title={say('Réservé à la personne, aux managers de son entité et aux administrateurs', "Only the person, their entity's managers and the administrators")}>—</span>;
  const cap = Math.max(1, p.capacity) * 60;
  return (
    <div className="ov-hours" title={`${hm(p.week.minutes)} / ${p.capacity} h`}>
      <span className="small"><b>{hoursText(p.week.minutes / 60, say)}</b> <span className="muted">/ {p.capacity} h</span></span>
      <span className="ov-hours-bar"><i style={{ width: `${Math.min(100, (p.week.minutes / cap) * 100)}%` }} /></span>
    </div>
  );
}
