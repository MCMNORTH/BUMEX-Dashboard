import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createDraft, updateDraft, deleteDraft, postEntry, reverseEntry, checkPostable, verifyChain, journalEntries, generalLedger, trialBalance, setPeriodStatus, setFiscalYearClosed, createFiscalYear, addAccount, updateAccount, periodFor,
  CHART_TEMPLATES, CHART_COLUMNS, ACCOUNT_KIND_FR, applyChartTemplate, exportChartRows, validateChartImport, applyChartImport, accountBalance, findAccountByCode, chartView, JOURNAL_KINDS, addJournal, updateJournal, deleteJournal, journalUsage,
  thirdPartyRulesFor, setThirdPartyRules, collectiveFor, nextThirdPartyCode,
  fxRate, parseAmount, fmt, r2, type State, type Id, type JournalEntry, type Currency, type Account, type DraftInput, type CoaTemplate, type ChartImportReport, type JournalKind, DomainError,
} from '@bumex/domain';
import { useStore } from '../../store';
import { Tabs, Field, Chip, D, Money, STATUS_KIND, STATUS_FR, saveFile, downloadXlsx, readXlsx, DeleteButton } from '../common';

type Tab = 'entry' | 'journals' | 'gl' | 'tb' | 'closing' | 'coa' | 'setup' | 'integrity';

interface LineDraft { code: string; description: string; debit: string; credit: string; dim: string }
const emptyLine = (): LineDraft => ({ code: '', description: '', debit: '', credit: '', dim: '' });

// "6310" and "631000" both resolve on a chart presented on six digits
function accountOf(state: State, entityId: Id, code: string): Account | undefined {
  const c = code.trim().split(/\s/)[0];
  return c ? findAccountByCode(state, entityId, c) : undefined;
}

export function AccountingPanel({ entityId, initialTab }: { entityId: Id; initialTab?: string | null }) {
  const { state, t, apply, ui } = useStore();
  // [bumex-one] an entity whose chart is not set up yet has no journal to post in: it opens on its chart
  const ready = state.journals.some((j) => j.entityId === entityId);
  const [tab, setTab] = useState<Tab>((initialTab as Tab) || (ready ? 'entry' : 'coa'));
  useEffect(() => { if (initialTab) setTab(initialTab as Tab); }, [initialTab]);
  const tabs = [
    { id: 'entry' as Tab, label: t('tab_entry') },
    { id: 'journals' as Tab, label: <>{t('tab_journals')} <Chip kind="dim">{state.entries.filter((e) => e.entityId === entityId && e.status === 'draft').length} {t('draft').toLowerCase()}</Chip></> },
    { id: 'gl' as Tab, label: t('tab_gl') }, { id: 'tb' as Tab, label: t('tab_tb') }, { id: 'closing' as Tab, label: t('tab_closing') }, { id: 'coa' as Tab, label: t('tab_coa') }, { id: 'setup' as Tab, label: 'Journaux · tiers' }, { id: 'integrity' as Tab, label: t('tab_integrity') },
  ];
  const [editing, setEditing] = useState<Id | null>(null);
  return (
    <>
      <div className="sheet-head">
        <h1>{t('room_accounting')}</h1>
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
      </div>
      <div className="sheet-body">
        {tab === 'entry' && !ready && <div className="banner info">Le plan comptable de cette entité n'est pas encore installé : choisissez-le dans l'onglet « {t('tab_coa')} ». <button className="btn sm" onClick={() => setTab('coa')}>{t('tab_coa')}</button></div>}{/* [bumex-one] */}
        {tab === 'entry' && ready && <EntryForm entityId={entityId} editing={editing} onDone={() => setEditing(null)} />}
        {tab === 'journals' && <Journals entityId={entityId} onEdit={(id) => { setEditing(id); setTab('entry'); }} />}
        {tab === 'gl' && <Ledger entityId={entityId} />}
        {tab === 'tb' && <TrialBalance entityId={entityId} />}
        {tab === 'closing' && <Closing entityId={entityId} />}
        {tab === 'coa' && <Chart entityId={entityId} />}
        {tab === 'setup' && <Setup entityId={entityId} />}
        {tab === 'integrity' && <Integrity entityId={entityId} />}
      </div>
      {void apply}
      {void ui}
    </>
  );
}

function EntryForm({ entityId, editing, onDone }: { entityId: Id; editing: Id | null; onDone: () => void }) {
  const { state, t, apply, toast } = useStore();
  const entity = state.entities.find((e) => e.id === entityId)!;
  const journals = state.journals.filter((j) => j.entityId === entityId);
  const existing = editing ? state.entries.find((e) => e.id === editing) : undefined;
  const [date, setDate] = useState(existing?.date ?? state.today);
  const [journalId, setJournalId] = useState(existing?.journalId ?? journals.find((j) => j.kind === 'misc')!.id);
  const [desc, setDesc] = useState(existing?.description ?? '');
  const [currency, setCurrency] = useState<Currency>(existing?.currency ?? entity.functionalCurrency);
  const [rate, setRate] = useState(existing ? String(existing.fxRate) : '1');
  const [lines, setLines] = useState<LineDraft[]>(
    existing
      ? existing.lines.map((l) => ({ code: state.accounts.find((a) => a.id === l.accountId)?.code ?? '', description: l.description, debit: l.debitTxn ? String(l.debitTxn) : '', credit: l.creditTxn ? String(l.creditTxn) : '', dim: l.customerId ?? l.supplierId ?? '' }))
      : [emptyLine(), emptyLine()],
  );
  const [loadedFor, setLoadedFor] = useState(editing);
  if (loadedFor !== editing) {
    setLoadedFor(editing);
    if (existing) {
      setDate(existing.date); setJournalId(existing.journalId); setDesc(existing.description); setCurrency(existing.currency); setRate(String(existing.fxRate));
      setLines(existing.lines.map((l) => ({ code: state.accounts.find((a) => a.id === l.accountId)?.code ?? '', description: l.description, debit: l.debitTxn ? String(l.debitTxn) : '', credit: l.creditTxn ? String(l.creditTxn) : '', dim: l.customerId ?? l.supplierId ?? '' })));
    }
  }
  const focused = useRef(0);
  const accounts = state.accounts.filter((a) => a.entityId === entityId && a.isPostable && a.active).sort((a, b) => a.code.localeCompare(b.code));
  const customers = state.customers.filter((c) => c.entityId === entityId);
  const suppliers = state.suppliers.filter((s) => s.entityId === entityId);

  const setLine = (i: number, patch: Partial<LineDraft>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const numRate = Number(rate.replace(',', '.')) || 1;
  const totals = useMemo(() => {
    const d = r2(lines.reduce((a, l) => a + (parseAmount(l.debit) ?? 0), 0));
    const c = r2(lines.reduce((a, l) => a + (parseAmount(l.credit) ?? 0), 0));
    return { d, c, diff: r2(d - c) };
  }, [lines]);

  const buildInput = (): DraftInput => ({
    entityId, journalId, date, description: desc || 'Écriture manuelle', currency, fxRate: numRate, sourceType: 'manual',
    lines: lines
      .filter((l) => l.code.trim() && ((parseAmount(l.debit) ?? 0) > 0 || (parseAmount(l.credit) ?? 0) > 0))
      .map((l) => {
        const a = accountOf(state, entityId, l.code);
        return { accountId: a?.id ?? l.code, description: l.description || desc, debitTxn: parseAmount(l.debit) ?? 0, creditTxn: parseAmount(l.credit) ?? 0, customerId: a?.requiresCustomer ? l.dim || undefined : undefined, supplierId: a?.requiresSupplier ? l.dim || undefined : undefined };
      }),
  });

  // live validation on a scratch copy of the state
  const checks = useMemo(() => {
    try {
      const input = buildInput();
      for (const l of input.lines) if (!state.accounts.some((a) => a.id === l.accountId)) return [{ code: 'account', message: `Compte inconnu : ${l.accountId}` }];
      const [tmp, e] = createDraft(state, input);
      return checkPostable(tmp, e.id);
    } catch (err) {
      return [{ code: 'error', message: err instanceof DomainError ? err.message : String(err) }];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, date, journalId, desc, currency, rate, state]);
  let periodInfo = '';
  try {
    const p = periodFor(state, entityId, date);
    const fy = state.fiscalYears.find((f) => f.id === p.fiscalYearId)!;
    periodInfo = `Exercice ${fy.label}${fy.isClosed ? ' (clôturé)' : ''} · période ${p.periodNo} · ${p.status === 'open' ? 'ouverte' : p.status === 'soft_closed' ? 'clôture douce' : 'verrouillée'}`;
  } catch (err) {
    periodInfo = err instanceof Error ? err.message : '';
  }

  const resetForm = () => { setDesc(''); setLines([emptyLine(), emptyLine()]); setDate(state.today); onDone(); };
  const keep = () => {
    const input = buildInput();
    const ok = editing ? apply((s) => updateDraft(s, editing, input), 'Brouillon mis à jour') : apply((s) => createDraft(s, input), 'Brouillon enregistré');
    if (ok) resetForm();
  };
  const post = () => {
    const input = buildInput();
    const ok = apply((s) => {
      let s1: State;
      let id: Id;
      if (editing) { s1 = updateDraft(s, editing, input); id = editing; } else { const [s2, e] = createDraft(s, input); s1 = s2; id = e.id; }
      const [s3, posted] = postEntry(s1, id);
      toast('ok', `Comptabilisée · ${journals.find((j) => j.id === journalId)?.code} ${posted.entryNo}`);
      return s3;
    });
    if (ok) resetForm();
  };
  const balanceLine = (i: number) => {
    const l = lines[i];
    const d = parseAmount(l.debit) ?? 0, c = parseAmount(l.credit) ?? 0;
    const diff = r2(totals.diff - d + c);
    if (diff > 0) setLine(i, { credit: String(diff), debit: '' });
    else if (diff < 0) setLine(i, { debit: String(-diff), credit: '' });
  };
  const onKey = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); post(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); keep(); }
    else if (e.key === 'F2') { e.preventDefault(); balanceLine(focused.current); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); setLines((ls) => [...ls.slice(0, focused.current + 1), { ...ls[focused.current] }, ...ls.slice(focused.current + 1)]); }
  };
  const canPost = checks.length === 0;
  return (
    <div className="cols">
      <form className="grow" onSubmit={(e) => e.preventDefault()} onKeyDown={onKey}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ margin: 0 }}>{editing ? `${t('edit')} · brouillon` : 'Nouvelle écriture'}</h2>
            <span className="small muted">{periodInfo}</span>
          </div>
          <div className="grid4">
            <Field label={`${t('date')} (toute période ouverte)`}><input className="in mono" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label={t('journal')}><select className="in" value={journalId} onChange={(e) => setJournalId(e.target.value)}>{journals.map((j) => <option key={j.id} value={j.id}>{j.code} · {j.name}</option>)}</select></Field>
            <Field label={t('label')}><input className="in" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Pièce / référence" /></Field>
            <Field label={`${t('currency')} · ${t('rate')}`}>
              <div style={{ display: 'flex', gap: 6 }}>
                <select className="in" style={{ width: 90 }} value={currency} onChange={(e) => { const c = e.target.value as Currency; setCurrency(c); try { setRate(String(c === entity.functionalCurrency ? 1 : fxRate(state, c, entity.functionalCurrency, date))); } catch { setRate('1'); } }}>
                  {['MRU', 'EUR', 'USD', 'MAD'].map((c) => <option key={c}>{c}</option>)}
                </select>
                <input className="in num" value={rate} onChange={(e) => setRate(e.target.value)} disabled={currency === entity.functionalCurrency} />
              </div>
            </Field>
          </div>
          <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
            <table>
              <thead><tr><th style={{ width: 36 }}>#</th><th style={{ width: 150 }}>{t('account')}</th><th>Libellé du compte</th><th>Libellé de ligne</th><th style={{ width: 170 }}>{t('dimension')}</th><th className="num" style={{ width: 140 }}>{t('debit')}</th><th className="num" style={{ width: 140 }}>{t('credit')}</th><th style={{ width: 36 }}></th></tr></thead>
              <tbody>
                {lines.map((l, i) => {
                  const a = accountOf(state, entityId, l.code);
                  return (
                    <tr key={i} onFocus={() => (focused.current = i)}>
                      <td className="mono">{i + 1}</td>
                      <td><input className="in mono" list="acc-list" value={l.code} onChange={(e) => setLine(i, { code: e.target.value })} aria-label={`Compte ligne ${i + 1}`} placeholder="code ou nom" /></td>
                      <td className="muted small">{a ? a.nameFr + (a.requiresCustomer ? ' · client requis' : a.requiresSupplier ? ' · fournisseur requis' : '') : l.code ? 'compte inconnu' : ''}</td>
                      <td><input className="in" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} aria-label={`Libellé ligne ${i + 1}`} /></td>
                      <td>
                        {a?.requiresCustomer ? (
                          <select className="in" value={l.dim} onChange={(e) => setLine(i, { dim: e.target.value })} aria-label={`Client ligne ${i + 1}`}><option value="">— client —</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                        ) : a?.requiresSupplier ? (
                          <select className="in" value={l.dim} onChange={(e) => setLine(i, { dim: e.target.value })} aria-label={`Fournisseur ligne ${i + 1}`}><option value="">— fournisseur —</option>{suppliers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                        ) : (
                          <span className="muted small">—</span>
                        )}
                      </td>
                      <td><input className="in num" value={l.debit} onChange={(e) => setLine(i, { debit: e.target.value })} aria-label={`Débit ligne ${i + 1}`} /></td>
                      <td><input className="in num" value={l.credit} onChange={(e) => setLine(i, { credit: e.target.value })} aria-label={`Crédit ligne ${i + 1}`} /></td>
                      <td><button type="button" className="btn sm" aria-label="Supprimer la ligne" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, k) => k !== i) : ls))}>×</button></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5}>
                    <button type="button" className="btn sm" onClick={() => setLines((ls) => [...ls, emptyLine()])}>+ ligne</button>
                    <span style={{ marginLeft: 12 }}>{t('total')} · </span>
                    <Chip kind={totals.diff === 0 && totals.d > 0 ? 'good' : 'warn'}>{totals.diff === 0 && totals.d > 0 ? t('balanced') : `${t('unbalanced')} ${fmt(totals.diff)}`}</Chip>
                  </td>
                  <td className="num">{fmt(totals.d)}</td>
                  <td className="num">{fmt(totals.c)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
            <datalist id="acc-list">{accounts.map((a) => <option key={a.id} value={a.code}>{a.code} {a.nameFr}</option>)}</datalist>
          </div>
          {checks.length > 0 && totals.d + totals.c > 0 && <div className="banner warn">{checks.map((c) => c.message).join(' · ')}</div>}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' }}>
            <span><kbd>Tab</kbd> cellule suivante</span><span><kbd>Ctrl</kbd>+<kbd>D</kbd> dupliquer la ligne</span><span><kbd>F2</kbd> équilibrer sur la ligne</span><span><kbd>Ctrl</kbd>+<kbd>S</kbd> brouillon</span><span><kbd>Ctrl</kbd>+<kbd>Entrée</kbd> comptabiliser</span>
            <div className="actions" style={{ marginLeft: 'auto' }}>
              {editing && <button type="button" className="btn" onClick={resetForm}>Annuler</button>}
              <button type="button" className="btn" onClick={keep}>{t('keep_draft')}</button>
              <button type="button" className="btn primary" disabled={!canPost} onClick={post}>{t('post')}</button>
            </div>
          </div>
        </div>
      </form>
      <aside className="side">
        <Drafts entityId={entityId} onEdit={() => undefined} />
      </aside>
    </div>
  );
}

function Drafts({ entityId, onEdit }: { entityId: Id; onEdit: (id: Id) => void }) {
  const { state, t, apply } = useStore();
  const drafts = state.entries.filter((e) => e.entityId === entityId && e.status === 'draft');
  void onEdit;
  return (
    <div className="card">
      <h2>Brouillons · {drafts.length}</h2>
      {drafts.length === 0 && <div className="muted small">Aucun brouillon : la lampe de la salle est éteinte.</div>}
      {drafts.map((e) => {
        const checks = checkPostable(state, e.id);
        const total = r2(e.lines.reduce((a, l) => a + l.debit, 0));
        return (
          <div key={e.id} style={{ borderTop: '1px solid var(--line)', padding: '8px 0', fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>{e.description}</span>
              <Money v={total} />
            </div>
            <div className="small muted"><D iso={e.date} /> · {state.journals.find((j) => j.id === e.journalId)?.code} · {e.lines.length} lignes</div>
            {checks.length > 0 && <div className="small" style={{ color: 'var(--warn)' }}>{checks.map((c) => c.message).join(' · ')}</div>}
            <div className="actions" style={{ justifyContent: 'flex-start', marginTop: 6 }}>
              <button className="btn sm primary" disabled={checks.length > 0} onClick={() => apply((s) => postEntry(s, e.id), 'Comptabilisée')}>{t('post')}</button>
              <button className="btn sm danger" onClick={() => apply((s) => deleteDraft(s, e.id), 'Brouillon supprimé')}>{t('delete')}</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EntryRow({ e, expanded, onToggle }: { e: JournalEntry; expanded: boolean; onToggle: () => void }) {
  const { state, t, apply } = useStore();
  const j = state.journals.find((x) => x.id === e.journalId);
  const total = r2(e.lines.reduce((a, l) => a + l.debit, 0));
  const chainOk = e.status === 'draft' ? null : verifyChain(state, e.entityId, e.journalId).find((c) => c.entryId === e.id)?.ok;
  return (
    <>
      <tr className="click" onClick={onToggle}>
        <td className="mono">{j?.code} {e.entryNo ? String(e.entryNo).padStart(6, '0') : '—'}</td>
        <td><D iso={e.date} /></td>
        <td>{e.description}</td>
        <td className="muted small">{e.sourceType}{e.postingRule ? ` · ${e.postingRule}` : ''}</td>
        <td className="num">{fmt(total)}</td>
        <td><Chip kind={STATUS_KIND[e.status]}>{STATUS_FR[e.status]}</Chip></td>
        <td>{chainOk === null ? '—' : <Chip kind={chainOk ? 'good' : 'crit'}>{chainOk ? t('hash_ok') : t('hash_bad')}</Chip>}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} style={{ background: '#f6f7f9' }}>
            <table style={{ background: 'transparent' }}>
              <thead><tr><th>#</th><th>{t('account')}</th><th>{t('label')}</th><th>{t('dimension')}</th><th className="num">{t('debit')}</th><th className="num">{t('credit')}</th><th className="num">Devise</th></tr></thead>
              <tbody>
                {e.lines.map((l) => {
                  const a = state.accounts.find((x) => x.id === l.accountId);
                  const dim = l.customerId ? state.customers.find((c) => c.id === l.customerId)?.name : l.supplierId ? state.suppliers.find((c) => c.id === l.supplierId)?.name : '';
                  return (
                    <tr key={l.lineNo}><td className="mono">{l.lineNo}</td><td className="mono">{a?.code} <span className="muted">{a?.nameFr}</span></td><td>{l.description}</td><td className="small">{dim}</td><td className="num">{l.debit ? fmt(l.debit) : ''}</td><td className="num">{l.credit ? fmt(l.credit) : ''}</td><td className="num small muted">{l.currency !== state.entities.find((x) => x.id === e.entityId)?.functionalCurrency ? `${fmt(l.debitTxn || l.creditTxn)} ${l.currency} @ ${l.fxRate}` : ''}</td></tr>
                  );
                })}
              </tbody>
            </table>
            <div className="actions" style={{ marginTop: 8 }}>
              <span className="small muted" style={{ marginRight: 'auto' }}>{e.postedAt ? `Comptabilisée le ${e.postedAt.slice(0, 16).replace('T', ' ')} par ${e.postedBy} · hash ${e.hash?.slice(0, 12)}…` : 'Brouillon'}</span>
              {e.status === 'posted' && <button className="btn sm" onClick={() => { const reason = prompt('Motif de l\'extourne ?', 'erreur de saisie'); if (reason !== null) apply((s) => reverseEntry(s, e.id, s.today, reason), 'Extournée'); }}>{t('reverse')}</button>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Journals({ entityId, onEdit }: { entityId: Id; onEdit: (id: Id) => void }) {
  const { state, t, ui } = useStore();
  const [journalId, setJournalId] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState<Id | null>(null);
  const fy = state.fiscalYears.find((f) => f.entityId === entityId && f.label === ui.fiscalYearLabel);
  const rows = journalEntries(state, entityId, { journalId: journalId || undefined, status: (status || undefined) as JournalEntry['status'] | undefined, fiscalYearId: fy?.id }).slice(0, 200);
  return (
    <div className="card flush">
      <div style={{ display: 'flex', gap: 8, padding: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <select className="in" style={{ width: 220 }} value={journalId} onChange={(e) => setJournalId(e.target.value)}><option value="">Tous les journaux</option>{state.journals.filter((j) => j.entityId === entityId).map((j) => <option key={j.id} value={j.id}>{j.code} · {j.name}</option>)}</select>
        <select className="in" style={{ width: 180 }} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Tous statuts</option><option value="draft">Brouillons</option><option value="posted">Comptabilisées</option><option value="reversed">Extournées</option></select>
        <span className="muted small">Exercice {ui.fiscalYearLabel} · {rows.length} écritures · cliquer une ligne pour les détails</span>
        {rows.some((r) => r.status === 'draft') && <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => onEdit(rows.find((r) => r.status === 'draft')!.id)}>{t('edit')} le premier brouillon</button>}
      </div>
      <table>
        <thead><tr><th>Journal · n°</th><th>{t('date')}</th><th>{t('label')}</th><th>Source</th><th className="num">{t('amount')}</th><th>{t('status')}</th><th>{t('tab_integrity')}</th></tr></thead>
        <tbody>{rows.map((e) => <EntryRow key={e.id} e={e} expanded={open === e.id} onToggle={() => setOpen(open === e.id ? null : e.id)} />)}</tbody>
      </table>
    </div>
  );
}

function Ledger({ entityId }: { entityId: Id }) {
  const { state, t, ui } = useStore();
  const accounts = state.accounts.filter((a) => a.entityId === entityId && a.isPostable && a.active).sort((a, b) => (a.isAuxiliary === b.isAuxiliary ? a.code.localeCompare(b.code) : a.isAuxiliary ? 1 : -1));
  const [code, setCode] = useState(() => findAccountByCode(state, entityId, '4100')?.code ?? accounts[0]?.code ?? '');
  const a = findAccountByCode(state, entityId, code.split(' ')[0]);
  const fy = state.fiscalYears.find((f) => f.entityId === entityId && f.label === ui.fiscalYearLabel);
  const rows = a ? generalLedger(state, entityId, a.id, { from: fy?.start, to: fy?.end }) : [];
  return (
    <div className="card flush">
      <div style={{ display: 'flex', gap: 8, padding: 10, alignItems: 'center' }}>
        <input className="in mono" style={{ width: 260 }} list="gl-list" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Compte" />
        <datalist id="gl-list">{accounts.map((x) => <option key={x.id} value={x.code}>{x.code} {x.nameFr}{x.isAuxiliary ? ' (auxiliaire)' : ''}</option>)}</datalist>
        <span>{a?.nameFr}{a && !a.isAuxiliary && state.accounts.some((x) => x.collectiveId === a.id) ? <span className="small muted"> · collectif, auxiliaires inclus</span> : null}</span>
        <span className="muted small" style={{ marginLeft: 'auto' }}>Exercice {ui.fiscalYearLabel} · solde <b className="mono">{fmt(rows.length ? rows[rows.length - 1].running : 0)}</b></span>
      </div>
      <table>
        <thead><tr><th>{t('date')}</th><th>Journal · n°</th><th>{t('label')}</th><th className="num">{t('debit')}</th><th className="num">{t('credit')}</th><th className="num">Solde</th></tr></thead>
        <tbody>
          {rows.map(({ entry, line, running }) => (
            <tr key={entry.id + line.lineNo}><td><D iso={entry.date} /></td><td className="mono">{state.journals.find((j) => j.id === entry.journalId)?.code} {String(entry.entryNo).padStart(6, '0')}</td><td>{line.description}</td><td className="num">{line.debit ? fmt(line.debit) : ''}</td><td className="num">{line.credit ? fmt(line.credit) : ''}</td><td className="num">{fmt(running)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrialBalance({ entityId }: { entityId: Id }) {
  const { state, t, ui } = useStore();
  const fy = state.fiscalYears.find((f) => f.entityId === entityId && f.label === ui.fiscalYearLabel);
  const [aux, setAux] = useState(false);
  const rows = trialBalance(state, entityId, { fiscalYearId: fy?.id, auxiliaries: aux });
  const td = r2(rows.reduce((a, r) => a + r.debit, 0)), tc = r2(rows.reduce((a, r) => a + r.credit, 0));
  const toast = useStore((s) => s.toast);
  const exportCsv = async () => {
    const csv = '\ufeff' + ['Compte;Libellé;Débit;Crédit;Solde', ...rows.map((r) => `${r.code};${r.name};${r.debit};${r.credit};${r.balance}`)].join('\n');
    await saveFile(`balance-${ui.fiscalYearLabel}.csv`, csv, 'text/csv;charset=utf-8', toast);
  };
  return (
    <div className="card flush">
      <div style={{ display: 'flex', gap: 8, padding: 10, alignItems: 'center' }}>
        <b>Balance · exercice {ui.fiscalYearLabel}</b>
        <Chip kind={td === tc ? 'good' : 'crit'}>{td === tc ? 'équilibrée' : 'déséquilibrée'}</Chip>
        <label className="small" style={{ marginLeft: 'auto' }}><input type="checkbox" checked={aux} onChange={(e) => setAux(e.target.checked)} /> détail des comptes auxiliaires (balance tiers)</label>
        <button className="btn sm" onClick={exportCsv}>Exporter (CSV pour Excel)</button>
      </div>
      <table>
        <thead><tr><th>{t('account')}</th><th>{t('label')}</th><th className="num">{t('debit')}</th><th className="num">{t('credit')}</th><th className="num">Solde</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.accountId}><td className="mono">{r.code}</td><td>{r.name}</td><td className="num">{fmt(r.debit)}</td><td className="num">{fmt(r.credit)}</td><td className="num">{fmt(r.balance)}</td></tr>)}</tbody>
        <tfoot><tr><td colSpan={2}>{t('total')}</td><td className="num">{fmt(td)}</td><td className="num">{fmt(tc)}</td><td className="num">{fmt(r2(td - tc))}</td></tr></tfoot>
      </table>
    </div>
  );
}

function Closing({ entityId }: { entityId: Id }) {
  const { state, t, apply } = useStore();
  const fys = state.fiscalYears.filter((f) => f.entityId === entityId).sort((a, b) => b.label.localeCompare(a.label));
  const nextYear = Math.max(...fys.map((f) => Number(f.label))) + 1;
  const prevYear = Math.min(...fys.map((f) => Number(f.label))) - 1;
  return (
    <div className="cols">
      <div className="grow">
        {fys.map((fy) => {
          const periods = state.periods.filter((p) => p.fiscalYearId === fy.id).sort((a, b) => a.periodNo - b.periodNo);
          const drafts = state.entries.filter((e) => e.fiscalYearId === fy.id && e.status === 'draft').length;
          return (
            <div className="card" key={fy.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0 }}>Exercice {fy.label}</h2>
                <Chip kind={fy.isClosed ? 'dim' : 'good'}>{fy.isClosed ? t('closed') : 'Ouvert'}</Chip>
                <span className="small muted">{drafts} brouillon(s) · {periods.filter((p) => p.status === 'locked').length}/12 périodes verrouillées</span>
                <div className="actions" style={{ marginLeft: 'auto' }}>
                  {fy.isClosed ? <button className="btn sm" onClick={() => apply((s) => setFiscalYearClosed(s, fy.id, false), `Exercice ${fy.label} rouvert`)}>Rouvrir (associé)</button> : <button className="btn sm" onClick={() => apply((s) => setFiscalYearClosed(s, fy.id, true), `Exercice ${fy.label} clôturé`)}>Clôturer l'exercice</button>}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 6, marginTop: 10 }}>
                {periods.map((p) => {
                  const pd = state.entries.filter((e) => e.periodId === p.id && e.status === 'draft').length;
                  return (
                    <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 8, fontSize: 12, background: p.status === 'locked' ? '#f3f4f6' : '#fff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{p.start.slice(0, 7)}</b><Chip kind={p.status === 'open' ? 'good' : p.status === 'soft_closed' ? 'warn' : 'dim'}>{p.status === 'open' ? t('open') : p.status === 'soft_closed' ? t('soft') : t('locked')}</Chip></div>
                      <div className="muted">{pd} brouillon(s)</div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                        {p.status !== 'open' && <button className="btn sm" onClick={() => apply((s) => setPeriodStatus(s, p.id, 'open'), 'Période ouverte')}>Ouvrir</button>}
                        {p.status !== 'soft_closed' && <button className="btn sm" onClick={() => apply((s) => setPeriodStatus(s, p.id, 'soft_closed'), 'Clôture douce')}>Douce</button>}
                        {p.status !== 'locked' && <button className="btn sm" onClick={() => apply((s) => setPeriodStatus(s, p.id, 'locked'), 'Période verrouillée')}>Verrouiller</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <aside className="side">
        <div className="card">
          <h2>Règles</h2>
          <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            <li>Une écriture se comptabilise dans toute période ouverte, quel que soit le jour : les exercices passés se saisissent depuis l'ERP.</li>
            <li>Verrouiller une période : associé, zéro brouillon. Clôture douce : seuls les associés comptabilisent.</li>
            <li>Clôturer un exercice : toutes les périodes verrouillées, zéro brouillon, associé. Rouvrir : associé, journalisé.</li>
            <li>Les numéros d'écriture sont continus par exercice ; la chaîne d'intégrité suit l'ordre de comptabilisation.</li>
          </ul>
        </div>
        <div className="card">
          <h2>Exercices</h2>
          <div className="actions" style={{ justifyContent: 'flex-start' }}>
            <button className="btn sm" onClick={() => apply((s) => createFiscalYear(s, entityId, prevYear), `Exercice ${prevYear} créé`)}>+ exercice {prevYear}</button>
            <button className="btn sm" onClick={() => apply((s) => createFiscalYear(s, entityId, nextYear), `Exercice ${nextYear} créé`)}>+ exercice {nextYear}</button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Chart({ entityId }: { entityId: Id }) {
  const { state, t, apply, toast } = useStore();
  const [q, setQ] = useState('');
  const [cls, setCls] = useState('');
  const [view, setView] = useState<'moving' | 'unused' | 'all' | 'auxiliary'>('moving');
  const [editId, setEditId] = useState<Id | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [kind, setKind] = useState<Account['kind']>('income');
  const [postable, setPostable] = useState(true);
  const [active, setActive] = useState(true);
  const [dim, setDim] = useState<'' | 'customer' | 'supplier' | 'engagement'>('');
  const [report, setReport] = useState<ChartImportReport | null>(null);
  const [importName, setImportName] = useState('');
  const [template, setTemplate] = useState<CoaTemplate>(state.entities.find((e) => e.id === entityId)!.coaTemplate);
  const fileRef = useRef<HTMLInputElement>(null);
  const all = state.accounts.filter((a) => a.entityId === entityId && !a.isAuxiliary);
  const viewRows = useMemo(() => chartView(state, entityId, view), [state, entityId, view]);
  const rows = viewRows.filter(({ account: a }) => (!q || a.code.startsWith(q) || a.nameFr.toLowerCase().includes(q.toLowerCase())) && (!cls || a.code.startsWith(cls)));
  const entity = state.entities.find((e) => e.id === entityId)!;
  const tpl = CHART_TEMPLATES.find((x) => x.id === entity.coaTemplate);
  const hasEntries = state.entries.some((e) => e.entityId === entityId);
  const editing = editId ? all.find((a) => a.id === editId) : undefined;
  const used = (a: Account) => state.entries.some((e) => e.entityId === entityId && e.lines.some((l) => l.accountId === a.id));
  const load = (a: Account | null) => { setEditId(a?.id ?? null); setCode(a?.code ?? ''); setName(a?.nameFr ?? ''); setNameEn(a?.nameEn ?? ''); setKind(a?.kind ?? 'income'); setPostable(a ? a.isPostable : true); setActive(a ? a.active : true); setDim(a?.requiresCustomer ? 'customer' : a?.requiresSupplier ? 'supplier' : a?.requiresEngagement ? 'engagement' : ''); };
  const save = () => {
    const ok = apply((s) => {
      if (editing) return updateAccount(s, editing.id, { nameFr: name.trim(), nameEn: nameEn.trim() || undefined, kind, isPostable: postable, active, requiresCustomer: dim === 'customer', requiresSupplier: dim === 'supplier', requiresEngagement: dim === 'engagement' });
      const [s1, a] = addAccount(s, entityId, code.trim(), name.trim() || code, kind);
      return updateAccount(s1, a.id, { nameEn: nameEn.trim() || undefined, isPostable: postable, requiresCustomer: dim === 'customer', requiresSupplier: dim === 'supplier', requiresEngagement: dim === 'engagement' });
    }, editing ? `Compte ${editing.code} modifié` : `Compte ${code} créé`);
    if (ok) load(null);
  };
  const exportXlsx = () => downloadXlsx(`plan-comptable-${entity.code}-${entity.coaTemplate}.xlsx`, [{ name: 'Plan comptable', rows: exportChartRows(state, entityId) }, { name: 'Mode d\'emploi', rows: [['Colonne', 'Attendu'], ['Numéro', '2 à 8 chiffres ; la classe est le premier chiffre'], ['Intitulé', 'obligatoire'], ['Intitulé (EN)', 'facultatif'], ['Classe', 'facultatif, doit correspondre au premier chiffre du numéro'], ['Type', 'Actif, Passif, Capitaux propres, Produit, Charge (déduit de la classe sauf classe 4)'], ['Imputable', 'oui / non (défaut : oui pour un compte à 3 chiffres et plus)'], ['Dimension', 'client, fournisseur, mission ou vide'], ['Actif', 'oui / non']] }], toast);
  const templateXlsx = () => downloadXlsx(`modele-plan-comptable.xlsx`, [{ name: 'Plan comptable', rows: [[...CHART_COLUMNS], ['7011', 'Prestations d\'audit', 'Audit fees', '7', 'Produit', 'oui', 'mission', 'oui'], ['6221', 'Loyers', 'Rent', '6', 'Charge', 'oui', '', 'oui'], ['4111', 'Clients', 'Trade receivables', '4', 'Actif', 'oui', 'client', 'oui']] }], toast);
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const raw = await readXlsx(f);
      const pick = (r: Record<string, string>, ...keys: string[]) => { for (const k of Object.keys(r)) if (keys.some((x) => k.trim().toLowerCase().startsWith(x))) return String(r[k] ?? ''); return ''; };
      const rowsIn = raw.map((r) => ({ code: pick(r, 'numéro', 'numero', 'code', 'compte'), nameFr: pick(r, 'intitulé', 'intitule', 'libellé', 'libelle', 'nom'), nameEn: pick(r, 'intitulé (en)', 'intitule (en)', 'name'), cls: pick(r, 'classe'), kind: pick(r, 'type'), postable: pick(r, 'imputable'), dimension: pick(r, 'dimension'), active: pick(r, 'actif') }));
      setReport(validateChartImport(state, entityId, rowsIn));
      setImportName(f.name);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    }
    if (fileRef.current) fileRef.current.value = '';
  };
  const applyImport = () => { if (!report) return; if (apply((s) => applyChartImport(s, entityId, report), 'Plan comptable importé')) { setReport(null); setImportName(''); } };
  return (
    <div className="cols">
      <div className="grow">
        <div className="card">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div><b>Plan actif · {tpl?.name ?? entity.coaTemplate}</b><div className="small muted">{all.length} comptes présentés sur {entity.accountCodeLength ?? 6} chiffres · {all.filter((a) => a.isPostable && a.active).length} imputables · utilisé par tous les modules de {entity.name}</div></div>
            <span style={{ marginLeft: 'auto' }} />
            <select className="in" style={{ width: 300 }} value={template} onChange={(e) => setTemplate(e.target.value as CoaTemplate)}>{CHART_TEMPLATES.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.country} · {x.accounts} comptes</option>)}</select>
            <button className="btn sm" onClick={() => apply((s) => applyChartTemplate(s, entityId, template, 'merge'), `Plan complété avec ${template}`)}>Compléter avec ce plan</button>
            <button className="btn sm danger" disabled={hasEntries} title={hasEntries ? 'Des écritures existent : remplacement impossible' : ''} onClick={() => { if (confirm(`Remplacer le plan de ${entity.name} par ${template} ? Les comptes, codes taxe et clés de paramétrage sont réinitialisés.`)) apply((s) => applyChartTemplate(s, entityId, template, 'replace'), `Plan ${template} activé`); }}>Remplacer (entité vierge)</button>
          </div>
          <div className="actions" style={{ justifyContent: 'flex-start', marginTop: 10, flexWrap: 'wrap' }}>
            <button className="btn sm" onClick={exportXlsx}>Exporter le plan (Excel)</button>
            <button className="btn sm" onClick={templateXlsx}>Télécharger le modèle Excel</button>
            <button className="btn sm primary" onClick={() => fileRef.current?.click()}>Importer un fichier Excel…</button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={(e) => onFile(e.target.files?.[0])} aria-label="Fichier Excel du plan comptable" />
            <span className="small muted">Exporter → compléter dans Excel → réimporter : les comptes existants sont mis à jour, les nouveaux créés, les anomalies bloquées avant toute écriture.</span>
          </div>
        </div>
        {report && (
          <div className="card">
            <h2>Contrôle de l'import · {importName}</h2>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0 10px' }}>
              <Chip kind="good">{report.toCreate} à créer</Chip><Chip kind="warn">{report.toUpdate} à modifier</Chip><Chip kind="dim">{report.unchanged} inchangés</Chip><Chip kind={report.errors.length ? 'crit' : 'good'}>{report.errors.length} erreur(s)</Chip><Chip kind={report.warnings.length ? 'warn' : 'dim'}>{report.warnings.length} avertissement(s)</Chip>
            </div>
            {report.errors.length > 0 && <table><thead><tr><th>Ligne</th><th>Compte</th><th>Erreur bloquante</th></tr></thead><tbody>{report.errors.map((e, i) => <tr key={i}><td className="mono">{e.line}</td><td className="mono">{e.code}</td><td style={{ color: 'var(--crit)' }}>{e.message}</td></tr>)}</tbody></table>}
            {report.warnings.length > 0 && <table style={{ marginTop: 8 }}><thead><tr><th>Ligne</th><th>Compte</th><th>Avertissement</th></tr></thead><tbody>{report.warnings.map((e, i) => <tr key={i}><td className="mono">{e.line}</td><td className="mono">{e.code}</td><td>{e.message}</td></tr>)}</tbody></table>}
            {report.errors.length === 0 && report.rows.filter((r) => r.action !== 'unchanged').length > 0 && (
              <table style={{ marginTop: 8 }}><thead><tr><th>Action</th><th>Compte</th><th>Intitulé</th><th>Type</th><th>Imputable</th><th>Dimension</th><th>Actif</th></tr></thead><tbody>{report.rows.filter((r) => r.action !== 'unchanged').slice(0, 60).map((r) => <tr key={r.line}><td><Chip kind={r.action === 'create' ? 'good' : 'warn'}>{r.action === 'create' ? 'créer' : 'modifier'}</Chip></td><td className="mono">{r.code}</td><td>{r.nameFr}</td><td>{ACCOUNT_KIND_FR[r.kind]}</td><td>{r.isPostable ? 'oui' : 'non'}</td><td className="small">{r.requiresCustomer ? 'client' : r.requiresSupplier ? 'fournisseur' : r.requiresEngagement ? 'mission' : ''}</td><td>{r.active ? 'oui' : 'non'}</td></tr>)}</tbody></table>
            )}
            <div className="actions" style={{ marginTop: 10 }}>
              <button className="btn" onClick={() => setReport(null)}>Annuler</button>
              <button className="btn primary" disabled={report.errors.length > 0 || report.toCreate + report.toUpdate === 0} onClick={applyImport}>Appliquer {report.toCreate + report.toUpdate} changement(s)</button>
            </div>
          </div>
        )}
        <div className="card flush">
          <div style={{ display: 'flex', gap: 8, padding: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {([['moving', 'Comptes mouvementés'], ['unused', 'Non mouvementés'], ['auxiliary', 'Comptes auxiliaires'], ['all', 'Tout le plan']] as const).map(([k, l]) => <button key={k} className={`btn sm ${view === k ? 'on' : ''}`} onClick={() => setView(k)}>{l}</button>)}
            <input className="in" style={{ width: 220 }} placeholder="Filtrer par numéro ou intitulé" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filtrer" />
            <select className="in" style={{ width: 140 }} value={cls} onChange={(e) => setCls(e.target.value)} aria-label="Classe"><option value="">Toutes classes</option>{['1', '2', '3', '4', '5', '6', '7', '8', '9'].filter((c) => all.some((a) => a.code.startsWith(c))).map((c) => <option key={c} value={c}>Classe {c}</option>)}</select>
            <span className="muted small">{rows.length} comptes{view === 'moving' ? ' avec écritures' : view === 'unused' ? ' sans écriture, racines et regroupements' : view === 'auxiliary' ? ' de tiers, rattachés à leur collectif' : ''} · cliquer pour modifier</span>
          </div>
          <table>
            <thead><tr><th>{t('account')}</th><th>{t('label')}</th><th>Type</th>{view === 'auxiliary' && <th>Collectif</th>}<th className="num">{t('debit')}</th><th className="num">{t('credit')}</th><th className="num">Solde</th><th></th></tr></thead>
            <tbody>{rows.map(({ account: a, debit, credit, balance, entries, collective }) => <tr key={a.id} className={a.id === editId ? 'sel' : ''} onClick={() => !a.isStatutory && !a.isAuxiliary && load(a)} style={{ cursor: a.isStatutory || a.isAuxiliary ? 'default' : 'pointer', opacity: a.active ? 1 : 0.55 }}><td className="mono">{a.code}</td><td>{a.nameFr}{a.nameEn ? <span className="small muted"> · {a.nameEn}</span> : null}{!a.active ? <Chip kind="off"> inactif</Chip> : null}{!a.isPostable && !a.isStatutory ? <span className="small muted"> · regroupement</span> : null}{a.requiresCustomer ? <span className="small muted"> · tiers client</span> : a.requiresSupplier ? <span className="small muted"> · tiers fournisseur</span> : a.requiresEngagement ? <span className="small muted"> · mission</span> : null}</td><td>{ACCOUNT_KIND_FR[a.kind]}</td>{view === 'auxiliary' && <td className="mono small">{collective ? `${collective.code} ${collective.nameFr}` : '—'}</td>}<td className="num">{entries ? fmt(debit, 0) : ''}</td><td className="num">{entries ? fmt(credit, 0) : ''}</td><td className="num">{entries ? fmt(balance, 0) : ''}</td><td onClick={(e) => e.stopPropagation()}>{!a.isStatutory && !a.isAuxiliary && !used(a) && <DeleteButton table="account" rowId={a.id} label={`Compte ${a.code} ${a.nameFr}`} entityId={entityId} />}</td></tr>)}{rows.length === 0 && <tr><td colSpan={8} className="muted small">Aucun compte dans cette vue</td></tr>}</tbody>
          </table>
        </div>
      </div>
      <aside className="side">
        <div className="card">
          <h2>{editing ? `Compte ${editing.code}` : 'Nouveau compte'}</h2>
          {!editing && <Field label="Numéro (3 à 8 chiffres)"><input className="in mono" value={code} onChange={(e) => setCode(e.target.value)} placeholder="7017121" /></Field>}
          <Field label="Intitulé" style={{ marginTop: 8 }}><input className="in" value={name} onChange={(e) => setName(e.target.value)} placeholder="Audit · export" /></Field>
          <Field label="Intitulé (EN)" style={{ marginTop: 8 }}><input className="in" value={nameEn} onChange={(e) => setNameEn(e.target.value)} /></Field>
          <div className="grid2" style={{ marginTop: 8 }}>
            <Field label="Type"><select className="in" value={kind} onChange={(e) => setKind(e.target.value as Account['kind'])}>{(Object.keys(ACCOUNT_KIND_FR) as Account['kind'][]).map((k) => <option key={k} value={k}>{ACCOUNT_KIND_FR[k]}</option>)}</select></Field>
            <Field label="Dimension requise"><select className="in" value={dim} onChange={(e) => setDim(e.target.value as typeof dim)}><option value="">aucune</option><option value="customer">client</option><option value="supplier">fournisseur</option><option value="engagement">mission</option></select></Field>
          </div>
          <label className="small" style={{ display: 'block', marginTop: 8 }}><input type="checkbox" checked={postable} onChange={(e) => setPostable(e.target.checked)} /> Imputable (accepte des écritures)</label>
          {editing && <label className="small" style={{ display: 'block', marginTop: 4 }}><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Actif (proposé dans les saisies)</label>}
          <div className="actions" style={{ marginTop: 10 }}>{editing && <button className="btn" onClick={() => load(null)}>Annuler</button>}<button className="btn primary" disabled={(!editing && !code.trim()) || !name.trim()} onClick={save}>{editing ? 'Enregistrer' : 'Créer'}</button></div>
          <div className="small muted" style={{ marginTop: 8 }}>Un numéro court est présenté sur {entity.accountCodeLength ?? 6} chiffres (4100 → 410000). Un compte créé ici est aussitôt proposé dans les factures, la saisie, les catégories d'immobilisations et les codes taxe ; un compte utilisé par des écritures ne peut être que désactivé, jamais supprimé.</div>
        </div>
      </aside>
    </div>
  );
}

function Setup({ entityId }: { entityId: Id }) {
  const { state, apply, t } = useStore();
  const journals = state.journals.filter((j) => j.entityId === entityId).sort((a, b) => a.code.localeCompare(b.code));
  const [editId, setEditId] = useState<Id | null>(null);
  const editing = journals.find((j) => j.id === editId);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<JournalKind>('misc');
  const load = (id: Id | null) => { const j = journals.find((x) => x.id === id); setEditId(id); setCode(j?.code ?? ''); setName(j?.name ?? ''); setKind(j?.kind ?? 'misc'); };
  const save = () => { if (apply((s) => (editing ? updateJournal(s, editing.id, { code, name, kind }) : addJournal(s, { entityId, code, name, kind })), editing ? 'Journal modifié' : 'Journal créé')) load(null); };
  const rules = thirdPartyRulesFor(state, entityId);
  const [cp, setCp] = useState(rules.customerPrefix);
  const [sp, setSp] = useState(rules.supplierPrefix);
  const [digits, setDigits] = useState(String(rules.digits));
  const [cc, setCc] = useState(rules.customerCollectiveId ?? '');
  const [sc, setSc] = useState(rules.supplierCollectiveId ?? '');
  const collectives = state.accounts.filter((a) => a.entityId === entityId && a.active && !a.isAuxiliary && a.code.startsWith('4')).sort((a, b) => a.code.localeCompare(b.code));
  const defaultCustomer = (() => { try { return collectiveFor(state, entityId, 'customer'); } catch { return undefined; } })();
  const defaultSupplier = (() => { try { return collectiveFor(state, entityId, 'supplier'); } catch { return undefined; } })();
  return (
    <div className="grid2">
      <div className="card flush">
        <div style={{ display: 'flex', gap: 8, padding: 10, alignItems: 'center' }}>
          <b>Journaux comptables</b>
          <span className="small muted">code, intitulé et type libres · un journal porteur d'écritures comptabilisées est conservé</span>
          <button className="btn sm primary" style={{ marginLeft: 'auto' }} onClick={() => load(null)}>Nouveau journal</button>
        </div>
        <table>
          <thead><tr><th>Code</th><th>Intitulé</th><th>Type</th><th className="num">Écritures</th><th>Utilisation</th><th></th></tr></thead>
          <tbody>{journals.map((j) => { const u = journalUsage(state, j.id); return <tr key={j.id} className={j.id === editId ? 'sel' : ''}><td className="mono">{j.code}</td><td>{j.name}</td><td>{JOURNAL_KINDS.find((k) => k.id === j.kind)?.name}</td><td className="num">{u.posted}{u.drafts ? ` (+${u.drafts} brouillon)` : ''}</td><td className="small muted">{[u.banks ? `${u.banks} compte(s) bancaire(s)` : '', u.loans ? `${u.loans} emprunt(s)` : ''].filter(Boolean).join(' · ') || '—'}</td><td style={{ whiteSpace: 'nowrap' }}><button className="btn sm" onClick={() => load(j.id)}>{t('edit')}</button> {u.posted === 0 && u.drafts === 0 && u.banks === 0 && u.loans === 0 && <button className="btn sm danger" onClick={() => { if (confirm(`Supprimer le journal ${j.code} ?`)) apply((s) => deleteJournal(s, j.id), 'Journal supprimé'); }}>{t('delete')}</button>}</td></tr>; })}</tbody>
        </table>
        <div className="card" style={{ margin: 10 }}>
          <h2>{editing ? `Journal ${editing.code}` : 'Nouveau journal'}</h2>
          <div className="grid3">
            <Field label="Code"><input className="in mono" value={code} onChange={(e) => setCode(e.target.value)} placeholder="BQ2" /></Field>
            <Field label="Intitulé"><input className="in" value={name} onChange={(e) => setName(e.target.value)} placeholder="Banque Attijari" /></Field>
            <Field label="Type"><select className="in" value={kind} onChange={(e) => setKind(e.target.value as JournalKind)}>{JOURNAL_KINDS.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select></Field>
          </div>
          <div className="actions" style={{ marginTop: 10 }}>{editing && <button className="btn" onClick={() => load(null)}>Annuler</button>}<button className="btn primary" disabled={!code.trim() || !name.trim()} onClick={save}>{editing ? 'Enregistrer' : 'Créer'}</button></div>
          {editing && journalUsage(state, editing.id).posted > 0 && <div className="small muted" style={{ marginTop: 6 }}>Ce journal porte des écritures comptabilisées : code et intitulé restent modifiables, le type est figé.</div>}
        </div>
      </div>
      <div className="card">
        <h2>Comptes auxiliaires des tiers</h2>
        <div className="small muted">Chaque client et chaque fournisseur reçoit un code auxiliaire unique (généré selon ces règles ou saisi) et un compte auxiliaire rattaché au collectif. Les écritures des tiers vont sur ces comptes ; la balance les replie dans le collectif.</div>
        <div className="grid3" style={{ marginTop: 10 }}>
          <Field label="Préfixe clients"><input className="in mono" value={cp} onChange={(e) => setCp(e.target.value.toUpperCase())} /></Field>
          <Field label="Préfixe fournisseurs"><input className="in mono" value={sp} onChange={(e) => setSp(e.target.value.toUpperCase())} /></Field>
          <Field label="Chiffres"><input className="in num" value={digits} onChange={(e) => setDigits(e.target.value)} /></Field>
        </div>
        <div className="grid2" style={{ marginTop: 8 }}>
          <Field label="Collectif clients"><select className="in mono" value={cc} onChange={(e) => setCc(e.target.value)}><option value="">{defaultCustomer ? `Paramétrage · ${defaultCustomer.code} ${defaultCustomer.nameFr}` : '—'}</option>{collectives.map((a) => <option key={a.id} value={a.id}>{a.code} {a.nameFr}</option>)}</select></Field>
          <Field label="Collectif fournisseurs"><select className="in mono" value={sc} onChange={(e) => setSc(e.target.value)}><option value="">{defaultSupplier ? `Paramétrage · ${defaultSupplier.code} ${defaultSupplier.nameFr}` : '—'}</option>{collectives.map((a) => <option key={a.id} value={a.id}>{a.code} {a.nameFr}</option>)}</select></Field>
        </div>
        <div className="small muted" style={{ marginTop: 8 }}>Prochains codes : client <span className="mono">{(() => { try { return nextThirdPartyCode(state, entityId, 'customer'); } catch { return '—'; } })()}</span> · fournisseur <span className="mono">{(() => { try { return nextThirdPartyCode(state, entityId, 'supplier'); } catch { return '—'; } })()}</span></div>
        <div className="actions" style={{ marginTop: 10 }}><button className="btn primary" onClick={() => apply((s) => setThirdPartyRules(s, entityId, { customerPrefix: cp, supplierPrefix: sp, digits: Number(digits) || 3, customerCollectiveId: cc || undefined, supplierCollectiveId: sc || undefined }), 'Règles des tiers enregistrées')}>Enregistrer les règles</button></div>
        <div className="small muted" style={{ marginTop: 8 }}>Les comptes auxiliaires existants se consultent dans Plan comptable › Comptes auxiliaires ; leur code et leur collectif se changent depuis la fiche du client ou du fournisseur.</div>
      </div>
    </div>
  );
}

function Integrity({ entityId }: { entityId: Id }) {
  const { state, t } = useStore();
  const journals = state.journals.filter((j) => j.entityId === entityId);
  return (
    <div className="card flush">
      <table>
        <thead><tr><th>Journal</th><th className="num">Écritures scellées</th><th className="num">Vérifiées</th><th>État</th><th>Dernier hash</th></tr></thead>
        <tbody>
          {journals.map((j) => {
            const checks = verifyChain(state, entityId, j.id);
            const ok = checks.filter((c) => c.ok).length;
            const head = state.chains[`${entityId}|${j.id}`];
            return <tr key={j.id}><td>{j.code} · {j.name}</td><td className="num">{checks.length}</td><td className="num">{ok}</td><td><Chip kind={checks.length === ok ? 'good' : 'crit'}>{checks.length === ok ? t('hash_ok') : t('hash_bad')}</Chip></td><td className="mono small muted">{head?.lastHash ? head.lastHash.slice(0, 20) + '…' : '—'}</td></tr>;
          })}
        </tbody>
      </table>
      <div className="small muted" style={{ padding: 10 }}>Chaque écriture comptabilisée est hachée (SHA-256) avec le hash de la précédente dans le même journal ; une modification directe en base casse la chaîne et apparaît ici en rouge.</div>
    </div>
  );
}
