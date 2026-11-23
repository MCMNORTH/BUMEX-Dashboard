import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  bankSummary, suggestFor, matchToPayment, recordPayment, bookByRule, bookToSuspense, bookTransfer, assignStatementLine, applyBankRules, suspenseSummary, splitOf, importStatement, parseStatementCsv, cashForecast, loanSummaries, loanSchedule, addLoan, payInstalment, headcount,
  addBankAccount, updateBankAccount, setBankAccountActive, favoritesFirst, setLoanSchedule, updateLoan, parseScheduleRows, checkManualSchedule,
  fmt, r2, addDays, parseAmount, type Id, type BankTransaction, type Currency, type Loan, type ManualInstalment, type BankAccount,
} from '@bumex/domain';
import { useStore } from '../../store';
import { Tabs, Field, Chip, D, Money, DeleteButton, downloadXlsx, readXlsx, entryRef } from '../common';
import { Select } from '../Select';
import { WideNote } from '../../one/WideNote'; // [mobile]
import { AssignLine, BankRules, propositionOf } from '../../one/BankAssign'; // [bumex-one] a line to any account, rules on the label
import { useSay } from '../../one/say';
import { PageRefresh } from '../../one/PageRefresh'; // [bumex-one] ↻ at the right of the header (2026-11-22)
// [bumex-one] bilingual: every text follows the person's language, say('français', 'English') (vanguard/one/say.ts, 2026-11-21)

type Tab = 'accounts' | 'recon' | 'rules' | 'import' | 'forecast' | 'loans';

export function BankPanel({ entityId, initialTab }: { entityId: Id; initialTab?: string | null }) {
  const { state, t } = useStore();
  const say = useSay();
  const [tab, setTab] = useState<Tab>((initialTab as Tab) || 'accounts');
  useEffect(() => { if (initialTab) setTab(initialTab as Tab); }, [initialTab]);
  const unmatched = state.bankTransactions.filter((x) => x.status === 'unmatched' && state.bankAccounts.find((b) => b.id === x.bankAccountId)?.entityId === entityId).length;
  const lateInstalments = loanSummaries(state, entityId).reduce((n, l) => n + l.overdue.length, 0);
  const tabs = [
    { id: 'accounts' as Tab, label: t('tab_accounts') }, { id: 'recon' as Tab, label: <>{t('tab_recon')} <Chip kind={unmatched ? 'warn' : 'good'}>{unmatched}</Chip></> }, { id: 'rules' as Tab, label: say('Règles', 'Rules') }, { id: 'import' as Tab, label: t('tab_import') }, { id: 'forecast' as Tab, label: t('tab_forecast') },
    { id: 'loans' as Tab, label: <>{t('tab_loans')} {lateInstalments ? <Chip kind="warn">{lateInstalments}</Chip> : null}</> },
  ];
  return (
    <>
      <div className="sheet-head">
        <h1>{t('room_bank')}</h1>
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
        <PageRefresh />
      </div>
      <div className="sheet-body">
        {tab === 'accounts' && <Accounts entityId={entityId} />}
        {tab === 'recon' && <Recon entityId={entityId} />}
        {tab === 'rules' && <BankRules entityId={entityId} />}
        {tab === 'import' && <Import entityId={entityId} />}
        {tab === 'forecast' && <Forecast entityId={entityId} />}
        {tab === 'loans' && <Loans entityId={entityId} />}
      </div>
    </>
  );
}

function Accounts({ entityId }: { entityId: Id }) {
  const { state, apply, t, openRoom } = useStore(); // [bumex-one] openRoom: Réglages › Taux de change
  const say = useSay();
  const rows = bankSummary(state, entityId);
  const entity = state.entities.find((e) => e.id === entityId)!;
  const [showInactive, setShowInactive] = useState(false);
  // [bumex-one] the favourite accounts first (asked on 2026-11-17): the new invoice's bank, first in every list
  const order = new Map(favoritesFirst(rows.map((r) => r.account)).map((a, i) => [a.id, i]));
  const shown = rows.filter((r) => showInactive || r.account.active !== false).sort((a, b) => order.get(a.account.id)! - order.get(b.account.id)!);
  const star = (b: BankAccount) => apply((s) => updateBankAccount(s, b.id, { favorite: !b.favorite }), b.favorite ? say('Retiré des favoris', 'Removed from favorites') : say('Compte favori : proposé en premier sur les factures', 'Favorite account: offered first on invoices'));
  const total = r2(shown.reduce((a, r) => a + r.bookBalanceFunctional, 0));
  const [editId, setEditId] = useState<Id | null | 'new'>(null);
  return (
    <div className="cols">
      <div className="grow">
        <div className="card flush">
          <div style={{ display: 'flex', gap: 8, padding: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <b>{say('Comptes bancaires et caisses', 'Bank accounts and cash desks')} · {entity.name}</b>
            <label className="small"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> {say('Afficher les comptes désactivés', 'Show inactive accounts')}</label>
            <button className="btn sm primary" style={{ marginLeft: 'auto' }} onClick={() => setEditId('new')}>{say('Nouveau compte bancaire', 'New bank account')}</button>
          </div>
          <table>
            <thead><tr><th>{say('Compte', 'Account')}</th><th>{say('Banque · n° de compte', 'Bank · account no.')}</th><th>{say('Devise', 'Currency')}</th><th>{say('Compte comptable', 'GL account')}</th><th>{say('Journal', 'Journal')}</th><th className="num">{say('Solde comptable', 'Book balance')}</th><th className="num">{say('Solde relevé', 'Statement balance')}</th><th>{say('Rapprochement', 'Reconciliation')}</th><th></th></tr></thead>
            <tbody>
              {shown.map((r) => {
                const gl = state.accounts.find((a) => a.id === r.account.glAccountId);
                const j = state.journals.find((x) => x.id === r.account.journalId) ?? state.journals.find((x) => x.entityId === entityId && x.kind === (r.account.isCash ? 'cash' : 'bank'));
                return (
                  <tr key={r.account.id} className={r.account.id === editId ? 'sel' : ''} style={{ opacity: r.account.active === false ? 0.55 : 1 }}>
                    <td style={{ whiteSpace: 'nowrap' }}>{!r.account.isCash && <button type="button" className="btn sm" style={{ padding: '0 6px', marginRight: 6, color: r.account.favorite ? 'var(--c-amber)' : 'var(--muted)', border: 0, background: 'none', fontSize: 16 }} title={r.account.favorite ? say('Favori : retirer', 'Favorite: remove') : say('Mettre en favori (proposé en premier, banque par défaut des factures)', 'Mark as favorite (offered first, default bank on invoices)')} aria-pressed={!!r.account.favorite} onClick={() => star(r.account)}>{r.account.favorite ? '★' : '☆'}</button>}<b>{r.account.name}</b>{r.account.active === false && <Chip kind="off">{say(' désactivé', ' inactive')}</Chip>}{r.account.showOnInvoices && <div className="small muted">{say('imprimé sur les factures', 'printed on invoices')}</div>}</td>
                    <td>{r.account.isCash ? <span className="muted">{say('caisse', 'cash desk')}</span> : <>{r.account.bankName}<div className="small muted mono">{r.account.accountNumber ?? r.account.iban ?? '—'}</div></>}</td>
                    <td>{r.account.currency}</td><td className="mono small">{gl ? `${gl.code} ${gl.nameFr}` : '—'}</td><td className="mono small">{j ? `${j.code} · ${j.name}` : '—'}</td>
                    <td className="num">{r.bookBalance === null ? <span className="muted" title={say(`Pas de taux ${r.account.currency}/${entity.functionalCurrency} à ce jour : saisissez-le dans Réglages › Taux de change`, `No ${r.account.currency}/${entity.functionalCurrency} rate as of today: enter it in Settings › Exchange rates`)}>— · {fmt(r.bookBalanceFunctional)} {entity.functionalCurrency} <button className="btn sm" onClick={() => openRoom('settings', 'rates')}>{say('Saisir le taux', 'Enter rate')}</button></span> : fmt(r.bookBalance)}</td><td className="num">{r.account.isCash ? '—' : fmt(r.statementBalance)}</td>
                    <td>{r.account.isCash ? <Chip kind="dim">{say('comptage', 'count')}</Chip> : r.unmatched ? <Chip kind="warn">{say(`${r.unmatched} ligne(s) à traiter`, `${r.unmatched} line(s) to process`)}</Chip> : <Chip kind="good">{say('À jour', 'Up to date')}</Chip>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}><button className="btn sm" onClick={() => setEditId(r.account.id)}>{t('edit')}</button> {r.account.active === false ? <button className="btn sm" onClick={() => apply((s) => setBankAccountActive(s, r.account.id, true), say('Compte réactivé', 'Account reactivated'))}>{say('Réactiver', 'Reactivate')}</button> : <button className="btn sm" onClick={() => apply((s) => setBankAccountActive(s, r.account.id, false), say('Compte désactivé', 'Account deactivated'))}>{say('Désactiver', 'Deactivate')}</button>}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr><td colSpan={5}>{say('Total contre-valeur', 'Total equivalent')} {entity.functionalCurrency}</td><td className="num">{fmt(total)}</td><td colSpan={3}>{say('Seuil du coffre : ', 'Cash threshold: ')}{fmt(entity.cashThreshold)} · <Chip kind={total >= entity.cashThreshold ? 'good' : 'crit'}>{total >= entity.cashThreshold ? say('Au-dessus', 'Above') : say('En dessous', 'Below')}</Chip></td></tr></tfoot>
          </table>
          <div className="small muted" style={{ padding: 10 }}>{say("Chaque opération d'un compte (encaissement, règlement, échéance d'emprunt, ligne de relevé) est comptabilisée sur le compte comptable et le journal attribués ici. L'écart entre le relevé et la comptabilité est la somme des lignes non rapprochées.", 'Every transaction on an account (receipt, payment, loan instalment, statement line) is posted to the GL account and journal assigned here. The difference between the statement and the books is the sum of the unreconciled lines.')}</div>
        </div>
      </div>
      {editId && <aside className="side"><BankAccountForm entityId={entityId} id={editId === 'new' ? null : editId} onClose={() => setEditId(null)} /></aside>}
    </div>
  );
}

function BankAccountForm({ entityId, id, onClose }: { entityId: Id; id: Id | null; onClose: () => void }) {
  const { state, apply } = useStore();
  const say = useSay();
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
  const [accountHolder, setAccountHolder] = useState(b?.accountHolder ?? ''); // [bumex-one] the invoice's payment block
  const [bic, setBic] = useState(b?.bic ?? '');
  const [favorite, setFavorite] = useState(b?.favorite ?? false);
  const used = !!b && state.entries.some((e) => e.status !== 'draft' && e.lines.some((l) => l.bankAccountId === b.id));
  const save = () => {
    const input = { name, bankName, accountNumber, rib, iban, bankAddress, currency, glAccountId, journalId: journalId || undefined, isCash, showOnInvoices, accountHolder, bic, favorite: !isCash && favorite };
    if (apply((s) => (b ? updateBankAccount(s, b.id, input) : addBankAccount(s, { entityId, ...input })), b ? say('Compte bancaire modifié', 'Bank account updated') : say('Compte bancaire créé', 'Bank account created'))) onClose();
  };
  return (
    <div className="card">
      <h2>{b ? say(`Compte · ${b.name}`, `Account · ${b.name}`) : say('Nouveau compte bancaire', 'New bank account')}</h2>
      <Field label={say('Intitulé du compte', 'Account name')}><input className="in" value={name} onChange={(e) => setName(e.target.value)} placeholder={say('BMCI compte principal MRU', 'BMCI main account MRU')} /></Field>
      <label className="small" style={{ display: 'block', margin: '8px 0' }}><input type="checkbox" checked={isCash} onChange={(e) => setIsCash(e.target.checked)} /> {say('Caisse (espèces, sans relevé)', 'Cash desk (cash, no statement)')}</label>
      {!isCash && <>
        <Field label={say('Nom de la banque', 'Bank name')}><input className="in" value={bankName} onChange={(e) => setBankName(e.target.value)} /></Field>
        <div className="grid2" style={{ marginTop: 8 }}>
          <Field label={say('Numéro de compte', 'Account number')}><input className="in mono" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} /></Field>
          <Field label="RIB"><input className="in mono" value={rib} onChange={(e) => setRib(e.target.value)} /></Field>
        </div>
        <Field label="IBAN" style={{ marginTop: 8 }}><input className="in mono" value={iban} onChange={(e) => setIban(e.target.value)} /></Field>
        <div className="grid2" style={{ marginTop: 8 }}>
          <Field label="BIC / SWIFT"><input className="in mono" value={bic} onChange={(e) => setBic(e.target.value.toUpperCase())} /></Field>
          <Field label={say('Titulaire du compte', 'Account holder')}><input className="in" value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} placeholder={entity.name} /></Field>
        </div>
        <Field label={say('Adresse de la banque', 'Bank address')} style={{ marginTop: 8 }}><input className="in" value={bankAddress} onChange={(e) => setBankAddress(e.target.value)} /></Field>
      </>}
      <div className="grid2" style={{ marginTop: 8 }}>
        <Field label={say('Devise', 'Currency')}><Select className="in" value={currency} disabled={used} onChange={(e) => setCurrency(e.target.value as Currency)}>{['MRU', 'USD', 'EUR', 'MAD'].map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label={say('Journal des opérations', 'Transactions journal')}><Select recent="journals" className="in" value={journalId} onChange={(e) => setJournalId(e.target.value)}>{journals.map((j) => <option key={j.id} value={j.id}>{j.code} · {j.name}</option>)}</Select></Field>
      </div>
      <Field label={say('Compte comptable (classe 5, imputable et actif)', 'GL account (class 5, postable and active)')} style={{ marginTop: 8 }}><Select recent="accounts" className="in mono" value={glAccountId} disabled={used} onChange={(e) => setGl(e.target.value)}><option value="">—</option>{glAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.nameFr}</option>)}</Select></Field>
      <label className="small" style={{ display: 'block', margin: '8px 0' }}><input type="checkbox" checked={showOnInvoices} onChange={(e) => setShow(e.target.checked)} /> {say('Imprimer les coordonnées sur les factures', 'Print the bank details on invoices')}</label>
      {!isCash && <label className="small" style={{ display: 'block', margin: '8px 0' }}><input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} /> {say('★ Favori : proposé en premier, banque par défaut des nouvelles factures', '★ Favorite: offered first, default bank for new invoices')}</label>}
      {used && <div className="small muted">{say('Des opérations existent : la devise et le compte comptable sont figés, le reste reste modifiable.', 'Transactions exist: the currency and GL account are locked, everything else can still be edited.')}</div>}
      <div className="small muted" style={{ marginTop: 6 }}>{say('Un compte comptable absent du plan se crée dans Comptabilité › Plan comptable ; un journal de banque supplémentaire dans Comptabilité › Journaux · tiers.', 'A GL account missing from the chart is created in Accounting › Chart of accounts; an extra bank journal in Accounting › Journals · third parties.')}</div>
      <div className="actions" style={{ marginTop: 10 }}><button className="btn" onClick={onClose}>{say('Annuler', 'Cancel')}</button><button className="btn primary" disabled={!name.trim() || !glAccountId || (!isCash && !bankName.trim())} onClick={save}>{b ? say('Enregistrer', 'Save') : say('Créer le compte', 'Create account')}</button></div>
    </div>
  );
}

function Recon({ entityId }: { entityId: Id }) {
  const { state, apply, toast } = useStore();
  const say = useSay();
  const banks = favoritesFirst(state.bankAccounts.filter((b) => b.entityId === entityId && b.active !== false && !b.isCash)); // [bumex-one] favourites first
  const [bankId, setBankId] = useState(banks[0]?.id ?? '');
  // [bumex-one] the lines to explain, or those put into the suspense account (asked by Sidaty on 2026-11-18, one/BankAssign.tsx)
  const [view, setView] = useState<'todo' | 'parked'>('todo');
  const [open, setOpen] = useState<Id | null>(null);
  const rows = state.bankTransactions.filter((x) => x.bankAccountId === bankId && x.status === 'unmatched').sort((a, b) => (a.date < b.date ? 1 : -1));
  const suspense = useMemo(() => suspenseSummary(state, entityId), [state, entityId]);
  const parked = suspense.pending.filter((p) => p.txn.bankAccountId === bankId).map((p) => p.txn).sort((a, b) => (a.date < b.date ? 1 : -1));
  const suspenseAccount = suspense.accountId ? state.accounts.find((a) => a.id === suspense.accountId) : undefined;
  const pendingTotal = r2(suspense.pending.reduce((a, p) => a + p.amount, 0));
  const byRule = rows.filter((t) => { const k = suggestFor(state, t).kind; return k === 'assign' || k === 'rule'; }).length;
  const bank = banks.find((b) => b.id === bankId);
  // [bumex-one] an internal transfer goes to any other account of the entity, the cash desks too
  const targets = favoritesFirst(state.bankAccounts.filter((b) => b.entityId === entityId && b.active !== false && b.id !== bankId));
  const runRules = () => {
    let done = { booked: 0, skipped: 0 };
    const ok = apply((s) => { const [s1, r] = applyBankRules(s, bankId); done = r; return s1; });
    if (ok) toast('ok', say(`${done.booked} ligne(s) comptabilisée(s) par les règles${done.skipped ? ` · ${done.skipped} refusée(s) (période verrouillée…) : à affecter une à une` : ''}`, `${done.booked} line(s) posted by the rules${done.skipped ? ` · ${done.skipped} rejected (locked period…): assign them one by one` : ''}`));
  };
  const act = (txn: BankTransaction) => {
    if (view === 'parked') {
      return <td style={{ whiteSpace: 'nowrap' }}><button className="btn sm primary" onClick={() => setOpen(open === txn.id ? null : txn.id)}>{say('Reclasser…', 'Reclassify…')}</button></td>;
    }
    const s = suggestFor(state, txn);
    return (
      <td style={{ whiteSpace: 'nowrap' }}>
        {s.kind === 'payment' && <button className="btn sm primary" onClick={() => apply((st) => matchToPayment(st, txn.id, s.payment.id), say('Ligne rapprochée', 'Line reconciled'))}>{say('Rapprocher', 'Reconcile')}</button>}
        {s.kind === 'invoice' && <button className="btn sm primary" onClick={() => apply((st) => recordPayment(st, { entityId, customerId: s.invoice.customerId, date: txn.date, currency: bank!.currency, amountTxn: txn.amount, bankAccountId: bankId, invoiceId: s.invoice.id, bankTransactionId: txn.id, reference: txn.reference ?? s.invoice.number }), say('Encaissement comptabilisé, facture lettrée, ligne rapprochée', 'Receipt posted, invoice matched, line reconciled'))}>{say('Encaisser et rapprocher', 'Record payment and reconcile')}</button>}
        {s.kind === 'assign' && <button className="btn sm primary" onClick={() => apply((st) => assignStatementLine(st, txn.id, [splitOf(s.rule, Math.abs(txn.amount))], s.rule.label), say('Comptabilisée par règle', 'Posted by rule'))}>{say('Comptabiliser', 'Post')}</button>}
        {s.kind === 'rule' && <button className="btn sm primary" onClick={() => apply((st) => bookByRule(st, txn.id, s.mappingKey), say('Comptabilisée par règle', 'Posted by rule'))}>{say('Comptabiliser', 'Post')}</button>}
        {s.kind === 'transfer' && targets.map((o) => <button key={o.id} className="btn sm primary" style={{ marginRight: 4 }} onClick={() => apply((st) => bookTransfer(st, txn.id, o.id), say('Virement interne comptabilisé, les deux lignes rapprochées', 'Internal transfer posted, both lines reconciled'))}>{say('Virement vers', 'Transfer to')} {o.name}</button>)}
        {' '}<button className={`btn sm ${s.kind === 'none' ? 'primary' : ''}`} onClick={() => setOpen(open === txn.id ? null : txn.id)}>{say('Affecter…', 'Assign…')}</button>
        {' '}<button className="btn sm" onClick={() => apply((st) => bookToSuspense(st, txn.id), say(`Mise en attente (${suspenseAccount?.code ?? '488'})`, `Moved to suspense (${suspenseAccount?.code ?? '488'})`))}>{say('Mettre en attente', 'Move to suspense')}</button>
      </td>
    );
  };
  const list = view === 'todo' ? rows : parked;
  return (
    <div className="card flush">
      <WideNote />{/* [mobile] */}
      <div style={{ display: 'flex', gap: 8, padding: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Select className="in" style={{ width: 300 }} value={bankId} onChange={(e) => { setBankId(e.target.value); setOpen(null); }}>{banks.map((b) => <option key={b.id} value={b.id}>{b.favorite ? '★ ' : ''}{b.bankName} · {b.name} ({b.currency})</option>)}</Select>
        <button className={`btn sm ${view === 'todo' ? 'on' : ''}`} onClick={() => { setView('todo'); setOpen(null); }}>{say('À traiter', 'To process')} · {rows.length}</button>
        <button className={`btn sm ${view === 'parked' ? 'on' : ''}`} onClick={() => { setView('parked'); setOpen(null); }}>{say('En attente', 'In suspense')}{suspenseAccount ? ` (${suspenseAccount.code})` : ''} · {parked.length}</button>
        {view === 'todo' && byRule > 0 && <button className="btn sm primary" onClick={runRules}>{say('Comptabiliser par les règles', 'Post by rules')} · {byRule}</button>}
        <span className="muted small">{view === 'todo' ? say('une ligne mise en attente compte comme écriture non comptabilisée sur la façade', 'a line moved to suspense counts as an unposted entry on the building facade') : say('reclassées par une écriture d\'OD, le compte bancaire inchangé', 'reclassified by a miscellaneous entry, the bank account unchanged')}</span>
      </div>
      {view === 'parked' && suspenseAccount && (
        <div className={`banner ${Math.abs(pendingTotal - suspense.balance) > 0.004 ? 'warn' : ''}`} style={{ margin: '0 10px 10px' }}>
          {say(`Solde du ${suspenseAccount.code} : ${fmt(suspense.balance)} · lignes en attente (tous comptes) : ${fmt(pendingTotal)}`, `Balance of ${suspenseAccount.code}: ${fmt(suspense.balance)} · lines in suspense (all accounts): ${fmt(pendingTotal)}`)}
          {suspense.explainedByHand ? say(` · ${suspense.explainedByHand} ligne(s) déjà reclassée(s) à la main (même montant sorti de l'attente) ne sont pas listées`, ` · ${suspense.explainedByHand} line(s) already reclassified by hand (same amount taken out of suspense) are not listed`) : ''}
          {Math.abs(pendingTotal - suspense.balance) > 0.004 && say(' · les deux ne concordent pas : un reclassement manuel groupé ou une autre écriture sur ce compte, à vérifier avant de reclasser.', ' · the two do not agree: a grouped manual reclassification or another entry on this account; check before reclassifying.')}
        </div>
      )}
      <table>
        <thead><tr><th>{say('Date', 'Date')}</th><th>{say('Libellé relevé', 'Statement description')}</th><th className="num">{say('Montant', 'Amount')}</th><th>{say('Proposition', 'Suggestion')}</th><th>{say('Action', 'Action')}</th></tr></thead>
        <tbody>
          {list.length === 0 && <tr><td colSpan={5} className="muted">{view === 'todo' ? say('Tout est rapproché sur ce compte.', 'Everything is reconciled on this account.') : say('Aucune ligne de ce compte en attente.', 'No lines from this account in suspense.')}</td></tr>}
          {list.map((txn) => {
            const p = propositionOf(state, txn, view === 'parked');
            return (
              <Fragment key={txn.id}>
                <tr><td><D iso={txn.date} /></td><td>{txn.description}</td><td className="num" style={{ color: txn.amount < 0 ? 'var(--crit)' : undefined }}>{fmt(txn.amount)}</td><td><Chip kind={p.kind}>{p.label}</Chip></td>{act(txn)}</tr>
                {open === txn.id && <tr><td colSpan={5} style={{ background: 'var(--paper, transparent)' }}><AssignLine entityId={entityId} txn={txn} parked={view === 'parked'} onDone={() => setOpen(null)} /></td></tr>}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Import({ entityId }: { entityId: Id }) {
  const { state, apply } = useStore();
  const say = useSay();
  const banks = favoritesFirst(state.bankAccounts.filter((b) => b.entityId === entityId && b.active !== false && !b.isCash)); // [bumex-one] favourites first
  const [bankId, setBankId] = useState(banks[0]?.id ?? '');
  const sample = `${addDays(state.today, 0).split('-').reverse().join('/')};VIR RECU CLIENT HOTEL M;150000\n${addDays(state.today, -1).split('-').reverse().join('/')};COMMISSION VIREMENT INTERNATIONAL;-6500\n${addDays(state.today, -1).split('-').reverse().join('/')};PRLV TELECOMS J;-71920`;
  const [text, setText] = useState('');
  const parsed = useMemo(() => parseStatementCsv(text), [text]);
  return (
    <div className="cols">
      <div className="grow">
        <div className="card">
          <h2>{say('Coller un relevé (CSV : date;libellé;montant[;référence])', 'Paste a statement (CSV: date;description;amount[;reference])')}</h2>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <Select className="in" style={{ width: 300 }} value={bankId} onChange={(e) => setBankId(e.target.value)}>{banks.map((b) => <option key={b.id} value={b.id}>{b.favorite ? '★ ' : ''}{b.bankName} · {b.name} ({b.currency})</option>)}</Select>
            <button className="btn sm" onClick={() => setText(sample)}>{say('Exemple', 'Example')}</button>
            <span className="muted small">{say('Dates JJ/MM/AAAA ou AAAA-MM-JJ, montants signés, virgule ou point. Les doublons sont ignorés à la ré-importation.', 'Dates DD/MM/YYYY or YYYY-MM-DD, signed amounts, comma or point. Duplicates are ignored when importing again.')}</span>
          </div>
          <textarea className="in" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={sample} aria-label={say('Relevé CSV', 'CSV statement')} />
          <div className="actions" style={{ marginTop: 8 }}>
            <span className="small muted" style={{ marginRight: 'auto' }}>{say(`${parsed.length} ligne(s) reconnue(s)`, `${parsed.length} line(s) recognized`)}</span>
            <button className="btn primary" disabled={!parsed.length} onClick={() => { if (apply((s) => importStatement(s, bankId, parsed), say(`${parsed.length} ligne(s) importée(s) · à rapprocher`, `${parsed.length} line(s) imported · to reconcile`))) setText(''); }}>{say('Importer', 'Import')}</button>
          </div>
        </div>
      </div>
      <aside className="side">
        <div className="card">
          <h2>{say('Aperçu', 'Preview')}</h2>
          <table><tbody>{parsed.slice(0, 10).map((l, i) => <tr key={i}><td><D iso={l.date} /></td><td className="small">{l.description}</td><td className="num">{fmt(l.amount)}</td></tr>)}</tbody></table>
        </div>
      </aside>
    </div>
  );
}

function Forecast({ entityId }: { entityId: Id }) {
  const { state } = useStore();
  const say = useSay();
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
          <h2>{say('Trésorerie prévisionnelle · 13 semaines', 'Cash forecast · 13 weeks')} · {entity.functionalCurrency}</h2>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={say('Solde prévisionnel par semaine', 'Forecast balance by week')} style={{ width: '100%', height: 'auto', fontFamily: 'var(--mono)', fontSize: 11 }}>
            <line x1={pad} x2={W - pad} y1={y(entity.cashThreshold)} y2={y(entity.cashThreshold)} style={{ stroke: 'var(--warn)' }} strokeDasharray="4 4" />
            <text x={W - pad} y={y(entity.cashThreshold) - 4} textAnchor="end" style={{ fill: 'var(--warn)' }}>{say('seuil', 'threshold')} {fmt(entity.cashThreshold, 0)}</text>
            <line x1={pad} x2={W - pad} y1={y(0)} y2={y(0)} style={{ stroke: 'var(--border)' }} />
            {weeks.map((w, i) => {
              const x = pad + i * bw + 4;
              const top = Math.min(y(w.balance), y(0));
              const h = Math.abs(y(w.balance) - y(0));
              return (
                <g key={w.weekStart}>
                  <rect x={x} y={top} width={bw - 8} height={Math.max(2, h)} style={{ fill: w.balance < entity.cashThreshold ? 'var(--warn)' : 'var(--brand-fg)' }} rx="2" />
                  <text x={x + (bw - 8) / 2} y={H - pad + 14} textAnchor="middle" style={{ fill: 'var(--muted)' }}>{say(w.label, w.label.replace(/^S/, 'W'))}</text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      <aside className="side">
        <div className="card flush">
          <table>
            <thead><tr><th>{say('Semaine', 'Week')}</th><th className="num">{say('Entrées', 'Inflows')}</th><th className="num">{say('Sorties', 'Outflows')}</th><th className="num">{say('Solde', 'Balance')}</th></tr></thead>
            <tbody>{weeks.map((w) => <tr key={w.weekStart}><td>{say(w.label, w.label.replace(/^S/, 'W'))} ·<span className="small muted"><D iso={w.weekStart} /></span></td><td className="num">{fmt(w.inflow, 0)}</td><td className="num">{fmt(w.outflow, 0)}</td><td className="num" style={{ color: w.balance < entity.cashThreshold ? 'var(--warn)' : undefined }}>{fmt(w.balance, 0)}</td></tr>)}</tbody>
          </table>
          <div className="small muted" style={{ padding: 10 }}>{say(`Entrées : factures clients à l'échéance (en retard : 60 % en semaine 2). Sorties : factures fournisseurs approuvées, paie mensuelle estimée ${fmt(payroll, 0)} le 28.`, `Inflows: customer invoices on their due date (overdue: 60% in week 2). Outflows: approved supplier invoices, estimated monthly payroll ${fmt(payroll, 0)} on the 28th.`)}</div>
        </div>
      </aside>
    </div>
  );
}

function Loans({ entityId }: { entityId: Id }) {
  const { state, apply, toast } = useStore();
  const say = useSay();
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
        <div className="kpi"><div className="l">{say('Emprunts actifs', 'Active loans')}</div><div className="v">{summaries.filter((s) => s.loan.status === 'active').length}</div></div>
        <div className="kpi"><div className="l">{say('Capital restant dû', 'Outstanding principal')}</div><div className="v">{fmt(totalOutstanding, 0)}</div></div>
        <div className="kpi"><div className="l">{say('Échéances en retard', 'Overdue instalments')}</div><div className="v" style={{ color: summaries.some((s) => s.overdue.length) ? 'var(--crit)' : undefined }}>{summaries.reduce((n, s) => n + s.overdue.length, 0)}</div></div>
        <div className="kpi"><div className="l">{say('Intérêts restant à payer', 'Interest remaining to pay')}</div><div className="v">{fmt(r2(summaries.reduce((a, s) => a + s.interestRemaining, 0)), 0)}</div></div>
      </div>
      <div className="card flush">
        <div style={{ display: 'flex', gap: 8, padding: 10, alignItems: 'center' }}>
          <span className="small muted">{say('Cliquer un emprunt pour son échéancier', 'Click a loan to see its schedule')}</span>
          <button className="btn sm primary" style={{ marginLeft: 'auto' }} onClick={() => setShowNew((v) => !v)}>{showNew ? say('Fermer', 'Close') : say('Nouvel emprunt', 'New loan')}</button>
        </div>
        <table>
          <thead><tr><th>{say('Référence', 'Reference')}</th><th>{say('Prêteur', 'Lender')}</th><th className="num">{say('Montant', 'Amount')}</th><th className="num">{say('Taux', 'Rate')}</th><th>{say('Durée · périodicité', 'Term · frequency')}</th><th>{say('Méthode', 'Method')}</th><th>{say('Déblocage', 'Drawdown')}</th><th className="num">{say('Réglées', 'Paid')}</th><th className="num">{say('Restant dû', 'Outstanding')}</th><th>{say('Prochaine échéance', 'Next instalment')}</th><th>{say('Statut', 'Status')}</th><th></th></tr></thead>
          <tbody>
            {summaries.map((s) => (
              <tr key={s.loan.id} className={sel?.loan.id === s.loan.id ? 'sel' : ''} onClick={() => setLoanId(s.loan.id)} style={{ cursor: 'pointer' }}>
                <td className="mono">{s.loan.reference}</td><td>{s.loan.lender}</td><td className="num">{s.loan.currency} {fmt(s.loan.principal, 0)}</td><td className="num">{(s.loan.annualRate * 100).toFixed(2)} %</td><td>{s.loan.months} {say('mois', 'months')} · {s.loan.frequency === 'monthly' ? say('mensuelle', 'monthly') : say('trimestrielle', 'quarterly')}</td><td>{s.loan.method === 'annuity' ? say('Annuités constantes', 'Equal instalments') : say('Capital constant', 'Equal principal')}</td><td><D iso={s.loan.startDate} /></td><td className="num">{s.paidCount} / {s.schedule.length}</td><td className="num">{fmt(s.outstanding, 0)}</td>
                <td>{s.nextDue ? <>{s.overdue.length ? <Chip kind="crit">{say(`${s.overdue.length} en retard`, `${s.overdue.length} overdue`)}</Chip> : <Chip kind={s.nextDue.date <= addDays(state.today, 30) ? 'warn' : 'good'}><D iso={s.nextDue.date} /></Chip>} <span className="small">{fmt(s.nextDue.total, 0)}</span></> : '—'}</td>
                <td><Chip kind={s.loan.status === 'active' ? 'good' : 'dim'}>{s.loan.status === 'active' ? say('En cours', 'Active') : say('Soldé', 'Repaid')}</Chip></td>
                <td onClick={(e) => e.stopPropagation()}><DeleteButton table="loan" rowId={s.loan.id} label={`Emprunt ${s.loan.reference}`} entityId={entityId} /></td>
              </tr>
            ))}
            {summaries.length === 0 && <tr><td colSpan={12} className="muted small">{say('Aucun emprunt', 'No loans')}</td></tr>}
          </tbody>
        </table>
      </div>
      {showNew && <NewLoan entityId={entityId} onDone={(id) => { setLoanId(id); setShowNew(false); }} />}
      {sel && (
        <div className="cols">
          <div className="grow">
            <div className="card flush">
              <div style={{ display: 'flex', gap: 8, padding: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <b>{say('Échéancier', 'Schedule')} · {sel.loan.reference} · {sel.loan.lender}</b>
                <Chip kind={sel.loan.scheduleMode === 'manual' ? 'warn' : 'dim'}>{sel.loan.scheduleMode === 'manual' ? say('échéancier de la banque (manuel)', "bank's schedule (manual)") : say('calculé automatiquement', 'calculated automatically')}</Chip>
                <span className="small muted">{sel.loan.notes}</span>
                <span style={{ marginLeft: 'auto' }} />
                {sel.loan.status === 'active' && <button className="btn sm" onClick={() => setEditSchedule((v) => !v)}>{editSchedule ? say('Fermer la saisie', 'Close editor') : sel.loan.scheduleMode === 'manual' ? say("Modifier l'échéancier", 'Edit schedule') : say('Passer en échéancier manuel', 'Switch to manual schedule')}</button>}
                <button className="btn sm" onClick={exportXlsx}>{say('Exporter (Excel)', 'Export (Excel)')}</button>
              </div>
              {editSchedule && <ScheduleEditor loan={sel.loan} onClose={() => setEditSchedule(false)} />}
              <div className="sched">
                <table>
                  <thead><tr><th>{say('N°', 'No.')}</th><th>{say('Date', 'Date')}</th><th className="num">{say('Capital restant dû', 'Outstanding principal')}</th><th className="num">{say('Capital', 'Principal')}</th><th className="num">{say('Intérêts', 'Interest')}</th><th className="num">{say('Frais', 'Fees')}</th><th className="num">{say('Échéance', 'Instalment')}</th><th className="num">{say('Restant après', 'Remaining after')}</th><th>{say('Statut', 'Status')}</th><th></th></tr></thead>
                  <tbody>
                    {sel.schedule.map((i) => {
                      const next = sel.loan.status === 'active' && !i.paid && sel.schedule.every((x) => x.no >= i.no || x.paid);
                      return (
                        <tr key={i.no} className={next ? 'sel' : ''}><td className="mono">{i.no}</td><td><D iso={i.date} /></td><td className="num">{fmt(i.opening, 0)}</td><td className="num">{fmt(i.capital, 0)}</td><td className="num">{fmt(i.interest, 0)}</td><td className="num">{fmt(i.fees, 0)}</td><td className="num"><b>{fmt(i.total, 0)}</b></td><td className="num">{fmt(i.closing, 0)}</td>
                          <td>{i.paid ? <Chip kind="good">{say(`réglée le ${i.paid.date}`, `paid on ${i.paid.date}`)}</Chip> : i.date < state.today ? <Chip kind="crit">{say('en retard', 'overdue')}</Chip> : <Chip kind="dim">{say('à venir', 'upcoming')}</Chip>}</td>
                          <td>{next && <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><input className="in mono" type="date" style={{ width: 140 }} value={payDate} onChange={(e) => setPayDate(e.target.value)} aria-label={say('Date du règlement', 'Payment date')} /><button className="btn sm primary" onClick={() => apply((s) => payInstalment(s, { loanId: sel.loan.id, instalmentNo: i.no, date: payDate }), say(`Échéance ${i.no} enregistrée et comptabilisée`, `Instalment ${i.no} recorded and posted`))}>{say('Régler', 'Pay')}</button></span>}</td></tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <aside className="side">
            <div className="card">
              <h2>{say('Situation', 'Summary')}</h2>
              <div className="kv">
                <span className="k">{say('Montant emprunté', 'Amount borrowed')}</span><Money v={sel.loan.principal} cur={sel.loan.currency} />
                <span className="k">{say('Capital remboursé', 'Principal repaid')}</span><Money v={r2(sel.loan.principal - sel.outstanding)} />
                <span className="k">{say('Capital restant dû', 'Outstanding principal')}</span><b><Money v={sel.outstanding} /></b>
                <span className="k">{say('Intérêts payés', 'Interest paid')}</span><Money v={sel.interestPaid} />
                <span className="k">{say('Intérêts restants', 'Interest remaining')}</span><Money v={sel.interestRemaining} />
                <span className="k">{say('Coût total du crédit', 'Total cost of credit')}</span><Money v={r2(sel.schedule.reduce((a, i) => a + i.interest + i.fees, 0))} />
                <span className="k">{say('Compte bancaire', 'Bank account')}</span><span>{state.bankAccounts.find((b) => b.id === sel.loan.bankAccountId)?.name}</span>
                <span className="k">{say("Compte d'emprunt", 'Loan account')}</span><span className="mono">{(() => { const a = state.accounts.find((x) => x.id === sel.loan.loanAccountId) ?? state.accounts.find((x) => x.id === state.mappings.find((m) => m.entityId === entityId && m.key === 'LOAN_PAYABLE' && !m.qualifier)?.accountId); return a ? `${a.code} ${a.nameFr}` : '—'; })()}</span>
                <span className="k">{say("Compte d'intérêts", 'Interest account')}</span><span className="mono">{(() => { const a = state.accounts.find((x) => x.id === sel.loan.interestAccountId) ?? state.accounts.find((x) => x.id === state.mappings.find((m) => m.entityId === entityId && m.key === 'LOAN_INTEREST' && !m.qualifier)?.accountId); return a ? `${a.code} ${a.nameFr}` : '—'; })()}</span>
                <span className="k">{say('Journal', 'Journal')}</span><span className="mono">{(() => { const j = state.journals.find((x) => x.id === sel.loan.journalId) ?? state.journals.find((x) => x.id === state.bankAccounts.find((b) => b.id === sel.loan.bankAccountId)?.journalId) ?? state.journals.find((x) => x.entityId === entityId && x.kind === 'bank'); return j ? `${j.code} · ${j.name}` : '—'; })()}</span>
                <span className="k">{say('Déblocage', 'Drawdown')}</span><span>{sel.loan.drawdownEntryId ? <span className="mono">{entryRef(state, state.entries.find((e) => e.id === sel.loan.drawdownEntryId))}</span> : say('repris en solde d\'ouverture', 'carried in the opening balance')}</span>
              </div>
              <div className="small muted" style={{ marginTop: 8 }}>{say("Chaque règlement passe une écriture : emprunt D (capital) · intérêts D · frais D · banque C. Les échéances se règlent dans l'ordre ; le capital restant dû suit les règlements réellement enregistrés.", 'Each payment posts an entry: loan Dr (principal) · interest Dr · fees Dr · bank Cr. Instalments are paid in order; the outstanding principal follows the payments actually recorded.')}</div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function NewLoan({ entityId, onDone }: { entityId: Id; onDone: (id: Id) => void }) {
  const { state, apply } = useStore();
  const say = useSay();
  const entity = state.entities.find((e) => e.id === entityId)!;
  const banks = favoritesFirst(state.bankAccounts.filter((b) => b.entityId === entityId && b.active !== false && !b.isCash)); // [bumex-one] favourites first
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
  const save = () => apply((s) => { const [s1, l] = addLoan(s, { entityId, lender, reference, currency, principal: p, annualRate: (parseAmount(rate) ?? 0) / 100, months: Number(months), startDate: start, frequency, method, feePerInstalment: parseAmount(fee) ?? 0, bankAccountId: bankId, notes: notes || undefined, postDrawdown: post, scheduleMode: mode, manualSchedule: mode === 'manual' ? manualRows : undefined, interestAccountId: interestAccountId || undefined, loanAccountId: loanAccountId || undefined, journalId: journalId || undefined }); window.setTimeout(() => onDone(l.id), 0); return s1; }, post ? say('Emprunt enregistré · déblocage comptabilisé', 'Loan saved · drawdown posted') : say('Emprunt enregistré', 'Loan saved'));
  return (
    <div className="cols">
      <form className="grow" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2>{say('Nouvel emprunt', 'New loan')}</h2>
          <div className="grid3">
            <Field label={say('Prêteur', 'Lender')}><input className="in" value={lender} onChange={(e) => setLender(e.target.value)} placeholder="BMCI · BNM · Attijari…" /></Field>
            <Field label={say('Référence du contrat', 'Contract reference')}><input className="in mono" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
            <Field label={say('Compte bancaire de déblocage et de prélèvement', 'Bank account for drawdown and repayments')}><Select className="in" value={bankId} onChange={(e) => { setBankId(e.target.value); const b = banks.find((x) => x.id === e.target.value); if (b) setCurrency(b.currency); }}>{banks.map((b) => <option key={b.id} value={b.id}>{b.favorite ? '★ ' : ''}{b.bankName} · {b.name} · {b.currency}</option>)}</Select></Field>
            <Field label={say(`Montant emprunté (${currency})`, `Amount borrowed (${currency})`)}><input className="in num" value={principal} onChange={(e) => setPrincipal(e.target.value)} /></Field>
            <Field label={say('Taux annuel (%)', 'Annual rate (%)')}><input className="in num" value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
            <Field label={say('Durée (mois)', 'Term (months)')}><input className="in num" value={months} onChange={(e) => setMonths(e.target.value)} /></Field>
            <Field label={say('Date de déblocage', 'Drawdown date')}><input className="in mono" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field label={say('Périodicité', 'Frequency')}><Select className="in" value={frequency} onChange={(e) => setFrequency(e.target.value as Loan['frequency'])}><option value="monthly">{say('Mensuelle', 'Monthly')}</option><option value="quarterly">{say('Trimestrielle', 'Quarterly')}</option></Select></Field>
            <Field label={say('Méthode', 'Method')}><Select className="in" value={method} onChange={(e) => setMethod(e.target.value as Loan['method'])}><option value="annuity">{say('Annuités constantes', 'Equal instalments')}</option><option value="linear">{say('Capital constant', 'Equal principal')}</option></Select></Field>
            <Field label={say('Frais par échéance', 'Fees per instalment')}><input className="in num" value={fee} onChange={(e) => setFee(e.target.value)} /></Field>
            <Field label={say('Conditions · notes', 'Terms · notes')} style={{ gridColumn: 'span 2' }}><input className="in" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={say('Garantie, différé, assurance…', 'Guarantee, deferral, insurance…')} /></Field>
            <Field label={say('Échéancier', 'Schedule')}><Select className="in" value={mode} onChange={(e) => setMode(e.target.value as 'auto' | 'manual')}><option value="auto">{say('Calculé automatiquement', 'Calculated automatically')}</option><option value="manual">{say("Saisi d'après le tableau de la banque", "Entered from the bank's table")}</option></Select></Field>
            <Field label={say("Compte d'emprunt (défaut : paramétrage)", 'Loan account (default: setup)')}><Select recent="accounts" className="in mono" value={loanAccountId} onChange={(e) => setLoanAccountId(e.target.value)}><option value="">{say('Paramétrage · emprunts', 'Setup · loans')}</option>{accounts.filter((a) => a.code.startsWith('1')).map((a) => <option key={a.id} value={a.id}>{a.code} {a.nameFr}</option>)}</Select></Field>
            <Field label={say("Compte d'intérêts (défaut : paramétrage)", 'Interest account (default: setup)')}><Select recent="accounts" className="in mono" value={interestAccountId} onChange={(e) => setInterestAccountId(e.target.value)}><option value="">{say('Paramétrage · intérêts', 'Setup · interest')}</option>{accounts.filter((a) => a.code.startsWith('6')).map((a) => <option key={a.id} value={a.id}>{a.code} {a.nameFr}</option>)}</Select></Field>
            <Field label={say('Journal (défaut : celui du compte bancaire)', "Journal (default: the bank account's)")}><Select recent="journals" className="in" value={journalId} onChange={(e) => setJournalId(e.target.value)}><option value="">{say('Journal du compte bancaire', "Bank account's journal")}</option>{journals.map((j) => <option key={j.id} value={j.id}>{j.code} · {j.name}</option>)}</Select></Field>
          </div>
          {mode === 'manual' && <ManualRows principal={p} rows={manualRows} onChange={setManualRows} startDate={start} />}
          {manualError && <div className="banner warn">{manualError}</div>}
          <label className="small"><input type="checkbox" checked={post} onChange={(e) => setPost(e.target.checked)} /> {say('Comptabiliser le déblocage (banque D · emprunt C) à la date de déblocage', 'Post the drawdown (bank Dr · loan Cr) on the drawdown date')}</label>
          <div className="actions"><button type="submit" className="btn primary" disabled={!lender.trim() || !reference.trim() || p <= 0 || !bankId || (mode === 'manual' && (!!manualError || manualRows.length === 0))}>{say("Enregistrer l'emprunt", 'Save loan')}</button></div>
        </div>
      </form>
      <aside className="side">
        <div className="card">
          <h2>{say("Aperçu de l'échéancier", 'Schedule preview')}</h2>
          {preview.length ? <><div className="kv"><span className="k">{say('Échéances', 'Instalments')}</span><span>{preview.length} × {fmt(preview[0].total, 0)}{mode === 'manual' ? say(' (saisi)', ' (entered)') : method === 'linear' ? say(' (dégressif)', ' (decreasing)') : ''}</span><span className="k">{say('Intérêts totaux', 'Total interest')}</span><Money v={r2(preview.reduce((a, i) => a + i.interest, 0))} /><span className="k">{say('Dernière échéance', 'Last instalment')}</span><span>{preview[preview.length - 1].date}</span></div><div className="sched" style={{ maxHeight: 220, marginTop: 8 }}><table><tbody>{preview.slice(0, 12).map((i) => <tr key={i.no}><td className="mono">{i.no}</td><td>{i.date}</td><td className="num">{fmt(i.capital, 0)}</td><td className="num">{fmt(i.interest, 0)}</td><td className="num">{fmt(i.total, 0)}</td></tr>)}{preview.length > 12 && <tr><td colSpan={5} className="muted small">{say(`… ${preview.length - 12} autres échéances`, `… ${preview.length - 12} more instalments`)}</td></tr>}</tbody></table></div></> : <div className="small muted">{say('Saisir le montant, le taux et la durée.', 'Enter the amount, rate and term.')}</div>}
        </div>
      </aside>
    </div>
  );
}


// The bank's own table, line by line: date, capital, interest, fees. Rows can be pasted from an Excel export.
function ManualRows({ principal, rows, onChange, startDate }: { principal: number; rows: ManualInstalment[]; onChange: (r: ManualInstalment[]) => void; startDate: string }) {
  const { toast } = useStore();
  const say = useSay();
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (i: number, patch: Partial<ManualInstalment>) => onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const add = () => { const last = rows[rows.length - 1]; onChange([...rows, { no: rows.length + 1, date: last ? addDays(last.date, 30) : addDays(startDate, 30), capital: 0, interest: 0, fees: 0 }]); };
  const remove = (i: number) => onChange(rows.filter((_, k) => k !== i).map((r, k) => ({ ...r, no: k + 1 })));
  const onFile = async (f: File | undefined) => { if (!f) return; try { const parsed = parseScheduleRows(await readXlsx(f)); if (!parsed.length) throw new Error(say('Aucune ligne reconnue (colonnes attendues : Date, Capital, Intérêts, Frais)', 'No line recognized (expected columns: Date, Principal, Interest, Fees)')); onChange(parsed.map((r, i) => ({ ...r, no: i + 1 }))); toast('ok', say(`${parsed.length} échéances importées`, `${parsed.length} instalments imported`)); } catch (e) { toast('error', e instanceof Error ? e.message : String(e)); } if (fileRef.current) fileRef.current.value = ''; };
  const totalCap = r2(rows.reduce((a, r) => a + (Number(r.capital) || 0), 0));
  return (
    <div className="card flush" style={{ border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', gap: 8, padding: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <b>{say('Échéancier de la banque', "Bank's schedule")}</b>
        <span className="small muted">{say('capital saisi', 'principal entered')} {fmt(totalCap, 0)} / {fmt(principal, 0)}{Math.abs(totalCap - principal) > 0.01 ? say(` · reste ${fmt(r2(principal - totalCap), 0)}`, ` · ${fmt(r2(principal - totalCap), 0)} remaining`) : say(' · complet', ' · complete')}</span>
        <span style={{ marginLeft: 'auto' }} />
        <button type="button" className="btn sm" onClick={() => fileRef.current?.click()}>{say('Importer (Excel)', 'Import (Excel)')}</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={(e) => onFile(e.target.files?.[0])} aria-label={say("Fichier d'échéancier", 'Schedule file')} />
        <button type="button" className="btn sm" onClick={add}>{say('+ échéance', '+ instalment')}</button>
      </div>
      <div className="sched" style={{ maxHeight: 300 }}>
        <table>
          <thead><tr><th>{say('N°', 'No.')}</th><th>{say('Date', 'Date')}</th><th className="num">{say('Capital', 'Principal')}</th><th className="num">{say('Intérêts', 'Interest')}</th><th className="num">{say('Frais', 'Fees')}</th><th className="num">{say('Total', 'Total')}</th><th></th></tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}><td className="mono">{r.no}</td><td><input className="in mono" type="date" value={r.date} onChange={(e) => set(i, { date: e.target.value })} aria-label={say(`Date ${r.no}`, `Date ${r.no}`)} /></td><td><input className="in num" value={String(r.capital)} onChange={(e) => set(i, { capital: parseAmount(e.target.value) ?? 0 })} aria-label={say(`Capital ${r.no}`, `Principal ${r.no}`)} /></td><td><input className="in num" value={String(r.interest)} onChange={(e) => set(i, { interest: parseAmount(e.target.value) ?? 0 })} aria-label={say(`Intérêts ${r.no}`, `Interest ${r.no}`)} /></td><td><input className="in num" value={String(r.fees)} onChange={(e) => set(i, { fees: parseAmount(e.target.value) ?? 0 })} aria-label={say(`Frais ${r.no}`, `Fees ${r.no}`)} /></td><td className="num">{fmt(r2((Number(r.capital) || 0) + (Number(r.interest) || 0) + (Number(r.fees) || 0)))}</td><td><button type="button" className="btn sm" onClick={() => remove(i)} aria-label={say('Retirer', 'Remove')}>×</button></td></tr>)}{rows.length === 0 && <tr><td colSpan={7} className="muted small">{say('Ajouter les échéances une à une ou importer le tableau de la banque (colonnes Date, Capital, Intérêts, Frais).', "Add the instalments one by one or import the bank's table (columns Date, Principal, Interest, Fees).")}</td></tr>}</tbody>
        </table>
      </div>
    </div>
  );
}

function ScheduleEditor({ loan, onClose }: { loan: Loan; onClose: () => void }) {
  const { state, apply } = useStore();
  const say = useSay();
  const initial = useMemo(() => (loan.scheduleMode === 'manual' && loan.manualSchedule?.length ? loan.manualSchedule : loanSchedule(loan, state.loanPayments).map((i) => ({ no: i.no, date: i.date, capital: i.capital, interest: i.interest, fees: i.fees }))), [loan, state.loanPayments]);
  const [rows, setRows] = useState<ManualInstalment[]>(initial);
  const paid = state.loanPayments.filter((p) => p.loanId === loan.id).map((p) => p.instalmentNo);
  const error = useMemo(() => { try { checkManualSchedule(loan.principal, rows); return null; } catch (e) { return e instanceof Error ? e.message : String(e); } }, [rows, loan.principal]);
  return (
    <div style={{ padding: 10, borderBottom: '1px solid var(--line)' }}>
      <div className="small muted" style={{ marginBottom: 6 }}>{say(`Les échéances déjà réglées (${paid.length ? paid.join(', ') : 'aucune'}) ne changent plus ; les autres suivent les conditions réelles du contrat.`, `Instalments already paid (${paid.length ? paid.join(', ') : 'none'}) no longer change; the others follow the actual terms of the contract.`)}</div>
      <ManualRows principal={loan.principal} rows={rows} onChange={setRows} startDate={loan.startDate} />
      {error && <div className="banner warn" style={{ marginTop: 8 }}>{error}</div>}
      <div className="actions" style={{ marginTop: 8 }}>
        <button className="btn" onClick={onClose}>{say('Annuler', 'Cancel')}</button>
        {loan.scheduleMode === 'manual' && <button className="btn" onClick={() => { if (apply((s) => updateLoan(s, loan.id, { scheduleMode: 'auto' }), say('Échéancier calculé rétabli', 'Calculated schedule restored'))) onClose(); }}>{say('Revenir au calcul automatique', 'Back to automatic calculation')}</button>}
        <button className="btn primary" disabled={!!error} onClick={() => { if (apply((s) => setLoanSchedule(s, loan.id, rows), say('Échéancier enregistré', 'Schedule saved'))) onClose(); }}>{say("Enregistrer l'échéancier", 'Save schedule')}</button>
      </div>
    </div>
  );
}
