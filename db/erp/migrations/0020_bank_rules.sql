-- =====================================================================
--  BUMEX ERP — migration 0020: the statement-line rules people make
--  Applies on top of 0001–0019.
--
--  Asked on 2026-11-18 (Sidaty, Banque › Rapprochement): a statement line goes to any account of the chart, with its
--  third party, and rules on the label book the lines they recognise ("CERTIFICATION CHEQUE" → the bank fees,
--  "UNITE MIXTE" → 432004). A rule: the words the label contains ("|" between alternatives, any case or accents), the
--  account, at most one third party, and optionally the one bank account whose lines it reads. The chart's own rules
--  (fees, interest, internal transfer) are not stored: every entity has the same (lib/erp/engine/chart.ts).
--  The lines booked by assignment or reclassified out of the suspense account are ordinary entries (postingRule
--  bank_assignment.v1 / bank_reclass.v1): no other change of the schema.
-- =====================================================================
set search_path to erp, public;

create table if not exists erp.bank_rule (
  id               uuid primary key default gen_random_uuid(),
  entity_id        uuid not null references erp.entity(id),
  pattern          text not null check (length(replace(btrim(pattern), '|', '')) >= 3),
  label            text not null,
  account_id       uuid not null references erp.account(id),
  customer_id      uuid references erp.customer(id),
  supplier_id      uuid references erp.supplier(id),
  employee_id      uuid references erp.employee(id),
  bank_account_id  uuid references erp.bank_account(id),
  created_by       text not null default erp.actor_id(),
  created_at       timestamptz not null default now(),
  check (num_nonnulls(customer_id, supplier_id, employee_id) <= 1)
);
create index if not exists bank_rule_entity on erp.bank_rule (entity_id);

alter table erp.bank_rule enable row level security;
alter table erp.bank_rule force row level security;
drop policy if exists by_entity on erp.bank_rule;
create policy by_entity on erp.bank_rule using (erp.can_see_entity(entity_id));

drop trigger if exists audit_bank_rule on erp.bank_rule;
create trigger audit_bank_rule after insert or update or delete on erp.bank_rule
  for each row execute function erp.audit_row();

grant select, insert, update, delete on erp.bank_rule to erp_app;
