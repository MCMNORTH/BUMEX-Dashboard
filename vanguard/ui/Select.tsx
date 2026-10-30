import { Children, Fragment, isValidElement, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import { highlights, rank } from './select-search';
import { isPhone } from '../one/screen'; // [mobile]

// [bumex-one] Every dropdown of the app (asked on 2026-10-27): a modern list with a smart search instead of the
// browser's <select> and <datalist>. Written as the native ones were — <Select value onChange> with <option>s, the
// change read from e.target.value — so a screen keeps its values, empty choices and disabled ones.
// - the search (ui/select-search.ts) from 6 choices; a shorter list filters as soon as one types;
// - `recent="<list>"` puts the last picks first (this browser only), on long lists;
// - `data-search` on an <option>: words found besides its label (an e-mail, a code, a city…);
// - on a phone, the list is a sheet from the bottom of the screen;
// - <Suggest>: a free text field with the same list of suggestions (what <datalist> was).
// The list is drawn over the page (a portal in the .vanguard container): a table or a panel never cuts it.

export type SelectChange = { target: { value: string }; currentTarget: { value: string } };

type Option = { value: string; label: string; disabled: boolean; keywords?: string; hint?: string; tone?: string; group?: string }; // hint: shown on the right (a person's load); tone: its colour; group: its <optgroup>'s label

const SEARCH_FROM = 6;
const RECENTS = 5;
const SHOWN = 200;

function text(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return text(node.props.children);
  return '';
}

// the <option>s of the children, through fragments, arrays and conditions
// (an <optgroup>'s label heads its options in the list, 2026-10-28: a mission's team, its floor first)
function optionsOf(children: ReactNode, out: Option[] = [], group?: string): Option[] {
  Children.forEach(children, (child) => {
    if (!isValidElement<{ value?: string | number; disabled?: boolean; children?: ReactNode; label?: string; 'data-search'?: string; 'data-hint'?: string; 'data-tone'?: string }>(child)) return;
    if (child.type === Fragment) optionsOf(child.props.children, out, group);
    else if (child.type === 'optgroup') optionsOf(child.props.children, out, child.props.label ?? group);
    else if (child.type === 'option') {
      const label = text(child.props.children);
      out.push({ value: child.props.value === undefined ? label : String(child.props.value), label, disabled: Boolean(child.props.disabled), keywords: [child.props['data-search'], group].filter(Boolean).join(' ') || undefined, hint: child.props['data-hint'], tone: child.props['data-tone'], group });
    }
  });
  return out;
}

const recentKey = (list: string) => `bumex-vanguard-recent:${list}`;
function readRecents(list?: string): string[] {
  if (!list) return [];
  try {
    const raw = JSON.parse(localStorage.getItem(recentKey(list)) ?? '[]');
    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}
function remember(list: string | undefined, value: string) {
  if (!list || value === '') return;
  try {
    localStorage.setItem(recentKey(list), JSON.stringify([value, ...readRecents(list).filter((v) => v !== value)].slice(0, RECENTS)));
  } catch {
    /* private window: no recents */
  }
}

function Marked({ label, query }: { label: string; query: string }) {
  const parts = highlights(label, query);
  if (!parts.length) return <>{label}</>;
  const out: ReactNode[] = [];
  let at = 0;
  parts.forEach(([s, e], i) => {
    if (s > at) out.push(label.slice(at, s));
    out.push(<mark key={i}>{label.slice(s, e)}</mark>);
    at = e;
  });
  if (at < label.length) out.push(label.slice(at));
  return <>{out}</>;
}

const phone = isPhone; // [mobile] the app's phone query (one/screen.ts)

type Row = { option: Option; section: 'recent' | 'all' };

// The list over the page, its search and its keys: shared by Select and Suggest (whose field is the search: `field`,
// its keys handed over through `onKeys`).
type ListProps = {
  options: Option[]; value: string; recent?: string; anchor: RefObject<HTMLElement | null>; onPick: (o: Option) => void; onClose: (refocus: boolean) => void;
  searchAlways: boolean; query: string; setQuery: (q: string) => void; field?: boolean; onKeys?: (handler: (e: KeyboardEvent) => void) => void;
  id: string;
};
function useList({ options, value, recent, anchor, onPick, onClose, searchAlways, query, setQuery, field, onKeys, id }: ListProps) {
  const fr = useStore((s) => s.ui.lang === 'fr');
  const [cursor, setCursor] = useState<{ key: string; at: number } | null>(null);
  const [place, setPlace] = useState<CSSProperties>({});
  const [sheet] = useState(phone);
  const listRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const matched = useMemo(() => rank(options, query), [options, query]);
  const rows = useMemo<Row[]>(() => {
    const recents = !query && recent && options.length >= SEARCH_FROM
      ? readRecents(recent).map((v) => options.find((o) => o.value === v && !o.disabled)).filter((o): o is Option => Boolean(o))
      : [];
    return [...recents.map((option) => ({ option, section: 'recent' as const })), ...matched.slice(0, SHOWN).map((option) => ({ option, section: 'all' as const }))];
  }, [matched, options, query, recent]);
  const recentCount = rows.filter((r) => r.section === 'recent').length;

  // the chosen one active at first, the best match while searching; then where the keys or the mouse take it
  const key = `${query}\u0000${value}`;
  const active = cursor?.key === key
    ? cursor.at
    : Math.max(0, query ? rows.findIndex((r) => !r.option.disabled) : rows.findIndex((r) => r.section === 'all' && r.option.value === value));
  const setActive = (at: number) => setCursor({ key, at });

  useLayoutEffect(() => {
    if (!anchor.current || sheet) return;
    const update = () => {
      if (!anchor.current) return;
      const r = anchor.current.getBoundingClientRect();
      const below = window.innerHeight - r.bottom - 8;
      const up = below < 240 && r.top > below;
      const width = Math.min(Math.max(r.width, 240), window.innerWidth - 16);
      const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
      setPlace({ left, width, maxHeight: Math.min(360, (up ? r.top : below) - 8), ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [anchor, sheet]);

  // a click elsewhere closes it
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose(false);
    };
    document.addEventListener('pointerdown', down, true);
    return () => document.removeEventListener('pointerdown', down, true);
  }, [anchor, onClose]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-row="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const move = (from: number, step: number) => {
    let at = from;
    for (let n = 0; n < rows.length; n++) {
      at = Math.min(rows.length - 1, Math.max(0, at + step));
      if (!rows[at]?.option.disabled) return at;
      if (at === 0 || at === rows.length - 1) break;
    }
    return from;
  };
  const onKey = (e: KeyboardEvent) => {
    const pressed = e.key;
    if (pressed === 'ArrowDown' || pressed === 'ArrowUp' || pressed === 'PageDown' || pressed === 'PageUp') {
      e.preventDefault();
      setActive(move(active, pressed === 'ArrowDown' ? 1 : pressed === 'ArrowUp' ? -1 : pressed === 'PageDown' ? 8 : -8));
    } else if ((pressed === 'Home' || pressed === 'End') && !query) {
      e.preventDefault();
      setActive(pressed === 'Home' ? move(-1, 1) : move(rows.length, -1));
    } else if (pressed === 'Enter') {
      e.preventDefault();
      const row = rows[active];
      if (row && !row.option.disabled) onPick(row.option);
    } else if (pressed === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // the room behind stays open
      onClose(true);
    } else if (pressed === 'Tab') {
      if (!field) e.preventDefault();
      onClose(!field);
    } else if (!field && !searchAlways && pressed.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // a short list filters as soon as one types
      e.preventDefault();
      setQuery(query + pressed);
    } else if (!field && !searchAlways && pressed === 'Backspace' && query) {
      e.preventDefault();
      setQuery(query.slice(0, -1));
    }
  };

  useEffect(() => {
    onKeys?.(onKey);
  });
  const showSearch = !field && (searchAlways || Boolean(query));
  // the keys go to the search, or to the list when there is none (a short list; Suggest keeps its own field)
  useEffect(() => {
    if (!field && !showSearch) listRef.current?.focus();
  }, [field, showSearch]);
  const root = typeof document !== 'undefined' ? document.querySelector('.vanguard') ?? document.body : null;
  const say = (f: string, e: string) => (fr ? f : e);
  const more = matched.length - Math.min(matched.length, SHOWN);

  const popup = root && createPortal(
    <>
      {sheet && <div className="vsel-backdrop" onPointerDown={() => onClose(false)} />}
      <div ref={popRef} className={`vsel-pop ${sheet ? 'vsel-sheet' : ''}`} style={sheet ? undefined : place} onKeyDown={onKey}>
        {showSearch && (
          <div className="vsel-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.3-4.3" /></svg>
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={say('Rechercher…', 'Search…')} aria-label={say('Rechercher', 'Search')}
              role="combobox" aria-expanded="true" aria-controls={id} aria-activedescendant={rows[active] ? `${id}-${active}` : undefined} autoComplete="off" spellCheck={false} />
            {query && <span className="vsel-count">{matched.length}</span>}
          </div>
        )}
        <div ref={listRef} id={id} role="listbox" className="vsel-list" tabIndex={-1}
          aria-activedescendant={!showSearch && rows[active] ? `${id}-${active}` : undefined}
          onMouseDown={(e) => e.preventDefault()}>
          {rows.map((row, i) => (
            <Fragment key={`${row.section}:${row.option.value}:${i}`}>
              {i === 0 && recentCount > 0 && <div className="vsel-head">{say('Récents', 'Recent')}</div>}
              {i === recentCount && recentCount > 0 && !row.option.group && <div className="vsel-head">{say('Tous', 'All')}</div>}
              {row.section === 'all' && !query && row.option.group && (i === recentCount || rows[i - 1]?.option.group !== row.option.group) && <div className="vsel-head">{row.option.group}</div>}
              <div id={`${id}-${i}`} data-row={i} role="option" aria-selected={row.option.value === value} aria-disabled={row.option.disabled || undefined}
                className={`vsel-opt ${i === active ? 'on' : ''} ${row.option.value === value ? 'sel' : ''} ${row.option.disabled ? 'off' : ''}`}
                onPointerMove={() => i !== active && !row.option.disabled && setActive(i)}
                onClick={() => !row.option.disabled && onPick(row.option)}>
                <span className="vsel-l">{row.option.label ? <Marked label={row.option.label} query={query} /> : ' '}</span>
                {(row.option.hint || (query && row.option.group)) && <span className={`vsel-hint ${row.option.tone ?? ''}`}>{row.option.hint ?? row.option.group}</span>}
                {row.option.value === value && <svg className="vsel-tick" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>}
              </div>
            </Fragment>
          ))}
          {!rows.length && <div className="vsel-empty">{say('Aucun résultat', 'No results')}{query ? ` · « ${query} »` : ''}</div>}
          {more > 0 && <div className="vsel-empty">{say(`… et ${more} autres : précisez la recherche`, `… and ${more} more: refine the search`)}</div>}
        </div>
      </div>
    </>,
    root,
  );
  return { popup };
}

export function Select({ value, onChange, children, className, style, disabled, id, title, recent, 'aria-label': ariaLabel }: {
  value?: string | number | null;
  onChange?: (e: SelectChange) => void;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  id?: string;
  title?: string;
  /** the list's name for its recent picks (long lists only) */
  recent?: string;
  'aria-label'?: string;
}) {
  const options = useMemo(() => optionsOf(children), [children]);
  const current = value === null || value === undefined ? '' : String(value);
  // as the browser's: a value that is none of the options shows the first one
  const selected = options.find((o) => o.value === current) ?? options[0];
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();

  const close = (refocus: boolean) => {
    setOpen(false);
    setQuery('');
    if (refocus) trigger.current?.focus();
  };
  const pick = (o: Option) => {
    close(true);
    remember(recent, o.value);
    if (o.value !== current) onChange?.({ target: { value: o.value }, currentTarget: { value: o.value } });
  };
  const popup = open ? <ListPopup id={listId} options={options} value={current} recent={recent} anchor={trigger} onPick={pick} onClose={close} searchAlways={options.length >= SEARCH_FROM} query={query} setQuery={setQuery} /> : null;

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (open || disabled) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // type to search: the list opens filtered
      e.preventDefault();
      setQuery(e.key);
      setOpen(true);
    }
  };

  return (
    <>
      <button ref={trigger} type="button" id={id} title={title} className={`${className ?? 'in'} vsel ${open ? 'open' : ''}`} style={style} disabled={disabled}
        role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} aria-label={ariaLabel}
        onClick={() => (open ? close(false) : setOpen(true))} onKeyDown={onKey}>
        <span className="vsel-v">{selected?.label || ' '}</span>
        <svg className="vsel-chev" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
      </button>
      {popup}
    </>
  );
}

// the list only while open (its listeners and portal with it)
function ListPopup(props: ListProps) {
  return useList(props).popup;
}

/** A free text field with suggestions (what the browser's <datalist> was): type anything, or pick one. */
export function Suggest({ value, onChange, options, className, style, placeholder, maxLength, 'aria-label': ariaLabel, recent }: {
  value: string;
  onChange: (e: SelectChange) => void;
  /** a suggestion's value, and how it reads in the list (an account: its code, "code name") */
  options: (string | { value: string; label?: string; keywords?: string })[];
  className?: string;
  style?: CSSProperties;
  placeholder?: string;
  maxLength?: number;
  recent?: string;
  'aria-label'?: string;
}) {
  const list = useMemo<Option[]>(() => options.map((o) => (typeof o === 'string' ? { value: o, label: o, disabled: false } : { value: o.value, label: o.label ?? o.value, keywords: o.keywords, disabled: false })), [options]);
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const keys = useRef<((e: KeyboardEvent) => void) | null>(null);
  const listId = useId();
  const set = (v: string) => onChange({ target: { value: v }, currentTarget: { value: v } });
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) input.current?.focus();
  };
  const pick = (o: Option) => {
    remember(recent, o.value);
    set(o.value);
    close(true);
  };
  // the field is the search: the list follows what is typed (what is already a suggestion shows them all)
  const query = list.some((o) => o.value === value) ? '' : value;
  const popup = open && list.length ? <ListPopup id={listId} options={list} value={value} recent={recent} anchor={input} onPick={pick} onClose={close} searchAlways={false} query={query} setQuery={set} field onKeys={(handler) => { keys.current = handler; }} /> : null;
  return (
    <>
      <input ref={input} className={className ?? 'in'} style={style} value={value} placeholder={placeholder} maxLength={maxLength} aria-label={ariaLabel} autoComplete="off"
        role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
        onChange={(e) => { set(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); setOpen(true); return; }
          // the list's keys, while the caret stays in the field
          if (open && ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Enter', 'Escape', 'Tab'].includes(e.key)) keys.current?.(e);
        }} />
      {popup}
    </>
  );
}
