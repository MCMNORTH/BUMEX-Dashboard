import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { amountInWords, amountSentence, numberToWordsEn, numberToWordsFr } from '../invoice-words';
import { defaultInvoiceLang, InvoiceSheet, type InvoiceSheetData } from '../InvoiceSheet';

describe('the amount in words', () => {
  it('in English, as the model writes it', () => {
    expect(amountSentence(9850, 'EUR', 'en')).toBe('This invoice amounts to nine thousand eight hundred fifty Euros');
    expect(numberToWordsEn(0)).toBe('zero');
    expect(numberToWordsEn(21)).toBe('twenty-one');
    expect(numberToWordsEn(1_250_300)).toBe('one million two hundred fifty thousand three hundred');
    expect(amountInWords(1, 'USD', 'en')).toBe('one US Dollar');
    expect(amountInWords(12.5, 'EUR', 'en')).toBe('twelve Euros and fifty cents');
  });
  it('in French, with its rules (et un, quatre-vingts, cents, mille)', () => {
    expect(numberToWordsFr(21)).toBe('vingt et un');
    expect(numberToWordsFr(71)).toBe('soixante et onze');
    expect(numberToWordsFr(80)).toBe('quatre-vingts');
    expect(numberToWordsFr(81)).toBe('quatre-vingt-un');
    expect(numberToWordsFr(99)).toBe('quatre-vingt-dix-neuf');
    expect(numberToWordsFr(200)).toBe('deux cents');
    expect(numberToWordsFr(201)).toBe('deux cent un');
    expect(numberToWordsFr(1000)).toBe('mille');
    expect(numberToWordsFr(80_000)).toBe('quatre-vingt mille');
    expect(numberToWordsFr(200_000)).toBe('deux cent mille');
    expect(numberToWordsFr(2_000_000)).toBe('deux millions');
    expect(amountInWords(9850, 'EUR', 'fr')).toBe('neuf mille huit cent cinquante euros');
    expect(amountInWords(1_000_000, 'MRU', 'fr')).toBe("un million d'ouguiyas");
    expect(amountInWords(3_000_000, 'USD', 'fr')).toBe('trois millions de dollars US');
    expect(amountInWords(1200.05, 'MRU', 'fr')).toBe('mille deux cents ouguiyas et cinq khoums');
  });
});

const model: InvoiceSheetData = {
  number: 'PROV141', status: 'draft', date: '2026-12-01', dueDate: '2026-12-31', currency: 'EUR', paymentMode: 'Virement',
  lines: [
    { lineNo: 1, description: 'Preparation and submission of IMF declaration', quantity: 6, unitPrice: 250, taxRateSnapshot: 0, lineHt: 1500 },
    { lineNo: 2, description: 'Tax Appeal', quantity: 15, unitPrice: 150, taxRateSnapshot: 0, lineHt: 2250 },
  ],
  totalHt: 3750, totalTax: 0, totalTtc: 3750, withholdingRate: 0, withholdingAmount: 0, netPayable: 3750,
  entity: { name: 'BUMEX SA', country: 'MR', address: '301, Rue Cheikh Saad Bouh Kane\nExtension Module B suite Tavragh Zeina\nBP : 7763 Nouakchott', phone: '45 25 26 26', fax: '45 25 51 51', email: 'bumex@bumex.mr', web: 'www.bumex.mr', nif: '21100778', capitalAmount: 10_000_000, capitalCurrency: 'MRU' },
  customer: { name: 'Tullow Group Services Limited', address: 'Villa N° 538 Ksar 23-030\n538 Nouakchott' },
  bank: { bankName: 'SOCIETE GENERALE MAURITANIE', accountHolder: 'BUMEX', iban: 'MR1300012000010000034369703', bic: 'BIIMMRMR' },
  url: 'https://app.bumex.mr/i/0b7c6f2e-1111-4444-8888-123456789abc',
};
const text = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '|').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');

describe('the invoice sheet', () => {
  it('prints the model: letterhead, title block, billed to, lines, totals, payment block, footer, QR code', () => {
    const html = renderToStaticMarkup(createElement(InvoiceSheet, { data: model, lang: 'en' }));
    const t = text(html);
    for (const s of ['BUMEX SA', 'Phone: 45 25 26 26 - Fax: 45 25 51 51', 'Email: bumex@bumex.mr', 'Web: www.bumex.mr', 'Invoice (PROV141)', '01/12/2026', '31/12/2026', 'Bank transfer', '30 days',
      'Billed To', 'Tullow Group Services Limited', 'Villa N° 538 Ksar 23-030', 'Amount in Euros', 'DESCRIPTION', 'U.P.', '250.00', '0%', '1,500.00', 'This invoice amounts to three thousand seven hundred fifty Euros',
      'Total Net', 'Total (inc. tax)', 'TOTAL DUE', '3,750.00', 'PAYMENT INFORMATION', 'BANK: SOCIETE GENERALE MAURITANIE', 'ACCOUNT OWNER NAME: BUMEX', 'IBAN: MR1300012000010000034369703', 'BIC/SWIFT: BIIMMRMR',
      'Registered office: BUMEX SA - 301, Rue Cheikh Saad Bouh Kane, Extension Module B suite Tavragh Zeina - BP : 7763 Nouakchott, Mauritanie', 'Capital of 10,000,000 MRU', 'NIF: 21100778', 'Signature', '1 / 1']) {
      expect(t, s).toContain(s);
    }
    expect(html).toContain('<svg class="ivx-qr"');
    expect(html).toContain('aria-label="https://app.bumex.mr/i/0b7c6f2e-1111-4444-8888-123456789abc"');
  });
  it('in French, with the withholding and no QR code before the invoice has its link', () => {
    const t = text(renderToStaticMarkup(createElement(InvoiceSheet, { data: { ...model, number: undefined, currency: 'MRU', withholdingRate: 0.07, withholdingAmount: 262.5, netPayable: 3487.5, url: undefined }, lang: 'fr' })));
    for (const s of ['Facture (brouillon)', 'Facturé à', 'Montant en ouguiyas', 'Virement bancaire', '1 500,00', 'Retenue à la source (7 %)', '−262,50', 'NET À PAYER', '3 487,50', 'BANQUE : SOCIETE GENERALE MAURITANIE', 'Capital de 10 000 000 MRU']) {
      expect(t, s).toContain(s);
    }
    expect(renderToStaticMarkup(createElement(InvoiceSheet, { data: { ...model, url: undefined }, lang: 'fr' }))).not.toContain('ivx-qr"');
  });
  it('speaks English for euros, dollars and non-residents, French otherwise', () => {
    expect(defaultInvoiceLang('EUR')).toBe('en');
    expect(defaultInvoiceLang('USD', 'MR')).toBe('en');
    expect(defaultInvoiceLang('MRU', 'XX')).toBe('en');
    expect(defaultInvoiceLang('MRU', 'MR')).toBe('fr');
  });
});
