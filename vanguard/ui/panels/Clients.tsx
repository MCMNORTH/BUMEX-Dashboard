import { useEffect, useMemo, useState } from 'react';
import {
  createInvoice, validateInvoice, createCreditNote, recordPayment, openInvoices, aging, dunningQueue, sendDunning, addCustomer, updateCustomer, computeLines, resolveTaxCode, fxRate, mapped, withholdingStatement, nextThirdPartyCode, collectiveFor, accountBalance,
  fmt, r2, parseAmount, type Id, type Currency, type CounterpartyRegime, type SalesInvoice, type TaxCode, DomainError, REVENUE_STATUS_LABEL,
} from '@bumex/domain';
import { useStore } from '../../store';
import { ClientRelations } from '../../one/Clients'; // [bumex-one] one client, two sides
import { ClientPanel } from '../../one/ClientPage'; // [bumex-one] a client's page
import { ContractPanel, ContractsTab } from '../../one/Contracts'; // [bumex-one] BUMEX One's contracts
import { useSay } from '../../one/say'; // [bumex-one]
import { Tabs, Field, Chip, D, Money, STATUS_KIND, STATUS_FR, DeleteButton, downloadXlsx } from '../common';

// Withholding codes that a customer applies on our invoices (the receivable side), as opposed to the ones we apply on suppliers.
export function salesWithholdingCodes(codes: TaxCode[], entityId: Id): TaxCode[] {
  return codes.filter((x) => x.entityId === entityId && x.kind === 'withholding' && !!x.deductibleAccountId);
}

type Tab = 'invoices' | 'new' | 'payments' | 'aging' | 'dunning' | 'customers' | 'withholding' | 'contracts'; // [bumex-one] contracts
const CATEGORIES = [['AUDIT', 'Audit'], ['TAX', 'Fiscal'], ['LEGAL', 'Juridique'], ['ADVISORY', 'Conseil'], ['IT', 'IT'], ['OTHER', 'Autre']];
const REGIMES: [CounterpartyRegime, string][] = [['standard', 'Standard'], ['gta', 'GTA · sous-traitant enregistré'], ['exempt', 'Exonéré'], ['non_resident', 'Non-résident · export'], ['public', 'Organisme public']];

export function ClientsPanel({ entityId, initialTab }: { entityId: Id; initialTab?: string | null }) {
  const { state, t } = useStore();
  const say = useSay(); // [bumex-one]
  const [tab, setTab] = useState<Tab>((initialTab as Tab) || 'invoices');
  useEffect(() => { if (initialTab) setTab(initialTab as Tab); }, [initialTab]);
  const [payFor, setPayFor] = useState<Id | null>(null);
  const ag = aging(state, entityId);
  const tabs = [
    { id: 'invoices' as Tab, label: t('tab_invoices') }, { id: 'new' as Tab, label: t('tab_new_invoice') }, { id: 'payments' as Tab, label: t('tab_payments') },
    { id: 'aging' as Tab, label: <>{t('tab_aging')} <Chip kind={ag.overdueCount ? 'crit' : 'good'}>{ag.overdueCount}</Chip></> }, { id: 'dunning' as Tab, label: t('tab_dunning') }, { id: 'withholding' as Tab, label: 'Retenues subies' }, { id: 'customers' as Tab, label: t('tab_customers') },
    { id: 'contracts' as Tab, label: say('Contrats', 'Contracts') }, // [bumex-one] BUMEX One's contracts (vanguard/one/Contracts.tsx)
  ];
  // [bumex-one] "client:<id>" and "contract:<id>" open that client's or contract's page
  const page = (tab as string).match(/^(client|contract):(.+)$/);
  const closePage = (back: Tab) => { setTab(back); useStore.getState().setUi({ tab: null }); };
  return (
    <>
      <div className="sheet-head">
        <h1>{t('room_clients')}</h1>
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
      </div>
      <div className="sheet-body">
        {tab === 'invoices' && <Invoices entityId={entityId} onPay={(id) => { setPayFor(id); setTab('payments'); }} />}
        {tab === 'new' && <NewInvoice entityId={entityId} onDone={() => setTab('invoices')} />}
        {tab === 'payments' && <Payments entityId={entityId} preselect={payFor} />}
        {tab === 'aging' && <AgingView entityId={entityId} />}
        {tab === 'dunning' && <Dunning entityId={entityId} />}
        {tab === 'withholding' && <WithholdingSuffered entityId={entityId} />}
        {tab === 'customers' && <Customers entityId={entityId} />}
        {tab === 'contracts' && <ContractsTab />}
        {page?.[1] === 'client' && <ClientPanel key={page[2]} clientId={page[2]} onClose={() => closePage('customers')} />}
        {page?.[1] === 'contract' && <ContractPanel key={page[2]} contractId={page[2]} onClose={() => closePage('contracts')} />}
      </div>
    </>
  );
}

function InvoiceDoc({ inv, onClose }: { inv: SalesInvoice; onClose: () => void }) {
  const { state } = useStore();
  const entity = state.entities.find((e) => e.id === inv.entityId)!;
  const customer = state.customers.find((c) => c.id === inv.customerId)!;
  const bank = state.bankAccounts.find((b) => b.id === inv.bankAccountId) ?? state.bankAccounts.find((b) => b.entityId === inv.entityId && b.showOnInvoices && b.currency === inv.currency);
  return (
    <div className="sheet-back" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflow: 'auto', padding: 20 }} onClick={onClose}>
      <div className="invoice-doc" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20 }}>
          <div><h1>{entity.name}</h1><div className="small muted">{entity.address ?? 'Nouakchott, Mauritanie'}<br />NIF {entity.nif ?? '[NIF]'}</div></div>
          <div style={{ textAlign: 'right' }}><div style={{ fontSize: 18, fontWeight: 600 }}>Facture {inv.number ?? '(brouillon)'}</div><div className="small">Date <D iso={inv.date} /> · Échéance <D iso={inv.dueDate} /></div></div>
        </div>
        <div style={{ margin: '20px 0', padding: 12, background: '#f6f7f9', borderRadius: 6 }}><b>Adressé à</b><br />{customer.name}<br /><span className="small muted">{customer.country} · régime {REGIMES.find((r) => r[0] === customer.regime)?.[1]}</span></div>
        <div className="small muted">Montant en {inv.currency === 'USD' ? 'dollars US' : inv.currency === 'EUR' ? 'euros' : inv.currency === 'MAD' ? 'dirhams' : 'ouguiyas'}</div>
        <table style={{ marginTop: 6 }}>
          <thead><tr><th>Désignation</th><th className="num">Qté</th><th className="num">P.U.</th><th className="num">TVA</th><th className="num">Total HT</th></tr></thead>
          <tbody>{inv.lines.map((l) => <tr key={l.lineNo}><td>{l.description}</td><td className="num">{l.quantity}</td><td className="num">{fmt(l.unitPrice)}</td><td className="num">{((l.taxRateSnapshot ?? 0) * 100).toFixed(0)} %</td><td className="num">{fmt(l.lineHt)}</td></tr>)}</tbody>
          <tfoot>
            <tr><td colSpan={4}>Montant des prestations (HT)</td><td className="num">{fmt(inv.totalHt)}</td></tr>
            <tr><td colSpan={4}>TVA</td><td className="num">{fmt(inv.totalTax)}</td></tr>
            <tr><td colSpan={4}>Total TTC</td><td className="num">{fmt(inv.totalTtc)}</td></tr>
            {inv.withholdingAmount > 0 && <tr><td colSpan={4}>Retenue à la source {Math.round(inv.withholdingRate * 1000) / 10} % sur prestations (retenue par le client)</td><td className="num">−{fmt(inv.withholdingAmount)}</td></tr>}
            <tr><td colSpan={4}><b>Net à payer</b></td><td className="num"><b>{inv.currency} {fmt(inv.netPayable)}</b></td></tr>
          </tfoot>
        </table>
        {inv.legalMentionFr && <div className="small" style={{ marginTop: 10 }}>Mention : {inv.legalMentionFr}</div>}
        {inv.withholdingAmount > 0 && <div className="small" style={{ marginTop: 4 }}>Le client retient {fmt(inv.withholdingAmount)} et le reverse au Trésor pour notre compte ; ce montant n'est pas une exonération : la TVA reste due sur le montant HT.</div>}
        <div className="small muted" style={{ marginTop: 14 }}>Paiement par {inv.paymentMode.toLowerCase()} · {bank ? `${bank.bankName} · ${bank.name} · IBAN ${bank.iban ?? '—'}` : ''}</div>
        <div className="actions" style={{ marginTop: 16 }}><button className="btn" onClick={() => window.print()}>Imprimer / PDF</button><button className="btn primary" onClick={onClose}>Fermer</button></div>
      </div>
    </div>
  );
}

function Invoices({ entityId, onPay }: { entityId: Id; onPay: (id: Id) => void }) {
  const { state, t, apply } = useStore();
  const [filter, setFilter] = useState<'all' | 'open' | 'overdue' | 'draft'>('all');
  const [doc, setDoc] = useState<SalesInvoice | null>(null);
  const open = openInvoices(state, entityId);
  const all = state.salesInvoices.filter((i) => i.entityId === entityId).sort((a, b) => (a.date < b.date ? 1 : -1));
  const rows = all.filter((i) => (filter === 'all' ? true : filter === 'draft' ? i.status === 'draft' : filter === 'open' ? open.some((o) => o.invoice.id === i.id) : open.some((o) => o.invoice.id === i.id && o.daysOverdue > 0)));
  return (
    <>
      <div className="card flush">
        <div style={{ display: 'flex', gap: 4, padding: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {([['all', `Toutes · ${all.length}`], ['open', `Ouvertes · ${open.length}`], ['overdue', `En retard · ${open.filter((o) => o.daysOverdue > 0).length}`], ['draft', `Brouillons · ${all.filter((i) => i.status === 'draft').length}`]] as const).map(([k, l]) => (
            <button key={k} className={`btn sm ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{l}</button>
          ))}
          <span className="muted small" style={{ marginLeft: 'auto' }}>Validée = numérotée et comptabilisée ; correction uniquement par avoir</span>
        </div>
        <table>
          <thead><tr><th>N°</th><th>{t('customer')}</th><th>Régime</th><th>{t('date')}</th><th>{t('due')}</th><th className="num">{t('currency')}</th><th className="num">HT</th><th className="num">TVA</th><th className="num">RAS</th><th className="num">Net à payer</th><th className="num">{t('open_amount')}</th><th>Retard</th><th>{t('status')}</th><th></th></tr></thead>
          <tbody>
            {rows.map((i) => {
              const c = state.customers.find((x) => x.id === i.customerId)!;
              const o = open.find((x) => x.invoice.id === i.id);
              return (
                <tr key={i.id}>
                  <td className="mono">{i.number ?? '—'}</td><td>{c.name}</td><td className="small">{REGIMES.find((r) => r[0] === c.regime)?.[1].split(' ·')[0]}{i.withholdingAmount > 0 ? <Chip kind="warn">RAS {Math.round(i.withholdingRate * 100)} %</Chip> : null}</td><td><D iso={i.date} /></td><td><D iso={i.dueDate} /></td><td className="num">{i.currency}</td><td className="num">{fmt(i.totalHt)}</td><td className="num">{fmt(i.totalTax)}</td><td className="num">{i.withholdingAmount ? fmt(i.withholdingAmount) : '—'}</td><td className="num">{fmt(i.netPayable)}</td><td className="num">{o ? fmt(o.openTxn) : i.status === 'draft' ? '—' : '0,00'}</td>
                  <td>{o && o.daysOverdue > 0 ? <Chip kind={o.daysOverdue > 90 ? 'crit' : o.daysOverdue > 30 ? 'crit' : 'warn'}>{o.daysOverdue} j</Chip> : '—'}</td>
                  <td><Chip kind={STATUS_KIND[i.status]}>{STATUS_FR[i.status]}{i.dunningLevel ? ` · relance ${i.dunningLevel}` : ''}</Chip></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn sm" onClick={() => setDoc(i)}>Aperçu</button>{' '}
                    {i.status === 'draft' && <button className="btn sm primary" onClick={() => apply((s) => validateInvoice(s, i.id), 'Facture validée et comptabilisée')}>Valider</button>}
                    {o && <><button className="btn sm" onClick={() => onPay(i.id)}>Encaisser</button>{' '}<button className="btn sm" onClick={() => { const reason = prompt("Motif de l'avoir ?", 'remise commerciale'); if (reason !== null) apply((s) => createCreditNote(s, i.id, reason, s.today), 'Avoir émis et comptabilisé'); }}>Avoir</button></>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {doc && <InvoiceDoc inv={doc} onClose={() => setDoc(null)} />}
    </>
  );
}

interface LineForm { description: string; quantity: string; unitPrice: string; serviceCategory: string; taxCodeId: string; revenueAccountId: string }
const emptyLine = (): LineForm => ({ description: '', quantity: '1', unitPrice: '', serviceCategory: 'AUDIT', taxCodeId: '', revenueAccountId: '' });

function NewInvoice({ entityId, onDone }: { entityId: Id; onDone: () => void }) {
  const { state, t, apply } = useStore();
  const entity = state.entities.find((e) => e.id === entityId)!;
  const customers = state.customers.filter((c) => c.entityId === entityId);
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? '');
  const customer = customers.find((c) => c.id === customerId);
  const [date, setDate] = useState(state.today);
  const [currency, setCurrency] = useState<Currency>(customer?.defaultCurrency ?? entity.functionalCurrency);
  const [rate, setRate] = useState('');
  const [engagementId, setEngagementId] = useState('');
  const [lines, setLines] = useState<LineForm[]>([emptyLine()]);
  const taxCodes = state.taxCodes.filter((x) => x.entityId === entityId && x.kind === 'vat');
  const whtCodes = salesWithholdingCodes(state.taxCodes, entityId);
  const [wht, setWht] = useState<string>('default'); // 'default' = the customer's setting, '' = none, else a code id
  const revenueAccounts = state.accounts.filter((a) => a.entityId === entityId && a.isPostable && a.kind === 'income' && a.code.startsWith('7')).sort((a, b) => a.code.localeCompare(b.code));
  const banks = state.bankAccounts.filter((b) => b.entityId === entityId && b.active !== false && !b.isCash);
  const [bankId, setBankId] = useState(banks.find((b) => b.currency === currency)?.id ?? banks[0]?.id ?? '');
  const autoRate = useMemo(() => { try { return fxRate(state, currency, entity.functionalCurrency, date); } catch { return 1; } }, [state, currency, entity.functionalCurrency, date]);
  const effRate = rate.trim() ? Number(rate.replace(',', '.')) || autoRate : autoRate;

  const input = () => ({
    entityId, customerId, date, currency, fxRate: effRate, engagementId: engagementId || undefined, bankAccountId: bankId || undefined,
    withholdingCodeId: wht === 'default' ? undefined : wht === '' ? null : wht,
    lines: lines.filter((l) => l.description.trim() && parseAmount(l.unitPrice) !== null).map((l) => ({ description: l.description, quantity: Number(l.quantity.replace(',', '.')) || 1, unitPrice: parseAmount(l.unitPrice) ?? 0, serviceCategory: l.serviceCategory, taxCodeId: l.taxCodeId || undefined, revenueAccountId: l.revenueAccountId || undefined })),
  });
  const preview = useMemo(() => {
    if (!customer) return null;
    try {
      const { lines: computed, mention } = computeLines(state, input());
      const ht = r2(computed.reduce((a, l) => a + l.lineHt, 0)), tax = r2(computed.reduce((a, l) => a + l.taxAmount, 0));
      const ar = customer.groupEntityId ? mapped(state, entityId, 'AR_GROUP') : mapped(state, entityId, 'AR_CONTROL');
      const whtId = wht === 'default' ? customer.withholdingCodeId : wht || undefined;
      const whtCode = whtId ? whtCodes.find((x) => x.id === whtId) : undefined;
      const withholding = whtCode ? r2(ht * whtCode.rate) : 0;
      const whtAccount = whtCode ? state.accounts.find((a) => a.id === whtCode.deductibleAccountId) : undefined;
      return { computed, mention, ht, tax, ttc: r2(ht + tax), withholding, whtCode, whtAccount, net: r2(ht + tax - withholding), ar, error: null as string | null };
    } catch (e) {
      return { computed: [], mention: undefined, ht: 0, tax: 0, ttc: 0, withholding: 0, whtCode: undefined, whtAccount: undefined, net: 0, ar: null, error: e instanceof DomainError ? e.message : String(e) };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, customerId, date, currency, effRate, engagementId, lines, wht]);
  const resolvedFor = (l: LineForm) => { if (!customer) return null; try { return resolveTaxCode(state, entityId, customer, l.serviceCategory, date); } catch { return null; } };
  const setLine = (i: number, patch: Partial<LineForm>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const save = (validate: boolean) => {
    const ok = apply((s) => {
      const [s1, inv] = createInvoice(s, input());
      if (!validate) return s1;
      const [s2] = validateInvoice(s1, inv.id);
      return s2;
    }, validate ? 'Facture validée, numérotée et comptabilisée' : 'Facture enregistrée en brouillon');
    if (ok) onDone();
  };
  return (
    <div className="cols">
      <form className="grow" onSubmit={(e) => e.preventDefault()}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="grid4">
            <Field label={t('customer')}><select className="in" value={customerId} onChange={(e) => { setCustomerId(e.target.value); const c = customers.find((x) => x.id === e.target.value); if (c) { setCurrency(c.defaultCurrency); setBankId(banks.find((b) => b.currency === c.defaultCurrency)?.id ?? banks[0]?.id ?? ''); } }}>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="Régime du client"><input className="in" readOnly value={REGIMES.find((r) => r[0] === customer?.regime)?.[1] ?? ''} /></Field>
            <Field label={`${t('date')} · échéance ${customer?.paymentTermsDays ?? 30} j`}><input className="in mono" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label={`${t('currency')} · taux du jour ${autoRate}`}><div style={{ display: 'flex', gap: 6 }}><select className="in" style={{ width: 90 }} value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>{['MRU', 'USD', 'EUR', 'MAD'].map((c) => <option key={c}>{c}</option>)}</select><input className="in num" placeholder={String(autoRate)} value={rate} onChange={(e) => setRate(e.target.value)} disabled={currency === entity.functionalCurrency} aria-label="Taux forcé" /></div></Field>
            <Field label="Mission"><select className="in" value={engagementId} onChange={(e) => setEngagementId(e.target.value)}><option value="">—</option>{state.engagements.filter((x) => x.entityId === entityId && x.customerId === customerId).map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}</select></Field>
            <Field label="Bloc bancaire imprimé"><select className="in" value={bankId} onChange={(e) => setBankId(e.target.value)}>{banks.map((b) => <option key={b.id} value={b.id}>{b.bankName} · {b.name}</option>)}</select></Field>
            <Field label="Retenue à la source appliquée par le client">
              <select className="in" value={wht} onChange={(e) => setWht(e.target.value)}>
                <option value="default">{customer?.withholdingCodeId ? `Fiche client · ${whtCodes.find((x) => x.id === customer.withholdingCodeId)?.code ?? ''} (${Math.round((whtCodes.find((x) => x.id === customer.withholdingCodeId)?.rate ?? 0) * 100)} %)` : 'Fiche client · aucune retenue'}</option>
                <option value="">Aucune retenue</option>
                {whtCodes.map((x) => <option key={x.id} value={x.id}>{x.code} · {Math.round(x.rate * 1000) / 10} % · {x.nameFr}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
            <table>
              <thead><tr><th>#</th><th>Désignation</th><th className="num" style={{ width: 70 }}>Qté</th><th className="num" style={{ width: 120 }}>P.U.</th><th style={{ width: 120 }}>Catégorie</th><th style={{ width: 190 }}>Code taxe</th><th style={{ width: 230 }}>Compte de produit</th><th className="num" style={{ width: 110 }}>Total HT</th><th></th></tr></thead>
              <tbody>
                {lines.map((l, i) => {
                  const auto = resolvedFor(l);
                  const chosen = l.taxCodeId ? taxCodes.find((x) => x.id === l.taxCodeId) : auto;
                  const status = chosen?.revenueStatus ?? 'taxable_standard';
                  const defaultRevenue = (() => { try { return mapped(state, entityId, 'REVENUE', `${l.serviceCategory}:${status}`); } catch { try { return mapped(state, entityId, 'REVENUE', status); } catch { return null; } } })();
                  const ht = r2((Number(l.quantity.replace(',', '.')) || 0) * (parseAmount(l.unitPrice) ?? 0));
                  return (
                    <tr key={i}>
                      <td className="mono">{i + 1}</td>
                      <td><input className="in" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} aria-label={`Désignation ${i + 1}`} placeholder="Audit des comptes · phase intérimaire" /></td>
                      <td><input className="in num" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} aria-label={`Quantité ${i + 1}`} /></td>
                      <td><input className="in num" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} aria-label={`Prix ${i + 1}`} /></td>
                      <td><select className="in" value={l.serviceCategory} onChange={(e) => setLine(i, { serviceCategory: e.target.value })} aria-label={`Catégorie ${i + 1}`}>{CATEGORIES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></td>
                      <td><select className="in" value={l.taxCodeId} onChange={(e) => setLine(i, { taxCodeId: e.target.value })} aria-label={`Code taxe ${i + 1}`}><option value="">{auto ? `${auto.code} · ${auto.rate * 100} % (règle)` : '—'}</option>{taxCodes.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.rate * 100} %</option>)}</select></td>
                      <td><select className="in mono" value={l.revenueAccountId} onChange={(e) => setLine(i, { revenueAccountId: e.target.value })} aria-label={`Compte de produit ${i + 1}`}><option value="">{defaultRevenue ? `${defaultRevenue.code} (défaut · ${REVENUE_STATUS_LABEL[status]})` : '—'}</option>{revenueAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.nameFr}</option>)}</select></td>
                      <td className="num">{fmt(ht)}</td>
                      <td><button type="button" className="btn sm" aria-label="Supprimer la ligne" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, k) => k !== i) : ls))}>×</button></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr><td colSpan={6}><button type="button" className="btn sm" onClick={() => setLines((ls) => [...ls, emptyLine()])}>+ ligne</button></td><td className="muted">Total HT</td><td className="num">{fmt(preview?.ht ?? 0)}</td><td></td></tr>
                <tr><td colSpan={6} className="small muted">{preview?.mention ? `Mention imprimée : « ${preview.mention} »` : ''}</td><td className="muted">TVA</td><td className="num">{fmt(preview?.tax ?? 0)}</td><td></td></tr>
                <tr><td colSpan={6} className="small muted">{preview?.whtCode ? `Retenue ${Math.round(preview.whtCode.rate * 1000) / 10} % sur ${fmt(preview.ht)} HT · compte ${preview.whtAccount?.code ?? ''} (créance sur le Trésor) · la TVA reste due sur le HT` : 'Aucune retenue à la source sur ce document'}</td><td className="muted">Total TTC</td><td className="num">{fmt(preview?.ttc ?? 0)}</td><td></td></tr>
                {preview && preview.withholding > 0 && <tr><td colSpan={6}></td><td className="muted">Retenue {Math.round((preview.whtCode?.rate ?? 0) * 1000) / 10} %</td><td className="num">−{fmt(preview.withholding)}</td><td></td></tr>}
                <tr><td colSpan={6} className="small">{preview?.ar && preview.ttc > 0 ? `Écriture prévue : ${preview.ar.code} D ${fmt(r2(preview.net * effRate))}${preview.withholding ? ` · ${preview.whtAccount?.code ?? 'RAS'} D ${fmt(r2(preview.withholding * effRate))}` : ''} ${entity.functionalCurrency} · ${preview.computed.map((l) => `${state.accounts.find((a) => a.id === l.revenueAccountId)?.code} C ${fmt(r2(l.lineHt * effRate))}`).join(' · ')}${preview.tax ? ` · TVA C ${fmt(r2(preview.tax * effRate))}` : ' · aucune ligne de TVA'}` : preview?.error ?? ''}</td><td><b>Net à payer</b></td><td className="num"><b>{currency} {fmt(preview?.net ?? 0)}</b></td><td></td></tr>
              </tfoot>
            </table>
          </div>
          <div className="actions">
            <button type="button" className="btn" onClick={() => save(false)}>{t('keep_draft')}</button>
            <button type="button" className="btn primary" disabled={!preview || !!preview.error || preview.ttc <= 0} onClick={() => save(true)}>{t('validate')}</button>
          </div>
        </div>
      </form>
      <aside className="side">
        <div className="card">
          <h2>Résolution de la taxe</h2>
          <div className="small">Document forcé &gt; règle (régime du client + catégorie) &gt; défaut de l'entité. Le code figé sur la ligne choisit aussi le sous-compte de produit, que vous pouvez remplacer par n'importe quel compte de classe 7, y compris un sous-compte créé dans le plan.</div>
          <h2 style={{ marginTop: 12 }}>Retenue ≠ exonération</h2>
          <div className="small">Une ligne <b>exonérée</b> ou <b>à taux zéro</b> ne porte pas de TVA (code taxe de la ligne). La <b>retenue à la source</b> s'applique au niveau du document, sur le HT des prestations, sans changer la TVA : le client verse le net et reverse la retenue au Trésor ; nous la suivons en créance ({whtCodes.map((x) => `${x.code} ${Math.round(x.rate * 1000) / 10} %`).join(', ') || 'aucun code'}) jusqu'à l'imputation sur notre impôt. Taux et comptes se règlent dans Fiscalité · codes.</div>
          <div style={{ marginTop: 10 }} className="small">
            {taxCodes.map((x) => <div key={x.id} className="kv" style={{ padding: '3px 0' }}><span className="mono">{x.code}</span><span>{x.nameFr}</span></div>)}
          </div>
        </div>
      </aside>
    </div>
  );
}

function Payments({ entityId, preselect }: { entityId: Id; preselect: Id | null }) {
  const { state, t, apply } = useStore();
  const open = openInvoices(state, entityId);
  const [invoiceId, setInvoiceId] = useState(preselect ?? open[0]?.invoice.id ?? '');
  const sel = open.find((o) => o.invoice.id === invoiceId);
  const [amount, setAmount] = useState(sel ? String(sel.openTxn) : '');
  const [date, setDate] = useState(state.today);
  const banks = state.bankAccounts.filter((b) => b.entityId === entityId && b.active !== false && b.currency === (sel?.invoice.currency ?? 'MRU'));
  const [bankId, setBankId] = useState(banks[0]?.id ?? '');
  const [ref, setRef] = useState('');
  const [tracked, setTracked] = useState(invoiceId);
  if (tracked !== invoiceId) { setTracked(invoiceId); const o = open.find((x) => x.invoice.id === invoiceId); setAmount(o ? String(o.openTxn) : ''); const b = state.bankAccounts.find((x) => x.entityId === entityId && x.currency === o?.invoice.currency); if (b) setBankId(b.id); }
  const payments = state.customerPayments.filter((p) => p.entityId === entityId).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 40);
  return (
    <div className="cols">
      <div className="grow">
        <div className="card flush">
          <table>
            <thead><tr><th>N°</th><th>{t('date')}</th><th>{t('customer')}</th><th className="num">{t('amount')}</th><th>Banque</th><th>Référence</th><th>Rapproché</th></tr></thead>
            <tbody>{payments.map((p) => <tr key={p.id}><td className="mono">{p.number}</td><td><D iso={p.date} /></td><td>{state.customers.find((c) => c.id === p.customerId)?.name}</td><td className="num">{p.currency} {fmt(p.amountTxn)}</td><td>{state.bankAccounts.find((b) => b.id === p.bankAccountId)?.name}</td><td className="small">{p.reference}</td><td>{p.bankTransactionId ? <Chip kind="good">oui</Chip> : <Chip kind="warn">en attente du relevé</Chip>}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
      <aside className="side">
        <div className="card">
          <h2>Encaissement</h2>
          <Field label="Facture ouverte"><select className="in" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>{open.map((o) => <option key={o.invoice.id} value={o.invoice.id}>{o.invoice.number} · {o.customer.name} · {o.invoice.currency} {fmt(o.openTxn)}</option>)}</select></Field>
          <Field label={`${t('amount')} reçu (${sel?.invoice.currency ?? ''})`} style={{ marginTop: 8 }}><input className="in num" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label={t('date')} style={{ marginTop: 8 }}><input className="in mono" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Compte bancaire (même devise)" style={{ marginTop: 8 }}><select className="in" value={bankId} onChange={(e) => setBankId(e.target.value)}>{banks.map((b) => <option key={b.id} value={b.id}>{b.bankName} · {b.name}</option>)}</select></Field>
          <Field label="Référence" style={{ marginTop: 8 }}><input className="in" value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
          <button className="btn primary" style={{ marginTop: 10, width: '100%', justifyContent: 'center' }} disabled={!sel || !bankId} onClick={() => { const amt = parseAmount(amount); if (!sel || amt === null) return; apply((s) => recordPayment(s, { entityId, customerId: sel.customer.id, date, currency: sel.invoice.currency, amountTxn: amt, bankAccountId: bankId, invoiceId: sel.invoice.id, reference: ref || sel.invoice.number }), "Encaissement comptabilisé et lettré"); }}>Enregistrer l'encaissement</button>
          <div className="small muted" style={{ marginTop: 8 }}>Lettrage automatique ; en devise, l'écart entre le cours de la facture et celui du jour est passé en 778 / 678.</div>
        </div>
      </aside>
    </div>
  );
}

function AgingView({ entityId }: { entityId: Id }) {
  const { state } = useStore();
  const ag = aging(state, entityId);
  const rows = openInvoices(state, entityId);
  const byCustomer = new Map<Id, { name: string; current: number; d1: number; d2: number; d3: number; total: number }>();
  for (const r of rows) {
    const c = byCustomer.get(r.customer.id) ?? { name: r.customer.name, current: 0, d1: 0, d2: 0, d3: 0, total: 0 };
    if (r.bucket === 'current') c.current = r2(c.current + r.openFunctional); else if (r.bucket === '1-30') c.d1 = r2(c.d1 + r.openFunctional); else if (r.bucket === '31-90') c.d2 = r2(c.d2 + r.openFunctional); else c.d3 = r2(c.d3 + r.openFunctional);
    c.total = r2(c.total + r.openFunctional);
    byCustomer.set(r.customer.id, c);
  }
  const pct = (x: number) => (ag.total ? Math.max(4, (x / ag.total) * 100) : 0);
  return (
    <div className="cols">
      <div className="grow">
        <div className="card flush">
          <table>
            <thead><tr><th>Client</th><th className="num">Non échu</th><th className="num">1–30 j</th><th className="num">31–90 j</th><th className="num">90+ j</th><th className="num">Total</th></tr></thead>
            <tbody>{[...byCustomer.values()].sort((a, b) => b.total - a.total).map((c) => <tr key={c.name}><td>{c.name}</td><td className="num">{fmt(c.current)}</td><td className="num">{fmt(c.d1)}</td><td className="num">{fmt(c.d2)}</td><td className="num" style={{ color: c.d3 ? 'var(--crit)' : undefined }}>{fmt(c.d3)}</td><td className="num">{fmt(c.total)}</td></tr>)}</tbody>
            <tfoot><tr><td>Total (contre-valeur MRU)</td><td className="num">{fmt(ag.current)}</td><td className="num">{fmt(ag.d1to30)}</td><td className="num">{fmt(ag.d31to90)}</td><td className="num">{fmt(ag.d90plus)}</td><td className="num">{fmt(ag.total)}</td></tr></tfoot>
          </table>
        </div>
      </div>
      <aside className="side">
        <div className="card">
          <h2>Balance âgée · {fmt(ag.total)} ouverts</h2>
          <div className="age" aria-label="Répartition par ancienneté">
            {ag.current > 0 && <div style={{ flex: pct(ag.current), background: 'var(--good)' }}>Non échu</div>}
            {ag.d1to30 > 0 && <div style={{ flex: pct(ag.d1to30), background: 'var(--warn)' }}>1–30</div>}
            {ag.d31to90 > 0 && <div style={{ flex: pct(ag.d31to90), background: 'var(--crit)' }}>31–90</div>}
            {ag.d90plus > 0 && <div style={{ flex: pct(ag.d90plus), background: '#7a1118' }}>90+</div>}
          </div>
          <div className="kv" style={{ marginTop: 10 }}>
            <span className="k">En retard</span><Money v={ag.overdue} /><span className="k">Factures en retard</span><span className="mono">{ag.overdueCount}</span><span className="k">Au-delà de 90 jours</span><span className="mono">{ag.over90Count}</span>
          </div>
          <div className="small muted" style={{ marginTop: 8 }}>La pile de dossiers rouges à l'accueil de l'étage compte {ag.overdueCount} dossiers.</div>
        </div>
      </aside>
    </div>
  );
}

function Dunning({ entityId }: { entityId: Id }) {
  const { state, apply } = useStore();
  const q = dunningQueue(state, entityId);
  return (
    <div className="card flush">
      <table>
        <thead><tr><th>Client</th><th>Facture</th><th className="num">Reste dû</th><th>Retard</th><th>Niveau proposé</th><th>Modèle</th><th></th></tr></thead>
        <tbody>
          {q.length === 0 && <tr><td colSpan={7} className="muted">Aucune relance à envoyer.</td></tr>}
          {q.map((r) => (
            <tr key={r.invoice.id}><td>{r.customer.name}</td><td className="mono">{r.invoice.number}</td><td className="num">{r.invoice.currency} {fmt(r.openTxn)}</td><td>{r.daysOverdue} j</td><td><Chip kind={r.nextLevel!.level === 3 ? 'crit' : 'warn'}>{r.nextLevel!.level} · {r.nextLevel!.label}</Chip></td><td className="small">{r.nextLevel!.template}</td><td><button className="btn sm primary" onClick={() => apply((s) => sendDunning(s, r.invoice.id), `Relance niveau ${r.nextLevel!.level} envoyée`)}>Envoyer</button></td></tr>
          ))}
        </tbody>
      </table>
      <div className="small muted" style={{ padding: 10 }}>Niveaux : 1 rappel courtois à 15 jours · 2 mise en demeure à 45 jours · 3 contentieux à 90 jours (transfert BUMEX Avocats). Paramétrables par entité.</div>
    </div>
  );
}

function Customers({ entityId }: { entityId: Id }) {
  const { state, apply, t } = useStore();
  const rows = state.customers.filter((c) => c.entityId === entityId);
  const whtCodes = salesWithholdingCodes(state.taxCodes, entityId);
  const [editId, setEditId] = useState<Id | null>(null);
  const editing = editId ? rows.find((c) => c.id === editId) : undefined;
  const [name, setName] = useState('');
  const [regime, setRegime] = useState<CounterpartyRegime>('standard');
  const [currency, setCurrency] = useState<Currency>('MRU');
  const [terms, setTerms] = useState('30');
  const [wht, setWht] = useState('');
  const [nif, setNif] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [collectiveId, setCollectiveId] = useState('');
  const nextCode = (() => { try { return nextThirdPartyCode(state, entityId, 'customer'); } catch { return ''; } })();
  const collectives = state.accounts.filter((a) => a.entityId === entityId && a.active && !a.isAuxiliary && a.isPostable && a.requiresCustomer).sort((a, b) => a.code.localeCompare(b.code));
  const defaultCollective = (() => { try { return collectiveFor(state, entityId, 'customer'); } catch { return undefined; } })();
  const auxOf = (c: { arAccountId?: Id }) => (c.arAccountId ? state.accounts.find((a) => a.id === c.arAccountId) : undefined);
  const load = (id: Id | null) => {
    const c = id ? rows.find((x) => x.id === id) : undefined;
    setEditId(id); setName(c?.name ?? ''); setRegime(c?.regime ?? 'standard'); setCurrency(c?.defaultCurrency ?? 'MRU'); setTerms(String(c?.paymentTermsDays ?? 30)); setWht(c?.withholdingCodeId ?? ''); setNif(c?.nif ?? ''); setEmail(c?.email ?? ''); setCode(c?.code ?? ''); setCollectiveId(c ? auxOf(c)?.collectiveId ?? '' : '');
  };
  const save = () => {
    const patch = { name: name.trim(), regime, defaultCurrency: currency, paymentTermsDays: Number(terms) || 30, withholdingCodeId: wht || undefined, nif: nif || undefined, email: email || undefined, country: regime === 'non_resident' ? 'XX' : 'MR', collectiveId: collectiveId || undefined };
    if (apply((s) => (editing ? updateCustomer(s, editing.id, { ...patch, code: code.trim() || editing.code }) : addCustomer(s, { entityId, code: code.trim() || undefined, ...patch })), editing ? 'Fiche client mise à jour' : 'Client créé avec son compte auxiliaire')) load(null);
  };
  const open = openInvoices(state, entityId);
  return (
    <div className="cols">
      <div className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="card flush">
          <table>
            <thead><tr><th>Code auxiliaire</th><th>Nom</th><th>Compte collectif</th><th>Régime TVA</th><th>Retenue à la source</th><th>Devise</th><th>Conditions</th><th className="num">Solde auxiliaire</th><th className="num">En retard</th><th></th></tr></thead>
            <tbody>{rows.map((c) => { const o = open.filter((x) => x.customer.id === c.id); const w = whtCodes.find((x) => x.id === c.withholdingCodeId); const aux = auxOf(c); const col = aux?.collectiveId ? state.accounts.find((a) => a.id === aux.collectiveId) : undefined; return <tr key={c.id} className={c.id === editId ? 'sel' : ''}><td className="mono">{c.code}</td><td>{c.name}{c.groupEntityId && <Chip kind="dim"> groupe</Chip>}{!c.active && <Chip kind="dim"> inactif</Chip>}<div className="small muted">{c.email ?? ''}{c.nif ? ` · NIF ${c.nif}` : ''}</div></td><td className="mono small">{col ? `${col.code} ${col.nameFr}` : '—'}</td><td>{REGIMES.find((r) => r[0] === c.regime)?.[1]}</td><td>{w ? <Chip kind="warn">{w.code} · {Math.round(w.rate * 1000) / 10} %</Chip> : <span className="muted">aucune</span>}</td><td>{c.defaultCurrency}</td><td>{c.paymentTermsDays} j</td><td className="num">{aux ? fmt(accountBalance(state, entityId, aux.id), 0) : fmt(r2(o.reduce((a, x) => a + x.openFunctional, 0)), 0)}</td><td className="num">{fmt(r2(o.filter((x) => x.daysOverdue > 0).reduce((a, x) => a + x.openFunctional, 0)))}</td><td style={{ whiteSpace: 'nowrap' }}><button className="btn sm" onClick={() => load(c.id)}>{t('edit')}</button> <DeleteButton table="customer" rowId={c.id} label={`Client ${c.name}`} entityId={entityId} /></td></tr>; })}</tbody>
          </table>
        </div>
        <ClientRelations entityId={entityId} />{/* [bumex-one] the relationship side, BUMEX One's clients */}
      </div>
      <aside className="side">
        <div className="card">
          <h2>{editing ? `Fiche · ${editing.code}` : 'Nouveau client'}</h2>
          <Field label="Nom"><input className="in" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <div className="grid2" style={{ marginTop: 8 }}>
            <Field label="Code auxiliaire (unique)"><input className="in mono" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={editing ? editing.code : `auto · ${nextCode}`} /></Field>
            <Field label="Compte collectif"><select className="in mono" value={collectiveId} onChange={(e) => setCollectiveId(e.target.value)}><option value="">{defaultCollective ? `Paramétrage · ${defaultCollective.code}` : '—'}</option>{collectives.map((a) => <option key={a.id} value={a.id}>{a.code} {a.nameFr}</option>)}</select></Field>
          </div>
          {editing && auxOf(editing) && <div className="small muted" style={{ marginTop: 4 }}>Compte auxiliaire <span className="mono">{auxOf(editing)!.code}</span> · solde {fmt(accountBalance(state, entityId, auxOf(editing)!.id), 0)} · renommer le code renomme le compte.</div>}
          <Field label="Régime TVA" style={{ marginTop: 8 }}><select className="in" value={regime} onChange={(e) => setRegime(e.target.value as CounterpartyRegime)}>{REGIMES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></Field>
          <Field label="Retenue à la source appliquée par ce client" style={{ marginTop: 8 }}><select className="in" value={wht} onChange={(e) => setWht(e.target.value)}><option value="">Aucune</option>{whtCodes.map((x) => <option key={x.id} value={x.id}>{x.code} · {Math.round(x.rate * 1000) / 10} %</option>)}</select></Field>
          <div className="grid2" style={{ marginTop: 8 }}>
            <Field label="Devise"><select className="in" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>{['MRU', 'USD', 'EUR', 'MAD'].map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Délai (jours)"><input className="in num" value={terms} onChange={(e) => setTerms(e.target.value)} /></Field>
            <Field label="NIF"><input className="in mono" value={nif} onChange={(e) => setNif(e.target.value)} /></Field>
            <Field label="E-mail"><input className="in" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          </div>
          <div className="actions" style={{ marginTop: 10 }}>
            {editing && <button className="btn" onClick={() => load(null)}>Annuler</button>}
            <button className="btn primary" disabled={!name.trim()} onClick={save}>{editing ? 'Enregistrer' : 'Créer'}</button>
          </div>
        </div>
      </aside>
    </div>
  );
}

// Withholding suffered on our sales: what each customer kept for the Treasury, to recover against our own tax.
function WithholdingSuffered({ entityId }: { entityId: Id }) {
  const { state, toast } = useStore();
  const [from, setFrom] = useState(state.today.slice(0, 4) + '-01-01');
  const [to, setTo] = useState(state.today);
  const st = useMemo(() => withholdingStatement(state, entityId, from, to), [state, entityId, from, to]);
  const entity = state.entities.find((e) => e.id === entityId)!;
  const acc = state.taxCodes.find((x) => x.entityId === entityId && x.kind === 'withholding' && x.deductibleAccountId);
  const account = acc ? state.accounts.find((a) => a.id === acc.deductibleAccountId) : undefined;
  const exportXlsx = () => downloadXlsx(`retenues-subies-${entity.code}-${from}-${to}.xlsx`, [{ name: 'Retenues subies', rows: [['Date', 'Document', 'Client', 'Base HT', 'Taux', 'Retenue', 'Devise', 'Statut'], ...st.suffered.map((r) => [r.date, r.document, r.counterparty, r.base, r.rate, r.amount, r.currency, r.status])] }, { name: 'Par mois', rows: [['Mois', 'Subies', 'Dues'], ...st.byMonth.map((m) => [m.month, m.suffered, m.due])] }], toast);
  return (
    <div className="cols">
      <div className="grow">
        <div className="card flush">
          <table>
            <thead><tr><th>Date</th><th>Facture</th><th>Client</th><th className="num">Base HT</th><th className="num">Taux</th><th className="num">Retenue</th><th>Statut</th></tr></thead>
            <tbody>{st.suffered.map((r, i) => <tr key={i}><td><D iso={r.date} /></td><td className="mono">{r.document}</td><td>{r.counterparty}</td><td className="num">{r.currency} {fmt(r.base)}</td><td className="num">{Math.round(r.rate * 1000) / 10} %</td><td className="num">{fmt(r.amount)}</td><td><Chip kind={r.status === 'réglée' ? 'good' : 'warn'}>{r.status}</Chip></td></tr>)}{st.suffered.length === 0 && <tr><td colSpan={7} className="muted small">Aucune retenue subie sur la période</td></tr>}</tbody>
            <tfoot><tr><td colSpan={5}>Total retenu par les clients (contre-valeur {entity.functionalCurrency})</td><td className="num">{fmt(st.sufferedTotal)}</td><td></td></tr></tfoot>
          </table>
        </div>
      </div>
      <aside className="side">
        <div className="card">
          <h2>Période</h2>
          <div className="grid2"><Field label="Du"><input className="in mono" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="Au"><input className="in mono" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field></div>
          <div className="kv" style={{ marginTop: 10 }}><span className="k">Retenues subies</span><Money v={st.sufferedTotal} /><span className="k">Compte de suivi</span><span className="mono">{account ? `${account.code} ${account.nameFr}` : '—'}</span><span className="k">Retenues dues (achats)</span><Money v={st.dueTotal} /></div>
          <button className="btn" style={{ marginTop: 10, width: '100%', justifyContent: 'center' }} onClick={exportXlsx}>Exporter (Excel)</button>
          <div className="small muted" style={{ marginTop: 8 }}>Les retenues dues sur nos achats (3 % / 15 %) et leur reversement se suivent dans Fiscalité.</div>
        </div>
      </aside>
    </div>
  );
}
