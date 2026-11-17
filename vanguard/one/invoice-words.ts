// The amount of an invoice in words, in English or French ("This invoice amounts to nine thousand eight hundred fifty
// Euros"), up to the billions, with the cents (asked on 2026-11-17 with the invoice's model).

export type InvoiceLang = 'en' | 'fr';

const EN_UNITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function enBelowThousand(n: number): string {
  const parts: string[] = [];
  if (n >= 100) parts.push(`${EN_UNITS[Math.floor(n / 100)]} hundred`);
  const r = n % 100;
  if (r) parts.push(r < 20 ? EN_UNITS[r] : `${EN_TENS[Math.floor(r / 10)]}${r % 10 ? `-${EN_UNITS[r % 10]}` : ''}`);
  return parts.join(' ');
}

export function numberToWordsEn(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'zero';
  const scales: [number, string][] = [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']];
  const parts: string[] = [];
  for (const [size, word] of scales) {
    if (n >= size) {
      parts.push(`${numberToWordsEn(Math.floor(n / size))} ${word}`);
      n %= size;
    }
  }
  if (n) parts.push(enBelowThousand(n));
  return parts.join(' ');
}

const FR_UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
const FR_TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

// 0–99; `plural`: "quatre-vingts" when nothing follows (not before "mille")
function frBelowHundred(n: number, plural: boolean): string {
  if (n < 20) return FR_UNITS[n];
  const t = Math.floor(n / 10), u = n % 10;
  if (t < 7) return `${FR_TENS[t]}${u === 1 ? ' et un' : u ? `-${FR_UNITS[u]}` : ''}`;
  if (t === 7) return `soixante${u === 1 ? ' et onze' : `-${FR_UNITS[10 + u]}`}`;
  if (t === 8) return u ? `quatre-vingt-${FR_UNITS[u]}` : plural ? 'quatre-vingts' : 'quatre-vingt';
  return `quatre-vingt-${FR_UNITS[10 + u]}`;
}

// 0–999; "deux cents" but "deux cent un", and no plural before "mille"
function frBelowThousand(n: number, plural: boolean): string {
  const h = Math.floor(n / 100), r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(h === 1 ? 'cent' : `${FR_UNITS[h]} ${r === 0 && plural ? 'cents' : 'cent'}`);
  if (r) parts.push(frBelowHundred(r, plural));
  return parts.join(' ');
}

export function numberToWordsFr(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'zéro';
  const parts: string[] = [];
  for (const [size, one, many] of [[1e9, 'milliard', 'milliards'], [1e6, 'million', 'millions']] as const) {
    if (n >= size) {
      const k = Math.floor(n / size);
      parts.push(k === 1 ? `un ${one}` : `${numberToWordsFr(k)} ${many}`);
      n %= size;
    }
  }
  if (n >= 1000) {
    const k = Math.floor(n / 1000);
    parts.push(k === 1 ? 'mille' : `${frBelowThousand(k, false)} mille`);
    n %= 1000;
  }
  if (n) parts.push(frBelowThousand(n, true));
  return parts.join(' ');
}

const CURRENCY: Record<InvoiceLang, Record<string, [string, string, string, string]>> = {
  // one, many, cent, cents
  en: { EUR: ['Euro', 'Euros', 'cent', 'cents'], USD: ['US Dollar', 'US Dollars', 'cent', 'cents'], MRU: ['Ouguiya', 'Ouguiyas', 'khoum', 'khoums'], MAD: ['Dirham', 'Dirhams', 'centime', 'centimes'] },
  fr: { EUR: ['euro', 'euros', 'centime', 'centimes'], USD: ['dollar US', 'dollars US', 'cent', 'cents'], MRU: ['ouguiya', 'ouguiyas', 'khoum', 'khoums'], MAD: ['dirham', 'dirhams', 'centime', 'centimes'] },
};

export function currencyName(currency: string, lang: InvoiceLang, plural = true): string {
  const c = CURRENCY[lang][currency];
  return c ? c[plural ? 1 : 0] : currency;
}

// "nine thousand eight hundred fifty Euros", "mille deux cents ouguiyas et cinquante khoums"
export function amountInWords(amount: number, currency: string, lang: InvoiceLang): string {
  const total = Math.round(Math.abs(amount) * 100);
  const units = Math.floor(total / 100), cents = total % 100;
  const words = lang === 'fr' ? numberToWordsFr : numberToWordsEn;
  const [one, many, cent, centsWord] = CURRENCY[lang][currency] ?? [currency, currency, '/100', '/100'];
  const name = units === 1 ? one : many;
  // French: "un million d'ouguiyas", "deux millions de dollars US"
  const of = lang === 'fr' && units >= 1e6 && units % 1e6 === 0 ? (/^[aeiouyéh]/i.test(name) ? "d'" : 'de ') : '';
  let out = `${words(units)} ${of}${name}`;
  if (cents) out += ` ${lang === 'fr' ? 'et' : 'and'} ${words(cents)} ${cents === 1 ? cent : centsWord}`;
  return out;
}

export function amountSentence(amount: number, currency: string, lang: InvoiceLang): string {
  return lang === 'fr' ? `Arrêtée la présente facture à la somme de ${amountInWords(amount, currency, lang)}` : `This invoice amounts to ${amountInWords(amount, currency, lang)}`;
}
