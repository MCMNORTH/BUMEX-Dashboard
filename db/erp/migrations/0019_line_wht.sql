-- =====================================================================
--  BUMEX ERP — migration 0019: the WHT per invoice line
--  Applies on top of 0001–0018.
--
--  Asked on 2026-11-17: the WHT (the withholding a client keeps, 7 %) is chosen on each line, beside its VAT, as the
--  old invoices printed it. A line keeps its WHT code and rate (0 = none); the invoice's withholding stays its total
--  (one code, on the HT of the lines bearing it). Lines from before have neither: they bear the invoice's WHT.
--  Credit note lines copy their invoice's lines, so they carry the same two columns.
-- =====================================================================
set search_path to erp, public;

alter table erp.sales_invoice_line
  add column if not exists withholding_code_id uuid references erp.tax_code(id),
  add column if not exists withholding_rate    numeric(7,4) check (withholding_rate is null or withholding_rate >= 0);

alter table erp.credit_note_line
  add column if not exists withholding_code_id uuid references erp.tax_code(id),
  add column if not exists withholding_rate    numeric(7,4) check (withholding_rate is null or withholding_rate >= 0);
