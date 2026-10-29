import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../ui/common';
import { Select } from '../ui/Select';
import { PRIORITY, TYPES, label } from './Tasks';
import { stageLabel } from './stages';
import { NO_FILTERS, activeFilterCount, isFiltered, stageFilterKey, type DueFilter, type GroupBy, type WorkFilters, type WorkTicket } from './work-filters';
import { Avatar, PriorityIcon, TypeIcon } from './work-ui';
import type { Say } from './ticket-history';

// The toolbar above the board and the list, as Jira's (asked on 2026-10-27), shared by the Tasks room and My work
// (2026-10-29): a search on the title, key and labels (and what else a ticket carries: My work, its mission), people as
// avatars, filters (priority, type, label, due date, stage, no estimate, mine), a scope (a mission), the grouping and the
// count. My work leaves out the people: every ticket there is the person's own.

export type Scope = { id: string; label: string; group?: string };
const GROUP_LABELS: Record<GroupBy, [string, string]> = { none: ['Grouper : aucun', 'Group: none'], assignee: ['Grouper : assigné', 'Group: assignee'], priority: ['Grouper : priorité', 'Group: priority'], mission: ['Grouper : mission', 'Group: mission'] };

export function WorkToolbar<T extends WorkTicket>({ tickets, filters, setFilters, scope, setScope, scopeAll, scopes, groups, people = true, count, total, noun, say }: {
  tickets: T[];
  filters: WorkFilters;
  setFilters: (f: WorkFilters) => void;
  scope: string;
  setScope: (s: string) => void;
  scopeAll: string; // the label of "every mission"
  scopes: Scope[];
  groups: GroupBy[];
  people?: boolean;
  count: number;
  total: number;
  noun?: [string, string]; // what is counted: "ticket(s)"
  say: Say;
}) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  // Escape closes the filters, wherever the focus is (their button, inside them, the page), and not the room
  // (ui/Header.tsx listens on the window: the document hears it first)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  const peopleList = useMemo(() => {
    const map = new Map<string, string>();
    for (const x of tickets) if (x.ticket.assignee_id) map.set(x.ticket.assignee_id, x.assignee);
    return [...map].sort((a, b) => a[1].localeCompare(b[1], 'fr'));
  }, [tickets]);
  const labels = useMemo(() => [...new Set(tickets.flatMap((x) => x.ticket.labels))].sort((a, b) => a.localeCompare(b, 'fr')), [tickets]);
  // the stages in view, by name across the boards (the built-in ones by status), in the boards' order of statuses
  const stages = useMemo(() => {
    const order = ['backlog', 'todo', 'in_progress', 'review', 'blocked', 'done'];
    const map = new Map<string, { name: string; rank: number }>();
    for (const x of tickets) map.set(stageFilterKey(x), { name: stageLabel(x.ticket.stage_name, x.ticket.status, say), rank: order.indexOf(x.ticket.status) });
    return [...map].sort((a, b) => a[1].rank - b[1].rank || a[1].name.localeCompare(b[1].name, 'fr'));
  }, [tickets, say]);
  const toggle = <K extends 'people' | 'priorities' | 'types' | 'labels' | 'stages'>(key: K, value: string) =>
    setFilters({ ...filters, [key]: filters[key].includes(value) ? filters[key].filter((v) => v !== value) : [...filters[key], value] });
  const shownPeople = peopleList.slice(0, 6);
  const filterCount = activeFilterCount(people ? filters : { ...filters, mine: false });
  const grouped = scopes.some((s) => s.group) ? [...new Set(scopes.map((s) => s.group ?? ''))] : null;
  return (
    <div className="wk-toolbar">
      <div className="wk-search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.3-4.3" /></svg>
        <input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          placeholder={people ? say('Rechercher : titre, clé, étiquette…', 'Search: title, key, label…') : say('Rechercher : titre, clé, mission, étiquette…', 'Search: title, key, mission, label…')}
          aria-label={say('Rechercher dans les tickets', 'Search the tickets')} />
      </div>
      {people && (
        <div className="wk-people" role="group" aria-label={say('Filtrer par personne', 'Filter by person')}>
          {shownPeople.map(([id, name]) => (
            <button key={id} className={filters.people.includes(id) ? 'on' : ''} onClick={() => toggle('people', id)} title={name} aria-pressed={filters.people.includes(id)}><Avatar name={name} size={28} /></button>
          ))}
          <button className={filters.people.includes('') ? 'on' : ''} onClick={() => toggle('people', '')} title={say('Non assigné', 'Unassigned')} aria-pressed={filters.people.includes('')}><Avatar name={null} size={28} title={say('Non assigné', 'Unassigned')} /></button>
          {peopleList.length > shownPeople.length && (
            <Select className="wk-more" value="" onChange={(e) => e.target.value && toggle('people', e.target.value)} aria-label={say('Autres personnes', 'More people')}>
              <option value="">+{peopleList.length - shownPeople.length}</option>
              {peopleList.slice(6).map(([id, name]) => <option key={id} value={id}>{filters.people.includes(id) ? '✓ ' : ''}{name}</option>)}
            </Select>
          )}
        </div>
      )}
      <div className="menu-wrap">
        <button ref={toggleRef} className={`btn sm ${filterCount ? 'on-filter' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open}><Icon name="search" size={13} /> {say('Filtrer', 'Filter')}{filterCount > 0 && <span className="wk-badge">{filterCount}</span>}</button>
        {open && (
          <>
            <div className="wk-pop-back" onClick={() => setOpen(false)} />
            <div className="wk-pop">
              {people && <label className="wk-check"><input type="checkbox" checked={filters.mine} onChange={(e) => setFilters({ ...filters, mine: e.target.checked })} /> {say('Mes tickets', 'My tickets')}</label>}
              <label className="wk-check"><input type="checkbox" checked={filters.noEstimate} onChange={(e) => setFilters({ ...filters, noEstimate: e.target.checked })} /> {say('Sans estimation', 'No estimate')}</label>
              <div className="wk-pop-h">{say('Échéance', 'Due')}</div>
              <div className="seg-mini">{([['all', say('Toutes', 'All')], ['late', say('En retard', 'Late')], ['week', say('Cette semaine', 'This week')], ['none', say('Sans date', 'No date')]] as [DueFilter, string][]).map(([k, l]) => <button key={k} className={filters.due === k ? 'on' : ''} onClick={() => setFilters({ ...filters, due: k })}>{l}</button>)}</div>
              {stages.length > 0 && <>
                <div className="wk-pop-h">{say('État', 'Status')}</div>
                <div className="wk-tags">{stages.map(([k, st]) => <button key={k} className={`tag ${filters.stages.includes(k) ? 'on' : ''}`} onClick={() => toggle('stages', k)}>{st.name}</button>)}</div>
              </>}
              <div className="wk-pop-h">{say('Priorité', 'Priority')}</div>
              {Object.keys(PRIORITY).reverse().map((p) => <label key={p} className="wk-check"><input type="checkbox" checked={filters.priorities.includes(p)} onChange={() => toggle('priorities', p)} /> <PriorityIcon priority={p} say={say} /> {label(PRIORITY[p], p, say)}</label>)}
              <div className="wk-pop-h">Type</div>
              {TYPES.map(([k, fr, en]) => <label key={k} className="wk-check"><input type="checkbox" checked={filters.types.includes(k)} onChange={() => toggle('types', k)} /> <TypeIcon type={k} say={say} /> {say(fr, en)}</label>)}
              {labels.length > 0 && <>
                <div className="wk-pop-h">{say('Étiquettes', 'Labels')}</div>
                <div className="wk-tags">{labels.map((l) => <button key={l} className={`tag ${filters.labels.includes(l) ? 'on' : ''}`} onClick={() => toggle('labels', l)}>{l}</button>)}</div>
              </>}
            </div>
          </>
        )}
      </div>
      {isFiltered(people ? filters : { ...filters, mine: false }) && <button className="btn sm ghost" onClick={() => setFilters({ ...NO_FILTERS, groupBy: filters.groupBy })}>{say('Effacer les filtres', 'Clear filters')}</button>}
      <span className="wk-spacer" />
      {(people || scopes.length > 1) && (
        <Select className="in wk-scope" value={scope} onChange={(e) => setScope(e.target.value)} aria-label={say('Mission', 'Mission')} recent="missions">
          <option value="all">{scopeAll}</option>
          {grouped
            ? grouped.map((g) => <optgroup key={g} label={g}>{scopes.filter((s) => (s.group ?? '') === g).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</optgroup>)
            : scopes.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </Select>
      )}
      {groups.length > 1 && (
        <Select className="in wk-group" value={filters.groupBy} onChange={(e) => setFilters({ ...filters, groupBy: e.target.value as GroupBy })} aria-label={say('Grouper', 'Group')}>
          {groups.map((g) => <option key={g} value={g}>{say(...GROUP_LABELS[g])}</option>)}
        </Select>
      )}
      <span className="small muted wk-count">{count === total ? `${total} ${say(...(noun ?? ['ticket(s)', 'ticket(s)']))}` : `${count} / ${total}`}</span>
    </div>
  );
}
