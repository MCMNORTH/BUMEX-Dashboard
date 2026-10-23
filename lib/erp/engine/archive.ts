import type { State, Id, ISODate, ArchiveRecord, ArchiveKind, ArchiveStatus, Engagement, Customer } from './types';
import { DomainError } from './types';
import { nextId, nextNumber, audit, PARTNER_ROLES } from './core';
import { addDays } from './money';

// The archive rack of the clients room is a physical interface to these records: every box or binder on it
// is one ArchiveRecord, placed by (bay, shelf, slot). The geometry below is shared with the 3D scene.
export const RACK = { bays: 3, shelves: 5, slotsPerShelf: 4 } as const;
export const RACK_CAPACITY = RACK.bays * RACK.shelves * RACK.slotsPerShelf;

export interface ArchiveInput {
  engagementId: Id;
  date?: ISODate;
  kind?: ArchiveKind;
  boxCount?: number;
  retentionYears?: number; // 10 by default: statutory retention of accounting records in Mauritania and Morocco
  notes?: string;
  label?: string;
  status?: ArchiveStatus;
  retrievedBy?: string;
  retrievedAt?: ISODate;
}

export function slotKey(bay: number, shelf: number, slot: number): string {
  return `${bay}-${shelf}-${slot}`;
}

// Fill order reads like a page: top shelf of bay A left → right, then bay B, bay C, then the next shelf down.
// Boxes therefore sit in archive-date order; destroyed boxes free their slot for the next file.
export function nextFreeSlot(state: State, entityId: Id): { bay: number; shelf: number; slot: number } | null {
  const used = new Set(state.archives.filter((a) => a.entityId === entityId && a.status !== 'destroyed').map((a) => slotKey(a.bay, a.shelf, a.slot)));
  for (let shelf = 1; shelf <= RACK.shelves; shelf++)
    for (let bay = 1; bay <= RACK.bays; bay++)
      for (let slot = 1; slot <= RACK.slotsPerShelf; slot++) if (!used.has(slotKey(bay, shelf, slot))) return { bay, shelf, slot };
  return null;
}

export function archiveEngagement(state: State, input: ArchiveInput): [State, ArchiveRecord] {
  const eng = state.engagements.find((e) => e.id === input.engagementId);
  if (!eng) throw new DomainError('engagement_missing', 'Mission inconnue');
  if (eng.status !== 'completed') throw new DomainError('not_completed', 'Seule une mission terminée peut être archivée');
  if (eng.archiveId && state.archives.some((a) => a.id === eng.archiveId && a.status !== 'destroyed')) throw new DomainError('already_archived', 'Cette mission est déjà sur le rayonnage');
  const place = nextFreeSlot(state, eng.entityId);
  if (!place) throw new DomainError('rack_full', 'Rayonnage complet : détruire des boîtes en fin de conservation ou ajouter une baie');
  const date = input.date ?? state.today;
  const [s1, reference] = nextNumber(state, eng.entityId, 'archive', '', date, 'ARC-{YYYY}-{SEQ4}', 'year');
  const [s2, id] = nextId(s1, 'arc');
  const customer = s2.customers.find((c) => c.id === eng.customerId);
  const record: ArchiveRecord = {
    id,
    entityId: eng.entityId,
    engagementId: eng.id,
    reference,
    archivedAt: date,
    retentionUntil: addDays(date, Math.round((input.retentionYears ?? 10) * 365.25)),
    status: input.status ?? 'archived',
    ...place,
    kind: input.kind ?? 'box',
    label: input.label ?? `${eng.code} · ${customer?.name ?? ''}`.trim(),
    boxCount: input.boxCount ?? 1,
    notes: input.notes,
    retrievedBy: input.retrievedBy,
    retrievedAt: input.retrievedAt,
  };
  const s3: State = { ...s2, archives: [...s2.archives, record], engagements: s2.engagements.map((e) => (e.id === eng.id ? { ...e, archiveId: id } : e)) };
  return [audit(s3, 'archive', id, 'I', `Dossier archivé · ${reference} · ${eng.name}`, eng.entityId), record];
}

function patchArchive(state: State, id: Id, patch: Partial<ArchiveRecord>, summary: string): [State, ArchiveRecord] {
  const a = state.archives.find((x) => x.id === id);
  if (!a) throw new DomainError('archive_missing', 'Boîte d\'archives inconnue');
  const next = { ...a, ...patch };
  return [audit({ ...state, archives: state.archives.map((x) => (x.id === id ? next : x)) }, 'archive', id, 'U', summary, a.entityId), next];
}

// A box taken off the rack for consultation: it keeps its slot, the slot shows as empty with a tag.
export function retrieveArchive(state: State, id: Id, by?: string): [State, ArchiveRecord] {
  const a = state.archives.find((x) => x.id === id);
  if (!a) throw new DomainError('archive_missing', 'Boîte d\'archives inconnue');
  if (a.status !== 'archived' && a.status !== 'pending_destruction') throw new DomainError('archive_state', 'Cette boîte n\'est pas sur le rayonnage');
  return patchArchive(state, id, { status: 'retrieved', retrievedBy: by ?? state.session.actorName, retrievedAt: state.today }, `Boîte sortie · ${a.reference}`);
}

export function returnArchive(state: State, id: Id): [State, ArchiveRecord] {
  const a = state.archives.find((x) => x.id === id);
  if (!a) throw new DomainError('archive_missing', 'Boîte d\'archives inconnue');
  if (a.status !== 'retrieved') throw new DomainError('archive_state', 'Cette boîte n\'est pas sortie');
  const status: ArchiveStatus = a.retentionUntil <= state.today ? 'pending_destruction' : 'archived';
  return patchArchive(state, id, { status, retrievedBy: undefined, retrievedAt: undefined }, `Boîte remise en place · ${a.reference}`);
}

export function destroyArchive(state: State, id: Id): [State, ArchiveRecord] {
  const a = state.archives.find((x) => x.id === id);
  if (!a) throw new DomainError('archive_missing', 'Boîte d\'archives inconnue');
  if (a.retentionUntil > state.today) throw new DomainError('retention', `Conservation en cours jusqu'au ${a.retentionUntil}`);
  if (!PARTNER_ROLES.includes(state.session.role)) throw new DomainError('forbidden', 'Seul un associé peut autoriser une destruction');
  const [s, rec] = patchArchive(state, id, { status: 'destroyed' }, `Boîte détruite · ${a.reference}`);
  return [{ ...s, engagements: s.engagements.map((e) => (e.id === a.engagementId ? { ...e, archiveId: undefined } : e)) }, rec];
}

export interface ArchiveRow {
  record: ArchiveRecord;
  engagement: Engagement;
  customer?: Customer;
  year: string;
}

export interface ArchiveFilter {
  q?: string;
  status?: ArchiveStatus | 'all';
  year?: string;
  kind?: ArchiveKind | 'all';
  customerId?: Id;
}

export function archiveRows(state: State, entityId: Id, filter: ArchiveFilter = {}): ArchiveRow[] {
  const q = (filter.q ?? '').trim().toLowerCase();
  const rows: ArchiveRow[] = [];
  for (const record of state.archives) {
    if (record.entityId !== entityId) continue;
    if (filter.status && filter.status !== 'all' && record.status !== filter.status) continue;
    if (!filter.status && record.status === 'destroyed') continue;
    if (filter.kind && filter.kind !== 'all' && record.kind !== filter.kind) continue;
    const engagement = state.engagements.find((e) => e.id === record.engagementId);
    if (!engagement) continue;
    if (filter.customerId && engagement.customerId !== filter.customerId) continue;
    const customer = state.customers.find((c) => c.id === engagement.customerId);
    const year = record.archivedAt.slice(0, 4);
    if (filter.year && year !== filter.year) continue;
    if (q) {
      const hay = `${record.reference} ${record.label} ${engagement.code} ${engagement.name} ${engagement.kind} ${customer?.name ?? ''} ${record.notes ?? ''}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }
    rows.push({ record, engagement, customer, year });
  }
  return rows.sort((a, b) => a.record.bay - b.record.bay || a.record.shelf - b.record.shelf || a.record.slot - b.record.slot);
}

export interface RackLayout {
  bays: number;
  shelves: number;
  slotsPerShelf: number;
  capacity: number;
  used: number;
  items: ArchiveRow[]; // everything physically on the rack (retrieved boxes keep their slot and are drawn as a tag)
  years: string[];
}

export function rackLayout(state: State, entityId: Id): RackLayout {
  const items = archiveRows(state, entityId).filter((r) => r.record.status !== 'destroyed');
  return {
    ...RACK,
    capacity: RACK_CAPACITY,
    used: items.length,
    items,
    years: [...new Set(items.map((r) => r.year))].sort(),
  };
}

// Engagements that are finished and still on a desk: the "à archiver" queue.
export function archiveQueue(state: State, entityId: Id): Engagement[] {
  return state.engagements.filter((e) => e.entityId === entityId && e.status === 'completed' && !e.archiveId);
}
