import { describe, expect, it } from 'vitest';

import { parseFxSheets } from '../fx-import';

// Excel's serial day of an ISO date (what the BCM's file holds in its Date column)
const serial = (iso: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86_400_000);

describe('reading an exchange-rate file', () => {
  it("reads the BCM's file as published: a sheet per year, the header where it is, MAD per 100, old ouguiyas left out", () => {
    const parsed = parseFxSheets([
      { name: '2024', rows: [['', '', '', ''], ['', '', 'Cours aprés 12h 30 min ', ''], ['Date', 'Devise', 'Cours de Référence 2', ''],
        ['', 'CAN', '', ''], // an empty row of the template: ignored
        [serial('2024-05-29'), 'EUR', 40.9, ''], [serial('2024-05-29'), 'USD', 39.6, ''], [serial('2024-05-29'), 'MAD', 395.06, ''], [serial('2024-05-29'), 'CAN', 29.55, ''], [serial('2024-05-29'), 'JPY', 276.36, ''],
        ['', '', '', '']] },
      { name: '2023', rows: [['Date', 'Devise', 'Cours 2'], [serial('2023-12-29'), 'EUR', 43.6624696], [serial('2023-12-29'), 'USD', 39.28]] },
      { name: '2017', rows: [['Date', 'Devise', 'Cours 2'], [serial('2017-12-29'), 'EUR', 421.63]] },
    ]);
    expect(parsed.format).toBe('bcm');
    expect(parsed.rows).toEqual([
      { date: '2024-05-29', from: 'EUR', to: 'MRU', rate: 40.9, source: 'BCM' },
      { date: '2024-05-29', from: 'USD', to: 'MRU', rate: 39.6, source: 'BCM' },
      { date: '2024-05-29', from: 'MAD', to: 'MRU', rate: 3.9506, source: 'BCM' },
      { date: '2023-12-29', from: 'EUR', to: 'MRU', rate: 43.6624696, source: 'BCM' },
      { date: '2023-12-29', from: 'USD', to: 'MRU', rate: 39.28, source: 'BCM' },
    ]);
    expect(parsed.skipped).toEqual([
      { reason: 'devises non tenues en comptabilité (CAN, JPY)', count: 2 },
      { reason: 'avant 2018 : cours en anciennes ouguiyas (MRO)', count: 1 },
    ]);
  });

  it('reads a plain table: date, currency, rate (and to, source), ISO or dd/mm/yyyy dates, decimal commas', () => {
    const parsed = parseFxSheets([{ name: 'Feuil1', rows: [['date', 'currency', 'rate', 'source'], ['2024-05-20', 'EUR', '41,00', 'BCM'], ['29/05/2024', 'usd', 39.6, ''], ['', '', '', ''], ['bad', 'EUR', 'x', '']] }]);
    expect(parsed.format).toBe('table');
    expect(parsed.rows).toEqual([
      { date: '2024-05-20', from: 'EUR', to: 'MRU', rate: 41, source: 'BCM' },
      { date: '2024-05-29', from: 'USD', to: 'MRU', rate: 39.6, source: undefined },
    ]);
    expect(parsed.skipped).toEqual([{ reason: 'ligne illisible (date ou taux)', count: 1 }]);
    expect(parseFxSheets([{ name: 'x', rows: [['a', 'b'], [1, 2]] }]).format).toBeNull();
  });

  it("reads the BCM site's export: value per weight, the reference rate's rows, dates month first", () => {
    const head = ['date', 'minBandeFluctuationUSD', 'nameArabic', 'nameEnglish', 'weight', 'maxBandeFluctuationUSD', 'currency', 'value', 'key', 'nameFrench'];
    const parsed = parseFxSheets([{ name: 'Sheet1', rows: [head,
      ['1/2/24', 36.96, 'يورو', 'Euro', 1, 40.85, 'EUR', 43.0341, 'coursChangeReference', 'Euro'],
      ['1/30/24', 37.1, 'يورو', 'Euro', 1, 41.01, 'EUR', 44.037, 'coursChangeReference', 'Euro'],
      ['1/30/24', 37.1, 'دولار', 'US Dollar', 1, 41.01, 'USD', 39.6, 'coursChangeReference', 'Dollar'],
      ['1/30/24', 37.1, 'درهم', 'Dirham', 100, 41.01, 'MAD', 395.06, 'coursChangeReference', 'Dirham'],
      ['1/30/24', 37.1, 'يورو', 'Euro', 1, 41.01, 'EUR', 44.5, 'coursChangeVente', 'Euro'],
      ['1/30/24', 37.1, 'ين', 'Yen', 1000, 41.01, 'JPY', 276.36, 'coursChangeReference', 'Yen'],
    ] }]);
    expect(parsed.format).toBe('bcm-export');
    expect(parsed.rows).toEqual([
      { date: '2024-01-02', from: 'EUR', to: 'MRU', rate: 43.0341, source: 'BCM' },
      { date: '2024-01-30', from: 'EUR', to: 'MRU', rate: 44.037, source: 'BCM' },
      { date: '2024-01-30', from: 'USD', to: 'MRU', rate: 39.6, source: 'BCM' },
      { date: '2024-01-30', from: 'MAD', to: 'MRU', rate: 3.9506, source: 'BCM' },
    ]);
    expect(parsed.skipped).toEqual([
      { reason: 'devises non tenues en comptabilité (JPY)', count: 1 },
      { reason: 'autre cours que le cours de référence (coursChangeVente)', count: 1 },
    ]);
    // the same file with real Excel dates, and a day-first file found as such
    const serialDates = parseFxSheets([{ name: 'S', rows: [head, [serial('2024-12-31'), '', '', '', 1, '', 'USD', 39.84, 'coursChangeReference', '']] }]);
    expect(serialDates.rows).toEqual([{ date: '2024-12-31', from: 'USD', to: 'MRU', rate: 39.84, source: 'BCM' }]);
    const dayFirst = parseFxSheets([{ name: 'S', rows: [['date', 'currency', 'rate'], ['02/01/2024', 'EUR', 43], ['30/01/2024', 'EUR', 44]] }]);
    expect(dayFirst.rows.map((r) => r.date)).toEqual(['2024-01-02', '2024-01-30']);
  });
});
