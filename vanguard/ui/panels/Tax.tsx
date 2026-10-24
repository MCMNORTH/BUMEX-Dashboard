import { useEffect, useMemo, useState } from 'react';
import {
  vatStatement, withholdingStatement, addTaxCode, updateTaxCode, setTaxRule, accountBalance, REVENUE_STATUS_LABEL,
  fmt, r2, parseAmount, type Id, type State, type TaxCode, type TaxKind, type RevenueStatus, type CounterpartyRegime,
} from '@bumex/domain';
import { useStore } from '../../store';
import { Tabs, Field, Chip, D, Money, downloadXlsx } from '../common';

type Tab = 'summary' | 'withholding' | 'codes' | 'rules';
const REGIMES: [CounterpartyRegime, string][] = [['standard', 'Standard'], ['gta', 'GTA · sous-traitant enregistré'], ['exempt', 'Exonéré'], ['non_resident', 'Non-résident · export'], ['public', 'Organisme public']];
const CATEGORIES = [['AUDIT', 'Audit'], ['TAX', 'Fiscal'], ['LEGAL', 'Juridique'], ['ADVISORY', 'Conseil'], ['IT', 'IT'], ['OTHER', 'Autre']];

export function TaxPanel({ entityId, initialTab }: { entityId: Id; initialTab?: string | null }) {
  const { t } = useStore();
  const [tab, setTab] = useState<Tab>((initialTab as Tab) || 'summary');
  useEffect(() => { if (initialTab) setTab(initialTab as Tab); }, [initialTab]);
  const tabs = [{ id: 'summary' as Tab, label: 'TVA · synthèse' }, { id: 'withholding' as Tab, label: 'Retenues à la source' }, { id: 'codes' as Tab, label: 'Codes taxe' }, { id: 'rules' as Tab, label: 'Règles' }];
  return (
    <>
      <div className="sheet-head"><h1>{t('room_tax')}</h1><Tabs tabs={tabs} value={tab} onChange={setTab} /></div>
      <div className="sheet-body">
        {tab === 'summary' && <Summary entityId={entityId} />}
        {tab === 'withholding' && <Withholding entityId={entityId} />}
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
          <div className="kpi"><div className="l">TVA collectée · période</div><div className="v">{fmt(vat.collected, 0)}</div></div>
          <div className="kpi"><div className="l">TVA déductible · période</div><div className="v">{fmt(vat.deductible, 0)}</div></div>
          <div className="kpi"><div className="l">TVA nette à décaisser</div><div className="v" style={{ color: vat.net > 0 ? 'var(--warn)' : 'var(--good)' }}>{fmt(vat.net, 0)}</div></div>
          <div className="kpi"><div className="l">Retenues subies · dues</div><div className="v">{fmt(wht.sufferedTotal, 0)} · {fmt(wht.dueTotal, 0)}</div></div>
        </div>
        <div className="card flush">
          <div style={{ display: 'flex', gap: 8, padding: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Field label="Du"><input className="in mono" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="Au"><input className="in mono" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={exportXlsx}>Exporter (Excel)</button>
          </div>
          <table>
            <thead><tr><th>Mois</th><th className="num">TVA collectée (ventes)</th><th className="num">TVA déductible (achats)</th><th className="num">TVA nette</th><th className="num">Retenues subies</th><th className="num">Retenues dues</th></tr></thead>
            <tbody>{vat.byMonth.map((m) => { const w = wht.byMonth.find((x) => x.month === m.month); return <tr key={m.month}><td>{m.month}</td><td className="num">{fmt(m.collected, 0)}</td><td className="num">{fmt(m.deductible, 0)}</td><td className="num">{fmt(r2(m.collected - m.deductible), 0)}</td><td className="num">{fmt(w?.suffered ?? 0, 0)}</td><td className="num">{fmt(w?.due ?? 0, 0)}</td></tr>; })}</tbody>
            <tfoot><tr><td>Total</td><td className="num">{fmt(vat.collected, 0)}</td><td className="num">{fmt(vat.deductible, 0)}</td><td className="num">{fmt(vat.net, 0)}</td><td className="num">{fmt(wht.sufferedTotal, 0)}</td><td className="num">{fmt(wht.dueTotal, 0)}</td></tr></tfoot>
          </table>
        </div>
      </div>
      <aside className="side">
        <div className="card">
          <h2>Soldes des comptes de taxes</h2>
          <div className="kv">
            <span className="k">TVA collectée {collected ? <span className="mono muted">· {collected.acc.code}</span> : ''}</span><Money v={collected?.balance ?? 0} />
            <span className="k">TVA déductible {deductible ? <span className="mono muted">· {deductible.acc.code}</span> : ''}</span><Money v={deductible?.balance ?? 0} />
            <span className="k">Retenues à reverser {whtPay ? <span className="mono muted">· {whtPay.acc.code}</span> : ''}</span><Money v={whtPay?.balance ?? 0} />
            <span className="k">Retenues subies à imputer {whtRec ? <span className="mono muted">· {whtRec.acc.code}</span> : ''}</span><Money v={whtRec?.balance ?? 0} />
          </div>
          <div className="small muted" style={{ marginTop: 8 }}>Les soldes viennent du grand livre ; la période ci-contre filtre les factures par date. Retenue ≠ exonération : une facture exonérée ne porte pas de TVA, une facture soumise à retenue garde sa TVA et voit son net réduit.</div>
        </div>
      </aside>
    </div>
  );
}

function Withholding({ entityId }: { entityId: Id }) {
  const { state, toast } = useStore();
  const { from, to, setFrom, setTo } = usePeriod(state.today);
  const st = useMemo(() => withholdingStatement(state, entityId, from, to), [state, entityId, from, to]);
  const entity = state.entities.find((e) => e.id === entityId)!;
  const whtPay = mappedBalance(state, entityId, 'WHT_PAYABLE', -1), whtRec = mappedBalance(state, entityId, 'WHT_RECEIVABLE', 1);
  const exportXlsx = () => downloadXlsx(`retenues-${entity.code}-${from}-${to}.xlsx`, [{ name: 'Dues (achats)', rows: [['Date', 'Document', 'Fournisseur', 'Base HT', 'Taux', 'Retenue', 'Devise', 'Statut'], ...st.due.map((r) => [r.date, r.document, r.counterparty, r.base, r.rate, r.amount, r.currency, r.status])] }, { name: 'Subies (ventes)', rows: [['Date', 'Document', 'Client', 'Base HT', 'Taux', 'Retenue', 'Devise', 'Statut'], ...st.suffered.map((r) => [r.date, r.document, r.counterparty, r.base, r.rate, r.amount, r.currency, r.status])] }], toast);
  const Table = ({ title, rows, total, who }: { title: string; rows: typeof st.due; total: number; who: string }) => (
    <div className="card flush">
      <table>
        <thead><tr><th>{title}</th><th>Document</th><th>{who}</th><th className="num">Base HT</th><th className="num">Taux</th><th className="num">Retenue</th><th>Statut</th></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}><td><D iso={r.date} /></td><td className="mono">{r.document}</td><td>{r.counterparty}</td><td className="num">{r.currency} {fmt(r.base)}</td><td className="num">{Math.round(r.rate * 1000) / 10} %</td><td className="num">{fmt(r.amount)}</td><td><Chip kind={r.status === 'réglée' ? 'good' : 'warn'}>{r.status}</Chip></td></tr>)}{rows.length === 0 && <tr><td colSpan={7} className="muted small">Aucune ligne sur la période</td></tr>}</tbody>
        <tfoot><tr><td colSpan={5}>Total (contre-valeur {entity.functionalCurrency})</td><td className="num">{fmt(total)}</td><td></td></tr></tfoot>
      </table>
    </div>
  );
  return (
    <div className="cols">
      <div className="grow">
        <div className="card flush">
          <div style={{ display: 'flex', gap: 8, padding: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Field label="Du"><input className="in mono" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="Au"><input className="in mono" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={exportXlsx}>Exporter (Excel)</button>
          </div>
        </div>
        <Table title="Retenues dues · que nous retenons sur les fournisseurs" rows={st.due} total={st.dueTotal} who="Fournisseur" />
        <Table title="Retenues subies · que nos clients retiennent" rows={st.suffered} total={st.sufferedTotal} who="Client" />
      </div>
      <aside className="side">
        <div className="card">
          <h2>Déclaration</h2>
          <div className="kv">
            <span className="k">À reverser au Trésor (période)</span><Money v={st.dueTotal} />
            <span className="k">Solde du compte {whtPay ? <span className="mono muted">{whtPay.acc.code}</span> : ''}</span><Money v={whtPay?.balance ?? 0} />
            <span className="k">Subies, à imputer sur notre impôt (période)</span><Money v={st.sufferedTotal} />
            <span className="k">Solde du compte {whtRec ? <span className="mono muted">{whtRec.acc.code}</span> : ''}</span><Money v={whtRec?.balance ?? 0} />
          </div>
          <div className="small muted" style={{ marginTop: 8 }}>Le reversement au Trésor se saisit en trésorerie (compte {whtPay?.acc.code ?? '433'} D · banque C) ; le solde de ce compte redescend alors à zéro.</div>
        </div>
      </aside>
    </div>
  );
}

function Codes({ entityId }: { entityId: Id }) {
  const { state, apply } = useStore();
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
  const [mention, setMention] = useState('');
  const load = (id: Id | null) => { const c = codes.find((x) => x.id === id); setEditId(id); setCode(c?.code ?? ''); setName(c?.nameFr ?? ''); setKind(c?.kind ?? 'vat'); setRate(c ? String(r2(c.rate * 100)) : ''); setStatus(c?.revenueStatus ?? ''); setCollected(c?.collectedAccountId ?? ''); setDeductible(c?.deductibleAccountId ?? ''); setMention(c?.legalMentionFr ?? ''); };
  const save = () => {
    const r = (parseAmount(rate) ?? 0) / 100;
    const patch = { nameFr: name, rate: r, revenueStatus: status || undefined, collectedAccountId: collected || undefined, deductibleAccountId: deductible || undefined, legalMentionFr: mention || undefined };
    if (apply((s) => (editing ? updateTaxCode(s, editing.id, patch) : addTaxCode(s, { entityId, code, kind, ...patch })), editing ? 'Code taxe mis à jour' : 'Code taxe créé')) load(null);
  };
  const used = (c: TaxCode) => state.customers.filter((x) => x.withholdingCodeId === c.id).length + state.suppliers.filter((x) => x.withholdingCodeId === c.id).length + state.taxRules.filter((x) => x.taxCodeId === c.id).length;
  const acc = (id?: Id) => { const a = id ? state.accounts.find((x) => x.id === id) : undefined; return a ? `${a.code} ${a.nameFr}` : '—'; };
  return (
    <div className="cols">
      <div className="grow">
        <div className="card flush">
          <table>
            <thead><tr><th>Code</th><th>Libellé</th><th>Nature</th><th className="num">Taux</th><th>Statut du produit</th><th>Compte collecté · à reverser</th><th>Compte déductible · à imputer</th><th className="num">Utilisé</th><th></th></tr></thead>
            <tbody>{codes.map((c) => <tr key={c.id} className={c.id === editId ? 'sel' : ''}><td className="mono">{c.code}</td><td>{c.nameFr}{c.legalMentionFr && <div className="small muted">« {c.legalMentionFr} »</div>}</td><td><Chip kind={c.kind === 'vat' ? 'dim' : 'warn'}>{c.kind === 'vat' ? 'TVA' : c.deductibleAccountId ? 'Retenue subie' : 'Retenue due'}</Chip></td><td className="num">{Math.round(c.rate * 1000) / 10} %</td><td className="small">{c.revenueStatus ? REVENUE_STATUS_LABEL[c.revenueStatus] : '—'}</td><td className="mono small">{acc(c.collectedAccountId)}</td><td className="mono small">{acc(c.deductibleAccountId)}</td><td className="num">{used(c)}</td><td><button className="btn sm" onClick={() => load(c.id)}>Modifier</button></td></tr>)}</tbody>
          </table>
        </div>
      </div>
      <aside className="side">
        <div className="card">
          <h2>{editing ? `Code · ${editing.code}` : 'Nouveau code taxe'}</h2>
          {!editing && <div className="grid2"><Field label="Code"><input className="in mono" value={code} onChange={(e) => setCode(e.target.value)} placeholder="RAS-7" /></Field><Field label="Nature"><select className="in" value={kind} onChange={(e) => setKind(e.target.value as TaxKind)}><option value="vat">TVA</option><option value="withholding">Retenue à la source</option></select></Field></div>}
          <Field label="Libellé" style={{ marginTop: 8 }}><input className="in" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <div className="grid2" style={{ marginTop: 8 }}>
            <Field label="Taux (%)"><input className="in num" value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
            {(editing?.kind ?? kind) === 'vat' && <Field label="Statut du produit"><select className="in" value={status} onChange={(e) => setStatus(e.target.value as RevenueStatus | '')}><option value="">—</option>{(Object.keys(REVENUE_STATUS_LABEL) as RevenueStatus[]).map((k) => <option key={k} value={k}>{REVENUE_STATUS_LABEL[k]}</option>)}</select></Field>}
          </div>
          <Field label={(editing?.kind ?? kind) === 'vat' ? 'Compte TVA collectée' : 'Compte retenue à reverser (retenue due sur achats)'} style={{ marginTop: 8 }}><select className="in mono" value={collected} onChange={(e) => setCollected(e.target.value)}><option value="">— (défaut du plan)</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.nameFr}</option>)}</select></Field>
          <Field label={(editing?.kind ?? kind) === 'vat' ? 'Compte TVA déductible' : 'Compte retenue subie (créance · retenue sur nos ventes)'} style={{ marginTop: 8 }}><select className="in mono" value={deductible} onChange={(e) => setDeductible(e.target.value)}><option value="">—</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.nameFr}</option>)}</select></Field>
          <Field label="Mention légale imprimée" style={{ marginTop: 8 }}><input className="in" value={mention} onChange={(e) => setMention(e.target.value)} /></Field>
          <div className="actions" style={{ marginTop: 10 }}>{editing && <button className="btn" onClick={() => load(null)}>Annuler</button>}<button className="btn primary" disabled={!name.trim() || (!editing && !code.trim())} onClick={save}>{editing ? 'Enregistrer' : 'Créer'}</button></div>
          <div className="small muted" style={{ marginTop: 8 }}>Une retenue « subie » porte un compte de créance (déductible) : elle s'applique aux factures clients. Une retenue « due » porte un compte à reverser : elle s'applique aux factures fournisseurs. Le taux (7 %, 3 %, 15 %…) se modifie ici ; les documents déjà validés gardent leur taux figé.</div>
        </div>
      </aside>
    </div>
  );
}

function Rules({ entityId }: { entityId: Id }) {
  const { state, apply } = useStore();
  const vatCodes = state.taxCodes.filter((x) => x.entityId === entityId && x.kind === 'vat');
  const rules = state.taxRules.filter((r) => r.entityId === entityId);
  const find = (regime: CounterpartyRegime | null, cat: string | null) => rules.find((r) => r.regime === regime && r.serviceCategory === cat);
  const set = (regime: CounterpartyRegime | null, cat: string | null, taxCodeId: string) => { if (taxCodeId) apply((s) => setTaxRule(s, { entityId, regime, serviceCategory: cat, taxCodeId }), 'Règle enregistrée'); };
  const Cell = ({ regime, cat }: { regime: CounterpartyRegime | null; cat: string | null }) => { const r = find(regime, cat); return <td><select className="in" value={r?.taxCodeId ?? ''} onChange={(e) => set(regime, cat, e.target.value)}><option value="">— (hérite)</option>{vatCodes.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.rate * 100} %</option>)}</select></td>; };
  return (
    <>
      <div className="banner info">Résolution d'une ligne de facture client : code forcé sur la ligne › règle régime + catégorie › règle régime seul › défaut de l'entité. Une cellule vide hérite du niveau supérieur.</div>
      <div className="card flush">
        <table>
          <thead><tr><th>Régime du client</th><th>Toutes catégories</th>{CATEGORIES.map(([k, n]) => <th key={k}>{n}</th>)}</tr></thead>
          <tbody>
            <tr><td><b>Défaut de l'entité</b></td><Cell regime={null} cat={null} />{CATEGORIES.map(([k]) => <Cell key={k} regime={null} cat={k} />)}</tr>
            {REGIMES.map(([k, n]) => <tr key={k}><td>{n}</td><Cell regime={k} cat={null} />{CATEGORIES.map(([c]) => <Cell key={c} regime={k} cat={c} />)}</tr>)}
          </tbody>
        </table>
      </div>
    </>
  );
}
