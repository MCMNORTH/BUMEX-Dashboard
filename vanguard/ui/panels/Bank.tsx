import { useEffect, useMemo, useRef, useState } from 'react';
import {
  bankSummary, suggestFor, matchToPayment, recordPayment, bookByRule, bookToSuspense, bookTransfer, importStatement, parseStatementCsv, cashForecast, loanSummaries, loanSchedule, addLoan, payInstalment, headcount,
  addBankAccount, updateBankAccount, setBankAccountActive, setLoanSchedule, updateLoan, parseScheduleRows, checkManualSchedule,
  fmt, r2, addDays, parseAmount, type Id, type BankTransaction, type Currency, type Loan, type ManualInstalment, type BankAccount,
} from '@bumex/domain';
import { useStore } from '../../store';
import { Tabs, Field, Chip, D, Money, DeleteButton, downloadXlsx, readXlsx, entryRef } from '../common';
import { Select } from '../Select';
import { WideNote } from '../../one/WideNote'; // [mobile]

type Tab = 'accounts' | 'recon' | 'import' | 'forecast' | 'loans';

export function BankPanel({ entityId, initialTab }: { entityId: Id; initialTab?: string | null }) {
  const { state, t } = useStore();
  const [tab, setTab] = useState<Tab>((initialTab as Tab) || 'accounts');
  useEffect(() => { if (initialTab) setTab(initialTab as Tab); }, [initialTab]);
  const unmatched = state.bankTransactions.filter((x) => x.status === 'unmatched' && state.bankAccounts.find((b) => b.id === x.bankAccountId)?.entityId === entityId).length;
  const lateInstalments = loanSummaries(state, entityId).reduce((n, l) => n + l.overdue.length, 0);
  const tabs = [
    { id: 'accounts' as Tab, label: t('tab_accounts') }, { id: 'recon' as Tab, label: <>{t('tab_recon')} <Chip kind={unmatched ? 'warn' : 'good'}>{unmatched}</Chip></> }, { id: 'import' as Tab, label: t('tab_import') }, { id: 'forecast' as Tab, label: t('tab_forecast') },
    { id: 'loans' as Tab, label: <>{t('tab_loans')} {lateInstalments ? <Chip kind="warn">{lateInstalments}</Chip> : null}</> },
  ];
  return (
    <>
      <div className="sheet-head">
        <h1>{t('room_bank')}</h1>
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
      </div>
      <div className="sheet-body">
        {tab === 'accounts' && <Accounts entityId={entityId} />}
        {tab === 'recon' && <Recon entityId={entityId} />}
        {tab === 'import' && <Import entityId={entityId} />}
        {tab === 'forecast' && <Forecast entityId={entityId} />}
        {tab === 'loans' && <Loans entityId={entityId} />}
      </div>
    </>
  );
}

function Accounts({ entityId }: { entityId: Id }) {
  const { state, apply, t } = useStore();
  const rows = bankSummary(state, entityId);
  const entity = state.entities.find((e) => e.id === entityId)!;
  const [showInactive, setShowInactive] = useState(false);
  const shown = rows.filter((r) => showInactive || r.account.active !== false);
  const total = r2(shown.reduce((a, r) => a + r.bookBalanceFunctional, 0));
  const [editId, setEditId] = useState<Id | null | 'new'>(null);
  return (
    <div className="cols">
      <div className="grow">
        <div className="card flush">
          <div style={{ display: 'flex', gap: 8, padding: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <b>Comptes bancaires et caisses · {entity.name}</b>
            <label className="small"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> afficher les comptes désactivés</label>
            <button className="btn sm primary" style={{ marginLeft: 'auto' }} onClick={() => setEditId('new')}>Nouveau compte bancaire</button>
          </div>
          <table>
            <thead><tr><th>Compte</th><th>Banque · n° de compte</th><th>Devise</th><th>Compte comptable</th><th>Journal</th><th className="num">Solde comptable</th><th className="num">Solde relevé</th><th>Rapprochement</th><th></th></tr></thead>
            <tbody>
              {shown.map((r) => {
                const gl = state.accounts.find((a) => a.id === r.account.glAccountId);
                const j = state.journals.find((x) => x.id === r.account.journalId) ?? state.journals.find((x) => x.entityId === entityId && x.kind === (r.account.isCash ? 'cash' : 'bank'));
                return (
                  <tr key={r.account.id} className={r.account.id === editId ? 'sel' : ''} style={{ opacity: r.account.active === false ? 0.55 : 1 }}>
                    <td><b>{r.account.name}</b>{r.account.active === false && <Chip kind="off"> désactivé</Chip>}{r.account.showOnInvoices && <div className="small muted">imprimé sur les factures</div>}</td>
                    <td>{r.account.isCash ? <span className="muted">caisse</span> : <>{r.account.bankName}<div className="small muted mono">{r.account.accountNumber ?? r.account.iban ?? '—'}</div></>}</td>
                    <td>{r.account.currency}</td><td className="mono small">{gl ? `${gl.code} ${gl.nameFr}` : '—'}</td><td className="mono small">{j ? `${j.code} · ${j.name}` : '—'}</td>
                    <td className="num">{fmt(r.bookBalance)}</td><td className="num">{r.account.isCash ? '—' : fmt(r.statementBalance)}</td>
                    <td>{r.account.isCash ? <Chip kind="dim">comptage</Chip> : r.unmatched ? <Chip kind="warn">{r.unmatched} ligne(s) à traiter</Chip> : <Chip kind="good">à jour</Chip>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}><button className="btn sm" onClick={() => setEditId(r.account.id)}>{t('edit')}</button> {r.account.active === false ? <button className="btn sm" onClick={() => apply((s) => setBankAccountActive(s, r.account.id, true), 'Compte réactivé')}>Réactiver</button> : <button className="btn sm" onClick={() => apply((s) => setBankAccountActive(s, r.account.id, false), 'Compte désactivé')}>Désactiver</button>}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr><td colSpan={5}>Total contre-valeur {entity.functionalCurrency}</td><td className="num">{fmt(total)}</td><td colSpan={3}>Seuil du coffre : {fmt(entity.cashThreshold)} · <Chip kind={total >= entity.cashThreshold ? 'good' : 'crit'}>{total >= entity.cashThreshold ? 'au-dessus' : 'en dessous'}</Chip></td></tr></tfoot>
          </table>
          <div className="small muted" style={{ padding: 10 }}>Chaque opération d'un compte (encaissement, règlement, échéance d'emprunt, ligne de relevé) est comptabilisée sur le compte comptable et le journal attribués ici. L'écart entre le relevé et la comptabilité est la somme des lignes non rapprochées.</div>
        </div>
      </div>
      {editId && <aside className="side"><BankAccountForm entityId={entityId} id={editId === 'new' ? null : editId} onClose={() => setEditId(null)} /></aside>}
    </div>
  );
}

function BankAccountForm({ entityId, id, onClose }: { entityId: Id; id: Id | null; onClose: () => void }) {
  const { state, apply } = useStore();
  const b: BankAccount | undefined = id ? state.bankAccounts.find((x) => x.id === id) : undefined;
  const entity = state.entities.find((e) => e.id === entityId)!;
  const glAccounts = state.accounts.filter((a) => a.entityId === entityId && a.isPostable && a.active && !a.isAuxiliary && a.code.startsWith('5')).sort((a, b2) => a.code.localeCompare(b2.code));
  const journals = state.journals.filter((j) => j.entityId === entityId && (j.kind === 'bank' || j.kind === 'cash'));
  const [name, setName] = useState(b?.name ?? '');
  const [bankName, setBankName] = useState(b?.bankName ?? '');
  const [accountNumber, setAccountNumber] = useState(b?.accountNumber ?? '');
  const [rib, setRib] = useState(b?.rib ?? '');
  const [iban, setIban] = useState(b?.iban ?? '');
  const [bankAddress, setBankAddress] = useState(b?.bankAddress ?? '');
  const [currency, setCurrency] = useState<Currency>(b?.currency ?? entity.functionalCurrency);
  const [glAccountId, setGl] = useState(b?.glAccountId ?? '');
  const [journalId, setJournalId] = useState(b?.journalId ?? journals.find((j) => j.kind === 'bank')?.id ?? '');
  const [isCash, setIsCash] = useState(b?.isCash ?? false);
  const [showOnInvoices, setShow] = useState(b?.showOnInvoices ?? false);
  const used = !!b && state.entries.some((e) => e.status !== 'draft' && e.lines.some((l) => l.bankAccountId === b.id));
  const save = () => {
    const input = { name, bankName, accountNumber, rib, iban, bankAddress, currency, glAccountId, journalId: journalId || undefined, isCash, showOnInvoices };
    if (apply((s) => (b ? updateBankAccount(s, b.id, input) : addBankAccount(s, { entityId, ...input })), b ? 'Compte bancaire modifié' : 'Compte bancaire créé')) onClose();
  };
  return (
    <div className="card">
      <h2>{b ? `Compte · ${b.name}` : 'Nouveau compte bancaire'}</h2>
      <Field label="Intitulé du compte"><input className="in" value={name} onChange={(e) => setName(e.target.value)} placeholder="BMCI compte principal MRU" /></Field>
      <label className="small" style={{ display: 'block', margin: '8px 0' }}><input type="checkbox" checked={isCash} onChange={(e) => setIsCash(e.target.checked)} /> Caisse (espèces, sans relevé)</label>
      {!isCash && <>
        <Field label="Nom de la banque"><input className="in" value={bankName} onChange={(e) => setBankName(e.target.value)} /></Field>
        <div className="grid2" style={{ marginTop: 8 }}>
          <Field label="Numéro de compte"><input className="in mono" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} /></Field>
          <Field label="RIB"><input className="in mono" value={rib} onChange={(e) => setRib(e.target.value)} /></Field>
        </div>
        <Field label="IBAN" style={{ marginTop: 8 }}><input className="in mono" value={iban} onChange={(e) => setIban(e.target.value)} /></Field>
        <Field label="Adresse de la banque" style={{ marginTop: 8 }}><input className="in" value={bankAddress} onChange={(e) => setBankAddress(e.target.value)} /></Field>
      </>}
      <div className="grid2" style={{ marginTop: 8 }}>
        <Field label="Devise"><Select className="in" value={currency} disabled={used} onChange={(e) => setCurrency(e.target.value as Currency)}>{['MRU', 'USD', 'EUR', 'MAD'].map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Journal des opérations"><Select recent="journals" className="in" value={journalId} onChange={(e) => setJournalId(e.target.value)}>{journals.map((j) => <option key={j.id} value={j.id}>{j.code} · {j.name}</option>)}</Select></Field>
      </div>
      <Field label="Compte comptable (classe 5, imputable et actif)" style={{ marginTop: 8 }}><Select recent="accounts" className="in mono" value={glAccountId} disabled={used} onChange={(e) => setGl(e.target.value)}><option value="">—</option>{glAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.nameFr}</option>)}</Select></Field>
      <label className="small" style={{ display: 'block', margin: '8px 0' }}><input type="checkbox" checked={showOnInvoices} onChange={(e) => setShow(e.target.checked)} /> Imprimer les coordonnées sur les factures</label>
      {used && <div className="small muted">Des opérations existent : la devise et le compte comptable sont figés, le reste reste modifiable.</div>}
      <div className="small muted" style={{ marginTop: 6 }}>Un compte comptable absent du plan se crée dans Comptabilité › Plan comptable ; un journal de banque supplémentaire dans Comptabilité › Journaux · tiers.</div>
      <div className="actions" style={{ marginTop: 10 }}><button className="btn" onClick={onClose}>Annuler</button><button className="btn primary" disabled={!name.trim() || !glAccountId || (!isCash && !bankName.trim())} onClick={save}>{b ? 'Enregistrer' : 'Créer le compte'}</button></div>
    </div>
  );
}

function Recon({ entityId }: { entityId: Id }) {
  const { state, apply } = useStore();
  const banks = state.bankAccounts.filter((b) => b.entityId === entityId && b.active !== false && !b.isCash);
  const [bankId, setBankId] = useState(banks[0]?.id ?? '');
  const rows = state.bankTransactions.filter((x) => x.bankAccountId === bankId && x.status === 'unmatched').sort((a, b) => (a.date < b.date ? 1 : -1));
  const bank = banks.find((b) => b.id === bankId);
  const act = (txn: BankTransaction) => {
    const s = suggestFor(state, txn);
    const others = banks.filter((b) => b.id !== bankId);
    return (
      <td style={{ whiteSpace: 'nowrap' }}>
        {s.kind === 'payment' && <button className="btn sm primary" onClick={() => apply((st) => matchToPayment(st, txn.id, s.payment.id), 'Ligne rapprochée')}>Rapprocher</button>}
        {s.kind === 'invoice' && <button className="btn sm primary" onClick={() => apply((st) => recordPayment(st, { entityId, customerId: s.invoice.customerId, date: txn.date, currency: bank!.currency, amountTxn: txn.amount, bankAccountId: bankId, invoiceId: s.invoice.id, bankTransactionId: txn.id, reference: txn.reference ?? s.invoice.number }), 'Encaissement comptabilisé, facture lettrée, ligne rapprochée')}>Encaisser et rapprocher</button>}
        {s.kind === 'rule' && <button className="btn sm primary" onClick={() => apply((st) => bookByRule(st, txn.id, s.mappingKey), 'Comptabilisée par règle')}>Comptabiliser</button>}
        {s.kind === 'transfer' && others.map((o) => <button key={o.id} className="btn sm primary" style={{ marginRight: 4 }} onClick={() => apply((st) => bookTransfer(st, txn.id, o.id), 'Virement interne comptabilisé, les deux lignes rapprochées')}>Virement vers {o.name}</button>)}
        {' '}<button className="btn sm" onClick={() => apply((st) => bookToSuspense(st, txn.id), 'Mise en attente (488)')}>Mettre en attente</button>
      </td>
    );
  };
  return (
    <div className="card flush">
      <WideNote />{/* [mobile] */}
      <div style={{ display: 'flex', gap: 8, padding: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Select recent="banks" className="in" style={{ width: 300 }} value={bankId} onChange={(e) => setBankId(e.target.value)}>{banks.map((b) => <option key={b.id} value={b.id}>{b.bankName} · {b.name} ({b.currency})</option>)}</Select>
        <span className="muted small">{rows.length} ligne(s) non expliquée(s) · une ligne mise en attente compte comme écriture non comptabilisée sur la façade</span>
      </div>
      <table>
        <thead><tr><th>Date</th><th>Libellé relevé</th><th className="num">Montant</th><th>Proposition</th><th>Action</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={5} className="muted">Tout est rapproché sur ce compte.</td></tr>}
          {rows.map((txn) => {
            const s = suggestFor(state, txn);
            return <tr key={txn.id}><td><D iso={txn.date} /></td><td>{txn.description}</td><td className="num" style={{ color: txn.amount < 0 ? 'var(--crit)' : undefined }}>{fmt(txn.amount)}</td><td><Chip kind={s.kind === 'none' ? 'warn' : 'good'}>{s.label}</Chip></td>{act(txn)}</tr>;
          })}
        </tbody>
      </table>
    </div>
  );
}

function Import({ entityId }: { entityId: Id }) {
  const { state, apply } = useStore();
  const banks = state.bankAccounts.filter((b) => b.entityId === entityId && b.active !== false && !b.isCash);
  const [bankId, setBankId] = useState(banks[0]?.id ?? '');
  const sample = `${addDays(state.today, 0).split('-').reverse().join('/')};VIR RECU CLIENT HOTEL M;150000\n${addDays(state.today, -1).split('-').reverse().join('/')};COMMISSION VIREMENT INTERNATIONAL;-6500\n${addDays(state.today, -1).split('-').reverse().join('/')};PRLV TELECOMS J;-71920`;
  const [text, setText] = useState('');
  const parsed = useMemo(() => parseStatementCsv(text), [text]);
  return (
    <div className="cols">
      <div className="grow">
        <div className="card">
          <h2>Coller un relevé (CSV : date;libellé;montant[;référence])</h2>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <Select recent="banks" className="in" style={{ width: 300 }} value={bankId} onChange={(e) => setBankId(e.target.value)}>{banks.map((b) => <option key={b.id} value={b.id}>{b.bankName} · {b.name} ({b.currency})</option>)}</Select>
            <button className="btn sm" onClick={() => setText(sample)}>Exemple</button>
            <span className="muted small">Dates JJ/MM/AAAA ou AAAA-MM-JJ, montants signés, virgule ou point. Les doublons sont ignorés à la ré-importation.</span>
          </div>
          <textarea className="in" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={sample} aria-label="Relevé CSV" />
          <div className="actions" style={{ marginTop: 8 }}>
            <span className="small muted" style={{ marginRight: 'auto' }}>{parsed.length} ligne(s) reconnue(s)</span>
            <button className="btn primary" disabled={!parsed.length} onClick={() => { if (apply((s) => importStatement(s, bankId, parsed), `${parsed.length} ligne(s) importée(s) · à rapprocher`)) setText(''); }}>Importer</button>
          </div>
        </div>
      </div>
      <aside className="side">
        <div className="card">
          <h2>Aperçu</h2>
          <table><tbody>{parsed.slice(0, 10).map((l, i) => <tr key={i}><td><D iso={l.date} /></td><td className="small">{l.description}</td><td className="num">{fmt(l.amount)}</td></tr>)}</tbody></table>
        </div>
      </aside>
    </div>
  );
}

function Forecast({ entityId }: { entityId: Id }) {
  const { state } = useStore();
  const entity = state.entities.find((e) => e.id === entityId)!;
  // monthly cash out for staff: the last posted payroll run (employer cost), else the current headcount's cost
  const lastRun = state.payrollRuns.filter((r) => r.entityId === entityId && r.status === 'posted').sort((a, b) => (a.month < b.month ? 1 : -1))[0];
  const payroll = r2(lastRun ? lastRun.totals.employerCost : headcount(state, entityId).monthlyEmployerCost);
  const weeks = cashForecast(state, entityId, 13, payroll);
  const max = Math.max(...weeks.map((w) => Math.abs(w.balance)), entity.cashThreshold, 1);
  const W = 720, H = 220, pad = 36;
  const bw = (W - pad * 2) / weeks.length;
  const y = (v: number) => H - pad - ((v + max * 0.1) / (max * 1.2)) * (H - pad * 2);
  return (
    <div className="cols">
      <div className="grow">
        <div className="card">
          <h2>Trésorerie prévisionnelle · 13 semaines · {entity.functionalCurrency}</h2>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Solde prévisionnel par semaine" style={{ width: '100%', height: 'auto', fontFamily: 'var(--mono)', fontSize: 11 }}>
            <line x1={pad} x2={W - pad} y1={y(entity.cashThreshold)} y2={y(entity.cashThreshold)} stroke="#a35a00" strokeDasharray="4 4" />
            <text x={W - pad} y={y(entity.cashThreshold) - 4} textAnchor="end" fill="#a35a00">seuil {fmt(entity.cashThreshold, 0)}</text>
            <line x1={pad} x2={W - pad} y1={y(0)} y2={y(0)} stroke="#cbd2da" />
            {weeks.map((w, i) => {
              const x = pad + i * bw + 4;
              const top = Math.min(y(w.balance), y(0));
              const h = Math.abs(y(w.balance) - y(0));
              return (
                <g key={w.weekStart}>
                  <rect x={x} y={top} width={bw - 8} height={Math.max(2, h)} fill={w.balance < entity.cashThreshold ? '#a35a00' : '#0e6e6a'} rx="3" />
                  <text x={x + (bw - 8) / 2} y={H - pad + 14} textAnchor="middle" fill="#5e6773">{w.label}</text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      <aside className="side">
        <div className="card flush">
          <table>
            <thead><tr><th>Semaine</th><th className="num">Entrées</th><th className="num">Sorties</th><th className="num">Solde</th></tr></thead>
            <tbody>{weeks.map((w) => <tr key={w.weekStart}><td>{w.label} · <span className="small muted"><D iso={w.weekStart} /></span></td><td className="num">{fmt(w.inflow, 0)}</td><td className="num">{fmt(w.outflow, 0)}</td><td className="num" style={{ color: w.balance < entity.cashThreshold ? 'var(--warn)' : undefined }}>{fmt(w.balance, 0)}</td></tr>)}</tbody>
          </table>
          <div className="small muted" style={{ padding: 10 }}>Entrées : factures clients à l'échéance (en retard : 60 % en semaine 2). Sorties : factures fournisseurs approuvées, paie mensuelle estimée {fmt(payroll, 0)} le 28.</div>
        </div>
      </aside>
    </div>
  );
}

function Loans({ entityId }: { entityId: Id }) {
  const { state, apply, toast } = useStore();
  const summaries = loanSummaries(state, entityId);
  const [loanId, setLoanId] = useState<Id | null>(summaries[0]?.loan.id ?? null);
  const [showNew, setShowNew] = useState(summaries.length === 0);
  const sel = summaries.find((x) => x.loan.id === loanId) ?? summaries[0];
  const entity = state.entities.find((e) => e.id === entityId)!;
  const totalOutstanding = r2(summaries.filter((s) => s.loan.status === 'active').reduce((a, s) => a + s.outstanding, 0));
  const [payDate, setPayDate] = useState(state.today);
  const [editSchedule, setEditSchedule] = useState(false);
  const exportXlsx = () => sel && downloadXlsx(`echeancier-${sel.loan.reference}.xlsx`, [{ name: 'Échéancier', rows: [['N°', 'Date', 'Capital restant dû', 'Capital', 'Intérêts', 'Frais', 'Total', 'Restant après', 'Réglée le'], ...sel.schedule.map((i) => [i.no, i.date, i.opening, i.capital, i.interest, i.fees, i.total, i.closing, i.paid?.date ?? ''])] }], toast);
  return (
    <>
      <div className="grid4">
        <div className="kpi"><div className="l">Emprunts actifs</div><div className="v">{summaries.filter((s) => s.loan.status === 'active').length}</div></div>
        <div className="kpi"><div className="l">Capital restant dû</div><div className="v">{fmt(totalOutstanding, 0)}</div></div>
        <div className="kpi"><div className="l">Échéances en retard</div><div className="v" style={{ color: summaries.some((s) => s.overdue.length) ? 'var(--crit)' : undefined }}>{summaries.reduce((n, s) => n + s.overdue.length, 0)}</div></div>
        <div className="kpi"><div className="l">Intérêts restant à payer</div><div className="v">{fmt(r2(summaries.reduce((a, s) => a + s.interestRemaining, 0)), 0)}</div></div>
      </div>
      <div className="card flush">
        <div style={{ display: 'flex', gap: 8, padding: 10, alignItems: 'center' }}>
          <span className="small muted">Cliquer un emprunt pour son échéancier</span>
          <button className="btn sm primary" style={{ marginLeft: 'auto' }} onClick={() => setShowNew((v) => !v)}>{showNew ? 'Fermer' : 'Nouvel emprunt'}</button>
        </div>
        <table>
          <thead><tr><th>Référence</th><th>Prêteur</th><th className="num">Montant</th><th className="num">Taux</th><th>Durée · périodicité</th><th>Méthode</th><th>Déblocage</th><th className="num">Réglées</th><th className="num">Restant dû</th><th>Prochaine échéance</th><th>Statut</th><th></th></tr></thead>
          <tbody>
            {summaries.map((s) => (
              <tr key={s.loan.id} className={sel?.loan.id === s.loan.id ? 'sel' : ''} onClick={() => setLoanId(s.loan.id)} style={{ cursor: 'pointer' }}>
                <td className="mono">{s.loan.reference}</td><td>{s.loan.lender}</td><td className="num">{s.loan.currency} {fmt(s.loan.principal, 0)}</td><td className="num">{(s.loan.annualRate * 100).toFixed(2)} %</td><td>{s.loan.months} mois · {s.loan.frequency === 'monthly' ? 'mensuelle' : 'trimestrielle'}</td><td>{s.loan.method === 'annuity' ? 'Annuités constantes' : 'Capital constant'}</td><td><D iso={s.loan.startDate} /></td><td className="num">{s.paidCount} / {s.schedule.length}</td><td className="num">{fmt(s.outstanding, 0)}</td>
                <td>{s.nextDue ? <>{s.overdue.length ? <Chip kind="crit">{s.overdue.length} en retard</Chip> : <Chip kind={s.nextDue.date <= addDays(state.today, 30) ? 'warn' : 'good'}><D iso={s.nextDue.date} /></Chip>} <span className="small">{fmt(s.nextDue.total, 0)}</span></> : '—'}</td>
                <td><Chip kind={s.loan.status === 'active' ? 'good' : 'dim'}>{s.loan.status === 'active' ? 'En cours' : 'Soldé'}</Chip></td>
                <td onClick={(e) => e.stopPropagation()}><DeleteButton table="loan" rowId={s.loan.id} label={`Emprunt ${s.loan.reference}`} entityId={entityId} /></td>
              </tr>
            ))}
            {summaries.length === 0 && <tr><td colSpan={12} className="muted small">Aucun emprunt</td></tr>}
          </tbody>
        </table>
      </div>
      {showNew && <NewLoan entityId={entityId} onDone={(id) => { setLoanId(id); setShowNew(false); }} />}
      {sel && (
        <div className="cols">
          <div className="grow">
            <div className="card flush">
              <div style={{ display: 'flex', gap: 8, padding: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <b>Échéancier · {sel.loan.reference} · {sel.loan.lender}</b>
                <Chip kind={sel.loan.scheduleMode === 'manual' ? 'warn' : 'dim'}>{sel.loan.scheduleMode === 'manual' ? 'échéancier de la banque (manuel)' : 'calculé automatiquement'}</Chip>
                <span className="small muted">{sel.loan.notes}</span>
                <span style={{ marginLeft: 'auto' }} />
                {sel.loan.status === 'active' && <button className="btn sm" onClick={() => setEditSchedule((v) => !v)}>{editSchedule ? 'Fermer la saisie' : sel.loan.scheduleMode === 'manual' ? "Modifier l'échéancier" : 'Passer en échéancier manuel'}</button>}
                <button className="btn sm" onClick={exportXlsx}>Exporter (Excel)</button>
              </div>
              {editSchedule && <ScheduleEditor loan={sel.loan} onClose={() => setEditSchedule(false)} />}
              <div className="sched">
                <table>
                  <thead><tr><th>N°</th><th>Date</th><th className="num">Capital restant dû</th><th className="num">Capital</th><th className="num">Intérêts</th><th className="num">Frais</th><th className="num">Échéance</th><th className="num">Restant après</th><th>Statut</th><th></th></tr></thead>
                  <tbody>
                    {sel.schedule.map((i) => {
                      const next = sel.loan.status === 'active' && !i.paid && sel.schedule.every((x) => x.no >= i.no || x.paid);
                      return (
                        <tr key={i.no} className={next ? 'sel' : ''}><td className="mono">{i.no}</td><td><D iso={i.date} /></td><td className="num">{fmt(i.opening, 0)}</td><td className="num">{fmt(i.capital, 0)}</td><td className="num">{fmt(i.interest, 0)}</td><td className="num">{fmt(i.fees, 0)}</td><td className="num"><b>{fmt(i.total, 0)}</b></td><td className="num">{fmt(i.closing, 0)}</td>
                          <td>{i.paid ? <Chip kind="good">réglée le {i.paid.date}</Chip> : i.date < state.today ? <Chip kind="crit">en retard</Chip> : <Chip kind="dim">à venir</Chip>}</td>
                          <td>{next && <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><input className="in mono" type="date" style={{ width: 140 }} value={payDate} onChange={(e) => setPayDate(e.target.value)} aria-label="Date du règlement" /><button className="btn sm primary" onClick={() => apply((s) => payInstalment(s, { loanId: sel.loan.id, instalmentNo: i.no, date: payDate }), `Échéance ${i.no} enregistrée et comptabilisée`)}>Régler</button></span>}</td></tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <aside className="side">
            <div className="card">
              <h2>Situation</h2>
              <div className="kv">
                <span className="k">Montant emprunté</span><Money v={sel.loan.principal} cur={sel.loan.currency} />
                <span className="k">Capital remboursé</span><Money v={r2(sel.loan.principal - sel.outstanding)} />
                <span className="k">Capital restant dû</span><b><Money v={sel.outstanding} /></b>
                <span className="k">Intérêts payés</span><Money v={sel.interestPaid} />
                <span className="k">Intérêts restants</span><Money v={sel.interestRemaining} />
                <span className="k">Coût total du crédit</span><Money v={r2(sel.schedule.reduce((a, i) => a + i.interest + i.fees, 0))} />
                <span className="k">Compte bancaire</span><span>{state.bankAccounts.find((b) => b.id === sel.loan.bankAccountId)?.name}</span>
                <span className="k">Compte d'emprunt</span><span className="mono">{(() => { const a = state.accounts.find((x) => x.id === sel.loan.loanAccountId) ?? state.accounts.find((x) => x.id === state.mappings.find((m) => m.entityId === entityId && m.key === 'LOAN_PAYABLE' && !m.qualifier)?.accountId); return a ? `${a.code} ${a.nameFr}` : '—'; })()}</span>
                <span className="k">Compte d'intérêts</span><span className="mono">{(() => { const a = state.accounts.find((x) => x.id === sel.loan.interestAccountId) ?? state.accounts.find((x) => x.id === state.mappings.find((m) => m.entityId === entityId && m.key === 'LOAN_INTEREST' && !m.qualifier)?.accountId); return a ? `${a.code} ${a.nameFr}` : '—'; })()}</span>
                <span className="k">Journal</span><span className="mono">{(() => { const j = state.journals.find((x) => x.id === sel.loan.journalId) ?? state.journals.find((x) => x.id === state.bankAccounts.find((b) => b.id === sel.loan.bankAccountId)?.journalId) ?? state.journals.find((x) => x.entityId === entityId && x.kind === 'bank'); return j ? `${j.code} · ${j.name}` : '—'; })()}</span>
                <span className="k">Déblocage</span><span>{sel.loan.drawdownEntryId ? <span className="mono">{entryRef(state, state.entries.find((e) => e.id === sel.loan.drawdownEntryId))}</span> : 'repris en solde d\'ouverture'}</span>
              </div>
              <div className="small muted" style={{ marginTop: 8 }}>Chaque règlement passe une écriture : emprunt D (capital) · intérêts D · frais D · banque C. Les échéances se règlent dans l'ordre ; le capital restant dû suit les règlements réellement enregistrés.</div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function NewLoan({ entityId, onDone }: { entityId: Id; onDone: (id: Id) => void }) {
  const { state, apply } = useStore();
  const entity = state.entities.find((e) => e.id === entityId)!;
  const banks = state.bankAccounts.filter((b) => b.entityId === entityId && b.active !== false && !b.isCash);
  const [lender, setLender] = useState('');
  const [reference, setReference] = useState('');
  const [currency, setCurrency] = useState<Currency>(entity.functionalCurrency);
  const [bankId, setBankId] = useState(banks.find((b) => b.currency === entity.functionalCurrency)?.id ?? banks[0]?.id ?? '');
  const [principal, setPrincipal] = useState('');
  const [rate, setRate] = useState('8');
  const [months, setMonths] = useState('36');
  const [start, setStart] = useState(state.today);
  const [frequency, setFrequency] = useState<Loan['frequency']>('monthly');
  const [method, setMethod] = useState<Loan['method']>('annuity');
  const [fee, setFee] = useState('0');
  const [notes, setNotes] = useState('');
  const [post, setPost] = useState(true);
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [manualRows, setManualRows] = useState<ManualInstalment[]>([]);
  const [interestAccountId, setInterestAccountId] = useState('');
  const [loanAccountId, setLoanAccountId] = useState('');
  const [journalId, setJournalId] = useState('');
  const accounts = state.accounts.filter((a) => a.entityId === entityId && a.isPostable && a.active && !a.isAuxiliary);
  const journals = state.journals.filter((j) => j.entityId === entityId && (j.kind === 'bank' || j.kind === 'misc'));
  const p = parseAmount(principal) ?? 0;
  const preview = useMemo(() => { if (p <= 0 || !(Number(months) >= 1)) return []; try { return loanSchedule({ id: 'x', entityId, lender, reference, currency, principal: p, annualRate: (parseAmount(rate) ?? 0) / 100, months: Number(months), startDate: start, frequency, method, feePerInstalment: parseAmount(fee) ?? 0, bankAccountId: bankId, status: 'active', scheduleMode: mode, manualSchedule: mode === 'manual' ? manualRows : undefined }); } catch { return []; } }, [p, months, rate, start, frequency, method, fee, bankId, entityId, lender, reference, currency, mode, manualRows]);
  const manualError = useMemo(() => { if (mode !== 'manual') return null; try { checkManualSchedule(p, manualRows); return null; } catch (e) { return e instanceof Error ? e.message : String(e); } }, [mode, manualRows, p]);
  const save = () => apply((s) => { const [s1, l] = addLoan(s, { entityId, lender, reference, currency, principal: p, annualRate: (parseAmount(rate) ?? 0) / 100, months: Number(months), startDate: start, frequency, method, feePerInstalment: parseAmount(fee) ?? 0, bankAccountId: bankId, notes: notes || undefined, postDrawdown: post, scheduleMode: mode, manualSchedule: mode === 'manual' ? manualRows : undefined, interestAccountId: interestAccountId || undefined, loanAccountId: loanAccountId || undefined, journalId: journalId || undefined }); window.setTimeout(() => onDone(l.id), 0); return s1; }, post ? 'Emprunt enregistré · déblocage comptabilisé' : 'Emprunt enregistré');
  return (
    <div className="cols">
      <form className="grow" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2>Nouvel emprunt</h2>
          <div className="grid3">
            <Field label="Prêteur"><input className="in" value={lender} onChange={(e) => setLender(e.target.value)} placeholder="BMCI · BNM · Attijari…" /></Field>
            <Field label="Référence du contrat"><input className="in mono" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
            <Field label="Compte bancaire de déblocage et de prélèvement"><Select recent="banks" className="in" value={bankId} onChange={(e) => { setBankId(e.target.value); const b = banks.find((x) => x.id === e.target.value); if (b) setCurrency(b.currency); }}>{banks.map((b) => <option key={b.id} value={b.id}>{b.bankName} · {b.name} · {b.currency}</option>)}</Select></Field>
            <Field label={`Montant emprunté (${currency})`}><input className="in num" value={principal} onChange={(e) => setPrincipal(e.target.value)} /></Field>
            <Field label="Taux annuel (%)"><input className="in num" value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
            <Field label="Durée (mois)"><input className="in num" value={months} onChange={(e) => setMonths(e.target.value)} /></Field>
            <Field label="Date de déblocage"><input className="in mono" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field label="Périodicité"><Select className="in" value={frequency} onChange={(e) => setFrequency(e.target.value as Loan['frequency'])}><option value="monthly">Mensuelle</option><option value="quarterly">Trimestrielle</option></Select></Field>
            <Field label="Méthode"><Select className="in" value={method} onChange={(e) => setMethod(e.target.value as Loan['method'])}><option value="annuity">Annuités constantes</option><option value="linear">Capital constant</option></Select></Field>
            <Field label="Frais par échéance"><input className="in num" value={fee} onChange={(e) => setFee(e.target.value)} /></Field>
            <Field label="Conditions · notes" style={{ gridColumn: 'span 2' }}><input className="in" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Garantie, différé, assurance…" /></Field>
            <Field label="Échéancier"><Select className="in" value={mode} onChange={(e) => setMode(e.target.value as 'auto' | 'manual')}><option value="auto">Calculé automatiquement</option><option value="manual">Saisi d'après le tableau de la banque</option></Select></Field>
            <Field label="Compte d'emprunt (défaut : paramétrage)"><Select recent="accounts" className="in mono" value={loanAccountId} onChange={(e) => setLoanAccountId(e.target.value)}><option value="">Paramétrage · emprunts</option>{accounts.filter((a) => a.code.startsWith('1')).map((a) => <option key={a.id} value={a.id}>{a.code} {a.nameFr}</option>)}</Select></Field>
            <Field label="Compte d'intérêts (défaut : paramétrage)"><Select recent="accounts" className="in mono" value={interestAccountId} onChange={(e) => setInterestAccountId(e.target.value)}><option value="">Paramétrage · intérêts</option>{accounts.filter((a) => a.code.startsWith('6')).map((a) => <option key={a.id} value={a.id}>{a.code} {a.nameFr}</option>)}</Select></Field>
            <Field label="Journal (défaut : celui du compte bancaire)"><Select recent="journals" className="in" value={journalId} onChange={(e) => setJournalId(e.target.value)}><option value="">Journal du compte bancaire</option>{journals.map((j) => <option key={j.id} value={j.id}>{j.code} · {j.name}</option>)}</Select></Field>
          </div>
          {mode === 'manual' && <ManualRows principal={p} rows={manualRows} onChange={setManualRows} startDate={start} />}
          {manualError && <div className="banner warn">{manualError}</div>}
          <label className="small"><input type="checkbox" checked={post} onChange={(e) => setPost(e.target.checked)} /> Comptabiliser le déblocage (banque D · emprunt C) à la date de déblocage</label>
          <div className="actions"><button type="submit" className="btn primary" disabled={!lender.trim() || !reference.trim() || p <= 0 || !bankId || (mode === 'manual' && (!!manualError || manualRows.length === 0))}>Enregistrer l'emprunt</button></div>
        </div>
      </form>
      <aside className="side">
        <div className="card">
          <h2>Aperçu de l'échéancier</h2>
          {preview.length ? <><div className="kv"><span className="k">Échéances</span><span>{preview.length} × {fmt(preview[0].total, 0)}{mode === 'manual' ? ' (saisi)' : method === 'linear' ? ' (dégressif)' : ''}</span><span className="k">Intérêts totaux</span><Money v={r2(preview.reduce((a, i) => a + i.interest, 0))} /><span className="k">Dernière échéance</span><span>{preview[preview.length - 1].date}</span></div><div className="sched" style={{ maxHeight: 220, marginTop: 8 }}><table><tbody>{preview.slice(0, 12).map((i) => <tr key={i.no}><td className="mono">{i.no}</td><td>{i.date}</td><td className="num">{fmt(i.capital, 0)}</td><td className="num">{fmt(i.interest, 0)}</td><td className="num">{fmt(i.total, 0)}</td></tr>)}{preview.length > 12 && <tr><td colSpan={5} className="muted small">… {preview.length - 12} autres échéances</td></tr>}</tbody></table></div></> : <div className="small muted">Saisir le montant, le taux et la durée.</div>}
        </div>
      </aside>
    </div>
  );
}


// The bank's own table, line by line: date, capital, interest, fees. Rows can be pasted from an Excel export.
function ManualRows({ principal, rows, onChange, startDate }: { principal: number; rows: ManualInstalment[]; onChange: (r: ManualInstalment[]) => void; startDate: string }) {
  const { toast } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (i: number, patch: Partial<ManualInstalment>) => onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const add = () => { const last = rows[rows.length - 1]; onChange([...rows, { no: rows.length + 1, date: last ? addDays(last.date, 30) : addDays(startDate, 30), capital: 0, interest: 0, fees: 0 }]); };
  const remove = (i: number) => onChange(rows.filter((_, k) => k !== i).map((r, k) => ({ ...r, no: k + 1 })));
  const onFile = async (f: File | undefined) => { if (!f) return; try { const parsed = parseScheduleRows(await readXlsx(f)); if (!parsed.length) throw new Error('Aucune ligne reconnue (colonnes attendues : Date, Capital, Intérêts, Frais)'); onChange(parsed.map((r, i) => ({ ...r, no: i + 1 }))); toast('ok', `${parsed.length} échéances importées`); } catch (e) { toast('error', e instanceof Error ? e.message : String(e)); } if (fileRef.current) fileRef.current.value = ''; };
  const totalCap = r2(rows.reduce((a, r) => a + (Number(r.capital) || 0), 0));
  return (
    <div className="card flush" style={{ border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', gap: 8, padding: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <b>Échéancier de la banque</b>
        <span className="small muted">capital saisi {fmt(totalCap, 0)} / {fmt(principal, 0)}{Math.abs(totalCap - principal) > 0.01 ? ` · reste ${fmt(r2(principal - totalCap), 0)}` : ' · complet'}</span>
        <span style={{ marginLeft: 'auto' }} />
        <button type="button" className="btn sm" onClick={() => fileRef.current?.click()}>Importer (Excel)</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={(e) => onFile(e.target.files?.[0])} aria-label="Fichier d'échéancier" />
        <button type="button" className="btn sm" onClick={add}>+ échéance</button>
      </div>
      <div className="sched" style={{ maxHeight: 300 }}>
        <table>
          <thead><tr><th>N°</th><th>Date</th><th className="num">Capital</th><th className="num">Intérêts</th><th className="num">Frais</th><th className="num">Total</th><th></th></tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}><td className="mono">{r.no}</td><td><input className="in mono" type="date" value={r.date} onChange={(e) => set(i, { date: e.target.value })} aria-label={`Date ${r.no}`} /></td><td><input className="in num" value={String(r.capital)} onChange={(e) => set(i, { capital: parseAmount(e.target.value) ?? 0 })} aria-label={`Capital ${r.no}`} /></td><td><input className="in num" value={String(r.interest)} onChange={(e) => set(i, { interest: parseAmount(e.target.value) ?? 0 })} aria-label={`Intérêts ${r.no}`} /></td><td><input className="in num" value={String(r.fees)} onChange={(e) => set(i, { fees: parseAmount(e.target.value) ?? 0 })} aria-label={`Frais ${r.no}`} /></td><td className="num">{fmt(r2((Number(r.capital) || 0) + (Number(r.interest) || 0) + (Number(r.fees) || 0)))}</td><td><button type="button" className="btn sm" onClick={() => remove(i)} aria-label="Retirer">×</button></td></tr>)}{rows.length === 0 && <tr><td colSpan={7} className="muted small">Ajouter les échéances une à une ou importer le tableau de la banque (colonnes Date, Capital, Intérêts, Frais).</td></tr>}</tbody>
        </table>
      </div>
    </div>
  );
}

function ScheduleEditor({ loan, onClose }: { loan: Loan; onClose: () => void }) {
  const { state, apply } = useStore();
  const initial = useMemo(() => (loan.scheduleMode === 'manual' && loan.manualSchedule?.length ? loan.manualSchedule : loanSchedule(loan, state.loanPayments).map((i) => ({ no: i.no, date: i.date, capital: i.capital, interest: i.interest, fees: i.fees }))), [loan, state.loanPayments]);
  const [rows, setRows] = useState<ManualInstalment[]>(initial);
  const paid = state.loanPayments.filter((p) => p.loanId === loan.id).map((p) => p.instalmentNo);
  const error = useMemo(() => { try { checkManualSchedule(loan.principal, rows); return null; } catch (e) { return e instanceof Error ? e.message : String(e); } }, [rows, loan.principal]);
  return (
    <div style={{ padding: 10, borderBottom: '1px solid var(--line)' }}>
      <div className="small muted" style={{ marginBottom: 6 }}>Les échéances déjà réglées ({paid.length ? paid.join(', ') : 'aucune'}) ne changent plus ; les autres suivent les conditions réelles du contrat.</div>
      <ManualRows principal={loan.principal} rows={rows} onChange={setRows} startDate={loan.startDate} />
      {error && <div className="banner warn" style={{ marginTop: 8 }}>{error}</div>}
      <div className="actions" style={{ marginTop: 8 }}>
        <button className="btn" onClick={onClose}>Annuler</button>
        {loan.scheduleMode === 'manual' && <button className="btn" onClick={() => { if (apply((s) => updateLoan(s, loan.id, { scheduleMode: 'auto' }), 'Échéancier calculé rétabli')) onClose(); }}>Revenir au calcul automatique</button>}
        <button className="btn primary" disabled={!!error} onClick={() => { if (apply((s) => setLoanSchedule(s, loan.id, rows), 'Échéancier enregistré')) onClose(); }}>Enregistrer l'échéancier</button>
      </div>
    </div>
  );
}
