// BUMEX One's finance records (invoices, payments, receipts, transfers, bank statements) became an archive on
// 2026-10-25: BUMEX Vanguard's ERP keeps the books, starting fresh. The records stay readable; nobody creates, edits
// or deletes them any more (lib/firebase/policies.ts refuses the writes, the pages hide their forms).
export const FINANCE_ARCHIVED = true;

export const ARCHIVED_FINANCE_TABLES = new Set(["invoices", "payments", "receipts", "transfers", "bank_statements", "bank_statement_lines"]);
