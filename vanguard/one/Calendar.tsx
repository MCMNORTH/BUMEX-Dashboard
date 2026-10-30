import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addDays, type Id } from '@bumex/domain';
import { calendarAction, type CalendarItem } from '@/lib/erp/vanguard/calendar-actions';
import { useStore } from '../store';
import { Select } from '../ui/Select';
import { useSay } from './say';
import { isPhone } from './screen'; // [mobile] a tapped day shows its list, under the month

// The Missions room's "Calendrier" tab: BUMEX One's Calendar page (redrawn on 2026-10-28: the titles were cut and the
// month said little). Ticket due dates, mission deadlines, milestones and contract renewals on a month grid, each kind
// in its colour (the legend filters them); a day picked lists its events in full beside the month, with their mission
// and client, each opening where it lives. On a phone the month shrinks to dots and the day's list carries the detail.

const TYPES: Record<string, [string, string]> = {
  ticket_due: ['Tickets', 'Tickets'],
  project_deadline: ['Échéances de mission', 'Mission deadlines'],
  milestone: ['Jalons', 'Milestones'],
  contract_renewal: ['Contrats', 'Contracts'],
  payment_due: ['Paiements', 'Payments'],
  internal_event: ['Interne', 'Internal'],
};
const ONE: Record<string, [string, string]> = {
  ticket_due: ['Ticket', 'Ticket'],
  project_deadline: ['Échéance de mission', 'Mission deadline'],
  milestone: ['Jalon', 'Milestone'],
  contract_renewal: ['Renouvellement de contrat', 'Contract renewal'],
  payment_due: ['Paiement', 'Payment'],
  internal_event: ['Interne', 'Internal'],
};
const SHOWN_PER_DAY = 3;

const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
const shiftMonth = (first: string, by: number) => {
  const d = new Date(`${first}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 10);
};

export function CalendarView({ entityId }: { entityId: Id }) {
  const { state, ui, openRoom } = useStore();
  const say = useSay();
  const router = useRouter();
  const today = state.today;
  const loadedAt = useStore((s) => s.loadedAt);
  const [items, setItems] = useState<CalendarItem[] | null>(null);
  const [month, setMonth] = useState(() => monthStart(state.today));
  const [day, setDay] = useState(() => state.today);
  const [hidden, setHidden] = useState<string[]>([]);
  const [scope, setScope] = useState<'floor' | 'all'>('floor');

  useEffect(() => {
    let live = true;
    calendarAction().then((d) => live && setItems(d)).catch(() => live && setItems([]));
    return () => { live = false; };
  }, [loadedAt]);

  const floorProjects = useMemo(() => new Set(state.engagements.filter((e) => e.entityId === entityId).map((e) => (e as { projectId?: string }).projectId).filter(Boolean) as string[]), [state.engagements, entityId]);
  if (!items) return <span className="muted">{say('Chargement…', 'Loading…')}</span>;

  const inScope = items.filter((i) => scope === 'all' || (i.projectId && floorProjects.has(i.projectId)));
  const shown = inScope.filter((i) => !hidden.includes(i.type));
  const end = shiftMonth(month, 1);
  const first = new Date(`${month}T00:00:00Z`);
  const gridStart = addDays(month, -((first.getUTCDay() + 6) % 7));
  const weeks = Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(gridStart, w * 7 + d))).filter((week) => week[0] < end);
  const locale = ui.lang === 'fr' ? 'fr-FR' : 'en-GB';
  const title = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(first);
  const weekdays = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${addDays(gridStart, i)}T00:00:00Z`)));
  const longDay = (iso: string) => new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  const byDay = new Map<string, CalendarItem[]>();
  for (const i of shown) byDay.set(i.date, [...(byDay.get(i.date) ?? []), i]);
  const inMonth = shown.filter((i) => i.date >= month && i.date < end).length;
  const types = Object.keys(TYPES).filter((k) => inScope.some((i) => i.type === k));
  const goMonth = (m: string) => { setMonth(m); setDay(m === monthStart(today) ? today : m); };
  const open = (i: CalendarItem) => {
    if (!i.open) return;
    if (i.open.kind === 'ticket') openRoom('tasks', `ticket:${i.open.id}`);
    else if (i.open.kind === 'mission') openRoom('missions', `mission:${i.open.id}`);
    else router.push(`/contracts/${i.open.id}`);
  };
  const dayItems = byDay.get(day) ?? [];
  const next = shown.filter((i) => i.date > day && i.date <= addDays(day, 14));

  return (
    <div className="cal">
      <div className="ms-toolbar">
        <div className="rm-nav">
          <button className="btn sm" onClick={() => goMonth(shiftMonth(month, -1))} aria-label={say('Mois précédent', 'Previous month')}>‹</button>
          <b className="cal-title">{title}</b>
          <button className="btn sm" onClick={() => goMonth(shiftMonth(month, 1))} aria-label={say('Mois suivant', 'Next month')}>›</button>
          <button className="btn sm" onClick={() => goMonth(monthStart(today))}>{say("Aujourd'hui", 'Today')}</button>
        </div>
        <div className="cal-legend" aria-label={say('Types affichés', 'Types shown')}>
          {types.map((k) => {
            const off = hidden.includes(k);
            return (
              <button key={k} className={`cal-key ${off ? 'off' : ''}`} aria-pressed={!off} onClick={() => setHidden(off ? hidden.filter((h) => h !== k) : [...hidden, k])}>
                <i className={`cal-dot ${k}`} />{say(...TYPES[k])}
              </button>
            );
          })}
        </div>
        <div className="ms-toolbar-r">
          <span className="small muted">{inMonth} {say('ce mois-ci', 'this month')}</span>
          <Select className="in ms-filter" value={scope} onChange={(e) => setScope(e.target.value as 'floor' | 'all')} aria-label={say('Périmètre', 'Scope')}>
            <option value="floor">{say('Cet étage', 'This floor')}</option>
            <option value="all">{say('Tout le groupe', 'The whole group')}</option>
          </Select>
        </div>
      </div>

      <div className="cal-layout">
        <div className="card flush cal-month">
          <div className="cal-wd">{weekdays.map((w, i) => <span key={w} className={i > 4 ? 'we' : ''}>{w}</span>)}</div>
          <div className="cal-grid" style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
            {weeks.flat().map((d, idx) => {
              const list = byDay.get(d) ?? [];
              const other = d < month || d >= end;
              const cls = ['cal-day', other && 'other', d === today && 'today', d === day && 'sel', idx % 7 > 4 && 'we'].filter(Boolean).join(' ');
              return (
                <div key={d} className={cls} role="button" tabIndex={0} aria-label={`${longDay(d)} · ${list.length}`} aria-pressed={d === day}
                  onClick={() => { setDay(d); if (isPhone()) window.setTimeout(() => document.querySelector('.cal-side')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDay(d); } }}>
                  <span className="cal-num">{Number(d.slice(8))}</span>
                  <div className="cal-pills">
                    {list.slice(0, SHOWN_PER_DAY).map((i) => (
                      <button key={i.id} className={`cal-pill ${i.type}`} title={`${say(...(ONE[i.type] ?? ONE.internal_event))} · ${i.title}${i.projectName ? ` · ${i.projectName}` : ''}`}
                        onClick={(e) => { e.stopPropagation(); setDay(d); open(i); }}>{i.title}</button>
                    ))}
                    {list.length > SHOWN_PER_DAY && <span className="cal-more">+{list.length - SHOWN_PER_DAY} {say('autres', 'more')}</span>}
                  </div>
                  {list.length > 0 && <span className="cal-dots" aria-hidden="true">{list.slice(0, 4).map((i) => <i key={i.id} className={`cal-dot ${i.type}`} />)}</span>}
                </div>
              );
            })}
          </div>
        </div>

        <aside className="cal-side">
          <div className="mw-block">
            <div className="mw-block-h"><h2 className="cal-side-day">{longDay(day)}</h2>{day === today && <span className="tag dim">{say("aujourd'hui", 'today')}</span>}</div>
            {dayItems.length ? dayItems.map((i) => <Event key={i.id} item={i} onOpen={() => open(i)} />) : <span className="small muted">{say('Rien ce jour-là.', 'Nothing that day.')}</span>}
          </div>
          <div className="mw-block">
            <div className="mw-block-h"><h2>{say('Les 14 jours suivants', 'The next 14 days')}</h2><span className="tk-count">{next.length}</span></div>
            {next.slice(0, 8).map((i) => <Event key={i.id} item={i} onOpen={() => open(i)} date={new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${i.date}T00:00:00Z`))} />)}
            {next.length > 8 && <span className="small muted">+{next.length - 8} {say('autres', 'more')}</span>}
            {!next.length && <span className="small muted">{say('Rien de prévu.', 'Nothing planned.')}</span>}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Event({ item, onOpen, date }: { item: CalendarItem; onOpen: () => void; date?: string }) {
  const say = useSay();
  return (
    <button className={`cal-event ${item.type}`} onClick={onOpen} disabled={!item.open}>
      <span className="cal-event-k">{date ? <b>{date}</b> : null}{date ? ' · ' : ''}{say(...(ONE[item.type] ?? ONE.internal_event))}</span>
      <span className="cal-event-t">{item.title}</span>
      {(item.projectName || item.clientName || item.who) && <span className="small muted">{[item.projectName, item.clientName, item.who].filter(Boolean).join(' · ')}</span>}
    </button>
  );
}
