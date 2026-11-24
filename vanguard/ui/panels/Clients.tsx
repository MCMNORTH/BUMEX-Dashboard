import { useEffect, useMemo, useState } from 'react';
import {
  createInvoice, updateInvoice, validateInvoice, postInvoice, createCreditNote, recordPayment, openInvoices, aging, dunningQueue, sendDunning, addCustomer, updateCustomer, computeLines, resolveTaxCode, fxRate, mapped, withholdingStatement, nextThirdPartyCode, collectiveFor, accountBalance,
  fmt, r2, parseAmount, type Id, type Currency, type CounterpartyRegime, type SalesInvoice, type TaxCode, DomainError, REVENUE_STATUS_LABEL,
  invoiceBankFor, favoritesFirst, setEntityLetterhead, type State,
} from '@bumex/domain';
import { useStore } from '../../store';
import { ClientRelations } from '../../one/Clients'; // [bumex-one] one client, two sides
import { ClientPanel } from '../../one/ClientPage'; // [bumex-one] a client's page
import { ContractPanel, ContractsTab } from '../../one/Contracts'; // [bumex-one] BUMEX One's contracts
import { useSay } from '../../one/say'; // [bumex-one]
import { Tabs, Field, Chip, D, Money, DeleteButton, downloadXlsx } from '../common';
import { fieldsAsk } from '../../one/ask'; // [bumex-one] Fluent's dialog, not the browser's (2026-11-20)
import { accountingStatus, paymentStatus } from '../../one/invoice-status'; // [bumex-one] two statuses: in the books, paid
import { ReceiptsRoom, CustomerUnlettered } from '../../one/Lettering'; // [bumex-one] lettering, small differences
import { Select } from '../Select';
import { WideNote } from '../../one/WideNote'; // [mobile]
import { InvoiceSheet, defaultInvoiceLang, type InvoiceLang, type InvoiceSheetData } from '../../one/InvoiceSheet'; // [bumex-one] the invoice as printed
import { InvoiceFit } from '../../one/InvoiceFit'; // [bumex-one]
import { PageRefresh } from '../../one/PageRefresh'; // [bumex-one] ↻ at the right of the header (2026-11-22)
// [bumex-one] bilingual: every text follows the person's language, say('français', 'English') (vanguard/one/say.ts, 2026-11-21)

// Withholding codes that a customer applies on our invoices (the receivable side), as opposed to the ones we apply on suppliers.
export function salesWithholdingCodes(codes: TaxCode[], entityId: Id): TaxCode[] {
  return codes.filter((x) => x.entityId === entityId && x.kind === 'withholding' && !!x.deductibleAccountId);
}

type InvoiceMode = 'normal' | 'gta' | 'card';

// [bumex-one] WHT, the withholding a client keeps on our invoices, always 7 % (asked on 2026-11-17): the entity's RAS-7
// code (its chart's), apart from the VAT, so an invoice can carry both.
export function whtCodeFor(codes: TaxCode[], entityId: Id): TaxCode | undefined {
  const own = salesWithholdingCodes(codes, entityId);
  return own.find((x) => x.code === 'RAS-7') ?? own.find((x) => Math.abs(x.rate - 0.07) < 1e-9);
}
type Tab = 'invoices' | 'new' | 'payments' | 'aging' | 'dunning' | 'customers' | 'withholding' | 'contracts' | 'letterhead'; // [bumex-one] contracts, letterhead
const CATEGORIES = [['AUDIT', 'Audit', 'Audit'], ['TAX', 'Fiscal', 'Tax'], ['LEGAL', 'Juridique', 'Legal'], ['ADVISORY', 'Conseil', 'Advisory'], ['IT', 'IT', 'IT'], ['OTHER', 'Autre', 'Other']];
const REGIMES: [CounterpartyRegime, string, string][] = [['standard', 'Standard', 'Standard'], ['gta', 'GTA · sous-traitant enregistré', 'GTA · registered subcontractor'], ['exempt', 'Exonéré', 'Exempt'], ['non_resident', 'Non-résident · export', 'Non-resident · export'], ['public', 'Organisme public', 'Public body']];

// [bumex-one] Words the engine and the shared helpers hand over in French (stored or compared as they are): their
// English, at render time only; a text not in these tables is shown as it comes.
type Say = (fr: string, en: string) => string;
const REVENUE_STATUS_EN: Record<string, string> = { taxable_standard: 'standard rate', taxable_reduced: 'reduced rate', exempt_domestic: 'exempt (domestic)', export_exempt: 'exempt export', export_taxable: 'taxable export' };
const WHT_STATUS_EN: Record<string, string> = { 'réglée': 'Settled', ouverte: 'Open', 'à reverser': 'To remit' };
const DUNNING_EN: Record<string, string> = { 'Rappel courtois': 'Friendly reminder', 'Mise en demeure': 'Formal notice', Contentieux: 'Litigation', 'Courriel + PDF': 'Email + PDF', 'Courrier signé associé': 'Letter signed by a partner', 'Transfert BUMEX Avocats': 'Handed over to BUMEX Avocats' };
const INVOICE_STATUS_EN: Record<string, string> = {
  'Comptabilisée': 'Posted', 'Non comptabilisée': 'Not posted', Brouillon: 'Draft', 'Payée': 'Paid', 'Soldée par avoir': 'Settled by credit note', 'Partiellement payée': 'Partially paid', 'Non payée': 'Unpaid',
  "Numérotée et figée, mais son écriture n'est pas passée : à comptabiliser": 'Numbered and locked, but its journal entry is not posted: to post',
  'Annulée par un avoir, sans encaissement': 'Cancelled by a credit note, no receipt',
};
// the two statuses of one/invoice-status.ts (a label, maybe " · relance N"; a title, maybe "Échue le …" / "Échéance le …")
function invoiceStatusSay(say: Say, fr: string | undefined): string | undefined {
  if (!fr) return fr;
  const [head, level] = fr.split(' · relance ');
  const due = head.match(/^(Échue|Échéance) le (.+)$/);
  const en = due ? `${due[1] === 'Échue' ? 'Overdue since' : 'Due on'} ${due[2]}` : INVOICE_STATUS_EN[head] ?? head;
  return say(fr, level ? `${en} · reminder ${level}` : en);
}
const regimeSay = (say: Say, regime: CounterpartyRegime | undefined) => { const r = REGIMES.find((x) => x[0] === regime); return r ? say(r[1], r[2]) : undefined; };

export function ClientsPanel({ entityId, initialTab }: { entityId: Id; initialTab?: string | null }) {
  const { state, t } = useStore();
  const say = useSay(); // [bumex-one]
  const [tab, setTab] = useState<Tab>((initialTab as Tab) || 'invoices');
  useEffect(() => { if (initialTab) setTab(initialTab as Tab); }, [initialTab]);
  const [payFor, setPayFor] = useState<Id | null>(null);
  // [bumex-one] a draft opened in the invoice form (asked on 2026-11-17); the "new invoice" tab starts a blank one
  const [editInvoiceId, setEditInvoiceId] = useState<Id | null>(null);
  const editing = editInvoiceId ? state.salesInvoices.find((i) => i.id === editInvoiceId && i.status === 'draft') : undefined;
  const pickTab = (next: Tab) => { if (next !== tab) setEditInvoiceId(null); setTab(next); };
  const ag = aging(state, entityId);
  const tabs = [
    { id: 'invoices' as Tab, label: t('tab_invoices') }, { id: 'new' as Tab, label: editing ? say('Modifier le brouillon', 'Edit draft') : t('tab_new_invoice') }, { id: 'payments' as Tab, label: t('tab_payments') },
    { id: 'aging' as Tab, label: <>{t('tab_aging')} <Chip kind={ag.overdueCount ? 'crit' : 'good'}>{ag.overdueCount}</Chip></> }, { id: 'dunning' as Tab, label: t('tab_dunning') }, { id: 'withholding' as Tab, label: say('WHT subie', 'WHT suffered') }, { id: 'customers' as Tab, label: t('tab_customers') },
    { id: 'contracts' as Tab, label: say('Contrats', 'Contracts') }, // [bumex-one] BUMEX One's contracts (vanguard/one/Contracts.tsx)
    { id: 'letterhead' as Tab, label: say('Modèle de facture', 'Invoice layout') }, // [bumex-one] the invoice's letterhead (2026-11-17)
  ];
  // [bumex-one] "client:<id>" and "contract:<id>" open that client's or contract's page
  const page = (tab as string).match(/^(client|contract):(.+)$/);
  const closePage = (back: Tab) => { setTab(back); useStore.getState().setUi({ tab: null }); };
  return (
    <>
      <div className="sheet-head">
        <h1>{t('room_clients')}</h1>
        <Tabs tabs={tabs} value={tab} onChange={pickTab} />
        <PageRefresh />
      </div>
      <div className="sheet-body">
        {tab === 'invoices' && <Invoices entityId={entityId} onPay={(id) => { setPayFor(id); setTab('payments'); }} onEdit={(id) => { setEditInvoiceId(id); setTab('new'); }} />}
        {tab === 'new' && <NewInvoice key={editing?.id ?? 'new'} entityId={entityId} editing={editing} onDone={() => { setEditInvoiceId(null); setTab('invoices'); }} />}
        {tab === 'payments' && <Payments entityId={entityId} preselect={payFor} />}
        {tab === 'aging' && <AgingView entityId={entityId} />}
        {tab === 'dunning' && <Dunning entityId={entityId} />}
        {tab === 'withholding' && <WithholdingSuffered entityId={entityId} />}
        {tab === 'customers' && <Customers entityId={entityId} />}
        {tab === 'contracts' && <ContractsTab />}
        {tab === 'letterhead' && <Letterhead entityId={entityId} />}
        {page?.[1] === 'client' && <ClientPanel key={page[2]} clientId={page[2]} onClose={() => closePage('customers')} />}
        {page?.[1] === 'contract' && <ContractPanel key={page[2]} contractId={page[2]} onClose={() => closePage('contracts')} />}
      </div>
    </>
  );
}

// [bumex-one] The invoice as printed (asked on 2026-11-17): the same sheet as its public page, the QR code's link
// (app/i/[token]); printing opens that page, which prints the invoice alone.
// The notes an invoice prints (Fiscalité › Mentions des factures): its WHT's when a line bears it, then each VAT code's of
// its lines, in their order. The same in SQL for the invoice's public page (lib/erp/invoice-link.ts).
export function invoiceNotes(codes: TaxCode[], inv: Pick<SalesInvoice, 'lines' | 'withholdingAmount' | 'withholdingCodeId'>): { fr?: string; en?: string }[] {
  const ids = [...(inv.withholdingAmount > 0 && inv.withholdingCodeId ? [inv.withholdingCodeId] : []), ...inv.lines.map((l) => l.taxCodeId).filter((x): x is Id => !!x)];
  return [...new Set(ids)].map((id) => codes.find((c) => c.id === id)).filter((c): c is TaxCode => !!c && !!(c.legalMentionFr || c.legalMentionEn)).map((c) => ({ fr: c.legalMentionFr, en: c.legalMentionEn }));
}

export function invoiceSheetData(state: State, inv: SalesInvoice, origin?: string): InvoiceSheetData {
  const entity = state.entities.find((e) => e.id === inv.entityId)!;
  const customer = state.customers.find((c) => c.id === inv.customerId)!;
  const bank = state.bankAccounts.find((b) => b.id === inv.bankAccountId) ?? invoiceBankFor(state, inv.entityId, inv.currency);
  return {
    number: inv.number, status: inv.status, date: inv.date, dueDate: inv.dueDate, currency: inv.currency, paymentMode: inv.paymentMode, lines: inv.lines,
    totalHt: inv.totalHt, totalTax: inv.totalTax, totalTtc: inv.totalTtc, withholdingRate: inv.withholdingRate, withholdingAmount: inv.withholdingAmount, netPayable: inv.netPayable,
    notes: invoiceNotes(state.taxCodes, inv),
    entity: { name: entity.name, country: entity.country, address: entity.address, phone: entity.phone, fax: entity.fax, email: entity.email, web: entity.web, nif: entity.nif, capitalAmount: entity.capitalAmount, capitalCurrency: entity.capitalCurrency, logoUrl: entity.logoUrl },
    customer: { name: customer?.name ?? '', address: customer?.address ?? customer?.clientAddress, nif: customer?.nif },
    bank: bank && !bank.isCash ? { bankName: bank.bankName, accountHolder: bank.accountHolder, iban: bank.iban, bic: bank.bic, accountNumber: bank.accountNumber, rib: bank.rib } : undefined,
    url: inv.publicToken && origin ? `${origin}/i/${inv.publicToken}` : undefined,
  };
}

function InvoiceDoc({ inv, onClose }: { inv: SalesInvoice; onClose: () => void }) {
  const { state, toast } = useStore();
  const say = useSay(); // [bumex-one]
  const current = state.salesInvoices.find((i) => i.id === inv.id) ?? inv; // its status and number as they are now
  const customer = state.customers.find((c) => c.id === current.customerId);
  const [lang, setLang] = useState<InvoiceLang>(() => defaultInvoiceLang(current.currency, customer?.country));
  const origin = typeof window !== 'undefined' ? window.location.origin : undefined;
  const data = invoiceSheetData(state, current, origin);
  const page = current.publicToken ? `/i/${current.publicToken}?lang=${lang}` : null;
  const copy = () => { if (data.url) navigator.clipboard?.writeText(`${data.url}?lang=${lang}`).then(() => toast('ok', say('Lien de la facture copié', 'Invoice link copied')), () => toast('error', say('Copie impossible', 'Could not copy'))); };
  return (
    <div className="sheet-back" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'auto', padding: 20 }} onClick={onClose}>
      <div style={{ width: '100%', maxWidth: 820 }} onClick={(e) => e.stopPropagation()}>
        <div className="actions" style={{ justifyContent: 'flex-start', flexWrap: 'wrap', marginBottom: 10 }}>
          <div className="pill-list">{(['en', 'fr'] as const).map((l) => <button key={l} className={`pill ${lang === l ? 'on' : ''}`} onClick={() => setLang(l)}>{l === 'en' ? 'English' : 'Français'}</button>)}</div>
          <span style={{ flex: 1 }} />
          {page && <button className="btn" onClick={copy}>{say('Copier le lien', 'Copy link')}</button>}
          {page && <button className="btn" onClick={() => window.open(page, '_blank', 'noopener')}>{say('Ouvrir la page', 'Open page')}</button>}
          <button className="btn" disabled={!page} title={page ? undefined : say('Le lien de la facture arrive avec son enregistrement', 'The invoice link comes once the invoice is saved')} onClick={() => page && window.open(`${page}&print=1`, '_blank', 'noopener')}>{say('Imprimer / PDF', 'Print / PDF')}</button>
          <button className="btn primary" onClick={onClose}>{say('Fermer', 'Close')}</button>
        </div>
        <InvoiceFit><div style={{ boxShadow: 'var(--shadow-16)' }}><InvoiceSheet data={data} lang={lang} /></div></InvoiceFit>
      </div>
    </div>
  );
}

// [bumex-one] The letterhead the invoices print (asked on 2026-11-17): the entity's address, phone, fax, e-mail, web, NIF,
// capital and logo, beside the invoice as it prints (its latest invoice, or a sample). The bank comes from the
// treasury's accounts (Trésorerie › comptes: the favourite one is the default).
function Letterhead({ entityId }: { entityId: Id }) {
  const { state, apply } = useStore();
  const say = useSay(); // [bumex-one]
  const e = state.entities.find((x) => x.id === entityId)!;
  const [form, setForm] = useState(() => ({ address: e.address ?? '', phone: e.phone ?? '', fax: e.fax ?? '', email: e.email ?? '', web: e.web ?? '', nif: e.nif ?? '', capital: e.capitalAmount != null ? String(e.capitalAmount) : '', capitalCurrency: e.capitalCurrency ?? e.functionalCurrency, logoUrl: e.logoUrl ?? '' }));
  const [lang, setLang] = useState<InvoiceLang>('en');
  const set = (k: keyof typeof form) => (ev: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: ev.target.value }));
  const capital = form.capital.trim() ? parseAmount(form.capital) : undefined;
  const patch = { address: form.address, phone: form.phone, fax: form.fax, email: form.email, web: form.web, nif: form.nif, capitalAmount: capital ?? undefined, capitalCurrency: form.capitalCurrency as Currency, logoUrl: form.logoUrl };
  const latest = state.salesInvoices.filter((i) => i.entityId === entityId).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const sample: InvoiceSheetData = latest
    ? invoiceSheetData(state, latest, typeof window !== 'undefined' ? window.location.origin : undefined)
    : { status: 'draft', date: state.today, dueDate: state.today, currency: 'EUR', paymentMode: 'Virement', lines: [{ lineNo: 1, description: 'Preparation and submission of IMF declaration', quantity: 6, unitPrice: 250, taxRateSnapshot: 0, lineHt: 1500 }], totalHt: 1500, totalTax: 0, totalTtc: 1500, withholdingRate: 0, withholdingAmount: 0, netPayable: 1500, entity: { name: e.name, country: e.country }, customer: { name: 'Client', address: 'Nouakchott' }, bank: undefined };
  const data: InvoiceSheetData = { ...sample, entity: { ...sample.entity, name: e.name, country: e.country, address: form.address, phone: form.phone, fax: form.fax, email: form.email, web: form.web, nif: form.nif, capitalAmount: capital ?? undefined, capitalCurrency: form.capitalCurrency, logoUrl: form.logoUrl } };
  return (
    <div className="cols">
      <aside className="side" style={{ order: 0 }}>
        <div className="card">
          <h2>{say('En-tête', 'Letterhead')} · {e.name}</h2>
          <Field label={say('Adresse (une ligne par ligne imprimée)', 'Address (one line per printed line)')}><textarea className="in" rows={3} value={form.address} onChange={set('address')} style={{ height: 'auto', resize: 'vertical' }} /></Field>
          <div className="grid2" style={{ marginTop: 8 }}>
            <Field label={say('Téléphone', 'Phone')}><input className="in" value={form.phone} onChange={set('phone')} /></Field>
            <Field label="Fax"><input className="in" value={form.fax} onChange={set('fax')} /></Field>
            <Field label={say('E-mail', 'Email')}><input className="in" value={form.email} onChange={set('email')} /></Field>
            <Field label={say('Site web', 'Website')}><input className="in" value={form.web} onChange={set('web')} /></Field>
            <Field label="NIF"><input className="in mono" value={form.nif} onChange={set('nif')} /></Field>
            <Field label="Capital"><div style={{ display: 'flex', gap: 6 }}><input className="in num" value={form.capital} onChange={set('capital')} /><Select className="in" style={{ width: 90 }} value={form.capitalCurrency} onChange={set('capitalCurrency')}>{['MRU', 'USD', 'EUR', 'MAD'].map((c) => <option key={c}>{c}</option>)}</Select></div></Field>
          </div>
          <Field label={say('Logo (adresse ; vide = logo BUMEX)', 'Logo (URL; blank = BUMEX logo)')} style={{ marginTop: 8 }}><input className="in" value={form.logoUrl} onChange={set('logoUrl')} placeholder="/bumex-official-logo-transparent.png" /></Field>
          <div className="small muted" style={{ marginTop: 8 }}>{say('Les coordonnées bancaires viennent des comptes de la Trésorerie : le compte choisi sur la facture, sinon le favori (★) dans sa devise. La signature viendra plus tard.', 'Bank details come from the Treasury accounts: the account chosen on the invoice, otherwise the favorite (★) in its currency. The signature will come later.')}</div>
          <div className="actions" style={{ marginTop: 10 }}>
            <button className="btn primary" disabled={form.capital.trim() !== '' && capital === null} onClick={() => apply((s) => setEntityLetterhead(s, entityId, patch), say("En-tête des factures enregistré", 'Invoice letterhead saved'))}>{say('Enregistrer', 'Save')}</button>
          </div>
        </div>
      </aside>
      <div className="grow">
        <div className="pill-list" style={{ marginBottom: 8 }}>{(['en', 'fr'] as const).map((l) => <button key={l} className={`pill ${lang === l ? 'on' : ''}`} onClick={() => setLang(l)}>{l === 'en' ? 'English' : 'Français'}</button>)}<span className="small muted" style={{ alignSelf: 'center' }}>{latest ? say(`Aperçu sur ${latest.number ?? 'le dernier brouillon'}`, `Preview on ${latest.number ?? 'the latest draft'}`) : say('Aperçu sur un exemple', 'Preview on a sample')}</span></div>
        <InvoiceFit><div style={{ boxShadow: 'var(--shadow-8)' }}><InvoiceSheet data={data} lang={lang} /></div></InvoiceFit>
      </div>
    </div>
  );
}

function Invoices({ entityId, onPay, onEdit }: { entityId: Id; onPay: (id: Id) => void; onEdit: (id: Id) => void }) {
  const { state, t, apply } = useStore();
  const say = useSay(); // [bumex-one]
  const [filter, setFilter] = useState<'all' | 'open' | 'overdue' | 'draft' | 'validated' | 'paid'>('all');
  const [doc, setDoc] = useState<SalesInvoice | null>(null);
  const open = openInvoices(state, entityId);
  const all = state.salesInvoices.filter((i) => i.entityId === entityId).sort((a, b) => (a.date < b.date ? 1 : -1));
  const rows = all.filter((i) => (filter === 'all' ? true : filter === 'draft' ? i.status === 'draft' : filter === 'validated' ? i.status === 'validated' : filter === 'paid' ? i.status === 'paid' : filter === 'open' ? open.some((o) => o.invoice.id === i.id) : open.some((o) => o.invoice.id === i.id && o.daysOverdue > 0)));
  return (
    <>
      <div className="card flush">
        <div style={{ display: 'flex', gap: 4, padding: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {([['all', `${say('Toutes', 'All')} · ${all.length}`], ['open', `${say('Ouvertes', 'Open')} · ${open.length}`], ['overdue', `${say('En retard', 'Overdue')} · ${open.filter((o) => o.daysOverdue > 0).length}`], ['draft', `${say('Brouillons', 'Drafts')} · ${all.filter((i) => i.status === 'draft').length}`], ['validated', `${say('Non comptabilisées', 'Not posted')} · ${all.filter((i) => i.status === 'validated').length}`], ['paid', `${say('Payées', 'Paid')} · ${all.filter((i) => i.status === 'paid').length}`]] as const).map(([k, l]) => (
            <button key={k} className={`btn sm ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{l}</button>
          ))}
          <span className="muted small" style={{ marginLeft: 'auto' }}>{say('Comptabilité : écriture passée ou non (orange : validée, numérotée, mais pas encore dans les livres) · Paiement : orange vif une fois échue · correction uniquement par avoir', 'Accounting: journal entry posted or not (orange: validated, numbered, but not yet in the books) · Payment: bright orange once overdue · corrections by credit note only')}</span>
        </div>
        <table>
          <thead><tr><th>{say('N°', 'No.')}</th><th>{t('customer')}</th><th>{say('Régime', 'Regime')}</th><th>{t('date')}</th><th>{t('due')}</th><th className="num">{t('currency')}</th><th className="num">{say('HT', 'Excl. tax')}</th><th className="num">{say('TVA', 'VAT')}</th><th className="num">WHT</th><th className="num">{say('Net à payer', 'Net payable')}</th><th className="num">{t('open_amount')}</th><th>{say('Retard', 'Overdue')}</th><th>{say('Comptabilité', 'Accounting')}</th><th>{say('Paiement', 'Payment')}</th><th></th></tr></thead>
          <tbody>
            {rows.map((i) => {
              const c = state.customers.find((x) => x.id === i.customerId)!;
              const o = open.find((x) => x.invoice.id === i.id);
              return (
                <tr key={i.id}>
                  <td className="mono">{i.number ?? '—'}</td><td>{c.name}</td><td className="small">{regimeSay(say, c.regime)?.split(' ·')[0]}{i.withholdingAmount > 0 ? <Chip kind="warn">WHT {Math.round(i.withholdingRate * 100)} %</Chip> : null}</td><td><D iso={i.date} /></td><td><D iso={i.dueDate} /></td><td className="num">{i.currency}</td><td className="num">{fmt(i.totalHt)}</td><td className="num">{fmt(i.totalTax)}</td><td className="num">{i.withholdingAmount ? fmt(i.withholdingAmount) : '—'}</td><td className="num">{fmt(i.netPayable)}</td><td className="num">{o ? fmt(o.openTxn) : i.status === 'draft' || i.status === 'validated' ? '—' : '0,00'}</td>
                  <td>{o && o.daysOverdue > 0 ? <Chip kind={o.daysOverdue > 90 ? 'crit' : o.daysOverdue > 30 ? 'crit' : 'warn'}>{say(`${o.daysOverdue} j`, `${o.daysOverdue} d`)}</Chip> : '—'}</td>
                  {(() => { const acc = accountingStatus(i), pay = paymentStatus(i, state.today, state.allocations, state.creditNotes); return <><td><span className={`chip ${acc.tone}`} title={invoiceStatusSay(say, acc.title)}>{invoiceStatusSay(say, acc.label)}</span></td><td><span className={`chip ${pay.tone}`} title={invoiceStatusSay(say, pay.title)}>{invoiceStatusSay(say, pay.label)}</span></td></>; })()}
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn sm" onClick={() => setDoc(i)}>{say('Aperçu', 'Preview')}</button>{' '}
                    {i.status === 'draft' && <><button className="btn sm" onClick={() => onEdit(i.id)}>{t('edit')}</button>{' '}<button className="btn sm" onClick={() => apply((s) => validateInvoice(s, i.id), say('Facture validée et numérotée', 'Invoice validated and numbered'))}>{t('validate')}</button>{' '}</>}
                    {(i.status === 'draft' || i.status === 'validated') && <button className="btn sm primary" onClick={() => apply((s) => postInvoice(s, i.id), say('Facture comptabilisée', 'Invoice posted'))}>{t('post')}</button>}
                    {i.status === 'draft' && <>{' '}<DeleteButton table="sales_invoice" rowId={i.id} label={`Facture brouillon · ${c.name} · ${i.currency} ${fmt(i.netPayable)} · ${i.date}`} entityId={entityId} /></>}
                    {o && <><button className="btn sm" onClick={() => onPay(i.id)}>{say('Encaisser', 'Record payment')}</button>{' '}<button className="btn sm" onClick={() => { void fieldsAsk({ title: say('Émettre un avoir', 'Issue a credit note'), message: say("L'avoir est comptabilisé dès son émission.", 'The credit note is posted as soon as it is issued.'), fields: [{ label: say("Motif de l'avoir", 'Credit note reason'), value: 'remise commerciale' }, { label: say("N° de l'avoir", 'Credit note number'), placeholder: say('vide : automatique', 'blank: automatic') }], confirm: say("Émettre l'avoir", 'Issue credit note') }).then((values) => { if (!values) return; const [reason, number] = values; apply((s) => createCreditNote(s, i.id, reason, s.today, undefined, number || undefined), say('Avoir émis et comptabilisé', 'Credit note issued and posted')); }); }}>{say('Avoir', 'Credit note')}</button></>}
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

const HELP_KEY = 'bumex-vanguard-invoice-help';

interface LineForm { description: string; quantity: string; unitPrice: string; serviceCategory: string; taxCodeId: string; revenueAccountId: string; whtId: string } // whtId: '' = WHT 0 %
const emptyLine = (whtId = ''): LineForm => ({ description: '', quantity: '1', unitPrice: '', serviceCategory: 'AUDIT', taxCodeId: '', revenueAccountId: '', whtId });

// editing: a draft opened again (asked on 2026-11-17), its fields as saved; saving updates it (updateInvoice)
function NewInvoice({ entityId, editing, onDone }: { entityId: Id; editing?: SalesInvoice; onDone: () => void }) {
  const { state, t, apply } = useStore();
  const say = useSay(); // [bumex-one]
  const entity = state.entities.find((e) => e.id === entityId)!;
  const customers = state.customers.filter((c) => c.entityId === entityId);
  const [customerId, setCustomerId] = useState(editing?.customerId ?? customers[0]?.id ?? '');
  const customer = customers.find((c) => c.id === customerId);
  const [date, setDate] = useState(editing?.date ?? state.today);
  const [currency, setCurrency] = useState<Currency>(editing?.currency ?? customer?.defaultCurrency ?? entity.functionalCurrency);
  const [rate, setRate] = useState(editing && editing.currency !== entity.functionalCurrency ? String(editing.fxRate) : '');
  const [engagementId, setEngagementId] = useState(editing?.engagementId ?? '');
  // [bumex-one] a number typed by hand, for the old invoices being imported (2026-11-17); empty: the sequence's at validation
  const [number, setNumber] = useState(editing?.number ?? '');
  // WHT (asked on 2026-11-17): the client keeps 7 % of a line's HT, chosen on each line beside its VAT (so both on one
  // invoice); a new line starts from the customer's card (a withholding there = 7 %); at 0 % nothing of it is printed.
  // It is kept as its code: '' (0 %), the 7 % one, or — on an older invoice — another withholding code, kept as it was.
  const whtCode = whtCodeFor(state.taxCodes, entityId);
  const cardWht = (c: typeof customer) => (c?.withholdingCodeId ? (state.taxCodes.some((x) => x.id === c.withholdingCodeId) ? c.withholdingCodeId : whtCode?.id ?? '') : '');
  const olderWht = (id: string) => (id && id !== whtCode?.id ? state.taxCodes.find((x) => x.id === id) : undefined);
  const [lines, setLines] = useState<LineForm[]>(() => editing?.lines.length
    ? editing.lines.map((l) => ({ description: l.description, quantity: String(l.quantity), unitPrice: String(l.unitPrice), serviceCategory: l.serviceCategory, taxCodeId: l.taxCodeId ?? '', revenueAccountId: l.revenueAccountId ?? '',
        // a line without a WHT code opens as "Non applicable", never with the invoice's (Sidaty, 2026-11-23)
        whtId: l.withholdingCodeId ?? '' }))
    : [emptyLine(cardWht(customer))]);
  // the explanations, folded into a "?" (asked on 2026-11-17): the form gets the width; the choice is remembered here
  const [help, setHelpState] = useState(() => { try { return localStorage.getItem(HELP_KEY) === 'open'; } catch { return false; } });
  const setHelp = (open: boolean) => { setHelpState(open); try { localStorage.setItem(HELP_KEY, open ? 'open' : 'closed'); } catch { /* private mode */ } };
  const taxCodes = state.taxCodes.filter((x) => x.entityId === entityId && x.kind === 'vat');
  // This invoice's regime (asked on 2026-11-02), the customer's card unchanged: Normal (the standard rules: TVA), GTA
  // (GTA-EXO 0 %); "card" keeps another regime of the card (exempt, export, public body) as it is. It only chooses the
  // lines' default VAT; WHT is apart.
  const modeOf = (c: typeof customer): InvoiceMode => (!c ? 'normal' : c.regime === 'gta' ? 'gta' : c.regime === 'standard' ? 'normal' : 'card');
  const [mode, setMode] = useState<InvoiceMode>(() => modeOf(customer));
  const regime: CounterpartyRegime | undefined = mode === 'gta' ? 'gta' : mode === 'card' ? undefined : 'standard';
  const revenueAccounts = state.accounts.filter((a) => a.entityId === entityId && a.isPostable && a.kind === 'income' && a.code.startsWith('7')).sort((a, b) => a.code.localeCompare(b.code));
  // [bumex-one] the favourite accounts first, and the default (invoiceBankFor: a favourite in the invoice's currency…)
  const banks = favoritesFirst(state.bankAccounts.filter((b) => b.entityId === entityId && b.active !== false && !b.isCash));
  const bankFor = (c: Currency) => invoiceBankFor(state, entityId, c)?.id ?? '';
  const [bankId, setBankId] = useState(() => editing?.bankAccountId ?? bankFor(currency));
  // An invoice in another currency than the floor's (MRU, or MAD at BUMEX Maroc) carries the rate typed on it, never the
  // rate table's (asked on 2026-11-17): it cannot be saved, not even as a draft, until the rate is entered.
  const foreign = currency !== entity.functionalCurrency;
  const lastRate = useMemo(() => { try { return fxRate(state, currency, entity.functionalCurrency, date); } catch { return null; } }, [state, currency, entity.functionalCurrency, date]);
  const typedRate = (() => { const n = Number(rate.trim().replace(/\s/g, '').replace(',', '.')); return rate.trim() && Number.isFinite(n) && n > 0 ? n : null; })();
  const rateMissing = foreign && typedRate === null;
  const effRate = foreign ? typedRate ?? 0 : 1;
  const pickCurrency = (c: Currency) => { setCurrency(c); setRate(''); setBankId(bankFor(c)); };

  const input = () => ({
    entityId, customerId, date, currency, fxRate: effRate, engagementId: engagementId || undefined, bankAccountId: bankId || undefined,
    withholdingCodeId: null, regime, number: number.trim() || undefined, // the WHT is each line's
    lines: lines.filter((l) => l.description.trim() && parseAmount(l.unitPrice) !== null).map((l) => ({ description: l.description, quantity: Number(l.quantity.replace(',', '.')) || 1, unitPrice: parseAmount(l.unitPrice) ?? 0, serviceCategory: l.serviceCategory, taxCodeId: l.taxCodeId || undefined, revenueAccountId: l.revenueAccountId || undefined, withholdingCodeId: l.whtId || null })),
  });
  const preview = useMemo(() => {
    if (!customer) return null;
    try {
      const { lines: computed, mention } = computeLines(state, input());
      const ht = r2(computed.reduce((a, l) => a + l.lineHt, 0)), tax = r2(computed.reduce((a, l) => a + l.taxAmount, 0));
      const ar = customer.groupEntityId ? mapped(state, entityId, 'AR_GROUP') : mapped(state, entityId, 'AR_CONTROL');
      const bearing = computed.filter((l) => l.withholdingCodeId); // the lines bearing the WHT (one code: computeLines)
      const wht = bearing.length ? state.taxCodes.find((x) => x.id === bearing[0].withholdingCodeId) : undefined;
      const whtBase = r2(bearing.reduce((a, l) => a + l.lineHt, 0));
      const withholding = wht ? r2(whtBase * wht.rate) : 0;
      const whtAccount = wht ? state.accounts.find((a) => a.id === wht.deductibleAccountId) : undefined;
      const notes = invoiceNotes(state.taxCodes, { lines: computed, withholdingAmount: withholding, withholdingCodeId: wht?.id });
      return { computed, mention, notes, ht, tax, ttc: r2(ht + tax), withholding, whtBase, whtCode: wht, whtAccount, net: r2(ht + tax - withholding), ar, error: null as string | null };
    } catch (e) {
      return { computed: [], mention: undefined, notes: [] as { fr?: string; en?: string }[], ht: 0, tax: 0, ttc: 0, withholding: 0, whtBase: 0, whtCode: undefined, whtAccount: undefined, net: 0, ar: null, error: e instanceof DomainError ? e.message : String(e) };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, customerId, date, currency, effRate, engagementId, lines, mode, number]);
  const resolvedFor = (l: LineForm) => { if (!customer) return null; try { return resolveTaxCode(state, entityId, regime ? { ...customer, regime } : customer, l.serviceCategory, date); } catch { return null; } };
  const setLine = (i: number, patch: Partial<LineForm>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  // Keep as draft (editable), validate (numbered and locked, not in the books) or post (validated and accounted).
  const save = (step: 'draft' | 'validate' | 'post') => {
    const ok = apply((s) => {
      const [s1, inv] = editing ? updateInvoice(s, editing.id, input()) : createInvoice(s, input());
      if (step === 'draft') return s1;
      return (step === 'post' ? postInvoice : validateInvoice)(s1, inv.id)[0];
    }, step === 'post' ? say('Facture validée, numérotée et comptabilisée', 'Invoice validated, numbered and posted') : step === 'validate' ? say('Facture validée et numérotée, à comptabiliser', 'Invoice validated and numbered, to be posted') : editing ? say('Brouillon mis à jour', 'Draft updated') : say('Facture enregistrée en brouillon', 'Invoice saved as draft'));
    if (ok) onDone();
  };
  const ready = !!preview && !preview.error && preview.ttc > 0 && !rateMissing;
  return (
    <div className="cols">
      <WideNote />{/* [mobile] */}
      <form className="grow" onSubmit={(e) => e.preventDefault()}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="grid4">
            <Field label={t('customer')}><Select recent="customers" className="in" value={customerId} onChange={(e) => { setCustomerId(e.target.value); const c = customers.find((x) => x.id === e.target.value); if (c) pickCurrency(c.defaultCurrency); setLines((ls) => ls.map((l) => ({ ...l, whtId: cardWht(c) }))); setMode(modeOf(c)); }}>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label={say('Régime du client', 'Client regime')}>
              <Select className="in" value={mode} onChange={(e) => setMode(e.target.value as InvoiceMode)}>
                {customer && customer.regime !== 'standard' && customer.regime !== 'gta' && <option value="card">{say('Fiche client', 'Client profile')} · {regimeSay(say, customer.regime)}</option>}
                <option value="normal">{say('Normal · TVA', 'Normal · VAT')} {Math.round((taxCodes.find((x) => x.revenueStatus === 'taxable_standard')?.rate ?? 0) * 100)} %</option>
                <option value="gta">{say('GTA · sous-traitant enregistré', 'GTA · registered subcontractor')}</option>
              </Select>
            </Field>
            <Field label={say('N° de facture', 'Invoice number')}><input className="in mono" value={number} onChange={(e) => setNumber(e.target.value)} placeholder={say('Automatique (vide)', 'Automatic (blank)')} title={say('Pour reprendre une ancienne facture ; vide : numéro attribué à la validation', 'To import an old invoice; blank: numbered on validation')} /></Field>
            <Field label={say(`${t('date')} · échéance ${customer?.paymentTermsDays ?? 30} j`, `${t('date')} · due in ${customer?.paymentTermsDays ?? 30} d`)}><input className="in mono" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label={foreign ? say(`${t('currency')} · taux 1 ${currency} = ? ${entity.functionalCurrency} (obligatoire)`, `${t('currency')} · rate 1 ${currency} = ? ${entity.functionalCurrency} (required)`) : t('currency')}>
              <div style={{ display: 'flex', gap: 6 }}>
                <Select className="in" style={{ width: 90 }} value={currency} onChange={(e) => pickCurrency(e.target.value as Currency)}>{['MRU', 'USD', 'EUR', 'MAD'].map((c) => <option key={c}>{c}</option>)}</Select>
                {foreign && <input className="in num" value={rate} onChange={(e) => setRate(e.target.value)} placeholder={`1 ${currency} = … ${entity.functionalCurrency}`} required aria-invalid={rateMissing}
                  style={rateMissing ? { borderColor: 'var(--crit)' } : undefined} aria-label={say(`Taux de conversion ${currency} vers ${entity.functionalCurrency}`, `Exchange rate ${currency} to ${entity.functionalCurrency}`)}
                  title={lastRate ? say(`Dernier taux enregistré : ${lastRate} — saisissez celui de cette facture`, `Latest recorded rate: ${lastRate} — enter this invoice's rate`) : say(`Saisissez le taux ${currency}/${entity.functionalCurrency} de cette facture`, `Enter this invoice's ${currency}/${entity.functionalCurrency} rate`)} />}
              </div>
            </Field>
            <Field label="Mission"><Select recent="missions" className="in" value={engagementId} onChange={(e) => setEngagementId(e.target.value)}><option value="">—</option>{state.engagements.filter((x) => x.entityId === entityId && x.customerId === customerId).map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}</Select></Field>
            <Field label={say('Bloc bancaire imprimé', 'Printed bank details')}><Select className="in" value={bankId} onChange={(e) => setBankId(e.target.value)}>{banks.map((b) => <option key={b.id} value={b.id} data-hint={b.currency}>{b.favorite ? '★ ' : ''}{b.bankName} · {b.name}</option>)}</Select></Field>
          </div>
          <div style={{ overflowX: 'auto', border: '1px solid var(--stroke)', borderRadius: 2 }}>
            <table>
              <thead><tr><th>#</th><th>{say('Désignation', 'Description')}</th><th className="num" style={{ width: 70 }}>{say('Qté', 'Qty')}</th><th className="num" style={{ width: 120 }}>{say('P.U.', 'Unit price')}</th><th style={{ width: 120 }}>{say('Catégorie', 'Category')}</th><th style={{ width: 190 }}>{say('TVA', 'VAT')}</th><th style={{ width: 100 }}>WHT</th><th style={{ width: 230 }}>{say('Compte de produit', 'Revenue account')}</th><th className="num" style={{ width: 110 }}>{say('Total HT', 'Total excl. tax')}</th><th></th></tr></thead>
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
                      <td><input className="in" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} aria-label={say(`Désignation ${i + 1}`, `Description ${i + 1}`)} placeholder={say('Audit des comptes · phase intérimaire', 'Financial statements audit · interim phase')} /></td>
                      <td><input className="in num" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} aria-label={say(`Quantité ${i + 1}`, `Quantity ${i + 1}`)} /></td>
                      <td><input className="in num" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} aria-label={say(`Prix ${i + 1}`, `Price ${i + 1}`)} /></td>
                      <td><Select className="in" value={l.serviceCategory} onChange={(e) => setLine(i, { serviceCategory: e.target.value })} aria-label={say(`Catégorie ${i + 1}`, `Category ${i + 1}`)}>{CATEGORIES.map(([k, n, en]) => <option key={k} value={k}>{say(n, en)}</option>)}</Select></td>
                      <td><Select className="in" value={l.taxCodeId} onChange={(e) => setLine(i, { taxCodeId: e.target.value })} aria-label={say(`TVA ${i + 1}`, `VAT ${i + 1}`)}><option value="">{auto ? say(`${auto.code} · ${auto.rate * 100} % (règle)`, `${auto.code} · ${auto.rate * 100} % (rule)`) : '—'}</option>{taxCodes.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.rate * 100} %</option>)}</Select></td>
                      <td>
                        <Select className="in" value={l.whtId} disabled={!whtCode && !olderWht(l.whtId)} title={whtCode ? undefined : say('Code RAS-7 absent : à créer dans Fiscalité › codes', 'No RAS-7 code: create it in Tax › codes')} onChange={(e) => setLine(i, { whtId: e.target.value })} aria-label={`WHT ${i + 1}`}>
                          <option value="">{say('Non applicable', 'Not applicable')}</option>
                          {whtCode && <option value={whtCode.id}>7 %</option>}
                          {olderWht(l.whtId) && <option value={l.whtId}>{Math.round((olderWht(l.whtId)?.rate ?? 0) * 1000) / 10} % · {olderWht(l.whtId)?.code}</option>}
                        </Select>
                      </td>
                      <td><Select recent="accounts" className="in mono" value={l.revenueAccountId} onChange={(e) => setLine(i, { revenueAccountId: e.target.value })} aria-label={say(`Compte de produit ${i + 1}`, `Revenue account ${i + 1}`)}><option value="">{defaultRevenue ? say(`${defaultRevenue.code} (défaut · ${REVENUE_STATUS_LABEL[status]})`, `${defaultRevenue.code} (default · ${REVENUE_STATUS_EN[status] ?? REVENUE_STATUS_LABEL[status]})`) : '—'}</option>{revenueAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.nameFr}</option>)}</Select></td>
                      <td className="num">{fmt(ht)}</td>
                      <td><button type="button" className="btn sm" aria-label={say('Supprimer la ligne', 'Delete line')} onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, k) => k !== i) : ls))}>×</button></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr><td colSpan={7}><button type="button" className="btn sm" onClick={() => setLines((ls) => [...ls, emptyLine(cardWht(customer))])}>{say('+ ligne', '+ line')}</button></td><td className="muted">{say('Total HT', 'Total excl. tax')}</td><td className="num">{fmt(preview?.ht ?? 0)}</td><td></td></tr>
                <tr><td colSpan={7} className="small muted">{preview?.notes.length ? say(`Mentions imprimées : ${preview.notes.map((n) => `« ${n.fr || n.en} »`).join(' · ')}`, `Printed notes: ${preview.notes.map((n) => `“${n.en || n.fr}”`).join(' · ')}`) : ''}</td><td className="muted">{say('TVA', 'VAT')}</td><td className="num">{fmt(preview?.tax ?? 0)}</td><td></td></tr>
                <tr><td colSpan={7} className="small muted">{preview?.whtCode ? say(`WHT ${Math.round(preview.whtCode.rate * 1000) / 10} % sur ${fmt(preview.whtBase)} HT · compte ${preview.whtAccount?.code ?? ''} (créance sur le Trésor) · la TVA reste due sur le HT`, `WHT ${Math.round(preview.whtCode.rate * 1000) / 10} % on ${fmt(preview.whtBase)} excl. tax · account ${preview.whtAccount?.code ?? ''} (receivable from the Treasury) · VAT remains due on the amount excl. tax`) : say('WHT non applicable : rien de retenu, rien d\'imprimé', 'WHT not applicable: nothing withheld, nothing printed')}</td><td className="muted">{say('Total TTC', 'Total incl. tax')}</td><td className="num">{fmt(preview?.ttc ?? 0)}</td><td></td></tr>
                {preview && preview.withholding > 0 && <tr><td colSpan={7}></td><td className="muted">WHT {Math.round((preview.whtCode?.rate ?? 0) * 1000) / 10} %</td><td className="num">−{fmt(preview.withholding)}</td><td></td></tr>}
                <tr><td colSpan={7} className="small">{rateMissing ? <span style={{ color: 'var(--crit)' }}>{say(`Saisissez le taux 1 ${currency} = ? ${entity.functionalCurrency} pour enregistrer cette facture.`, `Enter the rate 1 ${currency} = ? ${entity.functionalCurrency} to save this invoice.`)}</span> : preview?.ar && preview.ttc > 0 ? `${say('Écriture prévue :', 'Planned journal entry:')} ${preview.ar.code} D ${fmt(r2(preview.net * effRate))}${preview.withholding ? ` · ${preview.whtAccount?.code ?? 'WHT'} D ${fmt(r2(preview.withholding * effRate))}` : ''} ${entity.functionalCurrency} · ${preview.computed.map((l) => `${state.accounts.find((a) => a.id === l.revenueAccountId)?.code} C ${fmt(r2(l.lineHt * effRate))}`).join(' · ')}${preview.tax ? ` · ${say('TVA', 'VAT')} C ${fmt(r2(preview.tax * effRate))}` : say(' · aucune ligne de TVA', ' · no VAT line')}` : preview?.error ?? ''}</td><td><b>{say('Net à payer', 'Net payable')}</b></td><td className="num"><b>{currency} {fmt(preview?.net ?? 0)}</b></td><td></td></tr>
              </tfoot>
            </table>
          </div>
          <div className="actions">
            {editing && <button type="button" className="btn" onClick={onDone}>{say('Annuler', 'Cancel')}</button>}
            <button type="button" className="btn" disabled={rateMissing} onClick={() => save('draft')}>{t('keep_draft')}</button>
            <button type="button" className="btn" disabled={!ready} onClick={() => save('validate')}>{t('validate')}</button>
            <button type="button" className="btn primary" disabled={!ready} onClick={() => save('post')}>{t('post')}</button>
          </div>
        </div>
      </form>
      {!help && (
        <div style={{ flex: 'none' }}>
          <button type="button" className="btn sm" onClick={() => setHelp(true)} aria-label={say("Afficher l'aide : TVA, WHT, régime", 'Show help: VAT, WHT, regime')} title={say('Aide : TVA, WHT, régime', 'Help: VAT, WHT, regime')}
            style={{ width: 28, height: 28, padding: 0, justifyContent: 'center', fontWeight: 700 }}>?</button>
        </div>
      )}
      {help && <aside className="side">
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <h2 style={{ margin: 0 }}>{say('Résolution de la taxe', 'How the tax is chosen')}</h2>
            <button type="button" className="btn sm" onClick={() => setHelp(false)} aria-label={say("Replier l'aide", 'Collapse help')} title={say('Replier', 'Collapse')} style={{ width: 28, height: 28, padding: 0, justifyContent: 'center' }}>×</button>
          </div>
          <div className="small" style={{ marginTop: 8 }}>{say("Document forcé > règle (régime du client + catégorie) > défaut de l'entité. Le code figé sur la ligne choisit aussi le sous-compte de produit, que vous pouvez remplacer par n'importe quel compte de classe 7, y compris un sous-compte créé dans le plan.", 'Forced on the document > rule (client regime + category) > entity default. The code fixed on the line also picks the revenue sub-account, which you can replace with any class 7 account, including a sub-account created in the chart.')}</div>
          <h2 style={{ marginTop: 12 }}>{say('TVA et WHT', 'VAT and WHT')}</h2>
          <div className="small">{say('La ', '')}<b>{say('TVA', 'VAT')}</b>{say(' se choisit ligne par ligne (exonérée ou à taux zéro : aucune TVA). La ', ' is chosen line by line (exempt or zero-rated: no VAT). ')}<b>WHT</b>{say(' (retenue à la source, toujours 7 %) se choisit aussi ligne par ligne, sur le HT, en plus de la TVA : une facture peut porter les deux. Le client verse le net et reverse la WHT ; nous la suivons en créance (', ' (withholding tax, always 7 %) is also chosen line by line, on the amount excl. tax, on top of VAT: an invoice can carry both. The client pays the net amount and remits the WHT; we track it as a receivable (')}{whtCode ? `${whtCode.code}, ${say('compte', 'account')} ${state.accounts.find((a) => a.id === whtCode.deductibleAccountId)?.code ?? '—'}` : say('code RAS-7 absent', 'no RAS-7 code')}{say(") jusqu'à l'imputation sur notre impôt. À 7 %, la facture porte une colonne WHT, son total et la mention du régime GTA ; à 0 %, rien.", ') until it is offset against our tax. At 7 %, the invoice shows a WHT column, its total and the GTA regime note; at 0 %, nothing.')}</div>
          <h2 style={{ marginTop: 12 }}>{say('Régime de la facture', 'Invoice regime')}</h2>
          <div className="small">{say('Il part de la fiche client et ne vaut que pour cette facture ; il choisit la TVA proposée sur les lignes. ', 'It starts from the client profile and applies to this invoice only; it picks the VAT offered on the lines. ')}<b>Normal</b>{say(" : règles de l'entité (TVA). ", ": the entity's rules (VAT). ")}<b>GTA</b>{say(' : GTA-EXO 0 %, avec la mention « TVA non applicable » sur la facture.', ': GTA-EXO 0 %, with the note “VAT not applicable” on the invoice.')}</div>
          <div style={{ marginTop: 10 }} className="small">
            {taxCodes.map((x) => <div key={x.id} className="kv" style={{ padding: '3px 0' }}><span className="mono">{x.code}</span><span>{x.nameFr}</span></div>)}
          </div>
        </div>
      </aside>}
    </div>
  );
}

// [bumex-one] Receipts spread over invoices, lettered later, unlettered; the small differences decided by the
// administrator (Sidaty's corrections, 2026-11-23): vanguard/one/Lettering.tsx.
function Payments({ entityId, preselect }: { entityId: Id; preselect: Id | null }) {
  return <ReceiptsRoom entityId={entityId} preselect={preselect} />;
}

function AgingView({ entityId }: { entityId: Id }) {
  const { state } = useStore();
  const say = useSay(); // [bumex-one]
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
            <thead><tr><th>Client</th><th className="num">{say('Non échu', 'Not due')}</th><th className="num">{say('1–30 j', '1–30 d')}</th><th className="num">{say('31–90 j', '31–90 d')}</th><th className="num">{say('90+ j', '90+ d')}</th><th className="num">Total</th></tr></thead>
            <tbody>{[...byCustomer.values()].sort((a, b) => b.total - a.total).map((c) => <tr key={c.name}><td>{c.name}</td><td className="num">{fmt(c.current)}</td><td className="num">{fmt(c.d1)}</td><td className="num">{fmt(c.d2)}</td><td className="num" style={{ color: c.d3 ? 'var(--crit)' : undefined }}>{fmt(c.d3)}</td><td className="num">{fmt(c.total)}</td></tr>)}</tbody>
            <tfoot><tr><td>{say('Total (contre-valeur MRU)', 'Total (MRU equivalent)')}</td><td className="num">{fmt(ag.current)}</td><td className="num">{fmt(ag.d1to30)}</td><td className="num">{fmt(ag.d31to90)}</td><td className="num">{fmt(ag.d90plus)}</td><td className="num">{fmt(ag.total)}</td></tr></tfoot>
          </table>
        </div>
      </div>
      <aside className="side">
        <div className="card">
          <h2>{say('Balance âgée', 'Aged receivables')} · {fmt(ag.total)} {say('ouverts', 'open')}</h2>
          <div className="age" aria-label={say('Répartition par ancienneté', 'Breakdown by age')}>
            {ag.current > 0 && <div style={{ flex: pct(ag.current), background: 'var(--good)' }}>{say('Non échu', 'Not due')}</div>}
            {ag.d1to30 > 0 && <div style={{ flex: pct(ag.d1to30), background: 'var(--warn)' }}>1–30</div>}
            {ag.d31to90 > 0 && <div style={{ flex: pct(ag.d31to90), background: 'var(--crit)' }}>31–90</div>}
            {ag.d90plus > 0 && <div style={{ flex: pct(ag.d90plus), background: 'var(--crit-fg)' }}>90+</div>}
          </div>
          <div className="kv" style={{ marginTop: 10 }}>
            <span className="k">{say('En retard', 'Overdue')}</span><Money v={ag.overdue} /><span className="k">{say('Factures en retard', 'Overdue invoices')}</span><span className="mono">{ag.overdueCount}</span><span className="k">{say('Au-delà de 90 jours', 'Over 90 days')}</span><span className="mono">{ag.over90Count}</span>
          </div>
          <div className="small muted" style={{ marginTop: 8 }}>{say(`La pile de dossiers rouges à l'accueil de l'étage compte ${ag.overdueCount} dossiers.`, `The pile of red folders at the floor's reception holds ${ag.overdueCount} folders.`)}</div>
        </div>
      </aside>
    </div>
  );
}

function Dunning({ entityId }: { entityId: Id }) {
  const { state, apply } = useStore();
  const say = useSay(); // [bumex-one]
  const q = dunningQueue(state, entityId);
  return (
    <div className="card flush">
      <table>
        <thead><tr><th>Client</th><th>{say('Facture', 'Invoice')}</th><th className="num">{say('Reste dû', 'Balance due')}</th><th>{say('Retard', 'Overdue')}</th><th>{say('Niveau proposé', 'Suggested level')}</th><th>{say('Modèle', 'Template')}</th><th></th></tr></thead>
        <tbody>
          {q.length === 0 && <tr><td colSpan={7} className="muted">{say('Aucune relance à envoyer.', 'No reminders to send.')}</td></tr>}
          {q.map((r) => (
            <tr key={r.invoice.id}><td>{r.customer.name}</td><td className="mono">{r.invoice.number}</td><td className="num">{r.invoice.currency} {fmt(r.openTxn)}</td><td>{say(`${r.daysOverdue} j`, `${r.daysOverdue} d`)}</td><td><Chip kind={r.nextLevel!.level === 3 ? 'crit' : 'warn'}>{r.nextLevel!.level} · {say(r.nextLevel!.label, DUNNING_EN[r.nextLevel!.label] ?? r.nextLevel!.label)}</Chip></td><td className="small">{say(r.nextLevel!.template, DUNNING_EN[r.nextLevel!.template] ?? r.nextLevel!.template)}</td><td><button className="btn sm primary" onClick={() => apply((s) => sendDunning(s, r.invoice.id), say(`Relance niveau ${r.nextLevel!.level} envoyée`, `Level ${r.nextLevel!.level} reminder sent`))}>{say('Envoyer', 'Send')}</button></td></tr>
          ))}
        </tbody>
      </table>
      <div className="small muted" style={{ padding: 10 }}>{say('Niveaux : 1 rappel courtois à 15 jours · 2 mise en demeure à 45 jours · 3 contentieux à 90 jours (transfert BUMEX Avocats). Paramétrables par entité.', 'Levels: 1 friendly reminder at 15 days · 2 formal notice at 45 days · 3 litigation at 90 days (handed over to BUMEX Avocats). Configurable per entity.')}</div>
    </div>
  );
}

function Customers({ entityId }: { entityId: Id }) {
  const { state, apply, t } = useStore();
  const say = useSay(); // [bumex-one]
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
  const [address, setAddress] = useState(''); // [bumex-one] printed under "Billed To"
  const [code, setCode] = useState('');
  const [collectiveId, setCollectiveId] = useState('');
  const nextCode = (() => { try { return nextThirdPartyCode(state, entityId, 'customer'); } catch { return ''; } })();
  const collectives = state.accounts.filter((a) => a.entityId === entityId && a.active && !a.isAuxiliary && a.isPostable && a.requiresCustomer).sort((a, b) => a.code.localeCompare(b.code));
  const defaultCollective = (() => { try { return collectiveFor(state, entityId, 'customer'); } catch { return undefined; } })();
  const auxOf = (c: { arAccountId?: Id }) => (c.arAccountId ? state.accounts.find((a) => a.id === c.arAccountId) : undefined);
  const load = (id: Id | null) => {
    const c = id ? rows.find((x) => x.id === id) : undefined;
    setEditId(id); setName(c?.name ?? ''); setRegime(c?.regime ?? 'standard'); setCurrency(c?.defaultCurrency ?? 'MRU'); setTerms(String(c?.paymentTermsDays ?? 30)); setWht(c?.withholdingCodeId ?? ''); setNif(c?.nif ?? ''); setEmail(c?.email ?? ''); setAddress(c?.address ?? ''); setCode(c?.code ?? ''); setCollectiveId(c ? auxOf(c)?.collectiveId ?? '' : '');
  };
  const save = () => {
    const patch = { name: name.trim(), regime, defaultCurrency: currency, paymentTermsDays: Number(terms) || 30, withholdingCodeId: wht || undefined, nif: nif || undefined, email: email || undefined, address: address.trim() || undefined, country: regime === 'non_resident' ? 'XX' : 'MR', collectiveId: collectiveId || undefined };
    if (apply((s) => (editing ? updateCustomer(s, editing.id, { ...patch, code: code.trim() || editing.code }) : addCustomer(s, { entityId, code: code.trim() || undefined, ...patch })), editing ? say('Fiche client mise à jour', 'Client profile updated') : say('Client créé avec son compte auxiliaire', 'Client created with its sub-ledger account'))) load(null);
  };
  const open = openInvoices(state, entityId);
  return (
    <div className="cols">
      <div className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="card flush">
          <table>
            <thead><tr><th>{say('Code auxiliaire', 'Sub-ledger code')}</th><th>{say('Nom', 'Name')}</th><th>{say('Compte collectif', 'Control account')}</th><th>{say('Régime TVA', 'VAT regime')}</th><th>WHT</th><th>{say('Devise', 'Currency')}</th><th>{say('Conditions', 'Terms')}</th><th className="num">{say('Solde auxiliaire', 'Sub-ledger balance')}</th><th className="num">{say('En retard', 'Overdue')}</th><th></th></tr></thead>
            <tbody>{rows.map((c) => { const o = open.filter((x) => x.customer.id === c.id); const w = whtCodes.find((x) => x.id === c.withholdingCodeId); const aux = auxOf(c); const col = aux?.collectiveId ? state.accounts.find((a) => a.id === aux.collectiveId) : undefined; return <tr key={c.id} className={c.id === editId ? 'sel' : ''}><td className="mono">{c.code}</td><td>{c.name}{c.groupEntityId && <Chip kind="dim">{say(' groupe', ' group')}</Chip>}{!c.active && <Chip kind="dim">{say(' inactif', ' inactive')}</Chip>}<div className="small muted">{c.email ?? ''}{c.nif ? ` · NIF ${c.nif}` : ''}</div></td><td className="mono small">{col ? `${col.code} ${col.nameFr}` : '—'}</td><td>{regimeSay(say, c.regime)}</td><td>{w ? <Chip kind="warn">WHT {Math.round(w.rate * 1000) / 10} %</Chip> : <span className="muted">N/A</span>}</td><td>{c.defaultCurrency}</td><td>{say(`${c.paymentTermsDays} j`, `${c.paymentTermsDays} d`)}</td><td className="num">{aux ? fmt(accountBalance(state, entityId, aux.id), 0) : fmt(r2(o.reduce((a, x) => a + x.openFunctional, 0)), 0)}</td><td className="num">{fmt(r2(o.filter((x) => x.daysOverdue > 0).reduce((a, x) => a + x.openFunctional, 0)))}</td><td style={{ whiteSpace: 'nowrap' }}><button className="btn sm" onClick={() => load(c.id)}>{t('edit')}</button> <DeleteButton table="customer" rowId={c.id} label={`Client ${c.name}`} entityId={entityId} /></td></tr>; })}</tbody>
          </table>
        </div>
        <ClientRelations entityId={entityId} />{/* [bumex-one] the relationship side, BUMEX One's clients */}
      </div>
      <aside className="side">
        <div className="card">
          <h2>{editing ? say(`Fiche · ${editing.code}`, `Profile · ${editing.code}`) : say('Nouveau client', 'New client')}</h2>
          <Field label={say('Nom', 'Name')}><input className="in" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <div className="grid2" style={{ marginTop: 8 }}>
            <Field label={say('Code auxiliaire (unique)', 'Sub-ledger code (unique)')}><input className="in mono" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={editing ? editing.code : `auto · ${nextCode}`} /></Field>
            <Field label={say('Compte collectif', 'Control account')}><Select recent="accounts" className="in mono" value={collectiveId} onChange={(e) => setCollectiveId(e.target.value)}><option value="">{defaultCollective ? say(`Paramétrage · ${defaultCollective.code}`, `Settings · ${defaultCollective.code}`) : '—'}</option>{collectives.map((a) => <option key={a.id} value={a.id}>{a.code} {a.nameFr}</option>)}</Select></Field>
          </div>
          {editing && auxOf(editing) && <div className="small muted" style={{ marginTop: 4 }}>{say('Compte auxiliaire', 'Sub-ledger account')} <span className="mono">{auxOf(editing)!.code}</span> · {say('solde', 'balance')} {fmt(accountBalance(state, entityId, auxOf(editing)!.id), 0)} · {say('renommer le code renomme le compte.', 'renaming the code renames the account.')}</div>}
          <Field label={say('Régime TVA', 'VAT regime')} style={{ marginTop: 8 }}><Select className="in" value={regime} onChange={(e) => setRegime(e.target.value as CounterpartyRegime)}>{REGIMES.map(([k, n, en]) => <option key={k} value={k}>{say(n, en)}</option>)}</Select></Field>
          <Field label={say('WHT par défaut sur ses factures', 'Default WHT on their invoices')} style={{ marginTop: 8 }}><Select className="in" value={wht} onChange={(e) => setWht(e.target.value)}><option value="">{say('Non applicable', 'Not applicable')}</option>{whtCodes.filter((x) => x.id === whtCodeFor(state.taxCodes, entityId)?.id || x.id === wht).map((x) => <option key={x.id} value={x.id}>{Math.round(x.rate * 1000) / 10} %{x.code !== 'RAS-7' ? ` · ${x.code}` : ''}</option>)}</Select></Field>
          <div className="grid2" style={{ marginTop: 8 }}>
            <Field label={say('Devise', 'Currency')}><Select className="in" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>{['MRU', 'USD', 'EUR', 'MAD'].map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label={say('Délai (jours)', 'Payment terms (days)')}><input className="in num" value={terms} onChange={(e) => setTerms(e.target.value)} /></Field>
            <Field label="NIF"><input className="in mono" value={nif} onChange={(e) => setNif(e.target.value)} /></Field>
            <Field label={say('E-mail', 'Email')}><input className="in" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          </div>
          <Field label={say('Adresse (imprimée sur les factures)', 'Address (printed on invoices)')} style={{ marginTop: 8 }}><textarea className="in" rows={3} value={address} onChange={(e) => setAddress(e.target.value)} placeholder={editing?.clientAddress ? say(`Fiche relation · ${editing.clientAddress.replace(/\n/g, ', ')}`, `Relationship profile · ${editing.clientAddress.replace(/\n/g, ', ')}`) : 'Villa N° 538 Ksar 23-030\n538 Nouakchott'} style={{ height: 'auto', resize: 'vertical' }} /></Field>
          <div className="actions" style={{ marginTop: 10 }}>
            {editing && <button className="btn" onClick={() => load(null)}>{say('Annuler', 'Cancel')}</button>}
            <button className="btn primary" disabled={!name.trim()} onClick={save}>{editing ? say('Enregistrer', 'Save') : say('Créer', 'Create')}</button>
          </div>
        </div>
        {editing && <CustomerUnlettered entityId={entityId} customerId={editing.id} />}{/* [bumex-one] the receipts not wholly lettered (Sidaty, 2026-11-23) */}
      </aside>
    </div>
  );
}

// Withholding suffered on our sales: what each customer kept for the Treasury, to recover against our own tax.
function WithholdingSuffered({ entityId }: { entityId: Id }) {
  const { state, toast } = useStore();
  const say = useSay(); // [bumex-one]
  const [from, setFrom] = useState(state.today.slice(0, 4) + '-01-01');
  const [to, setTo] = useState(state.today);
  const st = useMemo(() => withholdingStatement(state, entityId, from, to), [state, entityId, from, to]);
  const entity = state.entities.find((e) => e.id === entityId)!;
  const acc = state.taxCodes.find((x) => x.entityId === entityId && x.kind === 'withholding' && x.deductibleAccountId);
  const account = acc ? state.accounts.find((a) => a.id === acc.deductibleAccountId) : undefined;
  const exportXlsx = () => downloadXlsx(`wht-subie-${entity.code}-${from}-${to}.xlsx`, [{ name: 'WHT subie', rows: [['Date', 'Document', 'Client', 'Base HT', 'Taux', 'WHT', 'Devise', 'Statut'], ...st.suffered.map((r) => [r.date, r.document, r.counterparty, r.base, r.rate, r.amount, r.currency, r.status])] }, { name: 'Par mois', rows: [['Mois', 'Subies', 'Dues'], ...st.byMonth.map((m) => [m.month, m.suffered, m.due])] }], toast);
  return (
    <div className="cols">
      <div className="grow">
        <div className="card flush">
          <table>
            <thead><tr><th>Date</th><th>{say('Facture', 'Invoice')}</th><th>Client</th><th className="num">{say('Base HT', 'Base excl. tax')}</th><th className="num">{say('Taux', 'Rate')}</th><th className="num">WHT</th><th>{say('Statut', 'Status')}</th></tr></thead>
            <tbody>{st.suffered.map((r, i) => <tr key={i}><td><D iso={r.date} /></td><td className="mono">{r.document}</td><td>{r.counterparty}</td><td className="num">{r.currency} {fmt(r.base)}</td><td className="num">{Math.round(r.rate * 1000) / 10} %</td><td className="num">{fmt(r.amount)}</td><td><Chip kind={r.status === 'réglée' ? 'good' : 'warn'}>{say(r.status, WHT_STATUS_EN[r.status] ?? r.status)}</Chip></td></tr>)}{st.suffered.length === 0 && <tr><td colSpan={7} className="muted small">{say('Aucune retenue subie sur la période', 'No withholding suffered in this period')}</td></tr>}</tbody>
            <tfoot><tr><td colSpan={5}>{say(`Total retenu par les clients (contre-valeur ${entity.functionalCurrency})`, `Total withheld by clients (${entity.functionalCurrency} equivalent)`)}</td><td className="num">{fmt(st.sufferedTotal)}</td><td></td></tr></tfoot>
          </table>
        </div>
      </div>
      <aside className="side">
        <div className="card">
          <h2>{say('Période', 'Period')}</h2>
          <div className="grid2"><Field label={say('Du', 'From')}><input className="in mono" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label={say('Au', 'To')}><input className="in mono" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field></div>
          <div className="kv" style={{ marginTop: 10 }}><span className="k">{say('WHT subie', 'Withholding tax suffered')}</span><Money v={st.sufferedTotal} /><span className="k">{say('Compte de suivi', 'Tracking account')}</span><span className="mono">{account ? `${account.code} ${account.nameFr}` : '—'}</span><span className="k">{say('Retenues dues (achats)', 'Withholding due (purchases)')}</span><Money v={st.dueTotal} /></div>
          <button className="btn" style={{ marginTop: 10, width: '100%', justifyContent: 'center' }} onClick={exportXlsx}>{say('Exporter (Excel)', 'Export (Excel)')}</button>
          <div className="small muted" style={{ marginTop: 8 }}>{say('Les retenues dues sur nos achats (3 % / 15 %) et leur reversement se suivent dans Fiscalité.', 'Withholding due on our purchases (3 % / 15 %) and its remittance are tracked in Tax.')}</div>
        </div>
      </aside>
    </div>
  );
}
