import type { State, Id, ISODate, Asset, AssetCategory, DepreciationMethod, DepreciationRun } from './types';
import { DomainError } from './types';
import { r2, sum, addMonths, addDays } from './money';
import { nextId, audit, mapped, nextNumber, requirePost, requireRole, PARTNER_ROLES, accountById, apAccountFor } from './core';
import { createDraft, postEntry, type DraftLineInput } from './ledger';

// Fixed assets: a sheet per asset, a depreciation schedule (linear or declining, prorata temporis in months),
// the year-end simulation and the posting of the dotations in one entry per fiscal year.

const DEFAULT_CATEGORIES: { code: string; name: string; lifeMonths: number; method: DepreciationMethod }[] = [
  { code: 'IT', name: 'Matériel informatique', lifeMonths: 36, method: 'linear' },
  { code: 'SOFTWARE', name: 'Logiciels et licences', lifeMonths: 36, method: 'linear' },
  { code: 'VEHICLE', name: 'Matériel de transport', lifeMonths: 60, method: 'linear' },
  { code: 'FURNITURE', name: 'Mobilier et matériel de bureau', lifeMonths: 120, method: 'linear' },
  { code: 'FITTINGS', name: 'Agencements et installations', lifeMonths: 120, method: 'linear' },
];

export function seedAssetCategories(state: State, entityId: Id): State {
  let s = state;
  for (const c of DEFAULT_CATEGORIES) {
    if (s.assetCategories.some((x) => x.entityId === entityId && x.code === c.code)) continue;
    const [s1, id] = nextId(s, 'acat');
    s = { ...s1, assetCategories: [...s1.assetCategories, { id, entityId, code: c.code, name: c.name, lifeMonths: c.lifeMonths, method: c.method, assetAccountId: mapped(s1, entityId, 'ASSET', c.code).id, accDeprAccountId: mapped(s1, entityId, 'ACC_DEPR', c.code).id }] };
  }
  return s;
}

export function addAssetCategory(state: State, input: { entityId: Id; code: string; name: string; lifeMonths: number; method: DepreciationMethod; assetAccountId: Id; accDeprAccountId: Id }): [State, AssetCategory] {
  requireRole(state, [...PARTNER_ROLES, 'accountant', 'manager'], 'de paramétrer les immobilisations');
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9_]{2,16}$/.test(code)) throw new DomainError('code', 'Code de catégorie : 2 à 16 caractères');
  if (state.assetCategories.some((c) => c.entityId === input.entityId && c.code === code)) throw new DomainError('exists', `La catégorie ${code} existe déjà`);
  if (!(input.lifeMonths >= 6 && input.lifeMonths <= 600)) throw new DomainError('life', 'Durée entre 6 et 600 mois');
  accountById(state, input.assetAccountId);
  accountById(state, input.accDeprAccountId);
  const [s1, id] = nextId(state, 'acat');
  const cat: AssetCategory = { ...input, id, code, name: input.name.trim() };
  return [audit({ ...s1, assetCategories: [...s1.assetCategories, cat] }, 'asset_category', id, 'I', `Catégorie ${cat.name}`, input.entityId), cat];
}

export function updateAssetCategory(state: State, id: Id, patch: Partial<Pick<AssetCategory, 'name' | 'lifeMonths' | 'method' | 'assetAccountId' | 'accDeprAccountId'>>): [State, AssetCategory] {
  requireRole(state, [...PARTNER_ROLES, 'accountant', 'manager'], 'de paramétrer les immobilisations');
  const c = state.assetCategories.find((x) => x.id === id);
  if (!c) throw new DomainError('not_found', 'Catégorie inconnue');
  const next = { ...c, ...patch };
  return [audit({ ...state, assetCategories: state.assetCategories.map((x) => (x.id === id ? next : x)) }, 'asset_category', id, 'U', `Catégorie ${next.name} modifiée`, c.entityId), next];
}

export const DECLINING_COEFFICIENT = (lifeMonths: number) => (lifeMonths <= 48 ? 1.5 : lifeMonths <= 72 ? 2 : 2.5);

export interface AssetInput {
  entityId: Id;
  code?: string;
  name: string;
  serial?: string;
  categoryId: Id;
  acquisitionDate: ISODate;
  cost: number;
  residual?: number;
  lifeMonths?: number;
  method?: DepreciationMethod;
  startDate?: ISODate;
  location: string;
  supplierId?: Id;
  notes?: string;
  status?: Asset['status'];
  accumulated?: number; // depreciation already posted before the asset entered this ERP
  acquisition?: { credit: 'supplier' | 'bank'; bankAccountId?: Id; vatAmount?: number } | null; // post Dr asset / Cr supplier or bank
}

function computeDates(start: ISODate, lifeMonths: number): ISODate {
  return addDays(addMonths(start, lifeMonths), -1);
}

export function addAsset(state: State, input: AssetInput): [State, Asset] {
  requireRole(state, [...PARTNER_ROLES, 'accountant', 'manager'], "d'enregistrer une immobilisation");
  const cat = state.assetCategories.find((c) => c.id === input.categoryId && c.entityId === input.entityId);
  if (!cat) throw new DomainError('category', 'Catégorie inconnue');
  if (!input.name.trim()) throw new DomainError('name', 'La désignation est obligatoire');
  if (!(input.cost > 0)) throw new DomainError('cost', "Valeur d'acquisition positive requise");
  const lifeMonths = input.lifeMonths ?? cat.lifeMonths;
  if (!(lifeMonths >= 6 && lifeMonths <= 600)) throw new DomainError('life', 'Durée entre 6 et 600 mois');
  const residual = r2(input.residual ?? 0);
  if (residual < 0 || residual >= input.cost) throw new DomainError('residual', 'Valeur résiduelle entre 0 et la valeur d\'acquisition');
  const start = input.startDate ?? input.acquisitionDate;
  if (start < input.acquisitionDate) throw new DomainError('dates', "Le début d'amortissement ne précède pas l'acquisition");
  if (input.serial && state.assets.some((a) => a.entityId === input.entityId && a.serial && a.serial.toLowerCase() === input.serial!.trim().toLowerCase())) throw new DomainError('serial', 'Ce numéro de série est déjà enregistré');
  let s = state;
  let code = input.code?.trim();
  if (!code) {
    const [s1, n] = nextNumber(s, input.entityId, 'asset', '', input.acquisitionDate, 'IMM-{YYYY}-{SEQ3}', 'year');
    s = s1;
    code = n;
  }
  if (s.assets.some((a) => a.entityId === input.entityId && a.code === code)) throw new DomainError('exists', `Le code ${code} existe déjà`);
  const [s2, id] = nextId(s, 'ast');
  s = s2;
  let asset: Asset = {
    id,
    entityId: input.entityId,
    code,
    name: input.name.trim(),
    serial: input.serial?.trim() || undefined,
    categoryId: cat.id,
    category: cat.name,
    acquisitionDate: input.acquisitionDate,
    cost: r2(input.cost),
    residual,
    lifeMonths,
    rate: r2((100 * 12) / lifeMonths),
    method: input.method ?? cat.method,
    startDate: start,
    endDate: computeDates(start, lifeMonths),
    accumulated: r2(input.accumulated ?? 0),
    location: input.location.trim(),
    status: input.status ?? 'in_service',
    supplierId: input.supplierId,
    notes: input.notes,
  };
  if (input.acquisition) {
    requirePost(state);
    const entity = state.entities.find((e) => e.id === input.entityId)!;
    const journal = state.journals.find((j) => j.entityId === input.entityId && j.kind === 'assets')!;
    const vat = r2(input.acquisition.vatAmount ?? 0);
    const lines: DraftLineInput[] = [{ accountId: cat.assetAccountId, description: `Acquisition ${asset.code} ${asset.name}`, debitTxn: asset.cost, assetId: id }];
    if (vat) lines.push({ accountId: mapped(state, input.entityId, 'VAT_DEDUCTIBLE').id, description: `TVA sur ${asset.code}`, debitTxn: vat });
    if (input.acquisition.credit === 'bank') {
      const bank = state.bankAccounts.find((b) => b.id === input.acquisition!.bankAccountId);
      if (!bank) throw new DomainError('not_found', 'Compte bancaire inconnu');
      lines.push({ accountId: bank.glAccountId, description: `Paiement ${asset.code}`, creditTxn: r2(asset.cost + vat), bankAccountId: bank.id });
    } else {
      if (!input.supplierId) throw new DomainError('supplier', 'Fournisseur requis pour une acquisition à crédit');
      const supplier = state.suppliers.find((x) => x.id === input.supplierId);
      if (!supplier) throw new DomainError('not_found', 'Fournisseur inconnu');
      lines.push({ accountId: apAccountFor(state, input.entityId, supplier).id, description: `Fournisseur ${asset.code}`, creditTxn: r2(asset.cost + vat), supplierId: input.supplierId });
    }
    const [s3, draft] = createDraft(s, { entityId: input.entityId, journalId: journal.id, date: input.acquisitionDate, description: `Acquisition ${asset.code} ${asset.name}`, currency: entity.functionalCurrency, fxRate: 1, sourceType: 'asset', sourceId: id, postingRule: 'asset_acquisition.v1', lines });
    const [s4, posted] = postEntry(s3, draft.id);
    asset = { ...asset, acquisitionEntryId: posted.id };
    s = s4;
  }
  return [audit({ ...s, assets: [...s.assets, asset] }, 'asset', id, 'I', `Immobilisation ${asset.code} · ${asset.name} · ${asset.cost}`, input.entityId), asset];
}

export function updateAsset(state: State, id: Id, patch: Partial<Pick<Asset, 'name' | 'serial' | 'location' | 'notes' | 'status' | 'lifeMonths' | 'method' | 'startDate' | 'residual' | 'categoryId'>>): [State, Asset] {
  requireRole(state, [...PARTNER_ROLES, 'accountant', 'manager'], 'de modifier une immobilisation');
  const a = state.assets.find((x) => x.id === id);
  if (!a) throw new DomainError('not_found', 'Immobilisation inconnue');
  if (patch.name !== undefined && !patch.name.trim()) throw new DomainError('name', 'La désignation est obligatoire');
  if ((patch.lifeMonths !== undefined || patch.method !== undefined || patch.startDate !== undefined || patch.residual !== undefined) && a.accumulated > 0) throw new DomainError('depreciated', 'Amortissements déjà comptabilisés : le plan ne change plus (passer par une révision de plan)');
  const lifeMonths = patch.lifeMonths ?? a.lifeMonths;
  if (!(lifeMonths >= 6 && lifeMonths <= 600)) throw new DomainError('life', 'Durée entre 6 et 600 mois');
  const start = patch.startDate ?? a.startDate;
  const cat = patch.categoryId ? state.assetCategories.find((c) => c.id === patch.categoryId) : undefined;
  if (patch.categoryId && !cat) throw new DomainError('category', 'Catégorie inconnue');
  const next: Asset = { ...a, ...patch, name: patch.name?.trim() ?? a.name, lifeMonths, startDate: start, endDate: computeDates(start, lifeMonths), rate: r2((100 * 12) / lifeMonths), category: cat?.name ?? a.category };
  return [audit({ ...state, assets: state.assets.map((x) => (x.id === id ? next : x)) }, 'asset', id, 'U', `Immobilisation ${a.code} modifiée`, a.entityId), next];
}

export interface ScheduleRow {
  year: number;
  months: number;
  opening: number;
  dotation: number;
  cumulative: number;
  closing: number;
  posted: boolean;
}

// Annual schedule, calendar years, prorata temporis in months (the start month counts in full).
export function depreciationSchedule(asset: Asset): ScheduleRow[] {
  const base = r2(asset.cost - asset.residual);
  const startYear = Number(asset.startDate.slice(0, 4));
  const startMonth = Number(asset.startDate.slice(5, 7));
  const totalMonths = asset.lifeMonths;
  const linearRate = 12 / totalMonths;
  const coef = DECLINING_COEFFICIENT(totalMonths);
  const rows: ScheduleRow[] = [];
  let cumulative = 0;
  let elapsed = 0; // months depreciated so far
  let year = startYear;
  let guard = 0;
  while (elapsed < totalMonths && guard++ < 100) {
    const monthsThisYear = Math.min(totalMonths - elapsed, year === startYear ? 13 - startMonth : 12);
    const opening = r2(asset.cost - cumulative);
    let dotation: number;
    if (asset.method === 'linear') dotation = r2((base * monthsThisYear) / totalMonths);
    else {
      const nbv = r2(opening - asset.residual);
      const declining = r2(nbv * linearRate * coef * (monthsThisYear / 12));
      const remaining = totalMonths - elapsed;
      const linearAlt = r2((nbv * monthsThisYear) / remaining);
      dotation = Math.max(declining, linearAlt);
    }
    if (elapsed + monthsThisYear >= totalMonths) dotation = r2(base - cumulative); // last year clears the rounding
    dotation = Math.min(dotation, r2(base - cumulative));
    cumulative = r2(cumulative + dotation);
    rows.push({ year, months: monthsThisYear, opening, dotation, cumulative, closing: r2(asset.cost - cumulative), posted: cumulative <= asset.accumulated + 0.004 });
    elapsed += monthsThisYear;
    year++;
  }
  return rows;
}

export interface YearDepreciation {
  asset: Asset;
  scheduled: number; // the dotation of the year per the schedule
  alreadyPosted: number; // posted for this fiscal year in earlier runs
  toPost: number;
  nbvAfter: number;
}

export function yearDepreciation(state: State, entityId: Id, fiscalYearId: Id): YearDepreciation[] {
  const fy = state.fiscalYears.find((f) => f.id === fiscalYearId && f.entityId === entityId);
  if (!fy) throw new DomainError('not_found', 'Exercice inconnu');
  const year = Number(fy.label);
  const runs = state.depreciationRuns.filter((r) => r.entityId === entityId && r.fiscalYearId === fiscalYearId);
  return state.assets
    .filter((a) => a.entityId === entityId && a.status === 'in_service' && a.startDate <= fy.end)
    .map((asset) => {
      const row = depreciationSchedule(asset).find((r) => r.year === year);
      const scheduled = row?.dotation ?? 0;
      const alreadyPosted = sum(runs.flatMap((r) => r.lines.filter((l) => l.assetId === asset.id).map((l) => l.amount)));
      const toPost = r2(Math.max(0, Math.min(scheduled - alreadyPosted, asset.cost - asset.residual - asset.accumulated)));
      return { asset, scheduled, alreadyPosted, toPost, nbvAfter: r2(asset.cost - asset.accumulated - toPost) };
    })
    .filter((r) => r.scheduled > 0 || r.alreadyPosted > 0);
}

// depreciation.v1 — one entry at the fiscal year end: Dr dotation expense / Cr accumulated depreciation per asset
export function postDepreciation(state: State, entityId: Id, fiscalYearId: Id, date?: ISODate): [State, DepreciationRun] {
  requirePost(state);
  const fy = state.fiscalYears.find((f) => f.id === fiscalYearId && f.entityId === entityId);
  if (!fy) throw new DomainError('not_found', 'Exercice inconnu');
  const rows = yearDepreciation(state, entityId, fiscalYearId).filter((r) => r.toPost > 0);
  if (!rows.length) throw new DomainError('nothing', 'Aucune dotation à comptabiliser pour cet exercice');
  const when = date ?? (fy.end < state.today ? fy.end : state.today);
  if (when < fy.start || when > fy.end) throw new DomainError('date', "La date de comptabilisation doit être dans l'exercice");
  const journal = state.journals.find((j) => j.entityId === entityId && j.kind === 'assets')!;
  const entity = state.entities.find((e) => e.id === entityId)!;
  const lines: DraftLineInput[] = [];
  for (const r of rows) {
    const cat = state.assetCategories.find((c) => c.id === r.asset.categoryId)!;
    let expense: Id;
    try { expense = mapped(state, entityId, 'DEPR_EXPENSE', cat.code).id; } catch { expense = mapped(state, entityId, 'DEPR_EXPENSE').id; }
    lines.push({ accountId: expense, description: `Dotation ${fy.label} ${r.asset.code} ${r.asset.name}`, debitTxn: r.toPost, assetId: r.asset.id });
    lines.push({ accountId: cat.accDeprAccountId, description: `Amortissement ${fy.label} ${r.asset.code}`, creditTxn: r.toPost, assetId: r.asset.id });
  }
  const [s1, draft] = createDraft(state, { entityId, journalId: journal.id, date: when, description: `Dotations aux amortissements ${fy.label}`, currency: entity.functionalCurrency, fxRate: 1, sourceType: 'depreciation', sourceId: fiscalYearId, postingRule: 'depreciation.v1', lines });
  const [s2, posted] = postEntry(s1, draft.id);
  const [s3, id] = nextId(s2, 'drun');
  const run: DepreciationRun = { id, entityId, fiscalYearId, date: when, total: sum(rows.map((r) => r.toPost)), lines: rows.map((r) => ({ assetId: r.asset.id, amount: r.toPost })), journalEntryId: posted.id };
  const assets = s3.assets.map((a) => { const l = run.lines.find((x) => x.assetId === a.id); return l ? { ...a, accumulated: r2(a.accumulated + l.amount) } : a; });
  return [audit({ ...s3, depreciationRuns: [...s3.depreciationRuns, run], assets }, 'depreciation_run', id, 'I', `Dotations ${fy.label} comptabilisées · ${run.total}`, entityId), run];
}

export interface RegisterRow {
  asset: Asset;
  category?: AssetCategory;
  nbv: number;
  yearDotation: number; // the current fiscal year's scheduled dotation
  progress: number; // 0..1 depreciated
}

export function assetRegister(state: State, entityId: Id, year = Number(state.today.slice(0, 4))): RegisterRow[] {
  return state.assets
    .filter((a) => a.entityId === entityId)
    .map((asset) => ({ asset, category: state.assetCategories.find((c) => c.id === asset.categoryId), nbv: r2(asset.cost - asset.accumulated), yearDotation: asset.status === 'in_service' ? depreciationSchedule(asset).find((r) => r.year === year)?.dotation ?? 0 : 0, progress: asset.cost - asset.residual > 0 ? Math.min(1, asset.accumulated / (asset.cost - asset.residual)) : 0 }))
    .sort((a, b) => (a.asset.code < b.asset.code ? -1 : 1));
}
