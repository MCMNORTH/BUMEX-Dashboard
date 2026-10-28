import { useState, type ReactNode } from 'react';
import { fmt, fmtDate, requestDeletion, canDecideDeletions, type ProtectedTable } from '@bumex/domain';
import { useStore } from '../store';

export function Money({ v, cur, sign = false }: { v: number; cur?: string; sign?: boolean }) {
  return (
    <span className="mono" style={{ whiteSpace: 'nowrap' }}>
      {sign && v > 0 ? '+' : ''}
      {fmt(v)}
      {cur ? ` ${cur}` : ''}
    </span>
  );
}

export function Chip({ kind, children }: { kind: 'good' | 'warn' | 'crit' | 'dim' | 'off'; children: ReactNode }) {
  return <span className={`chip ${kind}`}>{children}</span>;
}

export function Lamp({ kind, letter }: { kind: 'good' | 'warn' | 'crit' | 'off'; letter: string }) {
  return <span className={`lamp ${kind}`}>{letter}</span>;
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div role="tablist" style={{ display: 'flex', flexWrap: 'wrap' }}>
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={`tab ${value === t.id ? 'on' : ''}`} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children, style }: { label: string; children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="field" style={style}>
      <label>{label}</label>
      {children}
    </div>
  );
}

// Journal entry reference as shown everywhere: journal code + 6-digit number
export function entryRef(state: { journals: { id: string; code: string }[] }, e?: { journalId: string; entryNo?: number } | null): string {
  if (!e) return '—';
  const j = state.journals.find((x) => x.id === e.journalId)?.code ?? '';
  return `${j} ${e.entryNo ? String(e.entryNo).padStart(6, '0') : '—'}`;
}

export function D({ iso }: { iso?: string }) {
  // [bumex-one] 9999-12-31: no date (a mission without a deadline, a ticket without a due date)
  return <span className="mono">{iso && !iso.startsWith('9999-12-31') ? fmtDate(iso) : '—'}</span>;
}

export const STATUS_KIND: Record<string, 'good' | 'warn' | 'crit' | 'dim'> = { posted: 'good', paid: 'good', draft: 'dim', reversed: 'warn', pending_approval: 'warn', approved: 'good', rejected: 'crit', validated: 'good', cancelled: 'dim' };
export const STATUS_FR: Record<string, string> = { posted: 'Comptabilisée', paid: 'Payée', draft: 'Brouillon', reversed: 'Extournée', pending_approval: 'À approuver', approved: 'Approuvée', rejected: 'Rejetée', validated: 'Validée', cancelled: 'Annulée' };

// Files leave the page through the claude.ai downloads capability when the page runs there (the viewer confirms
// the save); elsewhere through a plain browser download.
export async function saveFile(filename: string, data: string | Blob | ArrayBuffer, mime: string, toast: (k: 'ok' | 'error' | 'info', t: string) => void): Promise<void> {
  const claude = (window as unknown as { claude?: { use: (n: string) => Promise<{ save: (r: { filename: string; data: string | Blob | ArrayBuffer }) => Promise<unknown> } | null> } }).claude;
  const dl = claude?.use ? await claude.use('downloads').catch(() => null) : null;
  if (dl) {
    try {
      await dl.save({ filename, data });
      toast('ok', `${filename} enregistré`);
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code !== 'declined') toast('error', 'Export indisponible ici');
    }
    return;
  }
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Outline icons (stroke only), shared by the sidebar and the command bar.
export const ICONS: Record<string, ReactNode> = {
  overview: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v10h14V10" /></>,
  floors: <><rect x="5" y="3" width="14" height="18" rx="1.5" /><path d="M5 9h14M5 15h14" /></>,
  accounting: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  bank: <><path d="M3 10 12 4l9 6" /><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" /></>,
  clients: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><circle cx="17" cy="9" r="2.4" /><path d="M15.5 14.5a4.5 4.5 0 0 1 5 4.5" /></>,
  missions: <><path d="M4 7h16v13H4z" /><path d="M9 7V4h6v3M4 12h16" /></>,
  suppliers: <><path d="M3 7h11v10H3zM14 11h4l3 3v3h-7" /><circle cx="7" cy="18" r="1.7" /><circle cx="17" cy="18" r="1.7" /></>,
  assets: <><path d="M12 3 4 7v10l8 4 8-4V7z" /><path d="M4 7l8 4 8-4M12 11v10" /></>,
  tasks: <><path d="M9 11l2 2 4-4" /><rect x="4" y="4" width="16" height="16" rx="3" /></>,
  archives: <><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v10h14V9M10 13h4" /></>,
  reports: <><path d="M4 20h16" /><path d="M6 16v-5M11 16V8M16 16v-3M21 16V5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  penthouse: <><path d="M4 20h16M6 20V9l6-5 6 5v11" /><path d="M10 20v-5h4v5" /></>,
  flag: <><path d="M5 21V4" /><path d="M5 4h12l-2 4 2 4H5" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></>,
  alert: <><path d="M12 3 2.5 20h19z" /><path d="M12 10v4M12 17.5v.5" /></>,
  activity: <><path d="M3 12h4l3-7 4 14 3-7h4" /></>,
  progress: <><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5A8.5 8.5 0 0 1 20.5 12" strokeWidth="3" /></>,
  chevronUp: <><path d="m6 15 6-6 6 6" /></>,
  chevronDown: <><path d="m6 9 6 6 6-6" /></>,
  chevronLeft: <><path d="m15 6-6 6 6 6" /></>,
  chevronRight: <><path d="m9 6 6 6-6 6" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.3-4.3" /></>,
  close: <><path d="M6 6l12 12M18 6 6 18" /></>,
  box: <><path d="M3 8h18v12H3z" /><path d="M3 8l2-4h14l2 4M10 12h4" /></>,
  back: <><path d="M10 19l-7-7 7-7" /><path d="M3 12h18" /></>,
  hr: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /><path d="M17 4.5a3 3 0 0 1 0 5.5" /></>,
  tax: <><path d="M6 3h12v18H6z" /><path d="M9 7h6M9 11h6M9 15h3" /><path d="m14.5 14 2.5 2.5-1.5 1.5" /></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  download: <><path d="M12 4v11M7 10l5 5 5-5" /><path d="M4 20h16" /></>,
  upload: <><path d="M12 15V4M7 9l5-5 5 5" /><path d="M4 20h16" /></>,
  mywork: <><path d="M4 6h10M4 12h10M4 18h7" /><path d="m15 17 2 2 4-4" /></>, // [bumex-one] My work
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
};

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

// Deleting anything that matters goes through this dialog: a reason, then an immediate deletion (partners,
// administrator) or a request that one of them approves. The engine enforces the same rule.
export function DeleteDialog() {
  const { ui, state, t, askDeletion, apply, toast } = useStore();
  const [reason, setReason] = useState('');
  const d = ui.deletion;
  if (!d) return null;
  const direct = canDecideDeletions(state);
  const close = () => { askDeletion(null); setReason(''); };
  const go = () => {
    const ok = apply((s) => {
      const r = requestDeletion(s, { table: d.table as ProtectedTable, rowId: d.rowId, label: d.label, reason, entityId: d.entityId });
      window.setTimeout(() => toast(r.executed ? 'ok' : 'info', r.executed ? `Supprimé · ${d.label}` : `Demande de suppression envoyée · ${d.label}`), 0);
      return r.state;
    });
    if (ok) close();
  };
  return (
    <div className="modal-back" onClick={close}>
      <div className="modal" role="dialog" aria-label={t('delete_confirm')} onClick={(e) => e.stopPropagation()}>
        <h2>{t('delete_confirm')}</h2>
        <p style={{ margin: '6px 0 10px' }}><b>{d.label}</b></p>
        <div className={`banner ${direct ? 'warn' : 'info'}`}>{direct ? t('delete_note_partner') : t('delete_note_other')}</div>
        <Field label={t('delete_reason')} style={{ marginTop: 10 }}>
          <textarea className="in" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus placeholder="Doublon, erreur de saisie, fin de relation…" />
        </Field>
        <div className="actions" style={{ marginTop: 12 }}>
          <button className="btn" onClick={close}>{t('close')}</button>
          <button className={`btn ${direct ? 'danger' : 'primary'}`} disabled={reason.trim().length < 4} onClick={go}>{direct ? t('delete_now') : t('delete_request')}</button>
        </div>
      </div>
    </div>
  );
}

export function DeleteButton({ table, rowId, label, entityId, small = true, children }: { table: ProtectedTable; rowId: string; label: string; entityId?: string; small?: boolean; children?: ReactNode }) {
  const askDeletion = useStore((s) => s.askDeletion);
  const t = useStore((s) => s.t);
  return <button className={`btn ${small ? 'sm' : ''} danger`} onClick={(e) => { e.stopPropagation(); askDeletion({ table, rowId, label, entityId }); }}>{children ?? t('delete')}</button>;
}

// Excel helpers (SheetJS): rows → .xlsx download, file → rows
export async function downloadXlsx(filename: string, sheets: { name: string; rows: (string | number)[][] }[], toast: (k: 'ok' | 'error' | 'info', t: string) => void): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const sh of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sh.rows);
    ws['!cols'] = sh.rows[0]?.map((_, i) => ({ wch: Math.min(48, Math.max(10, ...sh.rows.map((r) => String(r[i] ?? '').length + 2))) }));
    XLSX.utils.book_append_sheet(wb, ws, sh.name.slice(0, 31));
  }
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  await saveFile(filename, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', toast);
}

export async function readXlsx(file: File): Promise<Record<string, string>[]> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '', raw: false });
}
