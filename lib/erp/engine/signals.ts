import type { State, Id, Entity } from './types';
import { r2, sum } from './money';
import { cashPosition } from './bank';
import { aging } from './sales';
import { balanceByPrefix } from './ledger';
import { canSee } from './core';

export type Signal = 'good' | 'warn' | 'crit' | 'off';

export interface FloorSignals {
  entity: Entity;
  visible: boolean;
  cash: number;
  cashSignal: Signal;
  overdue: number;
  overdueCount: number;
  over90Count: number;
  overdueSignal: Signal;
  lateEngagements: number;
  engagements: number;
  engagementSignal: Signal;
  drafts: number;
  unmatchedBank: number;
  draftSignal: Signal;
  pendingApprovals: number;
  revenue: number; // posted revenue of the current fiscal year, functional currency
  result: number;
  receivables: number;
  payables: number;
}

export function floorSignals(state: State, entityId: Id): FloorSignals {
  const entity = state.entities.find((e) => e.id === entityId)!;
  const visible = canSee(state, entityId);
  const cash = cashPosition(state, entityId);
  const ag = aging(state, entityId);
  const eng = state.engagements.filter((e) => e.entityId === entityId && e.status === 'active');
  const late = eng.filter((e) => e.deadline < state.today).length;
  const drafts = state.entries.filter((e) => e.entityId === entityId && e.status === 'draft').length;
  const unmatchedBank = state.bankTransactions.filter((t) => t.status === 'unmatched' && state.bankAccounts.find((b) => b.id === t.bankAccountId)?.entityId === entityId).length;
  const pendingApprovals = state.supplierInvoices.filter((s) => s.entityId === entityId && s.status === 'pending_approval').length;
  const fy = state.fiscalYears.find((f) => f.entityId === entityId && state.today >= f.start && state.today <= f.end);
  const from = fy?.start;
  const revenue = r2(-balanceByPrefix7(state, entityId, from));
  const expenses = r2(balanceByPrefix(state, entityId, '6'));
  const result = r2(revenue - expenses);
  return {
    entity,
    visible,
    cash,
    cashSignal: !visible ? 'off' : cash >= entity.cashThreshold ? 'good' : cash >= entity.cashThreshold * 0.7 ? 'warn' : 'crit',
    overdue: ag.overdue,
    overdueCount: ag.overdueCount,
    over90Count: ag.over90Count,
    overdueSignal: !visible ? 'off' : ag.overdueCount === 0 ? 'good' : ag.over90Count > 0 || ag.overdueCount > 5 ? 'crit' : 'warn',
    lateEngagements: late,
    engagements: eng.length,
    engagementSignal: !visible ? 'off' : late === 0 ? 'good' : late > 3 ? 'crit' : 'warn',
    drafts,
    unmatchedBank,
    draftSignal: !visible ? 'off' : drafts + unmatchedBank === 0 ? 'good' : drafts + unmatchedBank > 10 ? 'warn' : 'warn',
    pendingApprovals,
    revenue,
    result,
    receivables: ag.total,
    payables: r2(-balanceByPrefix(state, entityId, '40')),
  };
}

function balanceByPrefix7(state: State, entityId: Id, from?: string): number {
  let b = 0;
  for (const e of state.entries) {
    if (e.entityId !== entityId || e.status === 'draft') continue;
    if (from && e.date < from) continue;
    for (const l of e.lines) {
      const a = state.accounts.find((x) => x.id === l.accountId);
      if (a && a.code.startsWith('7')) b = r2(b + l.debit - l.credit);
    }
  }
  return b;
}

export function allFloors(state: State): FloorSignals[] {
  return [...state.entities].sort((a, b) => a.floorOrder - b.floorOrder).map((e) => floorSignals(state, e.id));
}

export interface GroupFigures {
  floors: FloorSignals[];
  sumRevenue: number;
  intercompanyRevenue: number;
  consolidatedRevenue: number;
  result: number;
  cash: number;
  overdue: number;
  overdueCount: number;
}

export function groupFigures(state: State): GroupFigures {
  // [bumex-one] the test floor is no part of the group
  const floors = allFloors(state).filter((f) => !f.entity.isTest);
  const test = new Set(state.entities.filter((e) => e.isTest).map((e) => e.id));
  const ic = sum(state.salesInvoices.filter((i) => i.status !== 'draft' && !test.has(i.entityId) && state.customers.find((c) => c.id === i.customerId)?.groupEntityId).map((i) => r2(i.totalHt * i.fxRate)));
  const sumRevenue = sum(floors.map((f) => f.revenue));
  return { floors, sumRevenue, intercompanyRevenue: ic, consolidatedRevenue: r2(sumRevenue - ic), result: sum(floors.map((f) => f.result)), cash: sum(floors.map((f) => f.cash)), overdue: sum(floors.map((f) => f.overdue)), overdueCount: floors.reduce((a, f) => a + f.overdueCount, 0) };
}
