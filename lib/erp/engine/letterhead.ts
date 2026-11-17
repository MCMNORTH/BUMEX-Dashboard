// [bumex-one] An entity's letterhead: what its invoices print at the top and in the footer (asked on 2026-11-17,
// vanguard/one/InvoiceSheet.tsx). Ours, beside the engine as delivered.
import type { State, Id, Entity, Currency } from './types';
import { DomainError } from './types';
import { audit, requireRole, PARTNER_ROLES } from './core';

export type LetterheadInput = Partial<Pick<Entity, 'address' | 'phone' | 'fax' | 'email' | 'web' | 'nif' | 'capitalAmount' | 'capitalCurrency' | 'logoUrl'>>;

const CURRENCIES: Currency[] = ['MRU', 'USD', 'EUR', 'MAD'];
const clean = (v: string | undefined) => {
  const s = v?.replace(/\r\n/g, '\n').split('\n').map((l) => l.trim()).join('\n').trim();
  return s ? s : undefined;
};

export function setEntityLetterhead(state: State, entityId: Id, patch: LetterheadInput): [State, Entity] {
  requireRole(state, [...PARTNER_ROLES, 'accountant', 'manager'], "de modifier l'en-tête des factures");
  const e = state.entities.find((x) => x.id === entityId);
  if (!e) throw new DomainError('not_found', 'Entité inconnue');
  const text = (k: keyof LetterheadInput) => (k in patch ? clean(patch[k] as string | undefined) : (e[k] as string | undefined));
  const email = text('email');
  if (email && !/^[^\s@]+@[^\s@]+$/.test(email)) throw new DomainError('email', `Adresse e-mail invalide : ${email}`);
  const logoUrl = text('logoUrl');
  if (logoUrl && !/^(https?:\/\/|\/)/.test(logoUrl)) throw new DomainError('logo', 'Le logo est une adresse (https://…) ou un chemin du site (/entities/…)');
  const capitalAmount = 'capitalAmount' in patch ? patch.capitalAmount : e.capitalAmount;
  if (capitalAmount !== undefined && (!Number.isFinite(capitalAmount) || capitalAmount < 0)) throw new DomainError('capital', 'Capital invalide');
  const capitalCurrency = 'capitalCurrency' in patch ? patch.capitalCurrency || undefined : e.capitalCurrency;
  if (capitalCurrency && !CURRENCIES.includes(capitalCurrency)) throw new DomainError('currency', `Devise inconnue : ${capitalCurrency}`);
  const next: Entity = {
    ...e,
    address: text('address'), phone: text('phone'), fax: text('fax'), email, web: text('web'), nif: text('nif'),
    capitalAmount: capitalAmount ?? undefined, capitalCurrency, logoUrl,
  };
  return [audit({ ...state, entities: state.entities.map((x) => (x.id === entityId ? next : x)) }, 'entity', entityId, 'U', `En-tête des factures · ${e.name}`, entityId), next];
}
