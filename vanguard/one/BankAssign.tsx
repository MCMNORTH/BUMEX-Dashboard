import { useMemo, useState } from 'react';
import {
  assignStatementLine, addBankRule, updateBankRule, deleteBankRule, recordPayment, paySupplierInvoice, openInvoices, suggestFor, ruleMatches, findAccountByCode,
  arAccountFor, apAccountFor, mapped, canOpenRoom, parseAmount, fmt, r2, DomainError,
  type Id, type State, type Account, type BankTransaction, type BankRule, type StatementSplit,
} from '@bumex/domain';
import { useStore } from '../store';
import { Chip, Field } from '../ui/common';
import { confirmAsk } from './ask';
import { Select, Suggest } from '../ui/Select';
import { useSay, sayNow } from './say';
import { englishMessage } from './engine-messages';
// [bumex-one] bilingual: every text follows the person's language, say('français', 'English') (vanguard/one/say.ts, 2026-11-21)

// [bumex-one] Banque › Rapprochement and Banque › Règles (asked by Sidaty on 2026-11-18, lib/erp/engine/bank.ts): a
// statement line to any account with its third party, split over several accounts, or settling an open invoice; rules
// on the label that propose the account and book the lines they recognise.

type Party = '' | 'customer' | 'supplier' | 'employee';
type Row = { code: string; party: Party; partyId: string; description: string; amount: string };

type Say = (fr: string, en: string) => string;

const PARTY_LABEL: Record<Exclude<Party, ''>, [string, string]> = { customer: ['Client', 'Client'], supplier: ['Fournisseur', 'Supplier'], employee: ['Salarié', 'Employee'] };

function accountOf(state: State, entityId: Id, code: string): Account | undefined {
  const c = code.trim().split(/\s/)[0];
  return c ? findAccountByCode(state, entityId, c) : undefined;
}

// the accounts a line can go to: any postable account but the bank accounts' own (a transfer has its action)
function useTargets(entityId: Id, say: Say, without?: Id) {
  const { state } = useStore();
  return useMemo(() => {
    const banks = new Set(state.bankAccounts.filter((b) => b.entityId === entityId).map((b) => b.glAccountId));
    const accounts = state.accounts.filter((a) => a.entityId === entityId && a.isPostable && a.active && !banks.has(a.id) && a.id !== without).sort((a, b) => a.code.localeCompare(b.code));
    return {
      options: accounts.map((a) => ({ value: a.code, label: `${a.code} ${a.nameFr}${a.isAuxiliary ? say(' (auxiliaire)', ' (auxiliary)') : ''}` })),
      customers: state.customers.filter((c) => c.entityId === entityId).sort((a, b) => a.name.localeCompare(b.name)),
      suppliers: state.suppliers.filter((c) => c.entityId === entityId).sort((a, b) => a.name.localeCompare(b.name)),
      employees: state.employees.filter((e) => e.entityId === entityId && e.status !== 'left').sort((a, b) => a.lastName.localeCompare(b.lastName)),
    };
  }, [state, entityId, without, say]);
}

// An account and its third party. Choosing a client or a supplier fills its own account when none is chosen yet; an
// account that requires a client or a supplier fixes the kind of third party.
function AccountParty({ entityId, row, onChange, without }: { entityId: Id; row: Pick<Row, 'code' | 'party' | 'partyId'>; onChange: (patch: Partial<Row>) => void; without?: Id }) {
  const { state } = useStore();
  const say = useSay();
  const t = useTargets(entityId, say, without);
  const a = accountOf(state, entityId, row.code);
  const forced: Party = a?.requiresCustomer ? 'customer' : a?.requiresSupplier ? 'supplier' : '';
  const party = forced || row.party;
  const pickParty = (id: string) => {
    const patch: Partial<Row> = { party, partyId: id };
    const own = !id ? undefined
      : party === 'customer' ? (() => { const c = t.customers.find((x) => x.id === id); return c ? arAccountFor(state, entityId, c) : undefined; })()
      : party === 'supplier' ? (() => { const c = t.suppliers.find((x) => x.id === id); return c ? apAccountFor(state, entityId, c) : undefined; })()
      : party === 'employee' ? (() => { try { return mapped(state, entityId, 'NET_PAYABLE'); } catch { return undefined; } })()
      : undefined;
    if (own && (!a || a.requiresCustomer || a.requiresSupplier || !row.code.trim())) patch.code = own.code;
    onChange(patch);
  };
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <div style={{ width: 230 }}>
        <Suggest className="in mono" recent="account-codes" options={t.options} value={row.code} onChange={(e) => {
          const next = accountOf(state, entityId, e.target.value);
          onChange({ code: e.target.value, ...(next?.requiresCustomer ? { party: 'customer' as Party } : next?.requiresSupplier ? { party: 'supplier' as Party } : {}) });
        }} aria-label={say('Compte', 'Account')} placeholder={say('compte : code ou nom', 'account: code or name')} />
      </div>
      <Select className="in" style={{ width: 120 }} value={party} disabled={!!forced} onChange={(e) => onChange({ party: e.target.value as Party, partyId: '' })} aria-label={say('Tiers', 'Third party')}>
        <option value="">{say('Sans tiers', 'No third party')}</option>
        {(['customer', 'supplier', 'employee'] as const).map((p) => <option key={p} value={p}>{say(...PARTY_LABEL[p])}</option>)}
      </Select>
      {party === 'customer' && <Select recent="customers" className="in" style={{ width: 200 }} value={row.partyId} onChange={(e) => pickParty(e.target.value)} aria-label={say('Client', 'Client')}><option value="">{say('— client —', '— client —')}</option>{t.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}
      {party === 'supplier' && <Select recent="suppliers" className="in" style={{ width: 200 }} value={row.partyId} onChange={(e) => pickParty(e.target.value)} aria-label={say('Fournisseur', 'Supplier')}><option value="">{say('— fournisseur —', '— supplier —')}</option>{t.suppliers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}
      {party === 'employee' && <Select className="in" style={{ width: 200 }} value={row.partyId} onChange={(e) => pickParty(e.target.value)} aria-label={say('Salarié', 'Employee')}><option value="">{say('— salarié —', '— employee —')}</option>{t.employees.map((c) => <option key={c.id} value={c.id}>{c.lastName} {c.firstName}</option>)}</Select>}
      <span className="small muted">{a ? a.nameFr : row.code.trim() ? say('compte inconnu', 'unknown account') : ''}</span>
    </div>
  );
}

const partyOf = (r: Pick<Row, 'party' | 'partyId'>) => ({
  customerId: r.party === 'customer' && r.partyId ? r.partyId : undefined,
  supplierId: r.party === 'supplier' && r.partyId ? r.partyId : undefined,
  employeeId: r.party === 'employee' && r.partyId ? r.partyId : undefined,
});

// what a rule should look for, from a label: its words without the numbers and dates that change from line to line
export function patternFrom(label: string): string {
  return label.replace(/[0-9]+([/.\-:][0-9]+)*/g, ' ').replace(/\b(N°|NO|REF)\b/gi, ' ').replace(/[°#]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function AssignLine({ entityId, txn, parked, onDone }: { entityId: Id; txn: BankTransaction; parked: boolean; onDone: () => void }) {
  const { state, apply } = useStore();
  const say = useSay();
  const bank = state.bankAccounts.find((b) => b.id === txn.bankAccountId)!;
  const total = r2(Math.abs(txn.amount));
  const incoming = txn.amount > 0;
  const suspense = useMemo(() => { try { return mapped(state, entityId, 'SUSPENSE'); } catch { return undefined; } }, [state, entityId]);
  const canClients = canOpenRoom(state, entityId, 'clients'), canSuppliers = canOpenRoom(state, entityId, 'suppliers');
  type Mode = 'accounts' | 'invoice';
  const [mode, setMode] = useState<Mode>('accounts');
  const [rows, setRows] = useState<Row[]>(() => {
    const rule = state.bankRules.find((r) => r.accountId && !r.builtIn && ruleMatches(r, txn));
    const code = rule ? state.accounts.find((a) => a.id === rule.accountId)?.code ?? '' : '';
    const party: Party = rule?.customerId ? 'customer' : rule?.supplierId ? 'supplier' : rule?.employeeId ? 'employee' : '';
    return [{ code, party, partyId: rule?.customerId ?? rule?.supplierId ?? rule?.employeeId ?? '', description: '', amount: String(total) }];
  });
  const [date, setDate] = useState(txn.date);
  const [makeRule, setMakeRule] = useState(false);
  const [pattern, setPattern] = useState(() => patternFrom(txn.description));
  const [invoiceId, setInvoiceId] = useState('');

  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const splits: StatementSplit[] = rows.map((r) => ({ accountId: accountOf(state, entityId, r.code)?.id ?? (r.code.trim() ? `?${r.code}` : ''), amount: parseAmount(r.amount) ?? 0, description: r.description || undefined, ...partyOf(r) }));
  const spread = r2(splits.reduce((a, s) => a + s.amount, 0));
  const left = r2(total - spread);

  // the invoices this line can settle: a client's for money in, a supplier's for money out, in the account's currency
  const invoices = useMemo(() => {
    if (parked) return [];
    if (incoming) return canClients ? openInvoices(state, entityId).filter((o) => o.invoice.currency === bank.currency).map((o) => ({ id: o.invoice.id, label: `${o.invoice.number} · ${o.customer.name} · ${say('reste', 'remaining')} ${fmt(o.openTxn)}`, open: o.openTxn })) : [];
    if (!canSuppliers) return [];
    return state.supplierInvoices.filter((i) => i.entityId === entityId && i.status === 'posted' && i.currency === bank.currency).map((i) => {
      const s = state.suppliers.find((x) => x.id === i.supplierId);
      return { id: i.id, label: `${i.number ?? i.supplierRef} · ${s?.name ?? ''} · ${say('reste', 'remaining')} ${fmt(r2(i.netPayable - i.amountPaid))}`, open: r2(i.netPayable - i.amountPaid) };
    });
  }, [state, entityId, parked, incoming, canClients, canSuppliers, bank.currency, say]);
  const invoice = invoices.find((i) => i.id === invoiceId);

  const check = useMemo(() => {
    try {
      if (mode === 'invoice') {
        if (!invoice) return say('Choisissez la facture', 'Choose the invoice');
        if (incoming) {
          const inv = state.salesInvoices.find((i) => i.id === invoice.id)!;
          recordPayment(state, { entityId, customerId: inv.customerId, date: txn.date, currency: bank.currency, amountTxn: txn.amount, bankAccountId: bank.id, invoiceId: inv.id, bankTransactionId: txn.id });
        } else paySupplierInvoice(state, { invoiceId: invoice.id, date: txn.date, bankAccountId: bank.id, amount: total, bankTransactionId: txn.id });
        return null;
      }
      let s = state;
      if (makeRule && rows.length === 1) s = addBankRule(s, { entityId, pattern, accountId: splits[0].accountId, ...partyOf(rows[0]) })[0];
      assignStatementLine(s, txn.id, splits, undefined, parked ? date : undefined);
      return null;
    } catch (err) {
      return err instanceof DomainError ? say(err.message, englishMessage(err.message)) : String(err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, mode, invoice, rows, date, makeRule, pattern, say]);

  const save = () => {
    if (mode === 'invoice' && invoice) {
      const ok = incoming
        ? apply((s) => { const inv = s.salesInvoices.find((i) => i.id === invoice.id)!; return recordPayment(s, { entityId, customerId: inv.customerId, date: txn.date, currency: bank.currency, amountTxn: txn.amount, bankAccountId: bank.id, invoiceId: inv.id, bankTransactionId: txn.id, reference: txn.reference ?? inv.number }); }, sayNow('Encaissement comptabilisé, facture lettrée, ligne rapprochée', 'Receipt posted, invoice matched, line reconciled'))
        : apply((s) => paySupplierInvoice(s, { invoiceId: invoice.id, date: txn.date, bankAccountId: bank.id, amount: total, reference: txn.reference, bankTransactionId: txn.id }), sayNow('Règlement comptabilisé, facture fournisseur lettrée, ligne rapprochée', 'Payment posted, supplier invoice matched, line reconciled'));
      if (ok) onDone();
      return;
    }
    const rule = makeRule && rows.length === 1;
    const ok = apply((s) => {
      const s1 = rule ? addBankRule(s, { entityId, pattern, accountId: splits[0].accountId, ...partyOf(rows[0]) })[0] : s;
      return assignStatementLine(s1, txn.id, splits, rule ? `nouvelle règle « ${pattern} »` : undefined, parked ? date : undefined);
    }, parked ? sayNow('Ligne reclassée hors du compte d\'attente', 'Line reclassified out of the suspense account') : rule ? sayNow('Ligne comptabilisée · règle créée pour les suivantes', 'Line posted · rule created for the next ones') : sayNow('Ligne comptabilisée', 'Line posted'));
    if (ok) onDone();
  };

  const partyAccount = rows.some((r) => { const a = accountOf(state, entityId, r.code); return a?.requiresCustomer || a?.requiresSupplier; });
  return (
    <div style={{ padding: '10px 4px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <b>{parked ? say(`Reclasser hors de l'attente${suspense ? ` (${suspense.code})` : ''}`, `Reclassify out of suspense${suspense ? ` (${suspense.code})` : ''}`) : incoming ? say('Affecter l\'entrée', 'Assign the inflow') : say('Affecter la sortie', 'Assign the outflow')} · {bank.currency} {fmt(total)}</b>
        {invoices.length > 0 && <>
          <button className={`btn sm ${mode === 'accounts' ? 'on' : ''}`} onClick={() => setMode('accounts')}>{say('Comptes', 'Accounts')}</button>
          <button className={`btn sm ${mode === 'invoice' ? 'on' : ''}`} onClick={() => setMode('invoice')}>{incoming ? say('Facture client', 'Client invoice') : say('Facture fournisseur', 'Supplier invoice')}</button>
        </>}
        <span className="small muted" style={{ marginLeft: 'auto' }}>{txn.description}</span>
      </div>
      {mode === 'invoice' ? (
        <Field label={incoming ? say('Facture client ouverte', 'Open client invoice') : say('Facture fournisseur à régler', 'Supplier invoice to pay')}>
          <Select className="in" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}><option value="">{say('— facture —', '— invoice —')}</option>{invoices.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}</Select>
        </Field>
      ) : (
        <>
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <AccountParty entityId={entityId} row={r} onChange={(p) => setRow(i, p)} without={parked ? suspense?.id : undefined} />
              <input className="in" style={{ width: 180 }} value={r.description} onChange={(e) => setRow(i, { description: e.target.value })} placeholder={say('libellé (celui du relevé)', 'description (the statement\'s)')} aria-label={say(`Libellé ligne ${i + 1}`, `Description line ${i + 1}`)} />
              <input className="in num" style={{ width: 120 }} value={r.amount} onChange={(e) => setRow(i, { amount: e.target.value })} aria-label={say(`Montant ligne ${i + 1}`, `Amount line ${i + 1}`)} />
              {rows.length > 1 && <button type="button" className="btn sm" aria-label={say('Retirer la ligne', 'Remove the line')} onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))}>×</button>}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn sm" onClick={() => setRows((rs) => [...rs, { code: '', party: '', partyId: '', description: '', amount: left > 0 ? String(left) : '' }])}>{say('+ répartir sur un autre compte', '+ split over another account')}</button>
            {left !== 0 && <Chip kind="warn">{left > 0 ? say(`reste ${fmt(left)} à répartir`, `${fmt(left)} left to split`) : say(`${fmt(-left)} de trop`, `${fmt(-left)} too much`)}</Chip>}
            {parked && <Field label={say('Date du reclassement', 'Reclassification date')} style={{ margin: 0 }}><input className="in mono" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>}
          </div>
          {rows.length === 1 && (
            <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="checkbox" checked={makeRule} onChange={(e) => setMakeRule(e.target.checked)} />
              {say('Créer une règle : les libellés contenant', 'Create a rule: descriptions containing')}
              <input className="in" style={{ width: 240 }} value={pattern} onChange={(e) => setPattern(e.target.value)} disabled={!makeRule} aria-label={say('Libellé à reconnaître', 'Text to recognise')} />
              {say('iront à ce compte', 'will go to this account')}{rows[0].partyId ? say(' et ce tiers', ' and this third party') : ''}
            </label>
          )}
          {partyAccount && <div className="small muted">{say(`Un compte de tiers ne lettre aucune facture : pour solder une facture, choisissez « ${incoming ? 'Facture client' : 'Facture fournisseur'} »${parked ? ' depuis une ligne non encore mise en attente' : ''}.`, `A third-party account matches no invoice: to settle an invoice, choose “${incoming ? 'Client invoice' : 'Supplier invoice'}”${parked ? ' from a line not yet moved to suspense' : ''}.`)}</div>}
        </>
      )}
      {check && (mode === 'invoice' ? !!invoiceId : left === 0) && <div className="banner warn">{check}</div>}
      <div className="actions">
        <button className="btn" onClick={onDone}>{say('Annuler', 'Cancel')}</button>
        <button className="btn primary" disabled={!!check} onClick={save}>{parked ? say('Reclasser', 'Reclassify') : say('Comptabiliser', 'Post')}</button>
      </div>
    </div>
  );
}

// Banque › Règles: the rules people make (stored), and the chart's (given, read-only).
export function BankRules({ entityId }: { entityId: Id }) {
  const { state, apply } = useStore();
  const say = useSay();
  const banks = state.bankAccounts.filter((b) => b.entityId === entityId && b.active !== false && !b.isCash);
  const own = state.bankRules.filter((r) => r.entityId === entityId && !r.builtIn && r.accountId);
  const chart = state.bankRules.filter((r) => r.entityId === entityId && r.builtIn);
  const pending = state.bankTransactions.filter((t) => t.status === 'unmatched' && banks.some((b) => b.id === t.bankAccountId));
  const [editing, setEditing] = useState<Id | null>(null);
  const empty = { pattern: '', label: '', code: '', party: '' as Party, partyId: '', bankAccountId: '' };
  const [form, setForm] = useState(empty);
  const load = (r: BankRule | null) => {
    setEditing(r?.id ?? null);
    setForm(r ? { pattern: r.pattern, label: r.label, code: state.accounts.find((a) => a.id === r.accountId)?.code ?? '', party: r.customerId ? 'customer' : r.supplierId ? 'supplier' : r.employeeId ? 'employee' : '', partyId: r.customerId ?? r.supplierId ?? r.employeeId ?? '', bankAccountId: r.bankAccountId ?? '' } : empty);
  };
  const input = { pattern: form.pattern, label: form.label || undefined, accountId: accountOf(state, entityId, form.code)?.id ?? '', ...partyOf(form), bankAccountId: form.bankAccountId || undefined };
  const check = useMemo(() => {
    try { if (editing) updateBankRule(state, editing, input); else addBankRule(state, { entityId, ...input }); return null; } catch (err) { return err instanceof DomainError ? say(err.message, englishMessage(err.message)) : String(err); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, editing, form, say]);
  const recognised = (r: Pick<BankRule, 'pattern' | 'bankAccountId' | 'accountId' | 'builtIn'>) => pending.filter((t) => ruleMatches(r as BankRule, t)).length;
  const preview = form.pattern.trim().length >= 3 ? recognised({ pattern: form.pattern, bankAccountId: form.bankAccountId || undefined, accountId: 'x' }) : 0;
  const partyName = (r: BankRule) => r.customerId ? state.customers.find((c) => c.id === r.customerId)?.name : r.supplierId ? state.suppliers.find((c) => c.id === r.supplierId)?.name : r.employeeId ? (() => { const e = state.employees.find((c) => c.id === r.employeeId); return e ? `${e.lastName} ${e.firstName}` : undefined; })() : undefined;
  const save = () => {
    const ok = editing ? apply((s) => updateBankRule(s, editing, input), sayNow('Règle modifiée', 'Rule updated')) : apply((s) => addBankRule(s, { entityId, ...input }), preview ? sayNow(`Règle créée · ${preview} ligne(s) à comptabiliser dans Rapprochement`, `Rule created · ${preview} line(s) to post in Reconciliation`) : sayNow('Règle créée', 'Rule created'));
    if (ok) load(null);
  };
  return (
    <div className="cols">
      <div className="grow">
        <div className="card flush">
          <div style={{ padding: 10 }} className="small muted">{say("Une ligne de relevé dont le libellé contient les mots d'une règle est proposée à son compte et son tiers ; « Comptabiliser par les règles » (Rapprochement) les passe toutes d'un coup. Les règles d'un compte bancaire passent avant celles de tous les comptes.", 'A statement line whose description contains the words of a rule is suggested to its account and third party; “Post by rules” (Reconciliation) posts them all at once. The rules of a bank account come before those for all accounts.')}</div>
          <table>
            <thead><tr><th>{say('Le libellé contient', 'Description contains')}</th><th>{say('Compte', 'Account')}</th><th>{say('Tiers', 'Third party')}</th><th>{say('Compte bancaire', 'Bank account')}</th><th className="num">{say('Lignes à traiter', 'Lines to process')}</th><th></th></tr></thead>
            <tbody>
              {own.length === 0 && <tr><td colSpan={6} className="muted small">{say('Aucune règle : créez-en une ici, ou en affectant une ligne (case « Créer une règle »).', 'No rules: create one here, or while assigning a line (the “Create a rule” box).')}</td></tr>}
              {own.map((r) => {
                const a = state.accounts.find((x) => x.id === r.accountId);
                const n = recognised(r);
                return (
                  <tr key={r.id} className={r.id === editing ? 'sel' : ''}>
                    <td><b>{r.pattern.split('|').join(' · ')}</b><div className="small muted">{r.label}</div></td>
                    <td className="mono">{a ? `${a.code} ${a.nameFr}` : '—'}</td>
                    <td className="small">{partyName(r) ?? '—'}</td>
                    <td className="small">{r.bankAccountId ? state.bankAccounts.find((b) => b.id === r.bankAccountId)?.name : say('Tous', 'All')}</td>
                    <td className="num">{n ? <Chip kind="warn">{n}</Chip> : '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn sm" onClick={() => load(r)}>{say('Modifier', 'Edit')}</button>{' '}
                      <button className="btn sm" onClick={() => { const id = r.id!; void confirmAsk({ title: sayNow(`Supprimer la règle « ${r.pattern} » ?`, `Delete the rule “${r.pattern}”?`), message: sayNow('Les lignes déjà comptabilisées ne changent pas.', 'Lines already posted do not change.'), confirm: sayNow('Supprimer', 'Delete'), danger: true }).then((ok) => { if (ok) apply((s) => deleteBankRule(s, id), sayNow('Règle supprimée', 'Rule deleted')); }); }}>{say('Supprimer', 'Delete')}</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="card" style={{ marginTop: 12 }}>
          <h2>{say('Règles fournies avec le plan', 'Rules supplied with the chart')}</h2>
          <table>
            <thead><tr><th>{say('Le libellé contient', 'Description contains')}</th><th>{say('Destination', 'Destination')}</th><th className="num">{say('Lignes à traiter', 'Lines to process')}</th></tr></thead>
            <tbody>
              {chart.map((r) => {
                let dest = say('Virement interne : vers un autre compte bancaire ou la caisse', 'Internal transfer: to another bank account or the cash desk');
                if (r.mappingKey !== 'TRANSFER') { try { const a = mapped(state, entityId, r.mappingKey!); dest = `${a.code} ${a.nameFr}`; } catch { dest = say('compte non paramétré', 'account not set up'); } }
                return <tr key={r.id ?? r.mappingKey}><td className="mono small">{r.pattern.split('|').join(' · ')}</td><td className="small">{r.label} · {dest}</td><td className="num">{recognised(r) || '—'}</td></tr>;
              })}
            </tbody>
          </table>
          <div className="small muted" style={{ marginTop: 6 }}>{say('Une règle créée ici passe avant celles-ci : pour envoyer « VIREMENT INTERNE » à un compte de virements de fonds, créez-la.', 'A rule created here comes before these: to send “VIREMENT INTERNE” to a funds transfer account, create it.')}</div>
        </div>
      </div>
      <aside className="side">
        <div className="card">
          <h2>{editing ? say('Modifier la règle', 'Edit the rule') : say('Nouvelle règle', 'New rule')}</h2>
          <Field label={say('Le libellé contient (| entre plusieurs formulations)', 'Description contains (| between several wordings)')}><input className="in" value={form.pattern} onChange={(e) => setForm({ ...form, pattern: e.target.value })} placeholder="CERTIFICATION CHEQUE" /></Field>
          <Field label={say('Compte et tiers', 'Account and third party')}><AccountParty entityId={entityId} row={form} onChange={(p) => setForm((f) => ({ ...f, ...p }))} /></Field>
          <Field label={say('Sur le compte bancaire', 'On the bank account')}>
            <Select className="in" value={form.bankAccountId} onChange={(e) => setForm({ ...form, bankAccountId: e.target.value })}><option value="">{say('Tous les comptes', 'All accounts')}</option>{banks.map((b) => <option key={b.id} value={b.id}>{b.bankName} · {b.name} ({b.currency})</option>)}</Select>
          </Field>
          <Field label={say('Nom (facultatif)', 'Name (optional)')}><input className="in" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder={say('ex. Frais de certification', 'e.g. Certification fees')} /></Field>
          {form.pattern.trim().length >= 3 && <div className="small" style={{ margin: '6px 0' }}>{say('Reconnaît ', 'Recognises ')}<b>{preview}</b>{say(' ligne(s) à traiter.', ' line(s) to process.')}</div>}
          {check && form.pattern.trim() && form.code.trim() && <div className="banner warn">{check}</div>}
          <div className="actions" style={{ marginTop: 8 }}>
            {editing && <button className="btn" onClick={() => load(null)}>{say('Annuler', 'Cancel')}</button>}
            <button className="btn primary" disabled={!!check} onClick={save}>{editing ? say('Enregistrer', 'Save') : say('Créer la règle', 'Create the rule')}</button>
          </div>
        </div>
      </aside>
    </div>
  );
}

// a line's proposition, as the reconciliation reads it (in the language of the moment it is called, unless given a say)
export function propositionOf(state: State, txn: BankTransaction, parked: boolean, say: Say = sayNow): { label: string; kind: 'good' | 'warn' } {
  if (!parked) {
    const s = suggestFor(state, txn);
    // the engine words its suggestions in French (lib/erp/engine/bank.ts suggestFor); a rule's own label stays as written
    const label = s.kind === 'none' ? say(s.label, 'No match')
      : s.kind === 'payment' ? say(s.label, s.label.replace(/^Encaissement /, 'Receipt ').replace(/ %$/, '%'))
      : s.kind === 'invoice' ? say(s.label, s.label.replace(/^Encaisser /, 'Collect '))
      : s.label;
    return { label, kind: s.kind === 'none' ? 'warn' : 'good' };
  }
  const rule = state.bankRules.find((r) => r.accountId && !r.builtIn && ruleMatches(r, txn));
  return rule ? { label: rule.label, kind: 'good' } : { label: say('À expliquer', 'To explain'), kind: 'warn' };
}

