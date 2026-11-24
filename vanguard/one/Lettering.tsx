import { Fragment, useMemo, useState } from 'react';
import {
  recordPayment, letterPayment, unletterAllocation, paymentRemainder, unletteredPayments, settlementCandidates, settleInvoiceDifference, settleOverpayment,
  keepDifferenceOpen, openInvoices, favoritesFirst, mapped, settlementTolerance, fmt, r2, parseAmount, DomainError,
  type Id, type Currency, type State, type CustomerPayment, type PaymentAllocationInput,
} from '@bumex/domain';
import { useStore } from '../store';
import { Chip, D, Field } from '../ui/common';
import { Select } from '../ui/Select';
import { useSay, sayNow } from './say';
import { textAsk } from './ask';
import { englishMessage } from './engine-messages';

// [bumex-one] Clients › Encaissements, on Sidaty's corrections (2026-11-23; lib/erp/engine/sales.ts):
// - a receipt spread over several invoices of its client (one statement line, one receipt, its allocations);
// - a receipt not wholly lettered keeps its remainder, lettered later; an allocation is undone with a reason;
// - a small difference (up to the entity's tolerance, 500 MRU) is the administrator's decision: a loss (or a gain), or
//   kept open (asked on 2026-11-24); beyond the tolerance, settled with a reason and the account chosen.

type Amounts = Record<Id, string>; // invoice → the amount typed

// a client's open invoices in a currency, oldest first
function openOf(state: State, entityId: Id, customerId: Id, currency: Currency) {
  return openInvoices(state, entityId).filter((o) => o.customer.id === customerId && o.invoice.currency === currency).sort((a, b) => (a.invoice.date < b.invoice.date ? -1 : a.invoice.date > b.invoice.date ? 1 : 0));
}

// an amount spread over invoices, the oldest first
export function spread(total: number, open: { id: Id; open: number }[]): Amounts {
  const out: Amounts = {};
  let left = r2(total);
  for (const o of open) {
    if (left <= 0) break;
    const take = r2(Math.min(left, o.open));
    out[o.id] = String(take);
    left = r2(left - take);
  }
  return out;
}

export const allocationsOf = (amounts: Amounts): PaymentAllocationInput[] =>
  Object.entries(amounts).map(([invoiceId, v]) => ({ invoiceId, amountTxn: parseAmount(v) ?? 0 })).filter((a) => a.amountTxn > 0);

const errorOf = (err: unknown) => (err instanceof DomainError ? err.message : String(err));

// The open invoices of a client and what goes to each; what is left of the receipt below.
export function AllocationEditor({ entityId, customerId, currency, total, amounts, onChange }: { entityId: Id; customerId: Id; currency: Currency; total: number; amounts: Amounts; onChange: (a: Amounts) => void }) {
  const { state } = useStore();
  const say = useSay();
  const open = useMemo(() => openOf(state, entityId, customerId, currency), [state, entityId, customerId, currency]);
  const lettered = r2(allocationsOf(amounts).reduce((a, x) => a + x.amountTxn, 0));
  const left = r2(total - lettered);
  if (!open.length) return <div className="small muted">{say(`Aucune facture ouverte en ${currency} pour ce client : l'encaissement restera à lettrer.`, `No open invoice in ${currency} for this client: the receipt will stay to letter.`)}</div>;
  return (
    <div>
      <table>
        <thead><tr><th>{say('Facture', 'Invoice')}</th><th>{say('Échéance', 'Due')}</th><th className="num">{say('Reste dû', 'Open')}</th><th className="num">{say('À lettrer', 'To letter')}</th></tr></thead>
        <tbody>
          {open.map((o) => (
            <tr key={o.invoice.id}>
              <td className="mono">{o.invoice.number}</td><td><D iso={o.invoice.dueDate} /></td><td className="num">{fmt(o.openTxn)}</td>
              <td className="num"><input className="in num" style={{ width: 120 }} value={amounts[o.invoice.id] ?? ''} onChange={(e) => onChange({ ...amounts, [o.invoice.id]: e.target.value })} aria-label={say(`À lettrer sur ${o.invoice.number}`, `To letter on ${o.invoice.number}`)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
        <button type="button" className="btn sm" onClick={() => onChange(spread(total, open.map((o) => ({ id: o.invoice.id, open: o.openTxn }))))}>{say('Répartir (les plus anciennes d’abord)', 'Spread (oldest first)')}</button>
        <span className="small">{say('Lettré', 'Lettered')} {fmt(lettered)}</span>
        {left > 0.004 && <Chip kind="warn">{say(`reste ${fmt(left)} à lettrer plus tard`, `${fmt(left)} left to letter later`)}</Chip>}
        {left < -0.004 && <Chip kind="crit">{say(`${fmt(-left)} de plus que l'encaissement`, `${fmt(-left)} more than the receipt`)}</Chip>}
      </div>
    </div>
  );
}

// The receipt form: a client, an amount, the invoices it settles.
function ReceiptForm({ entityId, preselect }: { entityId: Id; preselect: Id | null }) {
  const { state, apply } = useStore();
  const say = useSay();
  const first = preselect ? state.salesInvoices.find((i) => i.id === preselect) : undefined;
  const customers = useMemo(() => state.customers.filter((c) => c.entityId === entityId).sort((a, b) => a.name.localeCompare(b.name)), [state, entityId]);
  const [customerId, setCustomerId] = useState(first?.customerId ?? '');
  const [currency, setCurrency] = useState<Currency>(first?.currency ?? 'MRU');
  const [amount, setAmount] = useState(first ? String(r2(first.netPayable - first.amountPaidTxn)) : '');
  const [amounts, setAmounts] = useState<Amounts>(first ? { [first.id]: String(r2(first.netPayable - first.amountPaidTxn)) } : {});
  const [date, setDate] = useState(state.today);
  const [ref, setRef] = useState(first?.number ?? '');
  const banks = favoritesFirst(state.bankAccounts.filter((b) => b.entityId === entityId && b.active !== false && b.currency === currency));
  const [bankId, setBankId] = useState(banks[0]?.id ?? '');
  const bank = banks.find((b) => b.id === bankId) ?? banks[0];
  const total = parseAmount(amount) ?? 0;
  const input = { entityId, customerId, date, currency, amountTxn: total, bankAccountId: bank?.id ?? '', allocations: allocationsOf(amounts), reference: ref || undefined };
  const check = useMemo(() => {
    if (!customerId || !bank || !(total > 0)) return say('Client, montant et compte bancaire requis', 'Client, amount and bank account required');
    try { recordPayment(state, input); return null; } catch (err) { return sayNow(errorOf(err), englishMessage(errorOf(err))); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, customerId, bank, total, amounts, date, currency, say]);
  const pickCustomer = (id: string) => {
    setCustomerId(id);
    setAmounts({});
    const c = customers.find((x) => x.id === id);
    if (c?.defaultCurrency) { setCurrency(c.defaultCurrency); const b = favoritesFirst(state.bankAccounts.filter((x) => x.entityId === entityId && x.active !== false && x.currency === c.defaultCurrency))[0]; if (b) setBankId(b.id); }
  };
  const save = () => {
    const ok = apply((s) => recordPayment(s, input), input.allocations.length ? say('Encaissement comptabilisé et lettré', 'Receipt posted and lettered') : say('Encaissement comptabilisé, à lettrer', 'Receipt posted, to letter'));
    if (ok) { setAmount(''); setAmounts({}); setRef(''); }
  };
  return (
    <div className="card">
      <h2>{say('Encaissement', 'Receipt')}</h2>
      <Field label={say('Client', 'Client')}><Select recent="customers" className="in" value={customerId} onChange={(e) => pickCustomer(e.target.value)}><option value="">{say('— client —', '— client —')}</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <Field label={say('Devise', 'Currency')} style={{ width: 90 }}><Select className="in" value={currency} onChange={(e) => { const c = e.target.value as Currency; setCurrency(c); setAmounts({}); const b = favoritesFirst(state.bankAccounts.filter((x) => x.entityId === entityId && x.active !== false && x.currency === c))[0]; setBankId(b?.id ?? ''); }}>{(['MRU', 'EUR', 'USD', 'MAD'] as Currency[]).map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label={say('Montant reçu', 'Amount received')} style={{ flex: 1 }}><input className="in num" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      </div>
      <Field label={say('Date', 'Date')} style={{ marginTop: 8 }}><input className="in mono" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label={say('Compte bancaire (même devise)', 'Bank account (same currency)')} style={{ marginTop: 8 }}><Select className="in" value={bank?.id ?? ''} onChange={(e) => setBankId(e.target.value)}>{banks.map((b) => <option key={b.id} value={b.id}>{b.favorite ? '★ ' : ''}{b.bankName} · {b.name}</option>)}</Select></Field>
      <Field label={say('Référence', 'Reference')} style={{ marginTop: 8 }}><input className="in" value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
      {customerId && <div style={{ marginTop: 10 }}><AllocationEditor entityId={entityId} customerId={customerId} currency={currency} total={total} amounts={amounts} onChange={setAmounts} /></div>}
      {check && customerId && total > 0 && <div className="banner warn" style={{ marginTop: 8 }}>{check}</div>}
      <button className="btn primary" style={{ marginTop: 10, width: '100%', justifyContent: 'center' }} disabled={!!check} onClick={save}>{say("Enregistrer l'encaissement", 'Save receipt')}</button>
      <div className="small muted" style={{ marginTop: 8 }}>{say("Un encaissement peut régler plusieurs factures du client ; ce qui n'est pas lettré reste à lettrer. En devise, l'écart entre le cours de chaque facture et celui du jour va en 778 / 678.", "A receipt can settle several of the client's invoices; what is not lettered stays to letter. In a foreign currency, each invoice's difference between its rate and the day's goes to 778 / 678.")}</div>
    </div>
  );
}

// Lettering a receipt's remainder, inline under its row.
function LetterLater({ entityId, payment, onDone }: { entityId: Id; payment: CustomerPayment; onDone: () => void }) {
  const { state, apply } = useStore();
  const say = useSay();
  const left = paymentRemainder(state, payment);
  const [amounts, setAmounts] = useState<Amounts>({});
  const [date, setDate] = useState(payment.date);
  const allocations = allocationsOf(amounts);
  const check = useMemo(() => {
    if (!allocations.length) return say('Indiquez les montants à lettrer', 'Enter the amounts to letter');
    try { letterPayment(state, payment.id, allocations, { date }); return null; } catch (err) { return sayNow(errorOf(err), englishMessage(errorOf(err))); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, amounts, date, say]);
  return (
    <div style={{ padding: '8px 4px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <b>{say(`Lettrer ${payment.number} · reste ${payment.currency} ${fmt(left)}`, `Letter ${payment.number} · ${payment.currency} ${fmt(left)} left`)}</b>
      <AllocationEditor entityId={entityId} customerId={payment.customerId} currency={payment.currency} total={left} amounts={amounts} onChange={setAmounts} />
      <Field label={say('Date des écarts de change (celle de l’encaissement, ou une période ouverte)', 'Date of the FX differences (the receipt’s, or an open period)')} style={{ maxWidth: 360 }}><input className="in mono" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      {check && allocations.length > 0 && <div className="banner warn">{check}</div>}
      <div className="actions"><button className="btn" onClick={onDone}>{say('Annuler', 'Cancel')}</button><button className="btn primary" disabled={!!check} onClick={() => { if (apply((s) => letterPayment(s, payment.id, allocations, { date }), say('Encaissement lettré', 'Receipt lettered'))) onDone(); }}>{say('Lettrer', 'Letter')}</button></div>
    </div>
  );
}

// The administrator's decisions on the small differences, and settling a larger one with a reason.
export function SettlementDecisions({ entityId }: { entityId: Id }) {
  const { state, apply } = useStore();
  const say = useSay();
  const admin = state.session.role === 'admin';
  const candidates = settlementCandidates(state, entityId);
  const tolerance = settlementTolerance(state, entityId);
  const func = state.entities.find((e) => e.id === entityId)?.functionalCurrency ?? 'MRU';
  const codeOf = (key: string) => { try { return mapped(state, entityId, key).code; } catch { return say('non paramétré', 'not set'); } };
  const [beyond, setBeyond] = useState(false);
  const partial = openInvoices(state, entityId).filter((o) => state.allocations.some((a) => a.invoiceId === o.invoice.id) && o.openFunctional > tolerance);
  const [form, setForm] = useState<{ invoiceId: Id; account: 'SETTLEMENT_LOSS' | 'BANK_FEES' | 'FX_LOSS'; reason: string } | null>(null);
  const why = admin ? undefined : say("Décision réservée à l'administrateur", 'Decision reserved for the administrator');
  if (!candidates.length && !partial.length) return null;
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>{say('Écarts de règlement', 'Settlement differences')}</h2>
        {candidates.length > 0 && <Chip kind="warn">{say(`${candidates.length} à décider`, `${candidates.length} to decide`)}</Chip>}
        <span className="small muted">{say(`jusqu'à ${fmt(tolerance)} ${func} · décision de l'administrateur`, `up to ${fmt(tolerance)} ${func} · the administrator's decision`)}</span>
      </div>
      {candidates.length > 0 && (
        <table style={{ marginTop: 8 }}>
          <thead><tr><th>{say('Document', 'Document')}</th><th>{say('Client', 'Client')}</th><th className="num">{say('Écart', 'Difference')}</th><th></th></tr></thead>
          <tbody>
            {candidates.map((c) => (
              <tr key={c.kind + (c.kind === 'invoice' ? c.invoice.id : c.payment.id)}>
                <td>{c.kind === 'invoice' ? say(`Facture ${c.invoice.number} · reste dû`, `Invoice ${c.invoice.number} · still owed`) : say(`Encaissement ${c.payment.number} · trop-perçu`, `Receipt ${c.payment.number} · overpaid`)}</td>
                <td>{c.customer.name}</td>
                <td className="num">{c.kind === 'invoice' ? c.invoice.currency : c.payment.currency} {fmt(c.amount)}{c.functional !== c.amount ? <span className="small muted"> · {fmt(c.functional)} {func}</span> : null}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {c.kind === 'invoice'
                    ? <button className="btn sm primary" disabled={!admin} title={why} onClick={() => apply((s) => settleInvoiceDifference(s, c.invoice.id), say(`Écart passé en perte (${codeOf('SETTLEMENT_LOSS')}), facture soldée`, `Difference booked as a loss (${codeOf('SETTLEMENT_LOSS')}), invoice settled`))}>{say(`En perte · ${codeOf('SETTLEMENT_LOSS')}`, `As a loss · ${codeOf('SETTLEMENT_LOSS')}`)}</button>
                    : <button className="btn sm primary" disabled={!admin} title={why} onClick={() => apply((s) => settleOverpayment(s, c.payment.id), say(`Trop-perçu passé en produit (${codeOf('SETTLEMENT_GAIN')})`, `Overpayment booked as income (${codeOf('SETTLEMENT_GAIN')})`))}>{say(`En produit · ${codeOf('SETTLEMENT_GAIN')}`, `As income · ${codeOf('SETTLEMENT_GAIN')}`)}</button>}
                  {' '}<button className="btn sm" disabled={!admin} title={why} onClick={() => apply((s) => keepDifferenceOpen(s, c.kind, c.kind === 'invoice' ? c.invoice.id : c.payment.id), say('Écart laissé ouvert', 'Difference kept open'))}>{c.kind === 'invoice' ? say('Laisser ouverte', 'Keep open') : say('Laisser à lettrer', 'Keep to letter')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {admin && partial.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <button className="btn sm" onClick={() => setBeyond((b) => !b)}>{beyond ? say('Masquer', 'Hide') : say(`Solder un écart au-delà du seuil… (${partial.length})`, `Settle a difference beyond the threshold… (${partial.length})`)}</button>
          {beyond && (
            <table style={{ marginTop: 6 }}>
              <tbody>
                {partial.map((o) => (
                  <Fragment key={o.invoice.id}>
                    <tr><td className="mono">{o.invoice.number}</td><td>{o.customer.name}</td><td className="num">{o.invoice.currency} {fmt(o.openTxn)}</td><td><button className="btn sm" onClick={() => setForm({ invoiceId: o.invoice.id, account: 'BANK_FEES', reason: '' })}>{say('Solder avec écart…', 'Settle with a difference…')}</button></td></tr>
                    {form?.invoiceId === o.invoice.id && (
                      <tr><td colSpan={4}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                          <Field label={say('Compte', 'Account')}><Select className="in" value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value as typeof form.account })}>
                            <option value="BANK_FEES">{say(`Frais bancaires · ${codeOf('BANK_FEES')}`, `Bank fees · ${codeOf('BANK_FEES')}`)}</option>
                            <option value="SETTLEMENT_LOSS">{say(`Écarts de règlement · ${codeOf('SETTLEMENT_LOSS')}`, `Settlement differences · ${codeOf('SETTLEMENT_LOSS')}`)}</option>
                            <option value="FX_LOSS">{say(`Perte de change · ${codeOf('FX_LOSS')}`, `FX loss · ${codeOf('FX_LOSS')}`)}</option>
                          </Select></Field>
                          <Field label={say('Motif (obligatoire)', 'Reason (required)')} style={{ flex: 1, minWidth: 220 }}><input className="in" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder={say('ex. frais retenus par la banque du client', "e.g. fees kept by the client's bank")} /></Field>
                          <button className="btn" onClick={() => setForm(null)}>{say('Annuler', 'Cancel')}</button>
                          <button className="btn primary" disabled={form.reason.trim().length < 4} onClick={() => { let accountId: Id | undefined; try { accountId = mapped(state, entityId, form.account).id; } catch { accountId = undefined; } if (apply((s) => settleInvoiceDifference(s, form.invoiceId, { accountId, reason: form.reason }), say('Facture soldée avec écart', 'Invoice settled with a difference'))) setForm(null); }}>{say('Solder', 'Settle')}</button>
                        </div>
                      </td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// Clients › Encaissements: the receipts, what each lettered and has left, and the form.
export function ReceiptsRoom({ entityId, preselect }: { entityId: Id; preselect: Id | null }) {
  const { state, apply } = useStore();
  const say = useSay();
  const [filter, setFilter] = useState<'all' | 'open'>('all');
  const [openId, setOpenId] = useState<Id | null>(null);
  const [letterId, setLetterId] = useState<Id | null>(null);
  const unlettered = unletteredPayments(state, entityId);
  const payments = (filter === 'open' ? unlettered.map((u) => u.payment) : state.customerPayments.filter((p) => p.entityId === entityId)).slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, filter === 'open' ? 500 : 60);
  const unletter = async (allocationId: Id, label: string) => {
    const reason = await textAsk({ title: say('Délettrer', 'Unletter'), message: label, label: say('Motif', 'Reason'), required: true, confirm: say('Délettrer', 'Unletter'), danger: true });
    if (reason) apply((s) => unletterAllocation(s, allocationId, reason), say('Lettrage annulé, facture rouverte', 'Lettering undone, invoice reopened'));
  };
  return (
    <div className="cols">
      <div className="grow">
        <SettlementDecisions entityId={entityId} />
        <div className="card flush">
          <div style={{ display: 'flex', gap: 4, padding: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className={`btn sm ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>{say('Récents', 'Recent')}</button>
            <button className={`btn sm ${filter === 'open' ? 'on' : ''}`} onClick={() => setFilter('open')}>{say(`Non lettrés · ${unlettered.length}`, `Not lettered · ${unlettered.length}`)}</button>
          </div>
          <table>
            <thead><tr><th>{say('N°', 'No.')}</th><th>{say('Date', 'Date')}</th><th>{say('Client', 'Client')}</th><th className="num">{say('Montant', 'Amount')}</th><th className="num">{say('Lettré', 'Lettered')}</th><th className="num">{say('Reste', 'Left')}</th><th>{say('Rapproché', 'Reconciled')}</th><th></th></tr></thead>
            <tbody>
              {payments.length === 0 && <tr><td colSpan={8} className="muted small">{say('Aucun encaissement', 'No receipt')}</td></tr>}
              {payments.map((p) => {
                const allocs = state.allocations.filter((a) => a.paymentId === p.id);
                const left = paymentRemainder(state, p);
                return (
                  <Fragment key={p.id}>
                    <tr className={openId === p.id ? 'sel' : ''} style={{ cursor: 'pointer' }} onClick={() => setOpenId(openId === p.id ? null : p.id)}>
                      <td className="mono">{p.number}</td><td><D iso={p.date} /></td><td>{state.customers.find((c) => c.id === p.customerId)?.name}</td>
                      <td className="num">{p.currency} {fmt(p.amountTxn)}</td><td className="num">{fmt(r2(allocs.reduce((a, x) => a + x.amountTxn, 0)))}</td>
                      <td className="num">{left > 0.004 ? <Chip kind="warn">{fmt(left)}</Chip> : '—'}</td>
                      <td>{p.bankTransactionId ? <Chip kind="good">{say('oui', 'yes')}</Chip> : <Chip kind="dim">{say('en attente du relevé', 'awaiting statement')}</Chip>}</td>
                      <td onClick={(e) => e.stopPropagation()}>{left > 0.004 && <button className="btn sm" onClick={() => setLetterId(letterId === p.id ? null : p.id)}>{say('Lettrer…', 'Letter…')}</button>}</td>
                    </tr>
                    {letterId === p.id && <tr><td colSpan={8}><LetterLater entityId={entityId} payment={p} onDone={() => setLetterId(null)} /></td></tr>}
                    {openId === p.id && (
                      <tr><td colSpan={8}>
                        {allocs.length === 0 ? <span className="small muted">{say('Rien de lettré', 'Nothing lettered')}</span> : (
                          <table>
                            <tbody>{allocs.map((a) => { const inv = state.salesInvoices.find((i) => i.id === a.invoiceId); return (
                              <tr key={a.id}><td className="mono">{inv?.number}</td><td className="num">{p.currency} {fmt(a.amountTxn)}</td><td className="small muted">{a.fxDifference ? say(`écart de change ${fmt(a.fxDifference)}`, `FX difference ${fmt(a.fxDifference)}`) : ''}</td>
                                <td><button className="btn sm" onClick={() => unletter(a.id, `${p.number} → ${inv?.number} · ${p.currency} ${fmt(a.amountTxn)}`)}>{say('Délettrer', 'Unletter')}</button></td></tr>
                            ); })}</tbody>
                          </table>
                        )}
                        {(p.writeOffTxn ?? 0) > 0 && <div className="small muted">{say(`Trop-perçu de ${fmt(p.writeOffTxn!)} passé en produit`, `Overpayment of ${fmt(p.writeOffTxn!)} taken to income`)}</div>}
                      </td></tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <aside className="side"><ReceiptForm key={preselect ?? 'none'} entityId={entityId} preselect={preselect} /></aside>
    </div>
  );
}

// A client's receipts not wholly lettered (their card, Clients › Clients).
export function CustomerUnlettered({ entityId, customerId, onLetter }: { entityId: Id; customerId: Id; onLetter?: () => void }) {
  const { state } = useStore();
  const say = useSay();
  const rows = unletteredPayments(state, entityId, customerId);
  if (!rows.length) return null;
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <h2>{say('Encaissements non lettrés', 'Receipts not lettered')}</h2>
      <table><tbody>{rows.map(({ payment: p, remainder }) => <tr key={p.id}><td className="mono">{p.number}</td><td><D iso={p.date} /></td><td className="num">{p.currency} {fmt(p.amountTxn)}</td><td className="num"><Chip kind="warn">{say('reste', 'left')} {fmt(remainder)}</Chip></td></tr>)}</tbody></table>
      {onLetter && <button className="btn sm" style={{ marginTop: 6 }} onClick={onLetter}>{say('Lettrer dans Encaissements', 'Letter in Receipts')}</button>}
    </div>
  );
}
