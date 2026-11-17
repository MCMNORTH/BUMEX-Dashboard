-- =====================================================================
--  BUMEX ERP — migration 0019: the WHT per invoice line, the invoices' notes in French and English
--  Applies on top of 0001–0018.
--
--  Asked on 2026-11-17: the WHT (the withholding a client keeps, 7 %) is chosen on each line, beside its VAT, as the
--  old invoices printed it. A line keeps its WHT code and rate (0 = none); the invoice's withholding stays its total
--  (one code, on the HT of the lines bearing it). Lines from before have neither: they bear the invoice's WHT.
--  Credit note lines copy their invoice's lines, so they carry the same two columns.
--  The invoices' notes, edited in Fiscalité › Mentions des factures: each tax code's, in French and English
--  (tax_code.legal_mention_en; the French one prints when it is empty). The WHT's (RAS-7) is the GTA Project's text,
--  where it was still the chart's default; GTA-EXO, EXO, EXP-0 and the WHT get their English where they had none and
--  their French is still the chart's (a note someone rewrote is not given a translation of another text).
-- =====================================================================
set search_path to erp, public;

alter table erp.sales_invoice_line
  add column if not exists withholding_code_id uuid references erp.tax_code(id),
  add column if not exists withholding_rate    numeric(7,4) check (withholding_rate is null or withholding_rate >= 0);

alter table erp.credit_note_line
  add column if not exists withholding_code_id uuid references erp.tax_code(id),
  add column if not exists withholding_rate    numeric(7,4) check (withholding_rate is null or withholding_rate >= 0);

alter table erp.tax_code add column if not exists legal_mention_en text;

update erp.tax_code
   set legal_mention_fr = 'Facture émise dans le cadre du régime fiscal spécifique du Projet GTA (Mauritanie–Sénégal). La retenue à la source (WHT) est prélevée par le Client et reversée à l''Unité Conjointe.'
 where code = 'RAS-7' and (legal_mention_fr is null or legal_mention_fr = 'Prestation soumise à la retenue à la source de 7 % — le client retient et reverse au Trésor');
update erp.tax_code set legal_mention_en = 'Invoice issued under the specific tax regime of the GTA Project (Mauritania–Senegal). The withholding tax (WHT) is withheld by the Client and remitted to the Joint Unit.'
 where code = 'RAS-7' and legal_mention_en is null and legal_mention_fr like 'Facture émise dans le cadre du régime fiscal spécifique du Projet GTA%';
update erp.tax_code set legal_mention_en = 'VAT not applicable in accordance with the GTA tax regime'
 where code = 'GTA-EXO' and legal_mention_en is null and legal_mention_fr = 'Prestation exonérée de TVA — sous-traitant enregistré au régime fiscal du projet GTA';
update erp.tax_code set legal_mention_en = 'VAT-exempt service'
 where code = 'EXO' and legal_mention_en is null and legal_mention_fr = 'Prestation exonérée de TVA';
update erp.tax_code set legal_mention_en = 'Export of services — VAT at 0 %'
 where code = 'EXP-0' and legal_mention_en is null and legal_mention_fr = 'Exportation de services — TVA 0 %';
