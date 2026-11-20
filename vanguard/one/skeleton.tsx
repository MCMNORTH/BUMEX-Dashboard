import type { CSSProperties, ReactNode } from 'react';
import { useStore } from '../store';

// Skeletons: what is loading drawn as its shape, under Fluent's shimmer (one wave over the whole window, work.css .sk),
// instead of "Chargement…" (asked on 2026-11-20). A loading place picks the shape of what comes: lines, a form, a
// table, a list, a board, figures, a page, a grid. Screen readers hear "Chargement…" once (role=status); with reduced
// motion the shapes stay still.
//
//   if (!data) return <Loading><SkTable rows={6} cols={5} /></Loading>;

type Size = number | string;

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
// varied widths, always the same ones: the page does not jump from one render to the next
const LINE = ['92%', '78%', '86%', '64%', '72%', '58%'];
const CELL = ['70%', '48%', '60%', '38%', '54%', '44%'];

/** One shape: a line of text by default. */
export function Sk({ w = '100%', h = 12, className = '', style }: { w?: Size; h?: Size; className?: string; style?: CSSProperties }) {
  return <span className={`sk ${className}`} style={{ width: w, height: h, ...style }} aria-hidden="true" />;
}

/** The loading place: says "Chargement…" to a screen reader, shows the shapes inside. */
export function Loading({ children, label, className = '', style }: { children: ReactNode; label?: string; className?: string; style?: CSSProperties }) {
  const fr = useStore((s) => s.ui.lang !== 'en');
  return (
    <div className={`sk-wrap ${className}`} role="status" aria-busy="true" style={style}>
      <span className="sk-vh">{label ?? (fr ? 'Chargement…' : 'Loading…')}</span>
      {children}
    </div>
  );
}

/** Lines of text. */
export function SkLines({ n = 3 }: { n?: number }) {
  return <div className="sk-lines">{range(n).map((i) => <Sk key={i} w={LINE[i % LINE.length]} />)}</div>;
}

/** The figures at the head of a page. */
export function SkKpis({ n = 4 }: { n?: number }) {
  return (
    <div className="sk-kpis">
      {range(n).map((i) => (
        <div key={i} className="kpi"><Sk w="55%" h={10} /><Sk w="35%" h={22} style={{ marginTop: 10 }} /></div>
      ))}
    </div>
  );
}

/** A table: its head and rows, in a card unless `bare`. */
export function SkTable({ rows = 6, cols = 5, bare = false }: { rows?: number; cols?: number; bare?: boolean }) {
  const table = (
    <div className="sk-table" style={{ '--sk-cols': cols } as CSSProperties}>
      <div className="sk-tr sk-th">{range(cols).map((c) => <Sk key={c} w={c ? '45%' : '60%'} h={10} />)}</div>
      {range(rows).map((r) => (
        <div key={r} className="sk-tr">{range(cols).map((c) => <Sk key={c} w={CELL[(r + c) % CELL.length]} />)}</div>
      ))}
    </div>
  );
  return bare ? table : <div className="card sk-card">{table}</div>;
}

/** Rows inside a table's own body (its head is already drawn). */
export function SkTableRows({ rows = 5, cols }: { rows?: number; cols: number }) {
  const fr = useStore((s) => s.ui.lang !== 'en');
  return (
    <>
      {range(rows).map((r) => (
        <tr key={r} className="sk-row">
          {range(cols).map((c) => (
            <td key={c}>
              {!r && !c && <span className="sk-vh" role="status">{fr ? 'Chargement…' : 'Loading…'}</span>}
              <Sk w={CELL[(r + c) % CELL.length]} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** A list: a picture (a person, a file) and two lines each. */
export function SkList({ rows = 5, card = false }: { rows?: number; card?: boolean }) {
  const list = (
    <div className="sk-list">
      {range(rows).map((i) => (
        <div key={i} className="sk-li">
          <Sk w={32} h={32} />
          <div className="sk-li-t"><Sk w={LINE[i % LINE.length]} /><Sk w="38%" h={10} /></div>
        </div>
      ))}
    </div>
  );
  return card ? <div className="card sk-card">{list}</div> : list;
}

/** A form: its labels and fields, and its button. */
export function SkForm({ fields = 4, cols = 1, actions = true }: { fields?: number; cols?: number; actions?: boolean }) {
  return (
    <div className="sk-form">
      <div className="sk-fields" style={{ '--sk-cols': cols } as CSSProperties}>
        {range(fields).map((i) => (
          <div key={i} className="sk-field"><Sk w={[90, 120, 70, 104][i % 4]} h={10} /><Sk h={28} /></div>
        ))}
      </div>
      {actions && <div className="sk-actions"><Sk w={88} h={28} /></div>}
    </div>
  );
}

/** A board: its columns and their cards. */
export function SkBoard({ cols = 4 }: { cols?: number }) {
  const cards = [3, 2, 4, 1, 2, 3];
  return (
    <div className="sk-board">
      {range(cols).map((c) => (
        <div key={c} className="sk-col">
          <div className="sk-col-h"><Sk w="46%" /><Sk w={18} /></div>
          {range(cards[c % cards.length]).map((i) => (
            <div key={i} className="sk-ticket">
              <Sk w={LINE[(c + i) % LINE.length]} />
              <Sk w="52%" h={10} />
              <div className="sk-ticket-f"><Sk w={44} h={16} /><Sk w={20} h={20} /></div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** A grid of days (a calendar, a week of time). */
export function SkGrid({ rows = 5, cols = 7 }: { rows?: number; cols?: number }) {
  return (
    <div className="card sk-card">
      <div className="sk-grid" style={{ '--sk-cols': cols } as CSSProperties}>
        {range(cols).map((c) => <div key={`h${c}`} className="sk-cell sk-cell-h"><Sk w="50%" h={10} /></div>)}
        {range(rows * cols).map((i) => (
          <div key={i} className="sk-cell">{i % 3 !== 1 && <Sk w={CELL[i % CELL.length]} h={10} />}{i % 4 === 0 && <Sk w="80%" h={18} />}</div>
        ))}
      </div>
    </div>
  );
}

/** A page of its own (a mission, a client, a contract, a person, a ticket): its head, its tabs, then figures and a
 *  table, or, `split`, its text beside its details. */
export function SkPage({ split = false, tabs = 5 }: { split?: boolean; tabs?: number }) {
  return (
    <div className="sk-page">
      <div className="sk-head">
        <Sk w={40} h={40} />
        <div className="sk-head-t"><Sk w="min(320px, 60%)" h={20} /><Sk w="min(200px, 40%)" h={10} /></div>
      </div>
      {tabs > 0 && <div className="sk-tabs">{range(tabs).map((i) => <Sk key={i} w={[64, 80, 56, 72, 60][i % 5]} />)}</div>}
      {split ? (
        <div className="sk-split">
          <div className="card sk-card"><SkLines n={7} /></div>
          <div className="card sk-card"><SkForm fields={5} actions={false} /></div>
        </div>
      ) : (
        <>
          <SkKpis n={4} />
          <SkTable rows={5} cols={4} />
        </>
      )}
    </div>
  );
}
