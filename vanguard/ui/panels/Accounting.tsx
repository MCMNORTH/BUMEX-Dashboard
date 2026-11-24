import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createDraft, updateDraft, deleteDraft, postEntry, reverseEntry, checkPostable, verifyChain, journalEntries, generalLedger, trialBalance, setPeriodStatus, setFiscalYearClosed, createFiscalYear, addAccount, updateAccount, periodFor,
  CHART_TEMPLATES, CHART_COLUMNS, ACCOUNT_KIND_FR, applyChartTemplate, exportChartRows, validateChartImport, applyChartImport, accountBalance, findAccountByCode, chartView, JOURNAL_KINDS, addJournal, updateJournal, deleteJournal, journalUsage,
  thirdPartyRulesFor, setThirdPartyRules, collectiveFor, nextThirdPartyCode,
  fxRate, parseAmount, fmt, r2, type State, type Id, type JournalEntry, type Currency, type Account, type DraftInput, type CoaTemplate, type ChartImportReport, type JournalKind, DomainError,
} from '@bumex/domain';
import { useStore } from '../../store';
import { FxRevaluationCard } from '../../one/FxRevaluation'; // [bumex-one] foreign currencies revalued at year end
import { ManagementRules, CorrectionAccounts } from '../../one/AccountingRules'; // [bumex-one] Sidaty's corrections (2026-11-23)
import { Tabs, Field, Chip, D, Money, STATUS_KIND, STATUS_FR, StatusChip, saveFile, downloadXlsx, readXlsx, DeleteButton } from '../common';
import { confirmAsk, textAsk } from '../../one/ask'; // [bumex-one] Fluent's dialog, not the browser's (2026-11-20)
import { Select, Suggest } from '../Select';
import { WideNote } from '../../one/WideNote'; // [mobile]
import { useSay } from '../../one/say';
import { englishMessage } from '../../one/engine-messages';
import { PageRefresh } from '../../one/PageRefresh'; // [bumex-one] ↻ at the right of the header (2026-11-22)
// [bumex-one] bilingual: every text follows the person's language, say('français', 'English') (vanguard/one/say.ts, 2026-11-21)

// the engine's labels are French (ACCOUNT_KIND_FR, JOURNAL_KINDS, CHART_TEMPLATES): their English, at render time only
const KIND_EN: Record<Account['kind'], string> = { asset: 'Asset', liability: 'Liability', equity: 'Equity', income: 'Income', expense: 'Expense' };
const JOURNAL_KIND_EN: Record<JournalKind, string> = { sales: 'Sales', purchases: 'Purchases', bank: 'Bank', cash: 'Cash desk', misc: 'Miscellaneous', assets: 'Fixed assets', closing: 'Closing' };
const TEMPLATE_EN: Record<CoaTemplate, string> = { PCM: 'Mauritanian chart of accounts (ONEC)', CGNC: 'General accounting standards code (Morocco)', SYSCOHADA: 'Revised SYSCOHADA (OHADA zone)' };

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
  const say = useSay();
  // [bumex-one] an entity whose chart is not set up yet has no journal to post in: it opens on its chart
  const ready = state.journals.some((j) => j.entityId === entityId);
  const [tab, setTab] = useState<Tab>((initialTab as Tab) || (ready ? 'entry' : 'coa'));
  useEffect(() => { if (initialTab) setTab(initialTab as Tab); }, [initialTab]);
  const tabs = [
    { id: 'entry' as Tab, label: t('tab_entry') },
    { id: 'journals' as Tab, label: <>{t('tab_journals')} <Chip kind="dim">{state.entries.filter((e) => e.entityId === entityId && e.status === 'draft').length} {t('draft').toLowerCase()}</Chip></> },
    { id: 'gl' as Tab, label: t('tab_gl') }, { id: 'tb' as Tab, label: t('tab_tb') }, { id: 'closing' as Tab, label: t('tab_closing') }, { id: 'coa' as Tab, label: t('tab_coa') }, { id: 'setup' as Tab, label: say('Journaux · tiers', 'Journals · third parties') }, { id: 'integrity' as Tab, label: t('tab_integrity') },
  ];
  const [editing, setEditing] = useState<Id | null>(null);
  return (
    <>
      <div className="sheet-head">
        <h1>{t('room_accounting')}</h1>
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
        <PageRefresh />
      </div>
      <div className="sheet-body">
        {tab === 'entry' && !ready && <div className="banner info">{say(`Le plan comptable de cette entité n'est pas encore installé : choisissez-le dans l'onglet « ${t('tab_coa')} ».`, `This entity's chart of accounts is not installed yet: choose it in the "${t('tab_coa')}" tab.`)} <button className="btn sm" onClick={() => setTab('coa')}>{t('tab_coa')}</button></div>}{/* [bumex-one] */}
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
  const say = useSay();
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
      for (const l of input.lines) if (!state.accounts.some((a) => a.id === l.accountId)) return [{ code: 'account', message: say(`Compte inconnu : ${l.accountId}`, `Unknown account: ${l.accountId}`) }];
      const [tmp, e] = createDraft(state, input);
      return checkPostable(tmp, e.id);
    } catch (err) {
      return [{ code: 'error', message: err instanceof DomainError ? err.message : String(err) }];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, date, journalId, desc, currency, rate, state, say]);
  let periodInfo = '';
  try {
    const p = periodFor(state, entityId, date);
    const fy = state.fiscalYears.find((f) => f.id === p.fiscalYearId)!;
    periodInfo = say(
      `Exercice ${fy.label}${fy.isClosed ? ' (clôturé)' : ''} · période ${p.periodNo} · ${p.status === 'open' ? 'ouverte' : p.status === 'soft_closed' ? 'clôture douce' : 'verrouillée'}`,
      `Fiscal year ${fy.label}${fy.isClosed ? ' (closed)' : ''} · period ${p.periodNo} · ${p.status === 'open' ? 'open' : p.status === 'soft_closed' ? 'soft close' : 'locked'}`,
    );
  } catch (err) {
    periodInfo = err instanceof Error ? err.message : '';
  }

  const resetForm = () => { setDesc(''); setLines([emptyLine(), emptyLine()]); setDate(state.today); onDone(); };
  const keep = () => {
    const input = buildInput();
    const ok = editing ? apply((s) => updateDraft(s, editing, input), say('Brouillon mis à jour', 'Draft updated')) : apply((s) => createDraft(s, input), say('Brouillon enregistré', 'Draft saved'));
    if (ok) resetForm();
  };
  const post = () => {
    const input = buildInput();
    const ok = apply((s) => {
      let s1: State;
      let id: Id;
      if (editing) { s1 = updateDraft(s, editing, input); id = editing; } else { const [s2, e] = createDraft(s, input); s1 = s2; id = e.id; }
      const [s3, posted] = postEntry(s1, id);
      const jc = journals.find((j) => j.id === journalId)?.code;
      toast('ok', say(`Comptabilisée · ${jc} ${posted.entryNo}`, `Posted · ${jc} ${posted.entryNo}`));
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
      <WideNote />{/* [mobile] */}
      <form className="grow" onSubmit={(e) => e.preventDefault()} onKeyDown={onKey}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ margin: 0 }}>{editing ? say(`${t('edit')} · brouillon`, `${t('edit')} · draft`) : say('Nouvelle écriture', 'New entry')}</h2>
            <span className="small muted">{periodInfo}</span>
          </div>
          <div className="grid4">
            <Field label={say(`${t('date')} (toute période ouverte)`, `${t('date')} (any open period)`)}><input className="in mono" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label={t('journal')}><Select recent="journals" className="in" value={journalId} onChange={(e) => setJournalId(e.target.value)}>{journals.map((j) => <option key={j.id} value={j.id}>{j.code} · {j.name}</option>)}</Select></Field>
            <Field label={t('label')}><input className="in" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={say('Pièce / référence', 'Document / reference')} /></Field>
            <Field label={`${t('currency')} · ${t('rate')}`}>
              <div style={{ display: 'flex', gap: 6 }}>
                <Select className="in" style={{ width: 90 }} value={currency} onChange={(e) => { const c = e.target.value as Currency; setCurrency(c); try { setRate(String(c === entity.functionalCurrency ? 1 : fxRate(state, c, entity.functionalCurrency, date))); } catch { setRate('1'); } }}>
                  {['MRU', 'EUR', 'USD', 'MAD'].map((c) => <option key={c}>{c}</option>)}
                </Select>
                <input className="in num" value={rate} onChange={(e) => setRate(e.target.value)} disabled={currency === entity.functionalCurrency} />
              </div>
            </Field>
          </div>
          <div style={{ overflowX: 'auto', border: '1px solid var(--stroke)', borderRadius: 2 }}>
            <table>
              <thead><tr><th style={{ width: 36 }}>#</th><th style={{ width: 150 }}>{t('account')}</th><th>{say('Libellé du compte', 'Account name')}</th><th>{say('Libellé de ligne', 'Line description')}</th><th style={{ width: 170 }}>{t('dimension')}</th><th className="num" style={{ width: 140 }}>{t('debit')}</th><th className="num" style={{ width: 140 }}>{t('credit')}</th><th style={{ width: 36 }}></th></tr></thead>
              <tbody>
                {lines.map((l, i) => {
                  const a = accountOf(state, entityId, l.code);
                  return (
                    <tr key={i} onFocus={() => (focused.current = i)}>
                      <td className="mono">{i + 1}</td>
                      <td><Suggest className="in mono" recent="account-codes" options={accounts.map((a) => ({ value: a.code, label: `${a.code} ${a.nameFr}` }))} value={l.code} onChange={(e) => setLine(i, { code: e.target.value })} aria-label={say(`Compte ligne ${i + 1}`, `Account, line ${i + 1}`)} placeholder={say('code ou nom', 'code or name')} /></td>
                      <td className="muted small">{a ? a.nameFr + (a.requiresCustomer ? say(' · client requis', ' · customer required') : a.requiresSupplier ? say(' · fournisseur requis', ' · supplier required') : '') : l.code ? say('compte inconnu', 'unknown account') : ''}</td>
                      <td><input className="in" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} aria-label={say(`Libellé ligne ${i + 1}`, `Description, line ${i + 1}`)} /></td>
                      <td>
                        {a?.requiresCustomer ? (
                          <Select recent="customers" className="in" value={l.dim} onChange={(e) => setLine(i, { dim: e.target.value })} aria-label={say(`Client ligne ${i + 1}`, `Customer, line ${i + 1}`)}><option value="">{say('— client —', '— customer —')}</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
                        ) : a?.requiresSupplier ? (
                          <Select recent="suppliers" className="in" value={l.dim} onChange={(e) => setLine(i, { dim: e.target.value })} aria-label={say(`Fournisseur ligne ${i + 1}`, `Supplier, line ${i + 1}`)}><option value="">{say('— fournisseur —', '— supplier —')}</option>{suppliers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
                        ) : (
                          <span className="muted small">—</span>
                        )}
                      </td>
                      <td><input className="in num" value={l.debit} onChange={(e) => setLine(i, { debit: e.target.value })} aria-label={say(`Débit ligne ${i + 1}`, `Debit, line ${i + 1}`)} /></td>
                      <td><input className="in num" value={l.credit} onChange={(e) => setLine(i, { credit: e.target.value })} aria-label={say(`Crédit ligne ${i + 1}`, `Credit, line ${i + 1}`)} /></td>
                      <td><button type="button" className="btn sm" aria-label={say('Supprimer la ligne', 'Delete line')} onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, k) => k !== i) : ls))}>×</button></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5}>
                    <button type="button" className="btn sm" onClick={() => setLines((ls) => [...ls, emptyLine()])}>{say('+ ligne', '+ line')}</button>
                    <span style={{ marginLeft: 12 }}>{t('total')} · </span>
                    <Chip kind={totals.diff === 0 && totals.d > 0 ? 'good' : 'warn'}>{totals.diff === 0 && totals.d > 0 ? t('balanced') : `${t('unbalanced')} ${fmt(totals.diff)}`}</Chip>
                  </td>
                  <td className="num">{fmt(totals.d)}</td>
                  <td className="num">{fmt(totals.c)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
          {checks.length > 0 && totals.d + totals.c > 0 && <div className="banner warn">{checks.map((c) => say(c.message, englishMessage(c.message))).join(' · ')}</div>}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' }}>
            <span><kbd>Tab</kbd> {say('cellule suivante', 'next cell')}</span><span><kbd>Ctrl</kbd>+<kbd>D</kbd> {say('dupliquer la ligne', 'duplicate line')}</span><span><kbd>F2</kbd> {say('équilibrer sur la ligne', 'balance on this line')}</span><span><kbd>Ctrl</kbd>+<kbd>S</kbd> {say('brouillon', 'draft')}</span><span><kbd>Ctrl</kbd>+<kbd>{say('Entrée', 'Enter')}</kbd> {say('comptabiliser', 'post')}</span>
            <div className="actions" style={{ marginLeft: 'auto' }}>
              {editing && <button type="button" className="btn" onClick={resetForm}>{say('Annuler', 'Cancel')}</button>}
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
  const say = useSay();
  const drafts = state.entries.filter((e) => e.entityId === entityId && e.status === 'draft');
  void onEdit;
  return (
    <div className="card">
      <h2>{say('Brouillons', 'Drafts')} · {drafts.length}</h2>
      {drafts.length === 0 && <div className="muted small">{say('Aucun brouillon : la lampe de la salle est éteinte.', 'No drafts: the room\'s lamp is off.')}</div>}
      {drafts.map((e) => {
        const checks = checkPostable(state, e.id);
        const total = r2(e.lines.reduce((a, l) => a + l.debit, 0));
        return (
          <div key={e.id} style={{ borderTop: '1px solid var(--line)', padding: '8px 0', fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>{e.description}</span>
              <Money v={total} />
            </div>
            <div className="small muted"><D iso={e.date} /> · {state.journals.find((j) => j.id === e.journalId)?.code} · {say(`${e.lines.length} lignes`, `${e.lines.length} lines`)}</div>
            {checks.length > 0 && <div className="small" style={{ color: 'var(--warn)' }}>{checks.map((c) => say(c.message, englishMessage(c.message))).join(' · ')}</div>}
            <div className="actions" style={{ justifyContent: 'flex-start', marginTop: 6 }}>
              <button className="btn sm primary" disabled={checks.length > 0} onClick={() => apply((s) => postEntry(s, e.id), say('Comptabilisée', 'Posted'))}>{t('post')}</button>
              <button className="btn sm danger" onClick={() => apply((s) => deleteDraft(s, e.id), say('Brouillon supprimé', 'Draft deleted'))}>{t('delete')}</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EntryRow({ e, expanded, onToggle }: { e: JournalEntry; expanded: boolean; onToggle: () => void }) {
  const { state, t, apply } = useStore();
  const say = useSay();
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
        <td><StatusChip status={e.status} /></td>
        <td>{chainOk === null ? '—' : <Chip kind={chainOk ? 'good' : 'crit'}>{chainOk ? t('hash_ok') : t('hash_bad')}</Chip>}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} style={{ background: 'var(--ground)' }}>
            <table style={{ background: 'transparent' }}>
              <thead><tr><th>#</th><th>{t('account')}</th><th>{t('label')}</th><th>{t('dimension')}</th><th className="num">{t('debit')}</th><th className="num">{t('credit')}</th><th className="num">{say('Devise', 'Currency')}</th></tr></thead>
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
              <span className="small muted" style={{ marginRight: 'auto' }}>{e.postedAt ? say(`Comptabilisée le ${e.postedAt.slice(0, 16).replace('T', ' ')} par ${e.postedBy} · hash ${e.hash?.slice(0, 12)}…`, `Posted on ${e.postedAt.slice(0, 16).replace('T', ' ')} by ${e.postedBy} · hash ${e.hash?.slice(0, 12)}…`) : say('Brouillon', 'Draft')}</span>
              {e.status === 'posted' && <button className="btn sm" onClick={() => { void textAsk({ title: say('Extourner l\'écriture', 'Reverse the entry'), message: say('Une écriture inverse est passée à la date du jour.', 'An opposite entry is posted with today\'s date.'), label: say('Motif de l\'extourne', 'Reason for the reversal'), value: 'erreur de saisie', confirm: t('reverse') }).then((reason) => { if (reason !== null) apply((s) => reverseEntry(s, e.id, s.today, reason), say('Extournée', 'Reversed')); }); }}>{t('reverse')}</button>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Journals({ entityId, onEdit }: { entityId: Id; onEdit: (id: Id) => void }) {
  const { state, t, ui } = useStore();
  const say = useSay();
  const [journalId, setJournalId] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState<Id | null>(null);
  const fy = state.fiscalYears.find((f) => f.entityId === entityId && f.label === ui.fiscalYearLabel);
  const rows = journalEntries(state, entityId, { journalId: journalId || undefined, status: (status || undefined) as JournalEntry['status'] | undefined, fiscalYearId: fy?.id }).slice(0, 200);
  return (
    <div className="card flush">
      <div style={{ display: 'flex', gap: 8, padding: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Select recent="journals" className="in" style={{ width: 220 }} value={journalId} onChange={(e) => setJournalId(e.target.value)}><option value="">{say('Tous les journaux', 'All journals')}</option>{state.journals.filter((j) => j.entityId === entityId).map((j) => <option key={j.id} value={j.id}>{j.code} · {j.name}</option>)}</Select>
        <Select className="in" style={{ width: 180 }} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">{say('Tous statuts', 'All statuses')}</option><option value="draft">{say('Brouillons', 'Drafts')}</option><option value="posted">{say('Comptabilisées', 'Posted')}</option><option value="reversed">{say('Extournées', 'Reversed')}</option></Select>
        <span className="muted small">{say(`Exercice ${ui.fiscalYearLabel} · ${rows.length} écritures · cliquer une ligne pour les détails`, `Fiscal year ${ui.fiscalYearLabel} · ${rows.length} entries · click a row for details`)}</span>
        {rows.some((r) => r.status === 'draft') && <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => onEdit(rows.find((r) => r.status === 'draft')!.id)}>{say(`${t('edit')} le premier brouillon`, `${t('edit')} the first draft`)}</button>}
      </div>
      <table>
        <thead><tr><th>{say('Journal · n°', 'Journal · no.')}</th><th>{t('date')}</th><th>{t('label')}</th><th>Source</th><th className="num">{t('amount')}</th><th>{t('status')}</th><th>{t('tab_integrity')}</th></tr></thead>
        <tbody>{rows.map((e) => <EntryRow key={e.id} e={e} expanded={open === e.id} onToggle={() => setOpen(open === e.id ? null : e.id)} />)}</tbody>
      </table>
    </div>
  );
}

function Ledger({ entityId }: { entityId: Id }) {
  const { state, t, ui } = useStore();
  const say = useSay();
  const accounts = state.accounts.filter((a) => a.entityId === entityId && a.isPostable && a.active).sort((a, b) => (a.isAuxiliary === b.isAuxiliary ? a.code.localeCompare(b.code) : a.isAuxiliary ? 1 : -1));
  const [code, setCode] = useState(() => findAccountByCode(state, entityId, '4100')?.code ?? accounts[0]?.code ?? '');
  const a = findAccountByCode(state, entityId, code.split(' ')[0]);
  const fy = state.fiscalYears.find((f) => f.entityId === entityId && f.label === ui.fiscalYearLabel);
  const rows = a ? generalLedger(state, entityId, a.id, { from: fy?.start, to: fy?.end }) : [];
  return (
    <div className="card flush">
      <div style={{ display: 'flex', gap: 8, padding: 10, alignItems: 'center' }}>
        <Suggest className="in mono" style={{ width: 260 }} recent="account-codes" options={accounts.map((x) => ({ value: x.code, label: `${x.code} ${x.nameFr}${x.isAuxiliary ? say(' (auxiliaire)', ' (subsidiary)') : ''}` }))} value={code} onChange={(e) => setCode(e.target.value)} aria-label={say('Compte', 'Account')} />
        <span>{a?.nameFr}{a && !a.isAuxiliary && state.accounts.some((x) => x.collectiveId === a.id) ? <span className="small muted">{say(' · collectif, auxiliaires inclus', ' · control account, subsidiaries included')}</span> : null}</span>
        <span className="muted small" style={{ marginLeft: 'auto' }}>{say(`Exercice ${ui.fiscalYearLabel} · solde`, `Fiscal year ${ui.fiscalYearLabel} · balance`)} <b className="mono">{fmt(rows.length ? rows[rows.length - 1].running : 0)}</b></span>
      </div>
      <table>
        <thead><tr><th>{t('date')}</th><th>{say('Journal · n°', 'Journal · no.')}</th><th>{t('label')}</th><th className="num">{t('debit')}</th><th className="num">{t('credit')}</th><th className="num">{say('Solde', 'Balance')}</th></tr></thead>
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
  const say = useSay();
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
        <b>{say(`Balance · exercice ${ui.fiscalYearLabel}`, `Trial balance · fiscal year ${ui.fiscalYearLabel}`)}</b>
        <Chip kind={td === tc ? 'good' : 'crit'}>{td === tc ? say('Équilibrée', 'Balanced') : say('Déséquilibrée', 'Unbalanced')}</Chip>
        <label className="small" style={{ marginLeft: 'auto' }}><input type="checkbox" checked={aux} onChange={(e) => setAux(e.target.checked)} /> {say('détail des comptes auxiliaires (balance tiers)', 'subsidiary account detail (third-party balance)')}</label>
        <button className="btn sm" onClick={exportCsv}>{say('Exporter (CSV pour Excel)', 'Export (CSV for Excel)')}</button>
      </div>
      <table>
        <thead><tr><th>{t('account')}</th><th>{t('label')}</th><th className="num">{t('debit')}</th><th className="num">{t('credit')}</th><th className="num">{say('Solde', 'Balance')}</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.accountId}><td className="mono">{r.code}</td><td>{r.name}</td><td className="num">{fmt(r.debit)}</td><td className="num">{fmt(r.credit)}</td><td className="num">{fmt(r.balance)}</td></tr>)}</tbody>
        <tfoot><tr><td colSpan={2}>{t('total')}</td><td className="num">{fmt(td)}</td><td className="num">{fmt(tc)}</td><td className="num">{fmt(r2(td - tc))}</td></tr></tfoot>
      </table>
    </div>
  );
}

function Closing({ entityId }: { entityId: Id }) {
  const { state, t, apply } = useStore();
  const say = useSay();
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
                <h2 style={{ margin: 0 }}>{say('Exercice', 'Fiscal year')} {fy.label}</h2>
                <Chip kind={fy.isClosed ? 'dim' : 'good'}>{fy.isClosed ? t('closed') : say('Ouvert', 'Open')}</Chip>
                <span className="small muted">{say(`${drafts} brouillon(s) · ${periods.filter((p) => p.status === 'locked').length}/12 périodes verrouillées`, `${drafts} draft(s) · ${periods.filter((p) => p.status === 'locked').length}/12 periods locked`)}</span>
                <div className="actions" style={{ marginLeft: 'auto' }}>
                  {fy.isClosed ? <button className="btn sm" onClick={() => apply((s) => setFiscalYearClosed(s, fy.id, false), say(`Exercice ${fy.label} rouvert`, `Fiscal year ${fy.label} reopened`))}>{say('Rouvrir (associé)', 'Reopen (partner)')}</button> : <button className="btn sm" onClick={() => apply((s) => setFiscalYearClosed(s, fy.id, true), say(`Exercice ${fy.label} clôturé`, `Fiscal year ${fy.label} closed`))}>{say('Clôturer l\'exercice', 'Close the fiscal year')}</button>}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 6, marginTop: 10 }}>
                {periods.map((p) => {
                  const pd = state.entries.filter((e) => e.periodId === p.id && e.status === 'draft').length;
                  return (
                    <div key={p.id} style={{ border: '1px solid var(--stroke)', borderRadius: 2, padding: 8, fontSize: 12, background: p.status === 'locked' ? 'var(--ground)' : 'var(--paper)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{p.start.slice(0, 7)}</b><Chip kind={p.status === 'open' ? 'good' : p.status === 'soft_closed' ? 'warn' : 'dim'}>{p.status === 'open' ? t('open') : p.status === 'soft_closed' ? t('soft') : t('locked')}</Chip></div>
                      <div className="muted">{say(`${pd} brouillon(s)`, `${pd} draft(s)`)}</div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                        {p.status !== 'open' && <button className="btn sm" onClick={() => apply((s) => setPeriodStatus(s, p.id, 'open'), say('Période ouverte', 'Period opened'))}>{say('Ouvrir', 'Open')}</button>}
                        {p.status !== 'soft_closed' && <button className="btn sm" onClick={() => apply((s) => setPeriodStatus(s, p.id, 'soft_closed'), say('Clôture douce', 'Soft close'))}>{say('Douce', 'Soft')}</button>}
                        {p.status !== 'locked' && <button className="btn sm" onClick={() => apply((s) => setPeriodStatus(s, p.id, 'locked'), say('Période verrouillée', 'Period locked'))}>{say('Verrouiller', 'Lock')}</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <FxRevaluationCard entityId={entityId} fiscalYearId={fy.id} />{/* [bumex-one] the year-end revaluation */}
            </div>
          );
        })}
      </div>
      <aside className="side">
        <div className="card">
          <h2>{say('Règles', 'Rules')}</h2>
          <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            <li>{say('Une écriture se comptabilise dans toute période ouverte, quel que soit le jour : les exercices passés se saisissent depuis l\'ERP.', 'An entry can be posted in any open period, whatever the day: past fiscal years are entered from the ERP.')}</li>
            <li>{say('Verrouiller une période : associé, zéro brouillon. Clôture douce : seuls les associés comptabilisent.', 'Locking a period: partner, no drafts. Soft close: only partners can post.')}</li>
            <li>{say('Clôturer un exercice : toutes les périodes verrouillées, zéro brouillon, associé. Rouvrir : associé, journalisé.', 'Closing a fiscal year: every period locked, no drafts, partner. Reopening: partner, logged.')}</li>
            <li>{say('Les numéros d\'écriture sont continus par exercice ; la chaîne d\'intégrité suit l\'ordre de comptabilisation.', 'Entry numbers are continuous within a fiscal year; the integrity chain follows the posting order.')}</li>
          </ul>
        </div>
        <div className="card">
          <h2>{say('Exercices', 'Fiscal years')}</h2>
          <div className="actions" style={{ justifyContent: 'flex-start' }}>
            <button className="btn sm" onClick={() => apply((s) => createFiscalYear(s, entityId, prevYear), say(`Exercice ${prevYear} créé`, `Fiscal year ${prevYear} created`))}>{say('+ exercice', '+ fiscal year')} {prevYear}</button>
            <button className="btn sm" onClick={() => apply((s) => createFiscalYear(s, entityId, nextYear), say(`Exercice ${nextYear} créé`, `Fiscal year ${nextYear} created`))}>{say('+ exercice', '+ fiscal year')} {nextYear}</button>
          </div>
          {/* [bumex-one] a year opened too early: the last one, empty, by the administrator (Sidaty, 2026-11-23) */}
          {(() => { const last = state.fiscalYears.filter((f) => f.entityId === entityId).sort((a, b) => (a.start < b.start ? 1 : -1))[0]; return last && state.session.role === 'admin' && !last.isClosed && !state.entries.some((e) => e.fiscalYearId === last.id) ? <div style={{ marginTop: 8 }}><DeleteButton table="fiscal_year" rowId={last.id} label={`Exercice ${last.label}`} entityId={entityId}>{say(`Supprimer l'exercice ${last.label} (vide)`, `Delete fiscal year ${last.label} (empty)`)}</DeleteButton></div> : null; })()}
        </div>
      </aside>
    </div>
  );
}

function Chart({ entityId }: { entityId: Id }) {
  const { state, t, apply, toast } = useStore();
  const say = useSay();
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
    }, editing ? say(`Compte ${editing.code} modifié`, `Account ${editing.code} updated`) : say(`Compte ${code} créé`, `Account ${code} created`));
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
  const applyImport = () => { if (!report) return; if (apply((s) => applyChartImport(s, entityId, report), say('Plan comptable importé', 'Chart of accounts imported'))) { setReport(null); setImportName(''); } };
  return (
    <div className="cols">
      <div className="grow">
        <div className="card">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div><b>{say('Plan actif', 'Active chart')} · {tpl ? say(tpl.name, TEMPLATE_EN[tpl.id]) : entity.coaTemplate}</b><div className="small muted">{say(`${all.length} comptes présentés sur ${entity.accountCodeLength ?? 6} chiffres · ${all.filter((a) => a.isPostable && a.active).length} imputables · utilisé par tous les modules de ${entity.name}`, `${all.length} accounts shown on ${entity.accountCodeLength ?? 6} digits · ${all.filter((a) => a.isPostable && a.active).length} postable · used by every module of ${entity.name}`)}</div></div>
            <span style={{ marginLeft: 'auto' }} />
            <Select className="in" style={{ width: 300 }} value={template} onChange={(e) => setTemplate(e.target.value as CoaTemplate)}>{CHART_TEMPLATES.map((x) => <option key={x.id} value={x.id}>{say(x.name, TEMPLATE_EN[x.id])} · {x.country} · {say(`${x.accounts} comptes`, `${x.accounts} accounts`)}</option>)}</Select>
            <button className="btn sm" onClick={() => apply((s) => applyChartTemplate(s, entityId, template, 'merge'), say(`Plan complété avec ${template}`, `Chart completed with ${template}`))}>{say('Compléter avec ce plan', 'Complete with this chart')}</button>
            <button className="btn sm danger" disabled={hasEntries} title={hasEntries ? say('Des écritures existent : remplacement impossible', 'Entries exist: the chart cannot be replaced') : ''} onClick={() => { void confirmAsk({ title: say(`Remplacer le plan de ${entity.name} par ${template} ?`, `Replace the chart of ${entity.name} with ${template}?`), message: say('Les comptes, codes taxe et clés de paramétrage sont réinitialisés.', 'Accounts, tax codes and setup keys are reset.'), confirm: say('Remplacer', 'Replace'), danger: true }).then((ok) => { if (ok) apply((s) => applyChartTemplate(s, entityId, template, 'replace'), say(`Plan ${template} activé`, `Chart ${template} activated`)); }); }}>{say('Remplacer (entité vierge)', 'Replace (blank entity)')}</button>
          </div>
          <div className="actions" style={{ justifyContent: 'flex-start', marginTop: 10, flexWrap: 'wrap' }}>
            <button className="btn sm" onClick={exportXlsx}>{say('Exporter le plan (Excel)', 'Export the chart (Excel)')}</button>
            <button className="btn sm" onClick={templateXlsx}>{say('Télécharger le modèle Excel', 'Download the Excel template')}</button>
            <button className="btn sm primary" onClick={() => fileRef.current?.click()}>{say('Importer un fichier Excel…', 'Import an Excel file…')}</button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={(e) => onFile(e.target.files?.[0])} aria-label={say('Fichier Excel du plan comptable', 'Chart of accounts Excel file')} />
            <span className="small muted">{say('Exporter → compléter dans Excel → réimporter : les comptes existants sont mis à jour, les nouveaux créés, les anomalies bloquées avant toute écriture.', 'Export → complete in Excel → import again: existing accounts are updated, new ones created, anomalies blocked before anything is written.')}</span>
          </div>
        </div>
        {report && (
          <div className="card">
            <h2>{say('Contrôle de l\'import', 'Import check')} · {importName}</h2>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0 10px' }}>
              <Chip kind="good">{say(`${report.toCreate} à créer`, `${report.toCreate} to create`)}</Chip><Chip kind="warn">{say(`${report.toUpdate} à modifier`, `${report.toUpdate} to update`)}</Chip><Chip kind="dim">{say(`${report.unchanged} inchangés`, `${report.unchanged} unchanged`)}</Chip><Chip kind={report.errors.length ? 'crit' : 'good'}>{say(`${report.errors.length} erreur(s)`, `${report.errors.length} error(s)`)}</Chip><Chip kind={report.warnings.length ? 'warn' : 'dim'}>{say(`${report.warnings.length} avertissement(s)`, `${report.warnings.length} warning(s)`)}</Chip>
            </div>
            {report.errors.length > 0 && <table><thead><tr><th>{say('Ligne', 'Line')}</th><th>{say('Compte', 'Account')}</th><th>{say('Erreur bloquante', 'Blocking error')}</th></tr></thead><tbody>{report.errors.map((e, i) => <tr key={i}><td className="mono">{e.line}</td><td className="mono">{e.code}</td><td style={{ color: 'var(--crit)' }}>{say(e.message, englishMessage(e.message))}</td></tr>)}</tbody></table>}
            {report.warnings.length > 0 && <table style={{ marginTop: 8 }}><thead><tr><th>{say('Ligne', 'Line')}</th><th>{say('Compte', 'Account')}</th><th>{say('Avertissement', 'Warning')}</th></tr></thead><tbody>{report.warnings.map((e, i) => <tr key={i}><td className="mono">{e.line}</td><td className="mono">{e.code}</td><td>{say(e.message, englishMessage(e.message))}</td></tr>)}</tbody></table>}
            {report.errors.length === 0 && report.rows.filter((r) => r.action !== 'unchanged').length > 0 && (
              <table style={{ marginTop: 8 }}><thead><tr><th>Action</th><th>{say('Compte', 'Account')}</th><th>{say('Intitulé', 'Name')}</th><th>Type</th><th>{say('Imputable', 'Postable')}</th><th>Dimension</th><th>{say('Actif', 'Active')}</th></tr></thead><tbody>{report.rows.filter((r) => r.action !== 'unchanged').slice(0, 60).map((r) => <tr key={r.line}><td><Chip kind={r.action === 'create' ? 'good' : 'warn'}>{r.action === 'create' ? say('créer', 'create') : say('modifier', 'update')}</Chip></td><td className="mono">{r.code}</td><td>{r.nameFr}</td><td>{say(ACCOUNT_KIND_FR[r.kind], KIND_EN[r.kind])}</td><td>{r.isPostable ? say('oui', 'yes') : say('non', 'no')}</td><td className="small">{r.requiresCustomer ? say('client', 'customer') : r.requiresSupplier ? say('fournisseur', 'supplier') : r.requiresEngagement ? 'mission' : ''}</td><td>{r.active ? say('oui', 'yes') : say('non', 'no')}</td></tr>)}</tbody></table>
            )}
            <div className="actions" style={{ marginTop: 10 }}>
              <button className="btn" onClick={() => setReport(null)}>{say('Annuler', 'Cancel')}</button>
              <button className="btn primary" disabled={report.errors.length > 0 || report.toCreate + report.toUpdate === 0} onClick={applyImport}>{say(`Appliquer ${report.toCreate + report.toUpdate} changement(s)`, `Apply ${report.toCreate + report.toUpdate} change(s)`)}</button>
            </div>
          </div>
        )}
        <div className="card flush">
          <div style={{ display: 'flex', gap: 8, padding: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {([['moving', 'Comptes mouvementés', 'Accounts with entries'], ['unused', 'Non mouvementés', 'Accounts without entries'], ['auxiliary', 'Comptes auxiliaires', 'Subsidiary accounts'], ['all', 'Tout le plan', 'Whole chart']] as const).map(([k, l, en]) => <button key={k} className={`btn sm ${view === k ? 'on' : ''}`} onClick={() => setView(k)}>{say(l, en)}</button>)}
            <input className="in" style={{ width: 220 }} placeholder={say('Filtrer par numéro ou intitulé', 'Filter by number or name')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={say('Filtrer', 'Filter')} />
            <Select className="in" style={{ width: 140 }} value={cls} onChange={(e) => setCls(e.target.value)} aria-label={say('Classe', 'Class')}><option value="">{say('Toutes classes', 'All classes')}</option>{['1', '2', '3', '4', '5', '6', '7', '8', '9'].filter((c) => all.some((a) => a.code.startsWith(c))).map((c) => <option key={c} value={c}>{say('Classe', 'Class')} {c}</option>)}</Select>
            <span className="muted small">{say(
              `${rows.length} comptes${view === 'moving' ? ' avec écritures' : view === 'unused' ? ' sans écriture, racines et regroupements' : view === 'auxiliary' ? ' de tiers, rattachés à leur collectif' : ''} · cliquer pour modifier`,
              `${rows.length} accounts${view === 'moving' ? ' with entries' : view === 'unused' ? ' without entries, roots and groupings' : view === 'auxiliary' ? ' of third parties, attached to their control account' : ''} · click to edit`,
            )}</span>
          </div>
          <table>
            <thead><tr><th>{t('account')}</th><th>{t('label')}</th><th>Type</th>{view === 'auxiliary' && <th>{say('Collectif', 'Control account')}</th>}<th className="num">{t('debit')}</th><th className="num">{t('credit')}</th><th className="num">{say('Solde', 'Balance')}</th><th></th></tr></thead>
            <tbody>{rows.map(({ account: a, debit, credit, balance, entries, collective }) => <tr key={a.id} className={a.id === editId ? 'sel' : ''} onClick={() => !a.isStatutory && !a.isAuxiliary && load(a)} style={{ cursor: a.isStatutory || a.isAuxiliary ? 'default' : 'pointer', opacity: a.active ? 1 : 0.55 }}><td className="mono">{a.code}</td><td>{a.nameFr}{a.nameEn ? <span className="small muted"> · {a.nameEn}</span> : null}{!a.active ? <Chip kind="off">{say(' inactif', ' inactive')}</Chip> : null}{!a.isPostable && !a.isStatutory ? <span className="small muted">{say(' · regroupement', ' · grouping')}</span> : null}{a.requiresCustomer ? <span className="small muted">{say(' · tiers client', ' · customer third party')}</span> : a.requiresSupplier ? <span className="small muted">{say(' · tiers fournisseur', ' · supplier third party')}</span> : a.requiresEngagement ? <span className="small muted"> · mission</span> : null}</td><td>{say(ACCOUNT_KIND_FR[a.kind], KIND_EN[a.kind])}</td>{view === 'auxiliary' && <td className="mono small">{collective ? `${collective.code} ${collective.nameFr}` : '—'}</td>}<td className="num">{entries ? fmt(debit, 0) : ''}</td><td className="num">{entries ? fmt(credit, 0) : ''}</td><td className="num">{entries ? fmt(balance, 0) : ''}</td><td onClick={(e) => e.stopPropagation()}>{/* [bumex-one] why an account cannot go, said (Sidaty, 2026-11-23) */}{a.isStatutory ? <span className="small muted" title={say('Compte du plan officiel : le désactiver plutôt', 'Official chart account: deactivate it instead')}>{say('officiel', 'official')}</span> : a.isAuxiliary ? <span className="small muted" title={say('Compte auxiliaire : il suit la fiche de son tiers', 'Sub-ledger account: it follows its third party')}>{say('auxiliaire', 'sub-ledger')}</span> : used(a) ? <span className="small muted" title={say('Compte mouvementé : le désactiver (cliquer la ligne)', 'Account with entries: deactivate it (click the row)')}>{say('mouvementé', 'has entries')}</span> : <DeleteButton table="account" rowId={a.id} label={`Compte ${a.code} ${a.nameFr}`} entityId={entityId} />}</td></tr>)}{rows.length === 0 && <tr><td colSpan={8} className="muted small">{say('Aucun compte dans cette vue', 'No accounts in this view')}</td></tr>}</tbody>
          </table>
        </div>
      </div>
      <aside className="side">
        <div className="card">
          <h2>{editing ? say(`Compte ${editing.code}`, `Account ${editing.code}`) : say('Nouveau compte', 'New account')}</h2>
          {!editing && <Field label={say('Numéro (3 à 8 chiffres)', 'Number (3 to 8 digits)')}><input className="in mono" value={code} onChange={(e) => setCode(e.target.value)} placeholder="7017121" /></Field>}
          <Field label={say('Intitulé', 'Name')} style={{ marginTop: 8 }}><input className="in" value={name} onChange={(e) => setName(e.target.value)} placeholder="Audit · export" /></Field>
          <Field label={say('Intitulé (EN)', 'Name (EN)')} style={{ marginTop: 8 }}><input className="in" value={nameEn} onChange={(e) => setNameEn(e.target.value)} /></Field>
          <div className="grid2" style={{ marginTop: 8 }}>
            <Field label="Type"><Select className="in" value={kind} onChange={(e) => setKind(e.target.value as Account['kind'])}>{(Object.keys(ACCOUNT_KIND_FR) as Account['kind'][]).map((k) => <option key={k} value={k}>{say(ACCOUNT_KIND_FR[k], KIND_EN[k])}</option>)}</Select></Field>
            <Field label={say('Dimension requise', 'Required dimension')}><Select className="in" value={dim} onChange={(e) => setDim(e.target.value as typeof dim)}><option value="">{say('Aucune', 'None')}</option><option value="customer">{say('Client', 'Customer')}</option><option value="supplier">{say('Fournisseur', 'Supplier')}</option><option value="engagement">Mission</option></Select></Field>
          </div>
          <label className="small" style={{ display: 'block', marginTop: 8 }}><input type="checkbox" checked={postable} onChange={(e) => setPostable(e.target.checked)} /> {say('Imputable (accepte des écritures)', 'Postable (accepts entries)')}</label>
          {editing && <label className="small" style={{ display: 'block', marginTop: 4 }}><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> {say('Actif (proposé dans les saisies)', 'Active (offered in new entries)')}</label>}
          <div className="actions" style={{ marginTop: 10 }}>{editing && <button className="btn" onClick={() => load(null)}>{say('Annuler', 'Cancel')}</button>}<button className="btn primary" disabled={(!editing && !code.trim()) || !name.trim()} onClick={save}>{editing ? say('Enregistrer', 'Save') : say('Créer', 'Create')}</button></div>
          <div className="small muted" style={{ marginTop: 8 }}>{say(`Un numéro court est présenté sur ${entity.accountCodeLength ?? 6} chiffres (4100 → 410000). Un compte créé ici est aussitôt proposé dans les factures, la saisie, les catégories d'immobilisations et les codes taxe ; un compte utilisé par des écritures ne peut être que désactivé, jamais supprimé.`, `A short number is shown on ${entity.accountCodeLength ?? 6} digits (4100 → 410000). An account created here is offered at once in invoices, new entries, fixed asset categories and tax codes; an account used by entries can only be deactivated, never deleted.`)}</div>
        </div>
      </aside>
    </div>
  );
}

function Setup({ entityId }: { entityId: Id }) {
  const { state, apply, t } = useStore();
  const say = useSay();
  const journals = state.journals.filter((j) => j.entityId === entityId).sort((a, b) => a.code.localeCompare(b.code));
  const [editId, setEditId] = useState<Id | null>(null);
  const editing = journals.find((j) => j.id === editId);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<JournalKind>('misc');
  const load = (id: Id | null) => { const j = journals.find((x) => x.id === id); setEditId(id); setCode(j?.code ?? ''); setName(j?.name ?? ''); setKind(j?.kind ?? 'misc'); };
  const save = () => { if (apply((s) => (editing ? updateJournal(s, editing.id, { code, name, kind }) : addJournal(s, { entityId, code, name, kind })), editing ? say('Journal modifié', 'Journal updated') : say('Journal créé', 'Journal created'))) load(null); };
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
          <b>{say('Journaux comptables', 'Accounting journals')}</b>
          <span className="small muted">{say('code, intitulé et type libres · un journal porteur d\'écritures comptabilisées est conservé', 'code, name and type are free · a journal that carries posted entries is kept')}</span>
          <button className="btn sm primary" style={{ marginLeft: 'auto' }} onClick={() => load(null)}>{say('Nouveau journal', 'New journal')}</button>
        </div>
        <table>
          <thead><tr><th>Code</th><th>{say('Intitulé', 'Name')}</th><th>Type</th><th className="num">{say('Écritures', 'Entries')}</th><th>{say('Utilisation', 'Usage')}</th><th></th></tr></thead>
          <tbody>{journals.map((j) => { const u = journalUsage(state, j.id); const jk = JOURNAL_KINDS.find((k) => k.id === j.kind); return <tr key={j.id} className={j.id === editId ? 'sel' : ''}><td className="mono">{j.code}</td><td>{j.name}</td><td>{jk && say(jk.name, JOURNAL_KIND_EN[jk.id])}</td><td className="num">{u.posted}{u.drafts ? say(` (+${u.drafts} brouillon)`, ` (+${u.drafts} draft)`) : ''}</td><td className="small muted">{[u.banks ? say(`${u.banks} compte(s) bancaire(s)`, `${u.banks} bank account(s)`) : '', u.loans ? say(`${u.loans} emprunt(s)`, `${u.loans} loan(s)`) : ''].filter(Boolean).join(' · ') || '—'}</td><td style={{ whiteSpace: 'nowrap' }}><button className="btn sm" onClick={() => load(j.id)}>{t('edit')}</button> {u.posted === 0 && u.drafts === 0 && u.banks === 0 && u.loans === 0 && <button className="btn sm danger" onClick={() => { void confirmAsk({ title: say(`Supprimer le journal ${j.code} ?`, `Delete journal ${j.code}?`), confirm: t('delete'), danger: true }).then((ok) => { if (ok) apply((s) => deleteJournal(s, j.id), say('Journal supprimé', 'Journal deleted')); }); }}>{t('delete')}</button>}</td></tr>; })}</tbody>
        </table>
        <div className="card" style={{ margin: 10 }}>
          <h2>{editing ? `Journal ${editing.code}` : say('Nouveau journal', 'New journal')}</h2>
          <div className="grid3">
            <Field label="Code"><input className="in mono" value={code} onChange={(e) => setCode(e.target.value)} placeholder="BQ2" /></Field>
            <Field label={say('Intitulé', 'Name')}><input className="in" value={name} onChange={(e) => setName(e.target.value)} placeholder="Banque Attijari" /></Field>
            <Field label="Type"><Select className="in" value={kind} onChange={(e) => setKind(e.target.value as JournalKind)}>{JOURNAL_KINDS.map((k) => <option key={k.id} value={k.id}>{say(k.name, JOURNAL_KIND_EN[k.id])}</option>)}</Select></Field>
          </div>
          <div className="actions" style={{ marginTop: 10 }}>{editing && <button className="btn" onClick={() => load(null)}>{say('Annuler', 'Cancel')}</button>}<button className="btn primary" disabled={!code.trim() || !name.trim()} onClick={save}>{editing ? say('Enregistrer', 'Save') : say('Créer', 'Create')}</button></div>
          {editing && journalUsage(state, editing.id).posted > 0 && <div className="small muted" style={{ marginTop: 6 }}>{say('Ce journal porte des écritures comptabilisées : code et intitulé restent modifiables, le type est figé.', 'This journal carries posted entries: its code and name can still be edited, its type is fixed.')}</div>}
        </div>
      </div>
      <div className="card">
        <h2>{say('Comptes auxiliaires des tiers', 'Third-party subsidiary accounts')}</h2>
        <div className="small muted">{say('Chaque client et chaque fournisseur reçoit un code auxiliaire unique (généré selon ces règles ou saisi) et un compte auxiliaire rattaché au collectif. Les écritures des tiers vont sur ces comptes ; la balance les replie dans le collectif.', 'Each customer and each supplier gets a unique subsidiary code (generated by these rules or typed in) and a subsidiary account attached to the control account. Third-party entries go to these accounts; the trial balance rolls them up into the control account.')}</div>
        <div className="grid3" style={{ marginTop: 10 }}>
          <Field label={say('Préfixe clients', 'Customer prefix')}><input className="in mono" value={cp} onChange={(e) => setCp(e.target.value.toUpperCase())} /></Field>
          <Field label={say('Préfixe fournisseurs', 'Supplier prefix')}><input className="in mono" value={sp} onChange={(e) => setSp(e.target.value.toUpperCase())} /></Field>
          <Field label={say('Chiffres', 'Digits')}><input className="in num" value={digits} onChange={(e) => setDigits(e.target.value)} /></Field>
        </div>
        <div className="grid2" style={{ marginTop: 8 }}>
          <Field label={say('Collectif clients', 'Customer control account')}><Select recent="accounts" className="in mono" value={cc} onChange={(e) => setCc(e.target.value)}><option value="">{defaultCustomer ? say(`Paramétrage · ${defaultCustomer.code} ${defaultCustomer.nameFr}`, `Default · ${defaultCustomer.code} ${defaultCustomer.nameFr}`) : '—'}</option>{collectives.map((a) => <option key={a.id} value={a.id}>{a.code} {a.nameFr}</option>)}</Select></Field>
          <Field label={say('Collectif fournisseurs', 'Supplier control account')}><Select recent="accounts" className="in mono" value={sc} onChange={(e) => setSc(e.target.value)}><option value="">{defaultSupplier ? say(`Paramétrage · ${defaultSupplier.code} ${defaultSupplier.nameFr}`, `Default · ${defaultSupplier.code} ${defaultSupplier.nameFr}`) : '—'}</option>{collectives.map((a) => <option key={a.id} value={a.id}>{a.code} {a.nameFr}</option>)}</Select></Field>
        </div>
        <div className="small muted" style={{ marginTop: 8 }}>{say('Prochains codes : client', 'Next codes: customer')} <span className="mono">{(() => { try { return nextThirdPartyCode(state, entityId, 'customer'); } catch { return '—'; } })()}</span> · {say('fournisseur', 'supplier')} <span className="mono">{(() => { try { return nextThirdPartyCode(state, entityId, 'supplier'); } catch { return '—'; } })()}</span></div>
        <div className="actions" style={{ marginTop: 10 }}><button className="btn primary" onClick={() => apply((s) => setThirdPartyRules(s, entityId, { customerPrefix: cp, supplierPrefix: sp, digits: Number(digits) || 3, customerCollectiveId: cc || undefined, supplierCollectiveId: sc || undefined }), say('Règles des tiers enregistrées', 'Third-party rules saved'))}>{say('Enregistrer les règles', 'Save the rules')}</button></div>
        <div className="small muted" style={{ marginTop: 8 }}>{say('Les comptes auxiliaires existants se consultent dans Plan comptable › Comptes auxiliaires ; leur code et leur collectif se changent depuis la fiche du client ou du fournisseur.', 'Existing subsidiary accounts are listed in Chart of accounts › Subsidiary accounts; their code and control account are changed from the customer\'s or supplier\'s record.')}</div>
      </div>
      <ManagementRules entityId={entityId} />{/* [bumex-one] Sidaty's corrections, 2026-11-23 */}
      <CorrectionAccounts entityId={entityId} />
    </div>
  );
}

function Integrity({ entityId }: { entityId: Id }) {
  const { state, t } = useStore();
  const say = useSay();
  const journals = state.journals.filter((j) => j.entityId === entityId);
  return (
    <div className="card flush">
      <table>
        <thead><tr><th>Journal</th><th className="num">{say('Écritures scellées', 'Sealed entries')}</th><th className="num">{say('Vérifiées', 'Verified')}</th><th>{say('État', 'Status')}</th><th>{say('Dernier hash', 'Last hash')}</th></tr></thead>
        <tbody>
          {journals.map((j) => {
            const checks = verifyChain(state, entityId, j.id);
            const ok = checks.filter((c) => c.ok).length;
            const head = state.chains[`${entityId}|${j.id}`];
            return <tr key={j.id}><td>{j.code} · {j.name}</td><td className="num">{checks.length}</td><td className="num">{ok}</td><td><Chip kind={checks.length === ok ? 'good' : 'crit'}>{checks.length === ok ? t('hash_ok') : t('hash_bad')}</Chip></td><td className="mono small muted">{head?.lastHash ? head.lastHash.slice(0, 20) + '…' : '—'}</td></tr>;
          })}
        </tbody>
      </table>
      <div className="small muted" style={{ padding: 10 }}>{say('Chaque écriture comptabilisée est hachée (SHA-256) avec le hash de la précédente dans le même journal ; une modification directe en base casse la chaîne et apparaît ici en rouge.', 'Each posted entry is hashed (SHA-256) with the hash of the previous one in the same journal; a direct change in the database breaks the chain and shows here in red.')}</div>
    </div>
  );
}
