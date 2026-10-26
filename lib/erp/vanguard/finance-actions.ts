"use server";

import { canRoleAccessRoute } from "@/lib/auth/permissions";
import { requireErpAccess } from "@/lib/erp/server";
import { getBankStatements, getInvoices, getPayments, getTransfers } from "@/lib/finance/service";

// The Reports room's "Archives financières" part (vanguard/one/FinanceArchive.tsx): BUMEX One's finance records,
// read-only since the ERP keeps the books (choice of 2026-10-24; the database refuses every change: work.finance_*,
// 0008), for the people its Finance pages were for.

export type FinanceArchive = {
  invoices: { id: string; number: string; client: string | null; project: string | null; issued: string; due: string; ht: number; tax: number; ttc: number; currency: string; status: string; approved: boolean }[];
  payments: { id: string; client: string | null; invoice: string | null; amount: number; currency: string; date: string | null; due: string | null; method: string; status: string; reference: string | null }[];
  transfers: { id: string; reference: string; beneficiary: string; bank: string | null; amount: number; currency: string; date: string; status: string; category: string; entity: string }[];
  statements: { id: string; label: string; account: string; date: string; currency: string; lines: number }[];
} | null;

export async function financeArchiveAction(): Promise<FinanceArchive> {
  const { auth } = await requireErpAccess();
  if (!canRoleAccessRoute(auth.role, "finance")) return null;
  const role = auth.role;
  const [invoices, payments, transfers, statements] = await Promise.all([
    getInvoices(role).catch(() => []),
    getPayments(role).catch(() => []),
    getTransfers(role).catch(() => []),
    getBankStatements(role).catch(() => []),
  ]);
  return {
    invoices: invoices.map((i) => ({ id: i.id, number: i.invoice_number, client: i.client?.name ?? null, project: i.project?.name ?? null, issued: i.issue_date, due: i.due_date, ht: i.amount_ht, tax: i.tax_amount, ttc: i.amount_ttc, currency: i.currency, status: i.status, approved: i.approval_status === "approved" })),
    payments: payments.map((p) => ({ id: p.id, client: p.client?.name ?? null, invoice: p.invoice?.invoice_number ?? null, amount: p.amount, currency: p.currency, date: p.payment_date, due: p.due_date, method: p.method, status: p.status, reference: p.reference })),
    transfers: transfers.map((t) => ({ id: t.id, reference: t.transfer_reference, beneficiary: t.beneficiary_name, bank: t.beneficiary_bank, amount: t.amount, currency: t.currency, date: t.transfer_date, status: t.status, category: t.category, entity: t.entity })),
    statements: statements.map((s) => ({ id: s.id, label: s.statement_label, account: s.account_label, date: s.statement_date, currency: s.currency, lines: s.lines.length })),
  };
}
