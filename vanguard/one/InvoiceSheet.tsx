import QRCode from 'qrcode';
import { amountSentence, currencyName, type InvoiceLang } from './invoice-words';

// [bumex-one] The invoice as BUMEX prints it (asked on 2026-11-17, from its model "Invoice (PROV141)"): the letterhead,
// the title block, a navy rule, the QR code and the "Billed To" box, the lines, the amount in words, the totals and
// the TOTAL DUE bar, the payment block (a treasury account: Bank › accounts), the signature (a placeholder for now)
// and the registered office's footer. One A4 page; English or French.
// Pure: drawn in Vanguard (Clients › invoices, vanguard/ui/panels/Clients.tsx) and on the invoice's public page, the
// QR code's link (app/i/[token]); its styles are its own (the .bumex-page class keeps Vanguard's out).
// Plain <div>s only: the app's print rules hide every <header>, <nav> and <aside> (app/globals.css).

export type { InvoiceLang };

export type InvoiceSheetData = {
  number?: string;
  status: string;
  date: string;
  dueDate: string;
  currency: string;
  paymentMode: string;
  lines: { lineNo: number; description: string; quantity: number; unitPrice: number; taxRateSnapshot?: number; lineHt: number; withholdingRate?: number }[]; // withholdingRate absent: the invoice's
  totalHt: number;
  totalTax: number;
  totalTtc: number;
  withholdingRate: number;
  withholdingAmount: number;
  netPayable: number;
  legalMention?: string;
  gtaVat?: boolean; // a line is GTA-EXO: the "VAT not applicable … GTA" note
  entity: {
    name: string; country: string; address?: string; phone?: string; fax?: string; email?: string; web?: string; nif?: string;
    capitalAmount?: number; capitalCurrency?: string; logoUrl?: string;
  };
  customer: { name: string; address?: string; nif?: string };
  bank?: { bankName: string; accountHolder?: string; iban?: string; bic?: string; accountNumber?: string; rib?: string };
  url?: string; // the QR code's link (the invoice's public page)
};

export const DEFAULT_INVOICE_LOGO = '/bumex-official-logo-transparent.png';

// English for an invoice in euros or dollars or to a non-resident, French otherwise
export function defaultInvoiceLang(currency: string, customerCountry?: string): InvoiceLang {
  return currency === 'EUR' || currency === 'USD' || customerCountry === 'XX' ? 'en' : 'fr';
}

const L = {
  en: {
    invoice: 'Invoice', draft: 'Draft', cancelled: 'Cancelled', invoiceDate: 'Invoice date:', dueDate: 'Due date:', paymentMethod: 'Payment method:', paymentTerms: 'Payment Terms:',
    days: (n: number) => `${n} day${n === 1 ? '' : 's'}`, billedTo: 'Billed To', amountIn: (c: string) => `Amount in ${c}`,
    description: 'DESCRIPTION', qty: 'QTY', up: 'U.P.', vat: 'VAT', wht: 'WHT', total: 'TOTAL', totalNet: 'Total Net', totalTax: 'Total VAT', totalTtc: 'Total (inc. tax)',
    totalWht: 'Total WHT', customerNif: 'VAT ID',
    whtNote: 'Invoice issued under the specific tax regime of the GTA Project (Mauritania–Senegal). The withholding tax (WHT) is withheld by the Client and remitted to the Joint Unit.',
    gtaNote: 'VAT not applicable in accordance with the GTA tax regime', totalDue: 'TOTAL DUE', paymentInfo: 'PAYMENT INFORMATION', bank: 'BANK', owner: 'ACCOUNT OWNER NAME',
    iban: 'IBAN', bic: 'BIC/SWIFT', account: 'ACCOUNT NO.', rib: 'RIB', signature: 'Signature', registered: 'Registered office', phone: 'Phone', fax: 'Fax', email: 'Email', web: 'Web',
    capital: 'Capital of', nif: 'NIF', sep: ':',
  },
  fr: {
    invoice: 'Facture', draft: 'brouillon', cancelled: 'annulée', invoiceDate: 'Date de facture :', dueDate: "Date d'échéance :", paymentMethod: 'Mode de paiement :', paymentTerms: 'Conditions de paiement :',
    days: (n: number) => `${n} jour${n === 1 ? '' : 's'}`, billedTo: 'Facturé à', amountIn: (c: string) => `Montant en ${c}`,
    description: 'DÉSIGNATION', qty: 'QTÉ', up: 'P.U.', vat: 'TVA', wht: 'WHT', total: 'TOTAL', totalNet: 'Total HT', totalTax: 'Total TVA', totalTtc: 'Total TTC',
    totalWht: 'Total WHT', customerNif: 'NIF',
    whtNote: "Facture émise dans le cadre du régime fiscal spécifique du Projet GTA (Mauritanie–Sénégal). La retenue à la source (WHT) est prélevée par le Client et reversée à l'Unité Conjointe.",
    gtaNote: 'TVA non applicable conformément au régime fiscal GTA', totalDue: 'NET À PAYER', paymentInfo: 'INFORMATIONS DE PAIEMENT', bank: 'BANQUE', owner: 'TITULAIRE DU COMPTE',
    iban: 'IBAN', bic: 'BIC/SWIFT', account: 'N° DE COMPTE', rib: 'RIB', signature: 'Signature', registered: 'Siège social', phone: 'Tél', fax: 'Fax', email: 'E-mail', web: 'Web',
    capital: 'Capital de', nif: 'NIF', sep: ' :',
  },
};

const PAYMENT_MODE: Record<string, { en: string; fr: string }> = {
  virement: { en: 'Bank transfer', fr: 'Virement bancaire' },
  'chèque': { en: 'Cheque', fr: 'Chèque' },
  cheque: { en: 'Cheque', fr: 'Chèque' },
  'espèces': { en: 'Cash', fr: 'Espèces' },
  carte: { en: 'Card', fr: 'Carte' },
};
const COUNTRY: Record<string, string> = { MR: 'Mauritanie', MA: 'Maroc' };

function money(x: number, lang: InvoiceLang, decimals = 2): string {
  const [i, f] = Math.abs(x).toFixed(decimals).split('.');
  const grouped = i.replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'fr' ? ' ' : ',');
  return `${x < 0 ? '−' : ''}${grouped}${decimals ? (lang === 'fr' ? ',' : '.') + f : ''}`;
}
const quantity = (q: number, lang: InvoiceLang) => (Number.isInteger(q) ? String(q) : money(q, lang, 2).replace(/[.,]?0+$/, ''));
const percent = (rate: number, lang: InvoiceLang) => `${String(Math.round(rate * 1000) / 10).replace('.', lang === 'fr' ? ',' : '.')}${lang === 'fr' ? ' %' : '%'}`;
const dmy = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const linesOf = (text?: string) => (text ?? '').split('\n').map((l) => l.trim()).filter(Boolean);

function Qr({ text }: { text: string }) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.modules.get(r, c)) d += `M${c} ${r}h1v1h-1z`;
  return (
    <svg className="ivx-qr" viewBox={`-2 -2 ${n + 4} ${n + 4}`} shapeRendering="crispEdges" role="img" aria-label={text}>
      <rect x={-2} y={-2} width={n + 4} height={n + 4} fill="#fff" />
      <path d={d} fill="#111" />
    </svg>
  );
}

export function InvoiceSheet({ data, lang }: { data: InvoiceSheetData; lang: InvoiceLang }) {
  const t = L[lang];
  const e = data.entity;
  const address = linesOf(e.address);
  const country = COUNTRY[e.country] ?? e.country;
  const title = data.number ?? t.draft;
  const terms = daysBetween(data.date, data.dueDate);
  const mode = PAYMENT_MODE[data.paymentMode.trim().toLowerCase()]?.[lang] ?? data.paymentMode;
  const contact = [e.phone && `${t.phone}${t.sep} ${e.phone}`, e.fax && `${t.fax}${t.sep} ${e.fax}`].filter(Boolean).join(' - ');
  // the registered office in one line: "BUMEX SA - 301, Rue …, Extension … - BP : 7763 Nouakchott, Mauritanie"
  const office = [e.name, address.length > 1 ? address.slice(0, -1).join(', ') : '', `${address[address.length - 1] ?? ''}${country ? `${address.length ? ', ' : ''}${country}` : ''}`].filter(Boolean).join(' - ');
  const footContact = [e.phone && `${t.phone}${t.sep} ${e.phone}`, e.fax && `${t.fax}${t.sep} ${e.fax}`, e.web, e.email].filter(Boolean).join(' - ');
  const wht = data.withholdingAmount > 0; // WHT at 0 %: nothing of it on the invoice
  const b = data.bank;
  const payRows: [string, string | undefined][] = b
    ? [[t.bank, b.bankName], [t.owner, b.accountHolder || e.name], [t.iban, b.iban], [t.bic, b.bic], ...(!b.iban ? [[t.account, b.accountNumber] as [string, string | undefined], [t.rib, b.rib] as [string, string | undefined]] : [])]
    : [];
  return (
    <div className="ivx bumex-page" lang={lang}>
      <style>{CSS}</style>
      <div className="ivx-page">
        <div className="ivx-head">
          <img className="ivx-logo" src={e.logoUrl || DEFAULT_INVOICE_LOGO} alt="" />
          <div className="ivx-co">
            <div className="ivx-co-name">{e.name}</div>
            {address.map((l, i) => <div key={i}>{l}</div>)}
            <div className="ivx-co-gap" />
            {contact && <div>{contact}</div>}
            {e.email && <div>{t.email}{t.sep} {e.email}</div>}
            {e.web && <div>{t.web}{t.sep} {e.web}</div>}
          </div>
          <div className="ivx-title">
            <div className="ivx-h">{t.invoice} ({title}){data.status === 'cancelled' ? ` · ${t.cancelled}` : ''}</div>
            <table className="ivx-meta">
              <tbody>
                <tr><td>{t.invoiceDate}</td><td>{dmy(data.date)}</td></tr>
                <tr><td>{t.dueDate}</td><td>{dmy(data.dueDate)}</td></tr>
                <tr><td>{t.paymentMethod}</td><td>{mode}</td></tr>
                <tr><td>{t.paymentTerms}</td><td>{t.days(terms)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div className="ivx-bar" />
        <div className="ivx-parties">
          <div className="ivx-qr-cell">{data.url && <Qr text={data.url} />}</div>
          <div className="ivx-to">
            <div className="ivx-label">{t.billedTo}</div>
            <div className="ivx-box">
              <div className="ivx-to-name">{data.customer.name}</div>
              {linesOf(data.customer.address).map((l, i) => <div key={i}>{l}</div>)}
              {data.customer.nif && <div className="ivx-to-id">{t.customerNif}{t.sep} {data.customer.nif}</div>}
            </div>
          </div>
        </div>
        <div className="ivx-rule" />
        <div className="ivx-amount-in">{t.amountIn(currencyName(data.currency, lang))}</div>
        <table className="ivx-lines">
          <thead><tr><th>{t.description}</th><th className="ivx-n ivx-qty">{t.qty}</th><th className="ivx-n">{t.up}</th><th className="ivx-vat">{t.vat}</th>{wht && <th className="ivx-vat">{t.wht}</th>}<th className="ivx-n">{t.total}</th></tr></thead>
          <tbody>
            {data.lines.map((l) => (
              <tr key={l.lineNo}>
                <td>{l.description}</td><td className="ivx-n ivx-qty">{quantity(l.quantity, lang)}</td><td className="ivx-n">{money(l.unitPrice, lang)}</td>
                <td className="ivx-vat">{percent(l.taxRateSnapshot ?? 0, lang)}</td>{wht && <td className="ivx-vat">{percent(l.withholdingRate ?? data.withholdingRate, lang)}</td>}<td className="ivx-n">{money(l.lineHt, lang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="ivx-words">{amountSentence(data.netPayable, data.currency, lang)}</div>{/* the net to pay (asked on 2026-11-17) */}
        <div className="ivx-sums">
          {/* the notes, beside the totals (asked on 2026-11-17): the WHT's when it applies, the GTA's when VAT is GTA-exempt,
              else the tax code's legal mention */}
          <div className="ivx-notes">
            {wht && <div className="ivx-note">{t.whtNote}</div>}
            {data.gtaVat ? <div className="ivx-note">{t.gtaNote}</div> : data.legalMention && <div className="ivx-note">{data.legalMention}</div>}
          </div>
          <div className="ivx-totals">
            <table>
              <tbody>
                <tr><td>{t.totalNet}</td><td>{money(data.totalHt, lang)}</td></tr>
                <tr><td>{t.totalTax}</td><td>{money(data.totalTax, lang)}</td></tr>
                <tr><td>{t.totalTtc}</td><td>{money(data.totalTtc, lang)}</td></tr>
              </tbody>
            </table>
            {wht && <table className="ivx-wht"><tbody><tr><td>{t.totalWht}</td><td>{money(-data.withholdingAmount, lang)}</td></tr></tbody></table>}
            <div className={`ivx-due${wht ? ' ivx-due-joined' : ''}`}><span>{t.totalDue}</span><span>{money(data.netPayable, lang)}</span></div>
          </div>
        </div>
        <div className="ivx-fill" />
        <div className="ivx-bottom">
          <div className="ivx-pay">
            {b && <>
              <div className="ivx-pay-h">{t.paymentInfo}</div>
              {payRows.filter(([, v]) => v).map(([k, v]) => <div key={k}>{k}{t.sep} {v}</div>)}
            </>}
          </div>
          {/* the signature: dynamic later (asked on 2026-11-17); its place is kept */}
          <div className="ivx-sign">
            <div className="ivx-sign-area">{t.signature}</div>
          </div>
        </div>
        <div className="ivx-foot">
          <div className="ivx-b">{t.registered}{t.sep} {office}</div>
          {footContact && <div className="ivx-b">{footContact}</div>}
          {e.capitalAmount != null && <div>{t.capital} {money(e.capitalAmount, lang, 0)} {e.capitalCurrency ?? ''}</div>}
          {e.nif && <div>{t.nif}{t.sep} {e.nif}</div>}
          {data.lines.length <= 10 && <span className="ivx-pageno">1 / 1</span>}
        </div>
      </div>
    </div>
  );
}

const CSS = `
.ivx { --ivx-navy: #1c3552; --ivx-bar: #13283f; --ivx-ink: #2c3138; --ivx-muted: #6b7380; --ivx-soft: #f3f5f8; --ivx-line: #d7dde5; --ivx-head: #d5e3f0; --ivx-due: #2e5c89;
  color: var(--ivx-ink); font-family: Helvetica, Arial, "Liberation Sans", sans-serif; font-size: 13px; line-height: 1.35; letter-spacing: normal; text-align: left; }
.ivx *, .ivx *::before, .ivx *::after { box-sizing: border-box; }
.ivx .ivx-page { width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; display: flex; flex-direction: column; padding: 13mm 12mm 7mm; position: relative; }
.ivx .ivx-head { display: flex; align-items: flex-start; gap: 14px; }
.ivx .ivx-logo { width: 92px; height: auto; margin-top: 14px; flex: none; }
.ivx .ivx-co { flex: 1; font-size: 13.5px; color: #3a3f47; }
.ivx .ivx-co-name { font-size: 20px; font-weight: 700; color: var(--ivx-navy); line-height: 1.1; }
.ivx .ivx-co-gap { height: 12px; }
.ivx .ivx-title { flex: none; min-width: 250px; }
.ivx .ivx-h { font-size: 25px; font-weight: 700; color: var(--ivx-navy); text-align: right; margin-bottom: 8px; white-space: nowrap; }
.ivx table { border-collapse: collapse; border-spacing: 0; width: auto; background: none; font-size: inherit; }
.ivx td, .ivx th { padding: 0; border: 0; background: none; text-transform: none; letter-spacing: normal; white-space: normal; vertical-align: middle; color: inherit; font-weight: inherit; }
.ivx .ivx-meta { margin-left: auto; font-size: 12px; }
.ivx .ivx-meta td { padding: 2px 0; }
.ivx .ivx-meta td:first-child { color: var(--ivx-muted); padding-right: 16px; }
.ivx .ivx-meta td:last-child { font-weight: 700; color: #3a3f47; }
.ivx .ivx-bar { height: 7px; background: var(--ivx-bar); margin: 10px -12mm 0; }
.ivx .ivx-parties { display: flex; justify-content: space-between; gap: 24px; padding: 22px 0 6px; }
.ivx .ivx-qr-cell { width: 122px; flex: none; }
.ivx .ivx-qr { width: 122px; height: 122px; display: block; }
.ivx .ivx-to { width: 50%; }
.ivx .ivx-label { font-size: 12px; font-weight: 700; color: var(--ivx-muted); margin: -12px 0 4px 6px; }
.ivx .ivx-box { background: var(--ivx-soft); border: 1px solid var(--ivx-line); border-radius: 8px; padding: 16px 20px; min-height: 178px; color: #3a3f47; }
.ivx .ivx-to-name { font-size: 15.5px; font-weight: 700; color: var(--ivx-navy); margin-bottom: 4px; }
.ivx .ivx-rule { border-top: 1px solid var(--ivx-line); margin-top: 4px; }
.ivx .ivx-amount-in { text-align: right; font-style: italic; color: var(--ivx-muted); font-size: 12px; margin: 6px 4px 6px; }
.ivx .ivx-lines { width: 100%; }
.ivx .ivx-lines th { background: var(--ivx-head); font-size: 10.5px; font-weight: 700; color: #1f2937; padding: 12px 14px; text-align: left; }
.ivx .ivx-lines td { padding: 11px 14px; border-bottom: 1px solid #e6eaef; font-size: 13.5px; }
.ivx .ivx-lines tbody tr:nth-child(even) td { background: #f7f9fb; }
.ivx .ivx-lines tbody tr:last-child td { border-bottom: 1px solid #9aa3ae; }
.ivx .ivx-lines .ivx-n { text-align: right; white-space: nowrap; }
.ivx .ivx-lines .ivx-qty { text-align: center; }
.ivx .ivx-lines .ivx-vat { text-align: left; width: 70px; white-space: nowrap; padding-left: 26px; }
.ivx .ivx-lines th.ivx-n:last-child, .ivx .ivx-lines td.ivx-n:last-child { width: 130px; }
.ivx .ivx-words { font-style: italic; font-size: 14px; color: #3a3f47; margin: 8px 4px 0; padding-top: 0; }
.ivx .ivx-sums { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-top: 26px; }
.ivx .ivx-notes { width: 46%; display: flex; flex-direction: column; gap: 10px; }
.ivx .ivx-note { background: var(--ivx-soft); border: 1px solid var(--ivx-line); border-radius: 8px; padding: 9px 16px; font-size: 12.5px; color: #3a3f47; line-height: 1.4; }
.ivx .ivx-totals { width: 48%; margin-left: auto; }
.ivx .ivx-totals .ivx-wht { margin-top: 12px; border-radius: 6px 6px 0 0; border-bottom: 0; }
.ivx .ivx-to-id { margin-top: 14px; }
.ivx .ivx-totals table { width: 100%; border: 1px solid var(--ivx-line); border-radius: 6px; border-collapse: separate; overflow: hidden; }
.ivx .ivx-totals td { padding: 6px 12px; font-weight: 700; font-size: 13.5px; border-bottom: 1px solid #e6eaef; }
.ivx .ivx-totals tr:last-child td { border-bottom: 0; }
.ivx .ivx-totals td:first-child { white-space: nowrap; }
.ivx .ivx-totals td:last-child { text-align: right; border-left: 1px solid #e6eaef; width: 38%; white-space: nowrap; }
.ivx .ivx-due { display: flex; margin-top: 12px; background: var(--ivx-due); color: #fff; font-weight: 700; font-size: 14px; }
.ivx .ivx-due.ivx-due-joined { margin-top: 0; }
.ivx .ivx-due span { padding: 7px 12px; }
.ivx .ivx-due span:first-child { flex: 1; }
.ivx .ivx-due span:last-child { width: 38%; text-align: right; border-left: 1px solid rgba(255,255,255,.45); white-space: nowrap; }
.ivx .ivx-fill { flex: 1; min-height: 40px; }
.ivx .ivx-bottom { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; margin-bottom: 8px; }
.ivx .ivx-pay { width: 50%; min-height: 1px; }
.ivx .ivx-pay:not(:empty) { background: var(--ivx-soft); border: 1px solid var(--ivx-line); border-radius: 8px; padding: 18px 22px; font-size: 12.5px; color: #3a3f47; line-height: 1.75; }
.ivx .ivx-pay-h { font-weight: 700; font-size: 13.5px; color: var(--ivx-navy); line-height: 1.3; }
.ivx .ivx-sign { width: 38%; display: flex; flex-direction: column; align-items: center; }
.ivx .ivx-sign-area { width: 100%; height: 150px; border: 1px dashed #c3cad4; border-radius: 6px; display: flex; align-items: flex-start; justify-content: center; padding-top: 8px; color: #a3abb6; font-size: 12px; }
.ivx .ivx-foot { border-top: 7px solid var(--ivx-bar); margin: 6px -12mm 0; padding: 7px 12mm 0; text-align: center; font-size: 9.6px; line-height: 1.4; color: #3a3f47; position: relative; }
.ivx .ivx-foot .ivx-b { font-weight: 700; }
.ivx .ivx-pageno { position: absolute; right: 12mm; bottom: 0; font-size: 11px; }
@media print {
  .ivx { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .ivx .ivx-page { margin: 0; box-shadow: none !important; }
  .ivx .ivx-lines tr, .ivx .ivx-sums, .ivx .ivx-bottom { break-inside: avoid; }
}
`;
