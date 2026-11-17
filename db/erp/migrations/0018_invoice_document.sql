-- =====================================================================
--  BUMEX ERP — migration 0018: the invoice as printed, its QR code, the favourite banks
--  Applies on top of 0001–0017.
--
--  Asked on 2026-11-17: the invoice laid out as BUMEX's model (vanguard/one/InvoiceSheet.tsx), its QR code opening it
--  on a page anyone with the code reads without signing in (app/i/[token]), the payment block from the treasury's
--  accounts, the favourite ones first and the default.
--  - erp.sales_invoice.public_token: the invoice's link, unguessable (a random uuid per invoice); the page reads the
--    invoice by it alone (lib/erp/invoice-link.ts), nothing else of the books.
--  - erp.bank_account.favorite: a favourite account comes first in the lists and is the new invoice's bank.
--  - BUMEX SA's letterhead, where it is still empty, from the model (address, phone, fax, e-mail, web, NIF, capital).
-- =====================================================================
set search_path to erp, public;

alter table erp.sales_invoice add column if not exists public_token uuid not null default gen_random_uuid();
create unique index if not exists sales_invoice_public_token_uq on erp.sales_invoice (public_token);

alter table erp.bank_account add column if not exists favorite boolean not null default false;

update erp.entity set
  address_lines    = coalesce(nullif(trim(address_lines), ''), E'301, Rue Cheikh Saad Bouh Kane\nExtension Module B suite Tavragh Zeina\nBP : 7763 Nouakchott'),
  phone            = coalesce(nullif(trim(phone), ''), '45 25 26 26'),
  fax              = coalesce(nullif(trim(fax), ''), '45 25 51 51'),
  email            = coalesce(nullif(trim(email), ''), 'bumex@bumex.mr'),
  web              = coalesce(nullif(trim(web), ''), 'www.bumex.mr'),
  nif              = coalesce(nullif(trim(nif), ''), '21100778'),
  capital_amount   = coalesce(capital_amount, 10000000),
  capital_currency = coalesce(capital_currency, 'MRU')
where code = 'bumex_sa';
