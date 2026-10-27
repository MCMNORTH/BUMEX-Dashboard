import { useEffect, useMemo, useState } from 'react';
import {
  createSupplierInvoice, approveSupplierInvoice, rejectSupplierInvoice, paySupplierInvoice, supplierPayables, addSupplier, updateSupplier, fxRate, mapped, APPROVAL_THRESHOLDS, nextThirdPartyCode, collectiveFor, accountBalance,
  fmt, r2, parseAmount, type Id, type Currency, type CounterpartyRegime, type SupplierInvoice,
} from '@bumex/domain';
import { useStore } from '../../store';
import { Tabs, Field, Chip, D, Money, STATUS_KIND, STATUS_FR, DeleteButton, downloadXlsx, entryRef } from '../common';
import { Select } from '../Select';

type Tab = 'invoices' | 'new' | 'payments' | 'payables' | 'suppliers';
const REGIMES: [CounterpartyRegime, string][] = [['standard', 'Standard'], ['gta', 'GTA · sous-traitant enregistré'], ['exempt', 'Exonéré'], ['non_resident', 'Non-résident'], ['public', 'Organisme public']];

export function SuppliersPanel({ entityId, initialTab }: { entityId: Id; initialTab?: string | null }) {
  const { state, t } = useStore();
  const [tab, setTab] = useState<Tab>((initialTab as Tab) || 'invoices');
  useEffect(() => { if (initialTab) setTab(initialTab as Tab); }, [initialTab]);
  const [payFor, setPayFor] = useState<Id | null>(null);
  const pending = state.supplierInvoices.filter((s) => s.entityId === entityId && s.status === 'pending_approval').length;
  const pay = supplierPayables(state, entityId);
  const tabs = [
    { id: 'invoices' as Tab, label: <>{t('tab_invoices')} {pending ? <Chip kind="warn">{pending}</Chip> : null}</> },
    { id: 'new' as Tab, label: t('tab_new_invoice') },
    { id: 'payments' as Tab, label: 'Règlements' },
    { id: 'payables' as Tab, label: <>À payer {pay.overdueCount ? <Chip kind="crit">{pay.overdueCount}</Chip> : null}</> },
    { id: 'suppliers' as Tab, label: t('tab_customers') },
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

function approverLabel(si: SupplierInvoice): string {
  return si.approverRole === 'partner' ? `Associé (≥ ${fmt(APPROVAL_THRESHOLDS.partner, 0)})` : si.approverRole === 'manager' ? `Manager (≥ ${fmt(APPROVAL_THRESHOLDS.manager, 0)})` : 'Aucun · comptabilisée à la saisie';
}

function Invoices({ entityId, onPay }: { entityId: Id; onPay: (id: Id) => void }) {
  const { state, t, apply } = useStore();
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
            {([['all', `Toutes · ${all.length}`], ['pending', `À approuver · ${all.filter((i) => i.status === 'pending_approval').length}`], ['open', `À payer · ${all.filter((i) => i.status === 'posted').length}`], ['paid', `Payées · ${all.filter((i) => i.status === 'paid').length}`], ['rejected', `Rejetées · ${all.filter((i) => i.status === 'rejected').length}`]] as const).map(([k, l]) => (
              <button key={k} className={`btn sm ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{l}</button>
            ))}
            <span className="muted small" style={{ marginLeft: 'auto' }}>Approbation selon le montant TTC · le préparateur n'approuve jamais sa propre facture</span>
          </div>
          <table>
            <thead><tr><th>N° interne</th><th>Fournisseur</th><th>Réf. fournisseur</th><th>{t('date')}</th><th>{t('due')}</th><th className="num">HT</th><th className="num">TVA</th><th className="num">RAS</th><th className="num">Net à payer</th><th className="num">Réglé</th><th>{t('status')}</th><th></th></tr></thead>
            <tbody>
              {rows.map((si) => {
                const s = sup(si.supplierId);
                const overdue = si.status === 'posted' && si.dueDate < state.today;
                return (
                  <tr key={si.id} className={si.id === detail ? 'sel' : ''} onClick={() => setDetail(si.id)} style={{ cursor: 'pointer' }}>
                    <td className="mono">{si.number ?? '—'}</td><td>{s?.name}</td><td className="mono small">{si.supplierRef}</td><td><D iso={si.date} /></td><td>{overdue ? <Chip kind="crit"><D iso={si.dueDate} /></Chip> : <D iso={si.dueDate} />}</td>
                    <td className="num">{si.currency !== 'MRU' ? si.currency + ' ' : ''}{fmt(si.totalHt)}</td><td className="num">{fmt(si.totalTax)}</td><td className="num">{si.withholdingAmount ? fmt(si.withholdingAmount) : '—'}</td><td className="num">{fmt(si.netPayable)}</td><td className="num">{fmt(si.amountPaid)}</td>
                    <td><Chip kind={STATUS_KIND[si.status]}>{STATUS_FR[si.status]}</Chip>{si.status === 'pending_approval' && <div className="small muted">{approverLabel(si)}</div>}</td>
                    <td style={{ whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                      {si.status === 'pending_approval' && <><button className="btn sm primary" onClick={() => apply((s) => approveSupplierInvoice(s, si.id), 'Approuvée et comptabilisée')}>Approuver</button>{' '}<button className="btn sm" onClick={() => { const reason = prompt('Motif du rejet ?'); if (reason) apply((s) => rejectSupplierInvoice(s, si.id, reason), 'Facture rejetée'); }}>Rejeter</button></>}
                      {si.status === 'posted' && <button className="btn sm primary" onClick={() => onPay(si.id)}>Régler</button>}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={12} className="muted small">Aucune facture dans ce filtre</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <aside className="side">
        {sel ? (
          <div className="card">
            <h2>{sup(sel.supplierId)?.name} · {sel.supplierRef}</h2>
            <div className="kv">
              <span className="k">N° interne</span><span className="mono">{sel.number ?? '— (à l\'approbation)'}</span>
              <span className="k">Libellé</span><span>{sel.description}</span>
              <span className="k">Date · échéance</span><span><D iso={sel.date} /> · <D iso={sel.dueDate} /></span>
              <span className="k">HT</span><span className="num">{sel.currency} {fmt(sel.totalHt)}</span>
              <span className="k">TVA {sel.taxCodeId ? state.taxCodes.find((x) => x.id === sel.taxCodeId)?.code : '(aucune)'}</span><span className="num">{fmt(sel.totalTax)}</span>
              <span className="k">Retenue {sel.withholdingCodeId ? state.taxCodes.find((x) => x.id === sel.withholdingCodeId)?.code : '(aucune)'}</span><span className="num">{fmt(sel.withholdingAmount)}</span>
              <span className="k">Net à payer</span><Money v={sel.netPayable} cur={sel.currency} />
              <span className="k">Réglé · reste</span><span className="num">{fmt(sel.amountPaid)} · {fmt(r2(sel.netPayable - sel.amountPaid))}</span>
              <span className="k">Compte de charge</span><span className="mono">{state.accounts.find((a) => a.id === sel.expenseAccountId)?.code} {state.accounts.find((a) => a.id === sel.expenseAccountId)?.nameFr}</span>
              <span className="k">Préparée par</span><span>{sel.preparedBy}</span>
              <span className="k">Approbation</span><span>{approverLabel(sel)}</span>
              {sel.paidAt && <><span className="k">Soldée le</span><span><D iso={sel.paidAt} /></span></>}
            </div>
            {entry && (
              <>
                <h2 style={{ marginTop: 12 }}>Écriture {entryRef(state, entry)}</h2>
                <table><tbody>{entry.lines.map((l) => <tr key={l.lineNo}><td className="mono">{state.accounts.find((a) => a.id === l.accountId)?.code}</td><td className="small">{state.accounts.find((a) => a.id === l.accountId)?.nameFr}</td><td className="num">{l.debit ? fmt(l.debit) : ''}</td><td className="num">{l.credit ? fmt(l.credit) : ''}</td></tr>)}</tbody></table>
              </>
            )}
            {state.supplierPayments.filter((p) => p.invoiceId === sel.id).length > 0 && (
              <>
                <h2 style={{ marginTop: 12 }}>Règlements</h2>
                <table><tbody>{state.supplierPayments.filter((p) => p.invoiceId === sel.id).map((p) => <tr key={p.id}><td className="mono">{p.number}</td><td><D iso={p.date} /></td><td className="small">{state.bankAccounts.find((b) => b.id === p.bankAccountId)?.name}</td><td className="num">{fmt(p.amount)}</td></tr>)}</tbody></table>
              </>
            )}
          </div>
        ) : (
          <div className="card">
            <h2>Circuit d'une facture fournisseur</h2>
            <div className="small">Saisie → approbation selon le seuil (manager dès {fmt(APPROVAL_THRESHOLDS.manager, 0)} TTC, associé dès {fmt(APPROVAL_THRESHOLDS.partner, 0)}) → écriture 6xxx D · TVA déductible D · fournisseur C · retenue à la source C → règlement fournisseur D · banque C. Cliquer une ligne pour la fiche et ses écritures.</div>
          </div>
        )}
      </aside>
    </div>
  );
}

function NewInvoice({ entityId, onDone }: { entityId: Id; onDone: () => void }) {
  const { state, t, apply } = useStore();
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
  const ap = (() => { try { return mapped(state, entityId, 'AP_CONTROL'); } catch { return null; } })();
  const save = () => {
    const ok = apply((s) => createSupplierInvoice(s, { entityId, supplierId, supplierRef: ref, date, dueDays: dueDays.trim() ? Number(dueDays) : undefined, currency, fxRate: rate, totalHt: amount, taxCodeId: taxCodeId || null, withholdingCodeId: wht === 'default' ? undefined : wht || null, expenseAccountId, description }), approver.startsWith('aucune') ? 'Facture enregistrée et comptabilisée' : `Facture enregistrée · approbation ${approver.toLowerCase()} requise`);
    if (ok) onDone();
  };
  return (
    <div className="cols">
      <form className="grow" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="grid3">
            <Field label="Fournisseur"><Select recent="suppliers" className="in" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="N° de facture du fournisseur"><input className="in mono" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="F-2026-0412" /></Field>
            <Field label={`${t('date')} · échéance ${dueDays.trim() ? dueDays + ' j' : (supplier?.paymentTermsDays ?? 30) + ' j (fiche)'}`}><div style={{ display: 'flex', gap: 6 }}><input className="in mono" type="date" value={date} onChange={(e) => setDate(e.target.value)} /><input className="in num" style={{ width: 70 }} placeholder={String(supplier?.paymentTermsDays ?? 30)} value={dueDays} onChange={(e) => setDueDays(e.target.value)} aria-label="Délai en jours" /></div></Field>
            <Field label={`Montant HT · ${currency}${currency !== entity.functionalCurrency ? ` · taux ${rate}` : ''}`}><div style={{ display: 'flex', gap: 6 }}><Select className="in" style={{ width: 90 }} value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>{['MRU', 'USD', 'EUR', 'MAD'].map((c) => <option key={c}>{c}</option>)}</Select><input className="in num" value={ht} onChange={(e) => setHt(e.target.value)} placeholder="0,00" /></div></Field>
            <Field label="TVA"><Select className="in" value={taxCodeId} onChange={(e) => setTaxCodeId(e.target.value)}><option value="">Sans TVA</option>{vatCodes.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.rate * 100} %</option>)}</Select></Field>
            <Field label="Retenue à la source (que nous retenons)"><Select className="in" value={wht} onChange={(e) => setWht(e.target.value)}><option value="default">{supplier?.withholdingCodeId ? `Fiche · ${state.taxCodes.find((x) => x.id === supplier.withholdingCodeId)?.code}` : 'Fiche · aucune'}</option><option value="">Aucune</option>{whtCodes.map((x) => <option key={x.id} value={x.id}>{x.code} · {Math.round(x.rate * 1000) / 10} %</option>)}</Select></Field>
            <Field label="Compte de charge ou d'immobilisation"><Select recent="accounts" className="in mono" value={expenseAccountId} onChange={(e) => setExpenseAccountId(e.target.value)}>{expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.nameFr}</option>)}</Select></Field>
            <Field label="Libellé" style={{ gridColumn: 'span 2' }}><input className="in" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Loyer octobre · Licences · Honoraires…" /></Field>
          </div>
          <table>
            <tbody>
              <tr><td>Montant HT</td><td className="num">{fmt(amount)}</td></tr>
              <tr><td>TVA {vat ? `${vat.rate * 100} %` : ''}</td><td className="num">{fmt(tax)}</td></tr>
              <tr><td>Total TTC {currency !== entity.functionalCurrency ? `(${fmt(ttcFunctional)} ${entity.functionalCurrency})` : ''}</td><td className="num">{fmt(ttc)}</td></tr>
              {withholding > 0 && <tr><td>Retenue à la source {whCode ? `${Math.round(whCode.rate * 1000) / 10} %` : ''} · reversée au Trésor</td><td className="num">−{fmt(withholding)}</td></tr>}
              <tr><td><b>Net à payer au fournisseur</b></td><td className="num"><b>{currency} {fmt(net)}</b></td></tr>
              <tr><td className="small muted" colSpan={2}>Approbation requise : {approver} · écriture prévue : {state.accounts.find((a) => a.id === expenseAccountId)?.code} D {fmt(amount)}{tax ? ` · TVA déductible D ${fmt(tax)}` : ''} · {ap?.code ?? '401'} C {fmt(net)}{withholding ? ` · retenue C ${fmt(withholding)}` : ''}</td></tr>
            </tbody>
          </table>
          <div className="actions"><button type="submit" className="btn primary" disabled={!supplierId || !ref.trim() || amount <= 0 || !expenseAccountId}>Enregistrer la facture</button></div>
        </div>
      </form>
      <aside className="side">
        <div className="card">
          <h2>Règles</h2>
          <div className="small">Une référence déjà enregistrée pour le même fournisseur est refusée (doublon). L'échéance vient de la fiche fournisseur sauf saisie. La retenue à la source par défaut vient aussi de la fiche ; les seuils d'approbation sont {fmt(APPROVAL_THRESHOLDS.manager, 0)} (manager) et {fmt(APPROVAL_THRESHOLDS.partner, 0)} (associé) TTC en {entity.functionalCurrency}.</div>
        </div>
      </aside>
    </div>
  );
}

function Payments({ entityId, preselect }: { entityId: Id; preselect: Id | null }) {
  const { state, t, apply } = useStore();
  const open = state.supplierInvoices.filter((s) => s.entityId === entityId && s.status === 'posted').sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  const [invoiceId, setInvoiceId] = useState(preselect ?? open[0]?.id ?? '');
  const sel = open.find((o) => o.id === invoiceId);
  const [amount, setAmount] = useState(sel ? String(r2(sel.netPayable - sel.amountPaid)) : '');
  const [date, setDate] = useState(state.today);
  const banks = state.bankAccounts.filter((b) => b.entityId === entityId && b.active !== false && b.currency === (sel?.currency ?? 'MRU'));
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
            <thead><tr><th>N°</th><th>{t('date')}</th><th>Fournisseur</th><th>Facture</th><th className="num">{t('amount')}</th><th>Banque</th><th>Référence</th></tr></thead>
            <tbody>{payments.map((p) => { const inv = state.supplierInvoices.find((i) => i.id === p.invoiceId); return <tr key={p.id}><td className="mono">{p.number}</td><td><D iso={p.date} /></td><td>{state.suppliers.find((s) => s.id === p.supplierId)?.name}</td><td className="mono small">{inv?.supplierRef}</td><td className="num">{inv?.currency} {fmt(p.amount)}</td><td>{state.bankAccounts.find((b) => b.id === p.bankAccountId)?.name}</td><td className="small">{p.reference}</td></tr>; })}{payments.length === 0 && <tr><td colSpan={7} className="muted small">Aucun règlement</td></tr>}</tbody>
          </table>
        </div>
      </div>
      <aside className="side">
        <div className="card">
          <h2>Régler une facture</h2>
          <Field label="Facture comptabilisée"><Select recent="supplier-invoices" className="in" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>{open.map((o) => <option key={o.id} value={o.id}>{state.suppliers.find((s) => s.id === o.supplierId)?.name} · {o.supplierRef} · {o.currency} {fmt(r2(o.netPayable - o.amountPaid))}</option>)}</Select></Field>
          <Field label={`${t('amount')} (${sel?.currency ?? ''})`} style={{ marginTop: 8 }}><input className="in num" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label={t('date')} style={{ marginTop: 8 }}><input className="in mono" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Compte bancaire (même devise)" style={{ marginTop: 8 }}><Select recent="banks" className="in" value={bankId} onChange={(e) => setBankId(e.target.value)}>{banks.map((b) => <option key={b.id} value={b.id}>{b.bankName} · {b.name}</option>)}</Select></Field>
          <Field label="Référence du virement" style={{ marginTop: 8 }}><input className="in" value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
          <button className="btn primary" style={{ marginTop: 10, width: '100%', justifyContent: 'center' }} disabled={!sel || !bankId} onClick={() => { const amt = parseAmount(amount); if (!sel || amt === null) return; apply((s) => paySupplierInvoice(s, { invoiceId: sel.id, date, bankAccountId: bankId, amount: amt, reference: ref || undefined }), 'Règlement comptabilisé'); }}>Enregistrer le règlement</button>
          <div className="small muted" style={{ marginTop: 8 }}>Écriture fournisseur D · banque C ; un règlement partiel laisse la facture ouverte pour le solde.</div>
        </div>
      </aside>
    </div>
  );
}

function PayablesView({ entityId }: { entityId: Id }) {
  const { state, toast } = useStore();
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
            <thead><tr><th>Fournisseur</th><th>Référence</th><th>Date</th><th>Échéance</th><th className="num">Reste dû</th><th className="num">Contre-valeur {entity.functionalCurrency}</th><th>Retard</th></tr></thead>
            <tbody>{pay.rows.map((r) => <tr key={r.invoice.id}><td>{r.supplier.name}</td><td className="mono small">{r.invoice.supplierRef}</td><td><D iso={r.invoice.date} /></td><td><D iso={r.invoice.dueDate} /></td><td className="num">{r.invoice.currency} {fmt(r.openTxn)}</td><td className="num">{fmt(r.openFunctional)}</td><td>{r.daysOverdue > 0 ? <Chip kind={r.daysOverdue > 30 ? 'crit' : 'warn'}>{r.daysOverdue} j</Chip> : <Chip kind="good">à échoir</Chip>}</td></tr>)}{pay.rows.length === 0 && <tr><td colSpan={7} className="muted small">Aucune dette fournisseur ouverte</td></tr>}</tbody>
            <tfoot><tr><td colSpan={5}>Total dettes fournisseurs</td><td className="num">{fmt(pay.total)}</td><td></td></tr></tfoot>
          </table>
        </div>
        <div className="card flush">
          <table>
            <thead><tr><th>Par fournisseur</th><th className="num">Factures</th><th className="num">Ouvert</th></tr></thead>
            <tbody>{pay.bySupplier.map((b) => <tr key={b.supplier.id}><td>{b.supplier.name}</td><td className="num">{b.count}</td><td className="num">{fmt(b.open)}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
      <aside className="side">
        <div className="card">
          <h2>État des dettes</h2>
          <div className="kv"><span className="k">Non échu</span><Money v={buckets.current} /><span className="k">1–30 j</span><Money v={buckets['1-30']} /><span className="k">31–90 j</span><Money v={buckets['31-90']} /><span className="k">90+ j</span><Money v={buckets['90+']} /><span className="k">En retard</span><Money v={pay.overdue} /><span className="k">En attente d'approbation</span><Money v={pay.pendingApproval} /></div>
          <button className="btn" style={{ marginTop: 10, width: '100%', justifyContent: 'center' }} onClick={exportXlsx}>Exporter (Excel)</button>
          <div className="small muted" style={{ marginTop: 8 }}>Les montants ouverts sont le net à payer (après retenue) moins les règlements enregistrés ; ils égalent le solde du compte fournisseurs.</div>
        </div>
      </aside>
    </div>
  );
}

function Suppliers({ entityId }: { entityId: Id }) {
  const { state, apply, t } = useStore();
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
    if (apply((s) => (editing ? updateSupplier(s, editing.id, { ...patch, code: code.trim() || editing.code }) : addSupplier(s, { entityId, code: code.trim() || undefined, ...patch })), editing ? 'Fiche fournisseur mise à jour' : 'Fournisseur créé avec son compte auxiliaire')) load(null);
  };
  const pay = supplierPayables(state, entityId);
  return (
    <div className="cols">
      <div className="grow">
        <div className="card flush">
          <table>
            <thead><tr><th>Code auxiliaire</th><th>Fournisseur</th><th>Compte collectif</th><th>Régime</th><th>Retenue</th><th>Délai</th><th>Compte de charge</th><th className="num">Solde auxiliaire</th><th></th></tr></thead>
            <tbody>{rows.map((s) => { const w = whtCodes.find((x) => x.id === s.withholdingCodeId); const aux = auxOf(s); const col = aux?.collectiveId ? state.accounts.find((a) => a.id === aux.collectiveId) : undefined; return <tr key={s.id} className={s.id === editId ? 'sel' : ''}><td className="mono">{s.code}</td><td>{s.name}{!s.active && <Chip kind="dim"> inactif</Chip>}<div className="small muted">{[s.email, s.phone, s.nif ? `NIF ${s.nif}` : ''].filter(Boolean).join(' · ')}</div></td><td className="mono small">{col ? `${col.code} ${col.nameFr}` : '—'}</td><td>{REGIMES.find((r) => r[0] === s.regime)?.[1]}</td><td>{w ? <Chip kind="warn">{w.code} · {Math.round(w.rate * 1000) / 10} %</Chip> : <span className="muted">aucune</span>}</td><td>{s.paymentTermsDays} j</td><td className="mono small">{state.accounts.find((a) => a.id === s.expenseAccountId)?.code ?? '—'}</td><td className="num">{aux ? fmt(-accountBalance(state, entityId, aux.id), 0) : '0'}</td><td style={{ whiteSpace: 'nowrap' }}><button className="btn sm" onClick={() => load(s.id)}>{t('edit')}</button> <DeleteButton table="supplier" rowId={s.id} label={`Fournisseur ${s.name}`} entityId={entityId} /></td></tr>; })}</tbody>
          </table>
        </div>
      </div>
      <aside className="side">
        <div className="card">
          <h2>{editing ? `Fiche · ${editing.code}` : 'Nouveau fournisseur'}</h2>
          <Field label="Nom"><input className="in" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <div className="grid2" style={{ marginTop: 8 }}>
            <Field label="Code auxiliaire (unique)"><input className="in mono" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={editing ? editing.code : `auto · ${nextCode}`} /></Field>
            <Field label="Compte collectif"><Select recent="accounts" className="in mono" value={collectiveId} onChange={(e) => setCollectiveId(e.target.value)}><option value="">{defaultCollective ? `Paramétrage · ${defaultCollective.code}` : '—'}</option>{collectives.map((a) => <option key={a.id} value={a.id}>{a.code} {a.nameFr}</option>)}</Select></Field>
          </div>
          {editing && auxOf(editing) && <div className="small muted" style={{ marginTop: 4 }}>Compte auxiliaire <span className="mono">{auxOf(editing)!.code}</span> · solde {fmt(-accountBalance(state, entityId, auxOf(editing)!.id), 0)} · renommer le code renomme le compte.</div>}
          <div className="grid2" style={{ marginTop: 8 }}>
            <Field label="Régime"><Select className="in" value={regime} onChange={(e) => setRegime(e.target.value as CounterpartyRegime)}>{REGIMES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</Select></Field>
            <Field label="Retenue à la source"><Select className="in" value={wht} onChange={(e) => setWht(e.target.value)}><option value="">Aucune</option>{whtCodes.map((x) => <option key={x.id} value={x.id}>{x.code} · {Math.round(x.rate * 1000) / 10} %</option>)}</Select></Field>
            <Field label="Délai (jours)"><input className="in num" value={terms} onChange={(e) => setTerms(e.target.value)} /></Field>
            <Field label="NIF"><input className="in mono" value={nif} onChange={(e) => setNif(e.target.value)} /></Field>
            <Field label="E-mail"><input className="in" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Téléphone"><input className="in" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          </div>
          <Field label="Adresse" style={{ marginTop: 8 }}><input className="in" value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
          <Field label="Compte de charge par défaut" style={{ marginTop: 8 }}><Select recent="accounts" className="in mono" value={expense} onChange={(e) => setExpense(e.target.value)}><option value="">—</option>{expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.nameFr}</option>)}</Select></Field>
          <div className="actions" style={{ marginTop: 10 }}>
            {editing && <button className="btn" onClick={() => load(null)}>Annuler</button>}
            <button className="btn primary" disabled={!name.trim()} onClick={save}>{editing ? 'Enregistrer' : 'Créer'}</button>
          </div>
        </div>
      </aside>
    </div>
  );
}
