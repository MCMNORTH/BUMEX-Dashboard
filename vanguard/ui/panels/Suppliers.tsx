import { useEffect, useMemo, useState } from 'react';
import {
  createSupplierInvoice, approveSupplierInvoice, rejectSupplierInvoice, paySupplierInvoice, supplierPayables, addSupplier, updateSupplier, fxRate, mapped, APPROVAL_THRESHOLDS, nextThirdPartyCode, collectiveFor, accountBalance,
  fmt, r2, parseAmount, type Id, type Currency, type CounterpartyRegime, type SupplierInvoice,
  favoritesFirst, // [bumex-one]
} from '@bumex/domain';
import { useStore } from '../../store';
import { Tabs, Field, Chip, D, Money, STATUS_KIND, STATUS_FR, StatusChip, DeleteButton, downloadXlsx, entryRef } from '../common';
import { textAsk } from '../../one/ask'; // [bumex-one] Fluent's dialog, not the browser's (2026-11-20)
import { Select } from '../Select';
import { useSay, sayNow } from '../../one/say';
// [bumex-one] bilingual: every text follows the person's language, say('français', 'English') (vanguard/one/say.ts, 2026-11-21)

type Say = ReturnType<typeof useSay>;
type Tab = 'invoices' | 'new' | 'payments' | 'payables' | 'suppliers';
const REGIMES: [CounterpartyRegime, string, string][] = [['standard', 'Standard', 'Standard'], ['gta', 'GTA · sous-traitant enregistré', 'GTA · registered subcontractor'], ['exempt', 'Exonéré', 'Exempt'], ['non_resident', 'Non-résident', 'Non-resident'], ['public', 'Organisme public', 'Public body']];

export function SuppliersPanel({ entityId, initialTab }: { entityId: Id; initialTab?: string | null }) {
  const { state, t } = useStore();
  const say = useSay();
  const [tab, setTab] = useState<Tab>((initialTab as Tab) || 'invoices');
  useEffect(() => { if (initialTab) setTab(initialTab as Tab); }, [initialTab]);
  const [payFor, setPayFor] = useState<Id | null>(null);
  const pending = state.supplierInvoices.filter((s) => s.entityId === entityId && s.status === 'pending_approval').length;
  const pay = supplierPayables(state, entityId);
  const tabs = [
    { id: 'invoices' as Tab, label: <>{t('tab_invoices')} {pending ? <Chip kind="warn">{pending}</Chip> : null}</> },
    { id: 'new' as Tab, label: t('tab_new_invoice') },
    { id: 'payments' as Tab, label: say('Règlements', 'Payments') },
    { id: 'payables' as Tab, label: <>{say('À payer', 'To pay')} {pay.overdueCount ? <Chip kind="crit">{pay.overdueCount}</Chip> : null}</> },
    { id: 'suppliers' as Tab, label: say('Fiches', 'Suppliers') }, // [bumex-one] t('tab_customers') said "Customers" in English
  ];
  return (
    <>
      <div className="sheet-head"><h1>{t('room_suppliers')}</h1><Tabs tabs={tabs} value={tab} onChange={setTab} /></div>
      <div className="sheet-body">
        {tab === 'invoices' && <Invoices entityId={entityId} onPay={(id) => { setPayFor(id); setTab('payments'); }} />}
        {tab === 'new' && <NewInvoice entityId={entityId} onDone={() => setTab('invoices')} />}
        {tab === 'payments' && <Payments entityId={entityId} preselect={payFor} />}
        {tab === 'payables' && <PayablesView entityId={entityId} />}
        {tab === 'suppliers' && <Suppliers entityId={entityId} />}
      </div>
    </>
  );
}

function approverLabel(si: SupplierInvoice, say: Say): string {
  return si.approverRole === 'partner' ? say(`Associé (≥ ${fmt(APPROVAL_THRESHOLDS.partner, 0)})`, `Partner (≥ ${fmt(APPROVAL_THRESHOLDS.partner, 0)})`) : si.approverRole === 'manager' ? say(`Manager (≥ ${fmt(APPROVAL_THRESHOLDS.manager, 0)})`, `Manager (≥ ${fmt(APPROVAL_THRESHOLDS.manager, 0)})`) : say('Aucun · comptabilisée à la saisie', 'None · posted on entry');
}

function Invoices({ entityId, onPay }: { entityId: Id; onPay: (id: Id) => void }) {
  const { state, t, apply } = useStore();
  const say = useSay();
  const [filter, setFilter] = useState<'all' | 'pending' | 'open' | 'paid' | 'rejected'>('all');
  const [detail, setDetail] = useState<Id | null>(null);
  const all = state.supplierInvoices.filter((s) => s.entityId === entityId).sort((a, b) => (a.date < b.date ? 1 : -1));
  const rows = all.filter((i) => (filter === 'all' ? true : filter === 'pending' ? i.status === 'pending_approval' : filter === 'open' ? i.status === 'posted' : filter === 'paid' ? i.status === 'paid' : i.status === 'rejected'));
  const sel = detail ? all.find((x) => x.id === detail) : undefined;
  const entry = sel?.journalEntryId ? state.entries.find((e) => e.id === sel.journalEntryId) : undefined;
  const sup = (id: Id) => state.suppliers.find((x) => x.id === id);
  return (
    <div className="cols">
      <div className="grow">
        <div className="card flush">
          <div style={{ display: 'flex', gap: 4, padding: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {([['all', say(`Toutes · ${all.length}`, `All · ${all.length}`)], ['pending', say(`À approuver · ${all.filter((i) => i.status === 'pending_approval').length}`, `To approve · ${all.filter((i) => i.status === 'pending_approval').length}`)], ['open', say(`À payer · ${all.filter((i) => i.status === 'posted').length}`, `To pay · ${all.filter((i) => i.status === 'posted').length}`)], ['paid', say(`Payées · ${all.filter((i) => i.status === 'paid').length}`, `Paid · ${all.filter((i) => i.status === 'paid').length}`)], ['rejected', say(`Rejetées · ${all.filter((i) => i.status === 'rejected').length}`, `Rejected · ${all.filter((i) => i.status === 'rejected').length}`)]] as const).map(([k, l]) => (
              <button key={k} className={`btn sm ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{l}</button>
            ))}
            <span className="muted small" style={{ marginLeft: 'auto' }}>{say('Approbation selon le montant TTC · le préparateur n\'approuve jamais sa propre facture', 'Approval by amount incl. tax · the preparer never approves their own invoice')}</span>
          </div>
          <table>
            <thead><tr><th>{say('N° interne', 'Internal no.')}</th><th>{say('Fournisseur', 'Supplier')}</th><th>{say('Réf. fournisseur', 'Supplier ref.')}</th><th>{t('date')}</th><th>{t('due')}</th><th className="num">{say('HT', 'Excl. tax')}</th><th className="num">{say('TVA', 'VAT')}</th><th className="num">{say('RAS', 'WHT')}</th><th className="num">{say('Net à payer', 'Net payable')}</th><th className="num">{say('Réglé', 'Paid')}</th><th>{t('status')}</th><th></th></tr></thead>
            <tbody>
              {rows.map((si) => {
                const s = sup(si.supplierId);
                const overdue = si.status === 'posted' && si.dueDate < state.today;
                return (
                  <tr key={si.id} className={si.id === detail ? 'sel' : ''} onClick={() => setDetail(si.id)} style={{ cursor: 'pointer' }}>
                    <td className="mono">{si.number ?? '—'}</td><td>{s?.name}</td><td className="mono small">{si.supplierRef}</td><td><D iso={si.date} /></td><td>{overdue ? <Chip kind="crit"><D iso={si.dueDate} /></Chip> : <D iso={si.dueDate} />}</td>
                    <td className="num">{si.currency !== 'MRU' ? si.currency + ' ' : ''}{fmt(si.totalHt)}</td><td className="num">{fmt(si.totalTax)}</td><td className="num">{si.withholdingAmount ? fmt(si.withholdingAmount) : '—'}</td><td className="num">{fmt(si.netPayable)}</td><td className="num">{fmt(si.amountPaid)}</td>
                    <td><StatusChip status={si.status} />{si.status === 'pending_approval' && <div className="small muted">{approverLabel(si, say)}</div>}</td>
                    <td style={{ whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                      {si.status === 'pending_approval' && <><button className="btn sm primary" onClick={() => apply((s) => approveSupplierInvoice(s, si.id), say('Approuvée et comptabilisée', 'Approved and posted'))}>{say('Approuver', 'Approve')}</button>{' '}<button className="btn sm" onClick={() => { void textAsk({ title: say('Rejeter la facture', 'Reject invoice'), label: say('Motif du rejet', 'Reason for rejection'), required: true, confirm: say('Rejeter', 'Reject'), danger: true }).then((reason) => { if (reason) apply((s) => rejectSupplierInvoice(s, si.id, reason), sayNow('Facture rejetée', 'Invoice rejected')); }); }}>{say('Rejeter', 'Reject')}</button></>}
                      {si.status === 'posted' && <button className="btn sm primary" onClick={() => onPay(si.id)}>{say('Régler', 'Pay')}</button>}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={12} className="muted small">{say('Aucune facture dans ce filtre', 'No invoices in this filter')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <aside className="side">
        {sel ? (
          <div className="card">
            <h2>{sup(sel.supplierId)?.name} · {sel.supplierRef}</h2>
            <div className="kv">
              <span className="k">{say('N° interne', 'Internal no.')}</span><span className="mono">{sel.number ?? say('— (à l\'approbation)', '— (on approval)')}</span>
              <span className="k">{say('Libellé', 'Description')}</span><span>{sel.description}</span>
              <span className="k">{say('Date · échéance', 'Date · due date')}</span><span><D iso={sel.date} /> · <D iso={sel.dueDate} /></span>
              <span className="k">{say('HT', 'Excl. tax')}</span><span className="num">{sel.currency} {fmt(sel.totalHt)}</span>
              <span className="k">{say('TVA', 'VAT')} {sel.taxCodeId ? state.taxCodes.find((x) => x.id === sel.taxCodeId)?.code : say('(aucune)', '(none)')}</span><span className="num">{fmt(sel.totalTax)}</span>
              <span className="k">{say('Retenue', 'Withholding')} {sel.withholdingCodeId ? state.taxCodes.find((x) => x.id === sel.withholdingCodeId)?.code : say('(aucune)', '(none)')}</span><span className="num">{fmt(sel.withholdingAmount)}</span>
              <span className="k">{say('Net à payer', 'Net payable')}</span><Money v={sel.netPayable} cur={sel.currency} />
              <span className="k">{say('Réglé · reste', 'Paid · remaining')}</span><span className="num">{fmt(sel.amountPaid)} · {fmt(r2(sel.netPayable - sel.amountPaid))}</span>
              <span className="k">{say('Compte de charge', 'Expense account')}</span><span className="mono">{state.accounts.find((a) => a.id === sel.expenseAccountId)?.code} {state.accounts.find((a) => a.id === sel.expenseAccountId)?.nameFr}</span>
              <span className="k">{say('Préparée par', 'Prepared by')}</span><span>{sel.preparedBy}</span>
              <span className="k">{say('Approbation', 'Approval')}</span><span>{approverLabel(sel, say)}</span>
              {sel.paidAt && <><span className="k">{say('Soldée le', 'Paid on')}</span><span><D iso={sel.paidAt} /></span></>}
            </div>
            {entry && (
              <>
                <h2 style={{ marginTop: 12 }}>{say('Écriture', 'Journal entry')} {entryRef(state, entry)}</h2>
                <table><tbody>{entry.lines.map((l) => <tr key={l.lineNo}><td className="mono">{state.accounts.find((a) => a.id === l.accountId)?.code}</td><td className="small">{state.accounts.find((a) => a.id === l.accountId)?.nameFr}</td><td className="num">{l.debit ? fmt(l.debit) : ''}</td><td className="num">{l.credit ? fmt(l.credit) : ''}</td></tr>)}</tbody></table>
              </>
            )}
            {state.supplierPayments.filter((p) => p.invoiceId === sel.id).length > 0 && (
              <>
                <h2 style={{ marginTop: 12 }}>{say('Règlements', 'Payments')}</h2>
                <table><tbody>{state.supplierPayments.filter((p) => p.invoiceId === sel.id).map((p) => <tr key={p.id}><td className="mono">{p.number}</td><td><D iso={p.date} /></td><td className="small">{state.bankAccounts.find((b) => b.id === p.bankAccountId)?.name}</td><td className="num">{fmt(p.amount)}</td></tr>)}</tbody></table>
              </>
            )}
          </div>
        ) : (
          <div className="card">
            <h2>{say('Circuit d\'une facture fournisseur', 'Supplier invoice workflow')}</h2>
            <div className="small">{say(`Saisie → approbation selon le seuil (manager dès ${fmt(APPROVAL_THRESHOLDS.manager, 0)} TTC, associé dès ${fmt(APPROVAL_THRESHOLDS.partner, 0)}) → écriture 6xxx D · TVA déductible D · fournisseur C · retenue à la source C → règlement fournisseur D · banque C. Cliquer une ligne pour la fiche et ses écritures.`, `Entry → approval by threshold (manager from ${fmt(APPROVAL_THRESHOLDS.manager, 0)} incl. tax, partner from ${fmt(APPROVAL_THRESHOLDS.partner, 0)}) → journal entry 6xxx Dr · input VAT Dr · supplier Cr · withholding tax Cr → payment: supplier Dr · bank Cr. Click a row for its details and journal entries.`)}</div>
          </div>
        )}
      </aside>
    </div>
  );
}

function NewInvoice({ entityId, onDone }: { entityId: Id; onDone: () => void }) {
  const { state, t, apply } = useStore();
  const say = useSay();
  const entity = state.entities.find((e) => e.id === entityId)!;
  const suppliers = state.suppliers.filter((s) => s.entityId === entityId && s.active);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '');
  const supplier = suppliers.find((s) => s.id === supplierId);
  const [ref, setRef] = useState('');
  const [date, setDate] = useState(state.today);
  const [dueDays, setDueDays] = useState('');
  const [currency, setCurrency] = useState<Currency>(entity.functionalCurrency);
  const [ht, setHt] = useState('');
  const vatCodes = state.taxCodes.filter((x) => x.entityId === entityId && x.kind === 'vat');
  const whtCodes = state.taxCodes.filter((x) => x.entityId === entityId && x.kind === 'withholding' && !!x.collectedAccountId);
  const [taxCodeId, setTaxCodeId] = useState(vatCodes.find((x) => x.rate > 0)?.id ?? '');
  const [wht, setWht] = useState('default');
  const expenseAccounts = state.accounts.filter((a) => a.entityId === entityId && a.isPostable && a.active && (a.kind === 'expense' || a.code.startsWith('2'))).sort((a, b) => a.code.localeCompare(b.code));
  const [expenseAccountId, setExpenseAccountId] = useState(supplier?.expenseAccountId ?? expenseAccounts[0]?.id ?? '');
  const [description, setDescription] = useState('');
  const [tracked, setTracked] = useState(supplierId);
  if (tracked !== supplierId) { setTracked(supplierId); if (supplier?.expenseAccountId) setExpenseAccountId(supplier.expenseAccountId); }
  const rate = useMemo(() => { try { return fxRate(state, currency, entity.functionalCurrency, date); } catch { return 1; } }, [state, currency, entity.functionalCurrency, date]);
  const amount = parseAmount(ht) ?? 0;
  const vat = vatCodes.find((x) => x.id === taxCodeId);
  const whId = wht === 'default' ? supplier?.withholdingCodeId : wht || undefined;
  const whCode = whId ? state.taxCodes.find((x) => x.id === whId) : undefined;
  const tax = r2(amount * (vat?.rate ?? 0)), ttc = r2(amount + tax), withholding = r2(amount * (whCode?.rate ?? 0)), net = r2(ttc - withholding);
  const ttcFunctional = r2(ttc * rate);
  const approver = ttcFunctional >= APPROVAL_THRESHOLDS.partner ? 'Associé' : ttcFunctional >= APPROVAL_THRESHOLDS.manager ? 'Manager' : 'aucune · comptabilisée immédiatement';
  const approverEn = ttcFunctional >= APPROVAL_THRESHOLDS.partner ? 'Partner' : ttcFunctional >= APPROVAL_THRESHOLDS.manager ? 'Manager' : 'none · posted immediately'; // [bumex-one] shown only; the logic reads `approver`
  const ap = (() => { try { return mapped(state, entityId, 'AP_CONTROL'); } catch { return null; } })();
  const save = () => {
    const ok = apply((s) => createSupplierInvoice(s, { entityId, supplierId, supplierRef: ref, date, dueDays: dueDays.trim() ? Number(dueDays) : undefined, currency, fxRate: rate, totalHt: amount, taxCodeId: taxCodeId || null, withholdingCodeId: wht === 'default' ? undefined : wht || null, expenseAccountId, description }), approver.startsWith('aucune') ? say('Facture enregistrée et comptabilisée', 'Invoice saved and posted') : say(`Facture enregistrée · approbation ${approver.toLowerCase()} requise`, `Invoice saved · ${approverEn.toLowerCase()} approval required`));
    if (ok) onDone();
  };
  return (
    <div className="cols">
      <form className="grow" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="grid3">
            <Field label={say('Fournisseur', 'Supplier')}><Select recent="suppliers" className="in" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label={say('N° de facture du fournisseur', 'Supplier invoice no.')}><input className="in mono" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="F-2026-0412" /></Field>
            <Field label={say(`${t('date')} · échéance ${dueDays.trim() ? dueDays + ' j' : (supplier?.paymentTermsDays ?? 30) + ' j (fiche)'}`, `${t('date')} · due in ${dueDays.trim() ? dueDays + ' d' : (supplier?.paymentTermsDays ?? 30) + ' d (supplier default)'}`)}><div style={{ display: 'flex', gap: 6 }}><input className="in mono" type="date" value={date} onChange={(e) => setDate(e.target.value)} /><input className="in num" style={{ width: 70 }} placeholder={String(supplier?.paymentTermsDays ?? 30)} value={dueDays} onChange={(e) => setDueDays(e.target.value)} aria-label={say('Délai en jours', 'Payment terms in days')} /></div></Field>
            <Field label={say(`Montant HT · ${currency}${currency !== entity.functionalCurrency ? ` · taux ${rate}` : ''}`, `Amount excl. tax · ${currency}${currency !== entity.functionalCurrency ? ` · rate ${rate}` : ''}`)}><div style={{ display: 'flex', gap: 6 }}><Select className="in" style={{ width: 90 }} value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>{['MRU', 'USD', 'EUR', 'MAD'].map((c) => <option key={c}>{c}</option>)}</Select><input className="in num" value={ht} onChange={(e) => setHt(e.target.value)} placeholder="0,00" /></div></Field>
            <Field label={say('TVA', 'VAT')}><Select className="in" value={taxCodeId} onChange={(e) => setTaxCodeId(e.target.value)}><option value="">{say('Sans TVA', 'No VAT')}</option>{vatCodes.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.rate * 100} %</option>)}</Select></Field>
            <Field label={say('Retenue à la source (que nous retenons)', 'Withholding tax (we withhold)')}><Select className="in" value={wht} onChange={(e) => setWht(e.target.value)}><option value="default">{supplier?.withholdingCodeId ? say(`Fiche · ${state.taxCodes.find((x) => x.id === supplier.withholdingCodeId)?.code}`, `Supplier default · ${state.taxCodes.find((x) => x.id === supplier.withholdingCodeId)?.code}`) : say('Fiche · aucune', 'Supplier default · none')}</option><option value="">{say('Aucune', 'None')}</option>{whtCodes.map((x) => <option key={x.id} value={x.id}>{x.code} · {Math.round(x.rate * 1000) / 10} %</option>)}</Select></Field>
            <Field label={say('Compte de charge ou d\'immobilisation', 'Expense or fixed asset account')}><Select recent="accounts" className="in mono" value={expenseAccountId} onChange={(e) => setExpenseAccountId(e.target.value)}>{expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.nameFr}</option>)}</Select></Field>
            <Field label={say('Libellé', 'Description')} style={{ gridColumn: 'span 2' }}><input className="in" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={say('Loyer octobre · Licences · Honoraires…', 'October rent · Licenses · Fees…')} /></Field>
          </div>
          <table>
            <tbody>
              <tr><td>{say('Montant HT', 'Amount excl. tax')}</td><td className="num">{fmt(amount)}</td></tr>
              <tr><td>{say('TVA', 'VAT')} {vat ? `${vat.rate * 100} %` : ''}</td><td className="num">{fmt(tax)}</td></tr>
              <tr><td>{say('Total TTC', 'Total incl. tax')} {currency !== entity.functionalCurrency ? `(${fmt(ttcFunctional)} ${entity.functionalCurrency})` : ''}</td><td className="num">{fmt(ttc)}</td></tr>
              {withholding > 0 && <tr><td>{say('Retenue à la source', 'Withholding tax')} {whCode ? `${Math.round(whCode.rate * 1000) / 10} %` : ''} · {say('reversée au Trésor', 'paid to the Treasury')}</td><td className="num">−{fmt(withholding)}</td></tr>}
              <tr><td><b>{say('Net à payer au fournisseur', 'Net payable to supplier')}</b></td><td className="num"><b>{currency} {fmt(net)}</b></td></tr>
              <tr><td className="small muted" colSpan={2}>{say('Approbation requise : ', 'Approval required: ')}{say(approver, approverEn)}{say(' · écriture prévue : ', ' · planned journal entry: ')}{state.accounts.find((a) => a.id === expenseAccountId)?.code} {say('D', 'Dr')} {fmt(amount)}{tax ? say(` · TVA déductible D ${fmt(tax)}`, ` · input VAT Dr ${fmt(tax)}`) : ''} · {ap?.code ?? '401'} {say('C', 'Cr')} {fmt(net)}{withholding ? say(` · retenue C ${fmt(withholding)}`, ` · withholding Cr ${fmt(withholding)}`) : ''}</td></tr>
            </tbody>
          </table>
          <div className="actions"><button type="submit" className="btn primary" disabled={!supplierId || !ref.trim() || amount <= 0 || !expenseAccountId}>{say('Enregistrer la facture', 'Save invoice')}</button></div>
        </div>
      </form>
      <aside className="side">
        <div className="card">
          <h2>{say('Règles', 'Rules')}</h2>
          <div className="small">{say(`Une référence déjà enregistrée pour le même fournisseur est refusée (doublon). L'échéance vient de la fiche fournisseur sauf saisie. La retenue à la source par défaut vient aussi de la fiche ; les seuils d'approbation sont ${fmt(APPROVAL_THRESHOLDS.manager, 0)} (manager) et ${fmt(APPROVAL_THRESHOLDS.partner, 0)} (associé) TTC en ${entity.functionalCurrency}.`, `A reference already saved for the same supplier is refused (duplicate). The due date comes from the supplier record unless entered. The default withholding tax also comes from the supplier record; the approval thresholds are ${fmt(APPROVAL_THRESHOLDS.manager, 0)} (manager) and ${fmt(APPROVAL_THRESHOLDS.partner, 0)} (partner) incl. tax in ${entity.functionalCurrency}.`)}</div>
        </div>
      </aside>
    </div>
  );
}

function Payments({ entityId, preselect }: { entityId: Id; preselect: Id | null }) {
  const { state, t, apply } = useStore();
  const say = useSay();
  const open = state.supplierInvoices.filter((s) => s.entityId === entityId && s.status === 'posted').sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  const [invoiceId, setInvoiceId] = useState(preselect ?? open[0]?.id ?? '');
  const sel = open.find((o) => o.id === invoiceId);
  const [amount, setAmount] = useState(sel ? String(r2(sel.netPayable - sel.amountPaid)) : '');
  const [date, setDate] = useState(state.today);
  const banks = favoritesFirst(state.bankAccounts.filter((b) => b.entityId === entityId && b.active !== false && b.currency === (sel?.currency ?? 'MRU'))); // [bumex-one] favourites first
  const [bankId, setBankId] = useState(banks[0]?.id ?? '');
  const [ref, setRef] = useState('');
  const [tracked, setTracked] = useState(invoiceId);
  if (tracked !== invoiceId) { setTracked(invoiceId); const o = open.find((x) => x.id === invoiceId); setAmount(o ? String(r2(o.netPayable - o.amountPaid)) : ''); const b = state.bankAccounts.find((x) => x.entityId === entityId && x.currency === o?.currency); if (b) setBankId(b.id); }
  const payments = state.supplierPayments.filter((p) => p.entityId === entityId).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 60);
  return (
    <div className="cols">
      <div className="grow">
        <div className="card flush">
          <table>
            <thead><tr><th>{say('N°', 'No.')}</th><th>{t('date')}</th><th>{say('Fournisseur', 'Supplier')}</th><th>{say('Facture', 'Invoice')}</th><th className="num">{t('amount')}</th><th>{say('Banque', 'Bank')}</th><th>{say('Référence', 'Reference')}</th></tr></thead>
            <tbody>{payments.map((p) => { const inv = state.supplierInvoices.find((i) => i.id === p.invoiceId); return <tr key={p.id}><td className="mono">{p.number}</td><td><D iso={p.date} /></td><td>{state.suppliers.find((s) => s.id === p.supplierId)?.name}</td><td className="mono small">{inv?.supplierRef}</td><td className="num">{inv?.currency} {fmt(p.amount)}</td><td>{state.bankAccounts.find((b) => b.id === p.bankAccountId)?.name}</td><td className="small">{p.reference}</td></tr>; })}{payments.length === 0 && <tr><td colSpan={7} className="muted small">{say('Aucun règlement', 'No payments')}</td></tr>}</tbody>
          </table>
        </div>
      </div>
      <aside className="side">
        <div className="card">
          <h2>{say('Régler une facture', 'Pay an invoice')}</h2>
          <Field label={say('Facture comptabilisée', 'Posted invoice')}><Select recent="supplier-invoices" className="in" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>{open.map((o) => <option key={o.id} value={o.id}>{state.suppliers.find((s) => s.id === o.supplierId)?.name} · {o.supplierRef} · {o.currency} {fmt(r2(o.netPayable - o.amountPaid))}</option>)}</Select></Field>
          <Field label={`${t('amount')} (${sel?.currency ?? ''})`} style={{ marginTop: 8 }}><input className="in num" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label={t('date')} style={{ marginTop: 8 }}><input className="in mono" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label={say('Compte bancaire (même devise)', 'Bank account (same currency)')} style={{ marginTop: 8 }}><Select className="in" value={bankId} onChange={(e) => setBankId(e.target.value)}>{banks.map((b) => <option key={b.id} value={b.id}>{b.favorite ? '★ ' : ''}{b.bankName} · {b.name}</option>)}</Select></Field>
          <Field label={say('Référence du virement', 'Transfer reference')} style={{ marginTop: 8 }}><input className="in" value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
          <button className="btn primary" style={{ marginTop: 10, width: '100%', justifyContent: 'center' }} disabled={!sel || !bankId} onClick={() => { const amt = parseAmount(amount); if (!sel || amt === null) return; apply((s) => paySupplierInvoice(s, { invoiceId: sel.id, date, bankAccountId: bankId, amount: amt, reference: ref || undefined }), say('Règlement comptabilisé', 'Payment posted')); }}>{say('Enregistrer le règlement', 'Save payment')}</button>
          <div className="small muted" style={{ marginTop: 8 }}>{say('Écriture fournisseur D · banque C ; un règlement partiel laisse la facture ouverte pour le solde.', 'Journal entry: supplier Dr · bank Cr; a partial payment leaves the invoice open for the balance.')}</div>
        </div>
      </aside>
    </div>
  );
}

function PayablesView({ entityId }: { entityId: Id }) {
  const { state, toast } = useStore();
  const say = useSay();
  const pay = supplierPayables(state, entityId);
  const entity = state.entities.find((e) => e.id === entityId)!;
  const buckets = { current: 0, '1-30': 0, '31-90': 0, '90+': 0 };
  for (const r of pay.rows) buckets[r.bucket] = r2(buckets[r.bucket] + r.openFunctional);
  const exportXlsx = () => downloadXlsx(`dettes-fournisseurs-${entity.code}-${state.today}.xlsx`, [{ name: 'Dettes', rows: [['Fournisseur', 'Référence', 'Date', 'Échéance', 'Devise', 'Reste dû', 'Contre-valeur', 'Retard (j)', 'Tranche'], ...pay.rows.map((r) => [r.supplier.name, r.invoice.supplierRef, r.invoice.date, r.invoice.dueDate, r.invoice.currency, r.openTxn, r.openFunctional, r.daysOverdue, r.bucket])] }, { name: 'Par fournisseur', rows: [['Fournisseur', 'Factures', 'Ouvert'], ...pay.bySupplier.map((b) => [b.supplier.name, b.count, b.open])] }], toast);
  return (
    <div className="cols">
      <div className="grow">
        <div className="card flush">
          <table>
            <thead><tr><th>{say('Fournisseur', 'Supplier')}</th><th>{say('Référence', 'Reference')}</th><th>Date</th><th>{say('Échéance', 'Due date')}</th><th className="num">{say('Reste dû', 'Amount due')}</th><th className="num">{say(`Contre-valeur ${entity.functionalCurrency}`, `${entity.functionalCurrency} equivalent`)}</th><th>{say('Retard', 'Overdue')}</th></tr></thead>
            <tbody>{pay.rows.map((r) => <tr key={r.invoice.id}><td>{r.supplier.name}</td><td className="mono small">{r.invoice.supplierRef}</td><td><D iso={r.invoice.date} /></td><td><D iso={r.invoice.dueDate} /></td><td className="num">{r.invoice.currency} {fmt(r.openTxn)}</td><td className="num">{fmt(r.openFunctional)}</td><td>{r.daysOverdue > 0 ? <Chip kind={r.daysOverdue > 30 ? 'crit' : 'warn'}>{r.daysOverdue} {say('j', 'd')}</Chip> : <Chip kind="good">{say('à échoir', 'Not yet due')}</Chip>}</td></tr>)}{pay.rows.length === 0 && <tr><td colSpan={7} className="muted small">{say('Aucune dette fournisseur ouverte', 'No open supplier payables')}</td></tr>}</tbody>
            <tfoot><tr><td colSpan={5}>{say('Total dettes fournisseurs', 'Total supplier payables')}</td><td className="num">{fmt(pay.total)}</td><td></td></tr></tfoot>
          </table>
        </div>
        <div className="card flush">
          <table>
            <thead><tr><th>{say('Par fournisseur', 'By supplier')}</th><th className="num">{say('Factures', 'Invoices')}</th><th className="num">{say('Ouvert', 'Open')}</th></tr></thead>
            <tbody>{pay.bySupplier.map((b) => <tr key={b.supplier.id}><td>{b.supplier.name}</td><td className="num">{b.count}</td><td className="num">{fmt(b.open)}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
      <aside className="side">
        <div className="card">
          <h2>{say('État des dettes', 'Payables aging')}</h2>
          <div className="kv"><span className="k">{say('Non échu', 'Not yet due')}</span><Money v={buckets.current} /><span className="k">{say('1–30 j', '1–30 days')}</span><Money v={buckets['1-30']} /><span className="k">{say('31–90 j', '31–90 days')}</span><Money v={buckets['31-90']} /><span className="k">{say('90+ j', '90+ days')}</span><Money v={buckets['90+']} /><span className="k">{say('En retard', 'Overdue')}</span><Money v={pay.overdue} /><span className="k">{say('En attente d\'approbation', 'Awaiting approval')}</span><Money v={pay.pendingApproval} /></div>
          <button className="btn" style={{ marginTop: 10, width: '100%', justifyContent: 'center' }} onClick={exportXlsx}>{say('Exporter (Excel)', 'Export (Excel)')}</button>
          <div className="small muted" style={{ marginTop: 8 }}>{say('Les montants ouverts sont le net à payer (après retenue) moins les règlements enregistrés ; ils égalent le solde du compte fournisseurs.', 'Open amounts are the net payable (after withholding) less the payments recorded; they equal the balance of the supplier account.')}</div>
        </div>
      </aside>
    </div>
  );
}

function Suppliers({ entityId }: { entityId: Id }) {
  const { state, apply, t } = useStore();
  const say = useSay();
  const rows = state.suppliers.filter((s) => s.entityId === entityId);
  const whtCodes = state.taxCodes.filter((x) => x.entityId === entityId && x.kind === 'withholding' && !!x.collectedAccountId);
  const expenseAccounts = state.accounts.filter((a) => a.entityId === entityId && a.isPostable && a.active && a.kind === 'expense').sort((a, b) => a.code.localeCompare(b.code));
  const [editId, setEditId] = useState<Id | null>(null);
  const editing = editId ? rows.find((s) => s.id === editId) : undefined;
  const [name, setName] = useState('');
  const [regime, setRegime] = useState<CounterpartyRegime>('standard');
  const [wht, setWht] = useState('');
  const [terms, setTerms] = useState('30');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [nif, setNif] = useState('');
  const [address, setAddress] = useState('');
  const [expense, setExpense] = useState('');
  const [code, setCode] = useState('');
  const [collectiveId, setCollectiveId] = useState('');
  const nextCode = (() => { try { return nextThirdPartyCode(state, entityId, 'supplier'); } catch { return ''; } })();
  const collectives = state.accounts.filter((a) => a.entityId === entityId && a.active && !a.isAuxiliary && a.isPostable && a.requiresSupplier).sort((a, b) => a.code.localeCompare(b.code));
  const defaultCollective = (() => { try { return collectiveFor(state, entityId, 'supplier'); } catch { return undefined; } })();
  const auxOf = (x: { apAccountId?: Id }) => (x.apAccountId ? state.accounts.find((a) => a.id === x.apAccountId) : undefined);
  const load = (id: Id | null) => {
    const s = id ? rows.find((x) => x.id === id) : undefined;
    setEditId(id); setName(s?.name ?? ''); setRegime(s?.regime ?? 'standard'); setWht(s?.withholdingCodeId ?? ''); setTerms(String(s?.paymentTermsDays ?? 30)); setEmail(s?.email ?? ''); setPhone(s?.phone ?? ''); setNif(s?.nif ?? ''); setAddress(s?.address ?? ''); setExpense(s?.expenseAccountId ?? ''); setCode(s?.code ?? ''); setCollectiveId(s ? auxOf(s)?.collectiveId ?? '' : '');
  };
  const save = () => {
    const patch = { name: name.trim(), regime, withholdingCodeId: wht || undefined, paymentTermsDays: Number(terms) || 30, email: email || undefined, phone: phone || undefined, nif: nif || undefined, address: address || undefined, expenseAccountId: expense || undefined, collectiveId: collectiveId || undefined };
    if (apply((s) => (editing ? updateSupplier(s, editing.id, { ...patch, code: code.trim() || editing.code }) : addSupplier(s, { entityId, code: code.trim() || undefined, ...patch })), editing ? say('Fiche fournisseur mise à jour', 'Supplier record updated') : say('Fournisseur créé avec son compte auxiliaire', 'Supplier created with its subsidiary account'))) load(null);
  };
  const pay = supplierPayables(state, entityId);
  return (
    <div className="cols">
      <div className="grow">
        <div className="card flush">
          <table>
            <thead><tr><th>{say('Code auxiliaire', 'Subsidiary code')}</th><th>{say('Fournisseur', 'Supplier')}</th><th>{say('Compte collectif', 'Control account')}</th><th>{say('Régime', 'Regime')}</th><th>{say('Retenue', 'Withholding')}</th><th>{say('Délai', 'Payment terms')}</th><th>{say('Compte de charge', 'Expense account')}</th><th className="num">{say('Solde auxiliaire', 'Subsidiary balance')}</th><th></th></tr></thead>
            <tbody>{rows.map((s) => { const w = whtCodes.find((x) => x.id === s.withholdingCodeId); const aux = auxOf(s); const col = aux?.collectiveId ? state.accounts.find((a) => a.id === aux.collectiveId) : undefined; return <tr key={s.id} className={s.id === editId ? 'sel' : ''}><td className="mono">{s.code}</td><td>{s.name}{!s.active && <Chip kind="dim">{say(' inactif', ' inactive')}</Chip>}<div className="small muted">{[s.email, s.phone, s.nif ? `NIF ${s.nif}` : ''].filter(Boolean).join(' · ')}</div></td><td className="mono small">{col ? `${col.code} ${col.nameFr}` : '—'}</td><td>{(() => { const r = REGIMES.find((x) => x[0] === s.regime); return r ? say(r[1], r[2]) : undefined; })()}</td><td>{w ? <Chip kind="warn">{w.code} · {Math.round(w.rate * 1000) / 10} %</Chip> : <span className="muted">{say('Aucune', 'None')}</span>}</td><td>{s.paymentTermsDays} {say('j', 'd')}</td><td className="mono small">{state.accounts.find((a) => a.id === s.expenseAccountId)?.code ?? '—'}</td><td className="num">{aux ? fmt(-accountBalance(state, entityId, aux.id), 0) : '0'}</td><td style={{ whiteSpace: 'nowrap' }}><button className="btn sm" onClick={() => load(s.id)}>{t('edit')}</button> <DeleteButton table="supplier" rowId={s.id} label={`Fournisseur ${s.name}`} entityId={entityId} /></td></tr>; })}</tbody>
          </table>
        </div>
      </div>
      <aside className="side">
        <div className="card">
          <h2>{editing ? say(`Fiche · ${editing.code}`, `Supplier record · ${editing.code}`) : say('Nouveau fournisseur', 'New supplier')}</h2>
          <Field label={say('Nom', 'Name')}><input className="in" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <div className="grid2" style={{ marginTop: 8 }}>
            <Field label={say('Code auxiliaire (unique)', 'Subsidiary code (unique)')}><input className="in mono" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={editing ? editing.code : `auto · ${nextCode}`} /></Field>
            <Field label={say('Compte collectif', 'Control account')}><Select recent="accounts" className="in mono" value={collectiveId} onChange={(e) => setCollectiveId(e.target.value)}><option value="">{defaultCollective ? say(`Paramétrage · ${defaultCollective.code}`, `Default · ${defaultCollective.code}`) : '—'}</option>{collectives.map((a) => <option key={a.id} value={a.id}>{a.code} {a.nameFr}</option>)}</Select></Field>
          </div>
          {editing && auxOf(editing) && <div className="small muted" style={{ marginTop: 4 }}>{say('Compte auxiliaire', 'Subsidiary account')} <span className="mono">{auxOf(editing)!.code}</span> · {say('solde', 'balance')} {fmt(-accountBalance(state, entityId, auxOf(editing)!.id), 0)} · {say('renommer le code renomme le compte.', 'renaming the code renames the account.')}</div>}
          <div className="grid2" style={{ marginTop: 8 }}>
            <Field label={say('Régime', 'Regime')}><Select className="in" value={regime} onChange={(e) => setRegime(e.target.value as CounterpartyRegime)}>{REGIMES.map(([k, n, en]) => <option key={k} value={k}>{say(n, en)}</option>)}</Select></Field>
            <Field label={say('Retenue à la source', 'Withholding tax')}><Select className="in" value={wht} onChange={(e) => setWht(e.target.value)}><option value="">{say('Aucune', 'None')}</option>{whtCodes.map((x) => <option key={x.id} value={x.id}>{x.code} · {Math.round(x.rate * 1000) / 10} %</option>)}</Select></Field>
            <Field label={say('Délai (jours)', 'Payment terms (days)')}><input className="in num" value={terms} onChange={(e) => setTerms(e.target.value)} /></Field>
            <Field label={say('NIF', 'Tax ID (NIF)')}><input className="in mono" value={nif} onChange={(e) => setNif(e.target.value)} /></Field>
            <Field label={say('E-mail', 'Email')}><input className="in" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label={say('Téléphone', 'Phone')}><input className="in" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          </div>
          <Field label={say('Adresse', 'Address')} style={{ marginTop: 8 }}><input className="in" value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
          <Field label={say('Compte de charge par défaut', 'Default expense account')} style={{ marginTop: 8 }}><Select recent="accounts" className="in mono" value={expense} onChange={(e) => setExpense(e.target.value)}><option value="">—</option>{expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.nameFr}</option>)}</Select></Field>
          <div className="actions" style={{ marginTop: 10 }}>
            {editing && <button className="btn" onClick={() => load(null)}>{say('Annuler', 'Cancel')}</button>}
            <button className="btn primary" disabled={!name.trim()} onClick={save}>{editing ? say('Enregistrer', 'Save') : say('Créer', 'Create')}</button>
          </div>
        </div>
      </aside>
    </div>
  );
}
