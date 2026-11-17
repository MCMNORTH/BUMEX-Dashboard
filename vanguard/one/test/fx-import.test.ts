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
});
