import "server-only";

import { isErpDatabaseConfigured, withErpSystemSession, type ErpTransaction } from "@/lib/erp/db";
import type { InvoiceSheetData } from "@/vanguard/one/InvoiceSheet";

// An invoice read by its link (its QR code, /i/<token>, migration 0018), for anyone who has the link: the invoice, its
// lines, its entity's letterhead, its customer and the bank printed on it, nothing else. The token is a random uuid
// per invoice; the server reads for nobody in particular ("invoice-link"), every entity visible, like an invitation.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LinkedInvoice = { data: Omit<InvoiceSheetData, "url">; customerCountry: string | null };

type InvoiceRow = {
  id: string; entity_id: string; number: string | null; status: string; date: string; due_date: string; currency: string; payment_mode: string;
  total_ht: number; total_tax: number; total_ttc: number; withholding_rate: number; withholding_amount: number; net_payable: number; legal_mention: string | null;
  bank_account_id: string | null; gta_vat: boolean;
  e_name: string; e_country: string; e_address: string | null; e_phone: string | null; e_fax: string | null; e_email: string | null; e_web: string | null;
  e_nif: string | null; e_capital: number | null; e_capital_currency: string | null; e_logo: string | null;
  c_name: string; c_address: string | null; c_nif: string | null; c_country: string | null;
};
type LineRow = { line_no: number; description: string; quantity: number; unit_price: number; tax_rate: number | null; line_ht: number };
type BankRow = { bank_name: string | null; account_holder: string | null; iban: string | null; bic: string | null; account_number: string | null; rib: string | null };

const opt = <T,>(v: T | null | undefined) => (v === null || v === undefined || v === "" ? undefined : v);

export async function findInvoiceByLink(token: string): Promise<LinkedInvoice | null> {
  if (typeof token !== "string" || !UUID.test(token) || !isErpDatabaseConfigured()) return null;
  return withErpSystemSession("invoice-link", (tx) => readInvoiceByLink(tx, token));
}

// in a system session (erp.open_system_session)
export async function readInvoiceByLink(tx: ErpTransaction, token: string): Promise<LinkedInvoice | null> {
  if (typeof token !== "string" || !UUID.test(token)) return null;
  const [inv] = await tx.query<InvoiceRow>(
    `select i.id, i.entity_id, i.number, i.status::text as status, i.invoice_date::text as date, i.due_date::text as due_date, i.currency::text as currency,
            coalesce(nullif(trim(i.payment_mode), ''), 'Virement') as payment_mode,
            i.total_ht::float8 as total_ht, i.total_tax::float8 as total_tax, i.total_ttc::float8 as total_ttc,
            coalesce(i.withholding_rate, 0)::float8 as withholding_rate, coalesce(i.withholding_amount, 0)::float8 as withholding_amount,
            coalesce(i.net_payable, i.total_ttc)::float8 as net_payable, i.legal_mention_fr as legal_mention, i.bank_account_id,
            exists (select 1 from erp.sales_invoice_line l join erp.tax_code t on t.id = l.tax_code_id where l.invoice_id = i.id and t.code = 'GTA-EXO') as gta_vat,
            e.name as e_name, e.country::text as e_country, e.address_lines as e_address, e.phone as e_phone, e.fax as e_fax, e.email as e_email,
            e.web as e_web, e.nif as e_nif, e.capital_amount::float8 as e_capital, e.capital_currency::text as e_capital_currency, e.logo_url as e_logo,
            c.name as c_name, c.nif as c_nif, c.country::text as c_country,
            coalesce(nullif(trim(c.address_lines), ''),
                     (select nullif(concat_ws(E'\\n', nullif(trim(w.address), ''), nullif(trim(w.city), '')), '') from work.client w where w.id = c.client_id)) as c_address
       from erp.sales_invoice i
       join erp.entity e on e.id = i.entity_id
       join erp.customer c on c.id = i.customer_id
      where i.public_token = $1::uuid`,
    [token],
  );
  if (!inv) return null;
  const lines = await tx.query<LineRow>(
    `select line_no, description, quantity::float8 as quantity, unit_price::float8 as unit_price, tax_rate_snapshot::float8 as tax_rate, line_ht::float8 as line_ht
       from erp.sales_invoice_line where invoice_id = $1 order by line_no`,
    [inv.id],
  );
  // the invoice's bank, else the one Vanguard prints by default (invoiceBankFor in lib/erp/engine/bank.ts)
  const [bank] = await tx.query<BankRow>(
    `select bank_name, account_holder, iban, bic, account_number, rib from erp.bank_account
      where ${inv.bank_account_id ? "id = $1" : "entity_id = $1 and active and not is_cash"}
      order by (favorite and currency = $2) desc, favorite desc, (show_on_invoices and currency = $2) desc, (currency = $2) desc, name
      limit 1`,
    [inv.bank_account_id ?? inv.entity_id, inv.currency],
  );
  const data: LinkedInvoice["data"] = {
    number: opt(inv.number),
    status: inv.status,
    date: inv.date,
    dueDate: inv.due_date,
    currency: inv.currency,
    paymentMode: inv.payment_mode,
    lines: lines.map((l) => ({ lineNo: l.line_no, description: l.description, quantity: l.quantity, unitPrice: l.unit_price, taxRateSnapshot: l.tax_rate ?? 0, lineHt: l.line_ht })),
    totalHt: inv.total_ht,
    totalTax: inv.total_tax,
    totalTtc: inv.total_ttc,
    withholdingRate: inv.withholding_rate,
    withholdingAmount: inv.withholding_amount,
    netPayable: inv.net_payable,
    legalMention: opt(inv.legal_mention),
    gtaVat: inv.gta_vat,
    entity: {
      name: inv.e_name, country: inv.e_country, address: opt(inv.e_address), phone: opt(inv.e_phone), fax: opt(inv.e_fax), email: opt(inv.e_email),
      web: opt(inv.e_web), nif: opt(inv.e_nif), capitalAmount: opt(inv.e_capital), capitalCurrency: opt(inv.e_capital_currency), logoUrl: opt(inv.e_logo),
    },
    customer: { name: inv.c_name, address: opt(inv.c_address), nif: opt(inv.c_nif) },
    bank: bank && bank.bank_name
      ? { bankName: bank.bank_name, accountHolder: opt(bank.account_holder), iban: opt(bank.iban), bic: opt(bank.bic), accountNumber: opt(bank.account_number), rib: opt(bank.rib) }
      : undefined,
  };
  return { data, customerCountry: inv.c_country };
}
