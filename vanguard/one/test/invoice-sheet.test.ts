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
    // ouguiyas' cents are centimes (the old invoices: "… Mauritania Ouguiya and ten centimes"), never khoums
    expect(amountSentence(88_110.1, 'MRU', 'en')).toBe('This invoice amounts to eighty-eight thousand one hundred ten Mauritania Ouguiya and ten centimes');
    expect(amountInWords(1200.05, 'MRU', 'fr')).toBe('mille deux cents ouguiyas et cinq centimes');
    expect(amountInWords(1_112_903.23, 'MRU', 'fr')).toBe('un million cent douze mille neuf cent trois ouguiyas et vingt-trois centimes');
    expect(amountInWords(1_035_000, 'MRU', 'fr')).toBe('un million trente-cinq mille ouguiyas');
    expect(amountInWords(12.5, 'EUR', 'fr')).toBe('douze euros et cinquante centimes');
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
const text = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');

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
    // the app's print rules hide <header>, <nav> and <aside> (app/globals.css): the letterhead vanished on paper
    expect(html).not.toMatch(/<(header|nav|aside)[\s>]/);
    expect(html).toContain('aria-label="https://app.bumex.mr/i/0b7c6f2e-1111-4444-8888-123456789abc"');
    // WHT at 0 %: no column, no total, no note
    for (const s of ['WHT', 'GTA']) expect(t).not.toContain(s);
  });
  it('with WHT 7 % (the old invoices): a WHT column, Total WHT apart above TOTAL DUE, the GTA notes beside the totals', () => {
    const gta = { ...model, currency: 'MRU', lines: [{ lineNo: 1, description: 'Seconded Junior Accountant', quantity: 1, unitPrice: 94_742.04, taxRateSnapshot: 0, lineHt: 94_742.04 }], totalHt: 94_742.04, totalTax: 0, totalTtc: 94_742.04, withholdingRate: 0.07, withholdingAmount: 6_631.94, netPayable: 88_110.1, gtaVat: true, legalMention: 'Prestation exonérée de TVA — régime GTA', customer: { ...model.customer, nif: '00625939' } };
    const html = renderToStaticMarkup(createElement(InvoiceSheet, { data: gta, lang: 'en' }));
    const t = text(html);
    for (const s of ['|VAT|WHT|TOTAL|', '|0%|7%|94,742.04|', 'Amount in Mauritania Ouguiya', 'VAT ID: 00625939', 'Total VAT', 'Total WHT|−6,631.94', 'TOTAL DUE|88,110.10',
      'This invoice amounts to eighty-eight thousand one hundred ten Mauritania Ouguiya and ten centimes',
      'Invoice issued under the specific tax regime of the GTA Project (Mauritania–Senegal). The withholding tax (WHT) is withheld by the Client and remitted to the Joint Unit.',
      'VAT not applicable in accordance with the GTA tax regime']) {
      expect(t, s).toContain(s);
    }
    expect(t).not.toContain('régime GTA|'); // the GTA note stands for the line's French mention
    // VAT 16 % with WHT 7 %: the WHT note, not the GTA one
    const both = text(renderToStaticMarkup(createElement(InvoiceSheet, { data: { ...gta, gtaVat: false, legalMention: undefined, totalTax: 15_158.73, totalTtc: 109_900.77, netPayable: 103_268.83 }, lang: 'en' })));
    expect(both).toContain('The withholding tax (WHT) is withheld by the Client');
    expect(both).not.toContain('VAT not applicable');
  });
  it('in French, with the withholding and no QR code before the invoice has its link', () => {
    const t = text(renderToStaticMarkup(createElement(InvoiceSheet, { data: { ...model, number: undefined, currency: 'MRU', withholdingRate: 0.07, withholdingAmount: 262.5, netPayable: 3487.5, url: undefined }, lang: 'fr' })));
    for (const s of ['Facture (brouillon)', 'Facturé à', 'Montant en ouguiyas', 'Virement bancaire', '1 500,00', '|TVA|RAS|TOTAL|', 'Total retenue (WHT)|−262,50', 'NET À PAYER', '3 487,50', 'Arrêtée la présente facture à la somme de trois mille quatre cent quatre-vingt-sept ouguiyas et cinquante centimes|',
      "La retenue à la source (WHT) est prélevée par le Client et reversée à l'Unité Conjointe.", 'BANQUE : SOCIETE GENERALE MAURITANIE', 'Capital de 10 000 000 MRU']) {
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
