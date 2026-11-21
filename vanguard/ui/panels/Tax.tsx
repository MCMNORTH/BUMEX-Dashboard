import { useEffect, useMemo, useState } from 'react';
import {
  vatStatement, withholdingStatement, addTaxCode, updateTaxCode, setTaxRule, accountBalance, REVENUE_STATUS_LABEL,
  fmt, r2, parseAmount, type Id, type State, type TaxCode, type TaxKind, type RevenueStatus, type CounterpartyRegime,
} from '@bumex/domain';
import { useStore } from '../../store';
import { Tabs, Field, Chip, D, Money, downloadXlsx } from '../common';
import { Select } from '../Select';
import { WideNote } from '../../one/WideNote'; // [mobile]
import { useSay } from '../../one/say';
// [bumex-one] bilingual: every text follows the person's language, say('français', 'English') (vanguard/one/say.ts, 2026-11-21)

type Tab = 'summary' | 'withholding' | 'notes' | 'codes' | 'rules'; // [bumex-one] notes: the invoices' mentions (2026-11-17)
const REGIMES: [CounterpartyRegime, string, string][] = [['standard', 'Standard', 'Standard'], ['gta', 'GTA · sous-traitant enregistré', 'GTA · registered subcontractor'], ['exempt', 'Exonéré', 'Exempt'], ['non_resident', 'Non-résident · export', 'Non-resident · export'], ['public', 'Organisme public', 'Public body']];
const CATEGORIES: [string, string, string][] = [['AUDIT', 'Audit', 'Audit'], ['TAX', 'Fiscal', 'Tax'], ['LEGAL', 'Juridique', 'Legal'], ['ADVISORY', 'Conseil', 'Advisory'], ['IT', 'IT', 'IT'], ['OTHER', 'Autre', 'Other']];
// [bumex-one] English beside the engine's French labels (REVENUE_STATUS_LABEL) and withholding statuses: shown only, the stored values stay
const REVENUE_STATUS_EN: Record<RevenueStatus, string> = { taxable_standard: 'subject to the standard rate', taxable_reduced: 'subject to the reduced rate', exempt_domestic: 'exempt (domestic)', export_exempt: 'exempt export', export_taxable: 'taxable export' };
const WHT_STATUS_EN: Record<string, string> = { 'réglée': 'Paid', 'ouverte': 'Open', 'à reverser': 'To remit' };

export function TaxPanel({ entityId, initialTab }: { entityId: Id; initialTab?: string | null }) {
  const { t } = useStore();
  const say = useSay();
  const [tab, setTab] = useState<Tab>((initialTab as Tab) || 'summary');
  useEffect(() => { if (initialTab) setTab(initialTab as Tab); }, [initialTab]);
  const tabs = [{ id: 'summary' as Tab, label: say('TVA et WHT · synthèse', 'VAT and WHT · summary') }, { id: 'withholding' as Tab, label: say('WHT et retenues', 'WHT and withholdings') }, { id: 'notes' as Tab, label: say('Mentions des factures', 'Invoice notes') }, { id: 'codes' as Tab, label: say('Codes taxe', 'Tax codes') }, { id: 'rules' as Tab, label: say('Règles TVA', 'VAT rules') }];
  return (
    <>
      <div className="sheet-head"><h1>{t('room_tax')}</h1><Tabs tabs={tabs} value={tab} onChange={setTab} /></div>
      <div className="sheet-body">
        {tab === 'summary' && <Summary entityId={entityId} />}
        {tab === 'withholding' && <Withholding entityId={entityId} />}
        {tab === 'notes' && <InvoiceNotes entityId={entityId} />}
        {tab === 'codes' && <Codes entityId={entityId} />}
        {tab === 'rules' && <Rules entityId={entityId} />}
      </div>
    </>
  );
}

function usePeriod(today: string) {
  const [from, setFrom] = useState(today.slice(0, 4) + '-01-01');
  const [to, setTo] = useState(today);
  return { from, to, setFrom, setTo };
}

function mappedBalance(state: State, entityId: Id, key: string, sign: 1 | -1) {
  const m = state.mappings.find((x) => x.entityId === entityId && x.key === key && !x.qualifier);
  const acc = m ? state.accounts.find((a) => a.id === m.accountId) : undefined;
  if (!acc) return null;
  try { return { acc, balance: r2(sign * accountBalance(state, entityId, acc.id)) }; } catch { return null; }
}

function Summary({ entityId }: { entityId: Id }) {
  const { state, toast } = useStore();
  const say = useSay();
  const { from, to, setFrom, setTo } = usePeriod(state.today);
  const vat = useMemo(() => vatStatement(state, entityId, from, to), [state, entityId, from, to]);
  const wht = useMemo(() => withholdingStatement(state, entityId, from, to), [state, entityId, from, to]);
  const entity = state.entities.find((e) => e.id === entityId)!;
  const collected = mappedBalance(state, entityId, 'VAT_COLLECTED', -1), deductible = mappedBalance(state, entityId, 'VAT_DEDUCTIBLE', 1), whtPay = mappedBalance(state, entityId, 'WHT_PAYABLE', -1), whtRec = mappedBalance(state, entityId, 'WHT_RECEIVABLE', 1);
  const exportXlsx = () => downloadXlsx(`tva-${entity.code}-${from}-${to}.xlsx`, [{ name: 'TVA par mois', rows: [['Mois', 'TVA collectée', 'TVA déductible', 'TVA nette'], ...vat.byMonth.map((m) => [m.month, m.collected, m.deductible, r2(m.collected - m.deductible)])] }, { name: 'Retenues par mois', rows: [['Mois', 'Subies (clients)', 'Dues (fournisseurs)'], ...wht.byMonth.map((m) => [m.month, m.suffered, m.due])] }], toast);
  return (
    <div className="cols">
      <div className="grow">
        <div className="grid4">
          <div className="kpi"><div className="l">{say('TVA collectée · période', 'Output VAT · period')}</div><div className="v">{fmt(vat.collected, 0)}</div></div>
          <div className="kpi"><div className="l">{say('TVA déductible · période', 'Input VAT · period')}</div><div className="v">{fmt(vat.deductible, 0)}</div></div>
          <div className="kpi"><div className="l">{say('TVA nette à décaisser', 'Net VAT payable')}</div><div className="v" style={{ color: vat.net > 0 ? 'var(--warn)' : 'var(--good)' }}>{fmt(vat.net, 0)}</div></div>
          <div className="kpi"><div className="l">{say('WHT subie · retenues dues', 'WHT suffered · withholdings due')}</div><div className="v">{fmt(wht.sufferedTotal, 0)} · {fmt(wht.dueTotal, 0)}</div></div>
        </div>
        <div className="card flush">
          <div style={{ display: 'flex', gap: 8, padding: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Field label={say('Du', 'From')}><input className="in mono" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label={say('Au', 'To')}><input className="in mono" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={exportXlsx}>{say('Exporter (Excel)', 'Export (Excel)')}</button>
          </div>
          <table>
            <thead><tr><th>{say('Mois', 'Month')}</th><th className="num">{say('TVA collectée (ventes)', 'Output VAT (sales)')}</th><th className="num">{say('TVA déductible (achats)', 'Input VAT (purchases)')}</th><th className="num">{say('TVA nette', 'Net VAT')}</th><th className="num">{say('WHT subie', 'WHT suffered')}</th><th className="num">{say('Retenues dues', 'Withholdings due')}</th></tr></thead>
            <tbody>{vat.byMonth.map((m) => { const w = wht.byMonth.find((x) => x.month === m.month); return <tr key={m.month}><td>{m.month}</td><td className="num">{fmt(m.collected, 0)}</td><td className="num">{fmt(m.deductible, 0)}</td><td className="num">{fmt(r2(m.collected - m.deductible), 0)}</td><td className="num">{fmt(w?.suffered ?? 0, 0)}</td><td className="num">{fmt(w?.due ?? 0, 0)}</td></tr>; })}</tbody>
            <tfoot><tr><td>Total</td><td className="num">{fmt(vat.collected, 0)}</td><td className="num">{fmt(vat.deductible, 0)}</td><td className="num">{fmt(vat.net, 0)}</td><td className="num">{fmt(wht.sufferedTotal, 0)}</td><td className="num">{fmt(wht.dueTotal, 0)}</td></tr></tfoot>
          </table>
        </div>
      </div>
      <aside className="side">
        <div className="card">
          <h2>{say('Soldes des comptes de taxes', 'Tax account balances')}</h2>
          <div className="kv">
            <span className="k">{say('TVA collectée', 'Output VAT')} {collected ? <span className="mono muted">· {collected.acc.code}</span> : ''}</span><Money v={collected?.balance ?? 0} />
            <span className="k">{say('TVA déductible', 'Input VAT')} {deductible ? <span className="mono muted">· {deductible.acc.code}</span> : ''}</span><Money v={deductible?.balance ?? 0} />
            <span className="k">{say('Retenues dues à reverser', 'Withholdings due to remit')} {whtPay ? <span className="mono muted">· {whtPay.acc.code}</span> : ''}</span><Money v={whtPay?.balance ?? 0} />
            <span className="k">{say('WHT subie à imputer', 'WHT suffered to offset')} {whtRec ? <span className="mono muted">· {whtRec.acc.code}</span> : ''}</span><Money v={whtRec?.balance ?? 0} />
          </div>
          <div className="small muted" style={{ marginTop: 8 }}>{say('Les soldes viennent du grand livre ; la période ci-contre filtre les factures par date. TVA et WHT se choisissent ligne par ligne sur les factures clients et peuvent s\'y cumuler : une ligne exonérée ne porte pas de TVA ; une ligne soumise à la WHT garde sa TVA, et le client retient 7 % de son HT sur le net à payer.', 'Balances come from the general ledger; the period selected here filters invoices by date. VAT and WHT are chosen line by line on customer invoices and can be combined: an exempt line bears no VAT; a line subject to WHT keeps its VAT, and the customer withholds 7% of its amount excl. tax from the net payable.')}</div>
        </div>
      </aside>
    </div>
  );
}

function Withholding({ entityId }: { entityId: Id }) {
  const { state, toast } = useStore();
  const say = useSay();
  const { from, to, setFrom, setTo } = usePeriod(state.today);
  const st = useMemo(() => withholdingStatement(state, entityId, from, to), [state, entityId, from, to]);
  const entity = state.entities.find((e) => e.id === entityId)!;
  const whtPay = mappedBalance(state, entityId, 'WHT_PAYABLE', -1), whtRec = mappedBalance(state, entityId, 'WHT_RECEIVABLE', 1);
  const exportXlsx = () => downloadXlsx(`retenues-${entity.code}-${from}-${to}.xlsx`, [{ name: 'Dues (achats)', rows: [['Date', 'Document', 'Fournisseur', 'Base HT', 'Taux', 'Retenue', 'Devise', 'Statut'], ...st.due.map((r) => [r.date, r.document, r.counterparty, r.base, r.rate, r.amount, r.currency, r.status])] }, { name: 'WHT subie (ventes)', rows: [['Date', 'Document', 'Client', 'Base HT (lignes WHT)', 'Taux', 'WHT', 'Devise', 'Statut'], ...st.suffered.map((r) => [r.date, r.document, r.counterparty, r.base, r.rate, r.amount, r.currency, r.status])] }], toast);
  // [bumex-one] Table: an inner component; its texts use the `say` of Withholding (no hook here)
  const Table = ({ title, rows, total, who, base = say('Base HT', 'Base excl. tax'), amount = say('Retenue', 'Withholding') }: { title: string; rows: typeof st.due; total: number; who: string; base?: string; amount?: string }) => (
    <div className="card flush">
      <table>
        <thead><tr><th>{title}</th><th>Document</th><th>{who}</th><th className="num">{base}</th><th className="num">{say('Taux', 'Rate')}</th><th className="num">{amount}</th><th>{say('Statut', 'Status')}</th></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}><td><D iso={r.date} /></td><td className="mono">{r.document}</td><td>{r.counterparty}</td><td className="num">{r.currency} {fmt(r.base)}</td><td className="num">{Math.round(r.rate * 1000) / 10} %</td><td className="num">{fmt(r.amount)}</td><td><Chip kind={r.status === 'réglée' ? 'good' : 'warn'}>{say(r.status, WHT_STATUS_EN[r.status] ?? r.status)}</Chip></td></tr>)}{rows.length === 0 && <tr><td colSpan={7} className="muted small">{say('Aucune ligne sur la période', 'No lines in this period')}</td></tr>}</tbody>
        <tfoot><tr><td colSpan={5}>{say(`Total (contre-valeur ${entity.functionalCurrency})`, `Total (${entity.functionalCurrency} equivalent)`)}</td><td className="num">{fmt(total)}</td><td></td></tr></tfoot>
      </table>
    </div>
  );
  return (
    <div className="cols">
      <div className="grow">
        <div className="card flush">
          <div style={{ display: 'flex', gap: 8, padding: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Field label={say('Du', 'From')}><input className="in mono" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label={say('Au', 'To')}><input className="in mono" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={exportXlsx}>{say('Exporter (Excel)', 'Export (Excel)')}</button>
          </div>
        </div>
        <Table title={say('WHT subie · que nos clients retiennent (7 %)', 'WHT suffered · withheld by our customers (7%)')} rows={st.suffered} total={st.sufferedTotal} who={say('Client', 'Customer')} base={say('Base HT (lignes WHT)', 'Base excl. tax (WHT lines)')} amount="WHT" />
        <Table title={say('Retenues dues · que nous retenons sur les fournisseurs', 'Withholdings due · withheld by us from suppliers')} rows={st.due} total={st.dueTotal} who={say('Fournisseur', 'Supplier')} />
      </div>
      <aside className="side">
        <div className="card">
          <h2>{say('Déclaration', 'Return')}</h2>
          <div className="kv">
            <span className="k">{say('À reverser au Trésor (période)', 'To remit to the Treasury (period)')}</span><Money v={st.dueTotal} />
            <span className="k">{say('Solde du compte', 'Account balance')} {whtPay ? <span className="mono muted">{whtPay.acc.code}</span> : ''}</span><Money v={whtPay?.balance ?? 0} />
            <span className="k">{say('WHT subie, à imputer sur notre impôt (période)', 'WHT suffered, to offset against our tax (period)')}</span><Money v={st.sufferedTotal} />
            <span className="k">{say('Solde du compte', 'Account balance')} {whtRec ? <span className="mono muted">{whtRec.acc.code}</span> : ''}</span><Money v={whtRec?.balance ?? 0} />
          </div>
          <div className="small muted" style={{ marginTop: 8 }}>{say(`Le reversement au Trésor se saisit en trésorerie (compte ${whtPay?.acc.code ?? '433'} D · banque C) ; le solde de ce compte redescend alors à zéro.`, `The payment to the Treasury is entered in Treasury (account ${whtPay?.acc.code ?? '433'} Dr · bank Cr); this account's balance then returns to zero.`)}</div>
        </div>
      </aside>
    </div>
  );
}

// [bumex-one] The texts the invoices print beside their totals (asked on 2026-11-17), each tax code's, in French and in
// English (the invoice's language; the other one when empty): the WHT's on an invoice with a line bearing it, each VAT
// code's on an invoice with a line at that code. Empty: nothing printed. Every invoice prints the current text.
function InvoiceNotes({ entityId }: { entityId: Id }) {
  const { state, apply } = useStore();
  const say = useSay();
  const codes = state.taxCodes
    .filter((x) => x.entityId === entityId && (x.kind === 'vat' || (x.kind === 'withholding' && !!x.deductibleAccountId)))
    .sort((a, b) => Number(a.kind === 'vat') - Number(b.kind === 'vat') || a.code.localeCompare(b.code));
  const [texts, setTexts] = useState<Record<Id, { fr: string; en: string }>>(() => Object.fromEntries(codes.map((c) => [c.id, { fr: c.legalMentionFr ?? '', en: c.legalMentionEn ?? '' }])));
  const textOf = (c: TaxCode) => texts[c.id] ?? { fr: c.legalMentionFr ?? '', en: c.legalMentionEn ?? '' };
  const set = (c: TaxCode, lang: 'fr' | 'en', v: string) => setTexts((t) => ({ ...t, [c.id]: { ...textOf(c), [lang]: v } }));
  const changed = codes.filter((c) => textOf(c).fr.trim() !== (c.legalMentionFr ?? '') || textOf(c).en.trim() !== (c.legalMentionEn ?? ''));
  const save = () => apply((s) => changed.reduce((acc, c) => updateTaxCode(acc, c.id, { legalMentionFr: textOf(c).fr.trim() || undefined, legalMentionEn: textOf(c).en.trim() || undefined })[0], s), say('Mentions des factures enregistrées', 'Invoice notes saved'));
  return (
    <div className="cols">
      <div className="grow">
        {codes.map((c) => (
          <div key={c.id} className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className="mono"><b>{c.code}</b></span><span>{c.nameFr}</span>
              <Chip kind={c.kind === 'vat' ? 'dim' : 'warn'}>{c.kind === 'vat' ? say(`TVA ${Math.round(c.rate * 1000) / 10} %`, `VAT ${Math.round(c.rate * 1000) / 10} %`) : `WHT ${Math.round(c.rate * 1000) / 10} %`}</Chip>
              <span className="small muted" style={{ marginLeft: 'auto' }}>{c.kind === 'vat' ? say('Imprimée quand une ligne porte cette TVA', 'Printed when a line bears this VAT') : say('Imprimée quand une ligne porte la WHT', 'Printed when a line bears the WHT')}</span>
            </div>
            <div className="grid2" style={{ marginTop: 8 }}>
              <Field label={say('Français', 'French')}><textarea className="in" rows={3} value={textOf(c).fr} onChange={(e) => set(c, 'fr', e.target.value)} placeholder={say('Aucune mention', 'No note')} style={{ height: 'auto', resize: 'vertical' }} /></Field>
              <Field label="English"><textarea className="in" rows={3} value={textOf(c).en} onChange={(e) => set(c, 'en', e.target.value)} placeholder={textOf(c).fr ? 'Empty: the French text is printed' : 'No note'} style={{ height: 'auto', resize: 'vertical' }} /></Field>
            </div>
          </div>
        ))}
        {codes.length === 0 && <div className="card muted">{say('Aucun code de TVA ou de WHT sur cette entité.', 'No VAT or WHT code for this entity.')}</div>}
      </div>
      <aside className="side">
        <div className="card">
          <h2>{say('Mentions des factures', 'Invoice notes')}</h2>
          <div className="small">{say('Chaque facture imprime, à gauche de ses totaux, la mention de la ', 'Each invoice prints, to the left of its totals, the ')}<b>WHT</b>{say(' si une ligne la porte, puis celle de chaque ', ' note if a line bears it, then the note of each ')}<b>{say('TVA', 'VAT')}</b>{say(' de ses lignes, dans leur ordre ; dans la langue de la facture (l\'autre si celle-ci est vide). Un texte vide n\'imprime rien.', ' on its lines, in their order; in the invoice\'s language (the other one if that one is empty). An empty text prints nothing.')}</div>
          <div className="small muted" style={{ marginTop: 8 }}>{say('Le texte modifié vaut pour toutes les factures, y compris celles déjà émises quand on les réimprime.', 'The edited text applies to all invoices, including those already issued when they are reprinted.')}</div>
          <div className="actions" style={{ marginTop: 10 }}>
            <button className="btn primary" disabled={!changed.length} onClick={save}>{changed.length ? say(`Enregistrer · ${changed.length}`, `Save · ${changed.length}`) : say('Enregistré', 'Saved')}</button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Codes({ entityId }: { entityId: Id }) {
  const { state, apply } = useStore();
  const say = useSay();
  const codes = state.taxCodes.filter((x) => x.entityId === entityId).sort((a, b) => a.code.localeCompare(b.code));
  const accounts = state.accounts.filter((a) => a.entityId === entityId && a.isPostable && a.active && (a.code.startsWith('4') || a.code.startsWith('3'))).sort((a, b) => a.code.localeCompare(b.code));
  const [editId, setEditId] = useState<Id | null>(null);
  const editing = codes.find((c) => c.id === editId);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<TaxKind>('vat');
  const [rate, setRate] = useState('');
  const [status, setStatus] = useState<RevenueStatus | ''>('');
  const [collected, setCollected] = useState('');
  const [deductible, setDeductible] = useState('');
  const load = (id: Id | null) => { const c = codes.find((x) => x.id === id); setEditId(id); setCode(c?.code ?? ''); setName(c?.nameFr ?? ''); setKind(c?.kind ?? 'vat'); setRate(c ? String(r2(c.rate * 100)) : ''); setStatus(c?.revenueStatus ?? ''); setCollected(c?.collectedAccountId ?? ''); setDeductible(c?.deductibleAccountId ?? ''); };
  const save = () => {
    const r = (parseAmount(rate) ?? 0) / 100;
    // the mention printed on the invoices is edited in « Mentions des factures »
    const patch = { nameFr: name, rate: r, revenueStatus: status || undefined, collectedAccountId: collected || undefined, deductibleAccountId: deductible || undefined };
    if (apply((s) => (editing ? updateTaxCode(s, editing.id, patch) : addTaxCode(s, { entityId, code, kind, ...patch })), editing ? say('Code taxe mis à jour', 'Tax code updated') : say('Code taxe créé', 'Tax code created'))) load(null);
  };
  const used = (c: TaxCode) => state.customers.filter((x) => x.withholdingCodeId === c.id).length + state.suppliers.filter((x) => x.withholdingCodeId === c.id).length + state.taxRules.filter((x) => x.taxCodeId === c.id).length;
  const acc = (id?: Id) => { const a = id ? state.accounts.find((x) => x.id === id) : undefined; return a ? `${a.code} ${a.nameFr}` : '—'; };
  return (
    <div className="cols">
      <div className="grow">
        <div className="card flush">
          <table>
            <thead><tr><th>Code</th><th>{say('Libellé', 'Description')}</th><th>{say('Nature', 'Type')}</th><th className="num">{say('Taux', 'Rate')}</th><th>{say('Statut du produit', 'Revenue status')}</th><th>{say('Compte collecté · à reverser', 'Collected account · to remit')}</th><th>{say('Compte déductible · à imputer', 'Deductible account · to offset')}</th><th className="num">{say('Utilisé', 'Used')}</th><th></th></tr></thead>
            <tbody>{codes.map((c) => <tr key={c.id} className={c.id === editId ? 'sel' : ''}><td className="mono">{c.code}</td><td>{c.nameFr}{c.legalMentionFr && <div className="small muted">« {c.legalMentionFr} »</div>}</td><td><Chip kind={c.kind === 'vat' ? 'dim' : 'warn'}>{c.kind === 'vat' ? say('TVA', 'VAT') : c.deductibleAccountId ? say('WHT · clients', 'WHT · customers') : say('Retenue due · fournisseurs', 'Withholding due · suppliers')}</Chip></td><td className="num">{Math.round(c.rate * 1000) / 10} %</td><td className="small">{c.revenueStatus ? say(REVENUE_STATUS_LABEL[c.revenueStatus], REVENUE_STATUS_EN[c.revenueStatus]) : '—'}</td><td className="mono small">{acc(c.collectedAccountId)}</td><td className="mono small">{acc(c.deductibleAccountId)}</td><td className="num">{used(c)}</td><td><button className="btn sm" onClick={() => load(c.id)}>{say('Modifier', 'Edit')}</button></td></tr>)}</tbody>
          </table>
        </div>
      </div>
      <aside className="side">
        <div className="card">
          <h2>{editing ? `Code · ${editing.code}` : say('Nouveau code taxe', 'New tax code')}</h2>
          {!editing && <div className="grid2"><Field label="Code"><input className="in mono" value={code} onChange={(e) => setCode(e.target.value)} placeholder="RAS-7" /></Field><Field label={say('Nature', 'Type')}><Select className="in" value={kind} onChange={(e) => setKind(e.target.value as TaxKind)}><option value="vat">{say('TVA', 'VAT')}</option><option value="withholding">{say('WHT · retenue à la source', 'WHT · withholding tax')}</option></Select></Field></div>}
          <Field label={say('Libellé', 'Description')} style={{ marginTop: 8 }}><input className="in" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <div className="grid2" style={{ marginTop: 8 }}>
            <Field label={say('Taux (%)', 'Rate (%)')}><input className="in num" value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
            {(editing?.kind ?? kind) === 'vat' && <Field label={say('Statut du produit', 'Revenue status')}><Select className="in" value={status} onChange={(e) => setStatus(e.target.value as RevenueStatus | '')}><option value="">—</option>{(Object.keys(REVENUE_STATUS_LABEL) as RevenueStatus[]).map((k) => <option key={k} value={k}>{say(REVENUE_STATUS_LABEL[k], REVENUE_STATUS_EN[k])}</option>)}</Select></Field>}
          </div>
          <Field label={(editing?.kind ?? kind) === 'vat' ? say('Compte TVA collectée', 'Output VAT account') : say('Compte retenue à reverser (retenue due sur achats)', 'Withholding payable account (withholding due on purchases)')} style={{ marginTop: 8 }}><Select recent="accounts" className="in mono" value={collected} onChange={(e) => setCollected(e.target.value)}><option value="">{say('— (défaut du plan)', '— (chart default)')}</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.nameFr}</option>)}</Select></Field>
          <Field label={(editing?.kind ?? kind) === 'vat' ? say('Compte TVA déductible', 'Input VAT account') : say('Compte retenue subie (créance · retenue sur nos ventes)', 'Withholding suffered account (receivable · withheld on our sales)')} style={{ marginTop: 8 }}><Select recent="accounts" className="in mono" value={deductible} onChange={(e) => setDeductible(e.target.value)}><option value="">—</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.nameFr}</option>)}</Select></Field>
          <div className="small muted" style={{ marginTop: 8 }}>{say('Le texte imprimé sur les factures (français et anglais) se règle dans « Mentions des factures ».', 'The text printed on invoices (French and English) is set in "Invoice notes".')}</div>
          <div className="actions" style={{ marginTop: 10 }}>{editing && <button className="btn" onClick={() => load(null)}>{say('Annuler', 'Cancel')}</button>}<button className="btn primary" disabled={!name.trim() || (!editing && !code.trim())} onClick={save}>{editing ? say('Enregistrer', 'Save') : say('Créer', 'Create')}</button></div>
          <div className="small muted" style={{ marginTop: 8 }}>{say('La WHT (retenue « subie », 7 %) porte un compte de créance : elle se choisit ligne par ligne sur les factures clients, « Non applicable » ou 7 %, en plus de la TVA de la ligne. Une retenue « due » (3 %, 15 %) porte un compte à reverser : elle s\'applique aux factures fournisseurs. Les taux se modifient ici ; les documents déjà validés gardent leur taux figé.', 'WHT (withholding "suffered", 7%) carries a receivable account: it is chosen line by line on customer invoices, "Not applicable" or 7%, on top of the line\'s VAT. A withholding "due" (3%, 15%) carries a payable account: it applies to supplier invoices. Rates are changed here; documents already validated keep their frozen rate.')}</div>
        </div>
      </aside>
    </div>
  );
}

function Rules({ entityId }: { entityId: Id }) {
  const { state, apply } = useStore();
  const say = useSay();
  const vatCodes = state.taxCodes.filter((x) => x.entityId === entityId && x.kind === 'vat');
  const rules = state.taxRules.filter((r) => r.entityId === entityId);
  const find = (regime: CounterpartyRegime | null, cat: string | null) => rules.find((r) => r.regime === regime && r.serviceCategory === cat);
  const set = (regime: CounterpartyRegime | null, cat: string | null, taxCodeId: string) => { if (taxCodeId) apply((s) => setTaxRule(s, { entityId, regime, serviceCategory: cat, taxCodeId }), say('Règle enregistrée', 'Rule saved')); };
  // [bumex-one] Cell: an inner component; its text uses the `say` of Rules (no hook here)
  const Cell = ({ regime, cat }: { regime: CounterpartyRegime | null; cat: string | null }) => { const r = find(regime, cat); return <td><Select className="in" value={r?.taxCodeId ?? ''} onChange={(e) => set(regime, cat, e.target.value)}><option value="">{say('— (hérite)', '— (inherits)')}</option>{vatCodes.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.rate * 100} %</option>)}</Select></td>; };
  return (
    <>
      <WideNote />{/* [mobile] */}
      <div className="banner info">{say('Résolution d\'une ligne de facture client : code forcé sur la ligne › règle régime + catégorie › règle régime seul › défaut de l\'entité. Une cellule vide hérite du niveau supérieur.', 'How a customer invoice line is resolved: code forced on the line › regime + category rule › regime-only rule › entity default. An empty cell inherits from the level above.')}</div>
      <div className="card flush">
        <table>
          <thead><tr><th>{say('Régime du client', 'Customer regime')}</th><th>{say('Toutes catégories', 'All categories')}</th>{CATEGORIES.map(([k, n, en]) => <th key={k}>{say(n, en)}</th>)}</tr></thead>
          <tbody>
            <tr><td><b>{say('Défaut de l\'entité', 'Entity default')}</b></td><Cell regime={null} cat={null} />{CATEGORIES.map(([k]) => <Cell key={k} regime={null} cat={k} />)}</tr>
            {REGIMES.map(([k, n, en]) => <tr key={k}><td>{say(n, en)}</td><Cell regime={k} cat={null} />{CATEGORIES.map(([c]) => <Cell key={c} regime={k} cat={c} />)}</tr>)}
          </tbody>
        </table>
      </div>
    </>
  );
}
