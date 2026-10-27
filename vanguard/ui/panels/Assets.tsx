import { useEffect, useMemo, useState } from 'react';
import {
  assetRegister, addAsset, updateAsset, depreciationSchedule, yearDepreciation, postDepreciation, addAssetCategory, updateAssetCategory, DECLINING_COEFFICIENT,
  fmt, r2, parseAmount, type Id, type Asset, type DepreciationMethod,
} from '@bumex/domain';
import { useStore } from '../../store';
import { Tabs, Field, Chip, D, Money, DeleteButton, downloadXlsx, entryRef } from '../common';
import { Select } from '../Select';

type Tab = 'register' | 'new' | 'sheet' | 'yearend' | 'categories';
const METHOD_FR: Record<DepreciationMethod, string> = { linear: 'Linéaire', declining: 'Dégressif' };
const STATUS: Record<Asset['status'], [string, 'good' | 'warn' | 'dim']> = { in_service: ['En service', 'good'], wip: ['En cours', 'warn'], disposed: ['Cédé · sorti', 'dim'] };

export function AssetsPanel({ entityId, initialTab }: { entityId: Id; initialTab?: string | null }) {
  const { state, t, ui } = useStore();
  const [tab, setTab] = useState<Tab>((initialTab as Tab) || 'register');
  useEffect(() => { if (initialTab) setTab(initialTab as Tab); }, [initialTab]);
  const [assetId, setAssetId] = useState<Id | null>(null);
  const fy = state.fiscalYears.find((f) => f.entityId === entityId && f.label === ui.fiscalYearLabel) ?? state.fiscalYears.filter((f) => f.entityId === entityId).sort((a, b) => (a.label < b.label ? 1 : -1))[0];
  const yearRows = useMemo(() => (fy ? yearDepreciation(state, entityId, fy.id) : []), [state, entityId, fy]);
  const toPost = r2(yearRows.reduce((s, r) => s + r.toPost, 0));
  const tabs = [
    { id: 'register' as Tab, label: `Registre · ${state.assets.filter((a) => a.entityId === entityId).length}` },
    { id: 'new' as Tab, label: 'Nouvelle immobilisation' },
    { id: 'sheet' as Tab, label: assetId ? `Fiche · ${state.assets.find((a) => a.id === assetId)?.code ?? ''}` : 'Fiche' },
    { id: 'yearend' as Tab, label: <>Dotations {fy?.label} {toPost > 0 ? <Chip kind="warn">{fmt(toPost, 0)}</Chip> : <Chip kind="good">à jour</Chip>}</> },
    { id: 'categories' as Tab, label: 'Catégories' },
  ];
  const open = (id: Id) => { setAssetId(id); setTab('sheet'); };
  return (
    <>
      <div className="sheet-head"><h1>{t('room_assets')}</h1><Tabs tabs={tabs} value={tab} onChange={setTab} /></div>
      <div className="sheet-body">
        {tab === 'register' && <Register entityId={entityId} onOpen={open} />}
        {tab === 'new' && <NewAsset entityId={entityId} onDone={open} />}
        {tab === 'sheet' && <Sheet entityId={entityId} assetId={assetId} onPick={setAssetId} />}
        {tab === 'yearend' && fy && <YearEnd entityId={entityId} fiscalYearId={fy.id} onOpen={open} />}
        {tab === 'categories' && <Categories entityId={entityId} />}
      </div>
    </>
  );
}

function Register({ entityId, onOpen }: { entityId: Id; onOpen: (id: Id) => void }) {
  const { state, toast } = useStore();
  const rows = assetRegister(state, entityId);
  const entity = state.entities.find((e) => e.id === entityId)!;
  const live = rows.filter((r) => r.asset.status !== 'disposed');
  const cost = r2(live.reduce((a, x) => a + x.asset.cost, 0)), acc = r2(live.reduce((a, x) => a + x.asset.accumulated, 0)), year = r2(live.reduce((a, x) => a + x.yearDotation, 0));
  const byCat = [...new Set(live.map((r) => r.asset.category))].map((c) => ({ c, n: live.filter((r) => r.asset.category === c).length, cost: r2(live.filter((r) => r.asset.category === c).reduce((a, x) => a + x.asset.cost, 0)), nbv: r2(live.filter((r) => r.asset.category === c).reduce((a, x) => a + x.nbv, 0)) }));
  const exportXlsx = () => downloadXlsx(`immobilisations-${entity.code}-${state.today}.xlsx`, [{ name: 'Registre', rows: [['Code', 'Désignation', 'N° de série', 'Catégorie', 'Acquisition', 'Valeur', 'Résiduelle', 'Durée (mois)', 'Taux %', 'Méthode', 'Début', 'Fin', 'Amort. cumulé', 'VNC', 'Dotation exercice', 'Localisation', 'Statut'], ...rows.map((r) => [r.asset.code, r.asset.name, r.asset.serial ?? '', r.asset.category, r.asset.acquisitionDate, r.asset.cost, r.asset.residual, r.asset.lifeMonths, r.asset.rate, METHOD_FR[r.asset.method], r.asset.startDate, r.asset.endDate, r.asset.accumulated, r.nbv, r.yearDotation, r.asset.location, STATUS[r.asset.status][0]])] }], toast);
  return (
    <>
      <div className="grid4">
        <div className="kpi"><div className="l">Biens en service ou en cours</div><div className="v">{live.length}</div></div>
        <div className="kpi"><div className="l">Valeur brute</div><div className="v">{fmt(cost, 0)}</div></div>
        <div className="kpi"><div className="l">Amortissements cumulés</div><div className="v">{fmt(acc, 0)}</div><div className="l">{Math.round((acc / Math.max(1, cost)) * 100)} % amorti</div></div>
        <div className="kpi"><div className="l">Valeur nette comptable</div><div className="v">{fmt(r2(cost - acc), 0)}</div><div className="l">dotation de l'exercice {fmt(year, 0)}</div></div>
      </div>
      <div className="card flush">
        <div style={{ display: 'flex', gap: 8, padding: 10, alignItems: 'center' }}>
          <span className="small muted">Cliquer une ligne pour la fiche, le plan d'amortissement et les écritures</span>
          <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={exportXlsx}>Exporter (Excel)</button>
        </div>
        <table>
          <thead><tr><th>Code</th><th>Désignation</th><th>Catégorie</th><th>Acquisition</th><th className="num">Valeur</th><th>Durée · taux</th><th>Méthode</th><th className="num">Amort. cumulé</th><th className="num">VNC</th><th className="num">Dotation exercice</th><th>Avancement</th><th>Statut</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.asset.id} onClick={() => onOpen(r.asset.id)} style={{ cursor: 'pointer' }}>
                <td className="mono">{r.asset.code}</td><td>{r.asset.name}<div className="small muted">{r.asset.serial ? `S/N ${r.asset.serial} · ` : ''}{r.asset.location}</div></td><td>{r.asset.category}</td><td><D iso={r.asset.acquisitionDate} /></td><td className="num">{fmt(r.asset.cost, 0)}</td><td>{r.asset.lifeMonths} mois · {r.asset.rate} %</td><td>{METHOD_FR[r.asset.method]}</td><td className="num">{fmt(r.asset.accumulated, 0)}</td><td className="num">{fmt(r.nbv, 0)}</td><td className="num">{fmt(r.yearDotation, 0)}</td>
                <td><div className="bar" style={{ width: 90 }}><i style={{ width: `${Math.round(r.progress * 100)}%` }} /></div></td><td><Chip kind={STATUS[r.asset.status][1]}>{STATUS[r.asset.status][0]}</Chip></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card flush">
        <table>
          <thead><tr><th>Par catégorie</th><th className="num">Biens</th><th className="num">Valeur brute</th><th className="num">VNC</th></tr></thead>
          <tbody>{byCat.map((c) => <tr key={c.c}><td>{c.c}</td><td className="num">{c.n}</td><td className="num">{fmt(c.cost, 0)}</td><td className="num">{fmt(c.nbv, 0)}</td></tr>)}</tbody>
        </table>
      </div>
    </>
  );
}

function NewAsset({ entityId, onDone }: { entityId: Id; onDone: (id: Id) => void }) {
  const { state, apply } = useStore();
  const cats = state.assetCategories.filter((c) => c.entityId === entityId);
  const [categoryId, setCategoryId] = useState(cats[0]?.id ?? '');
  const cat = cats.find((c) => c.id === categoryId);
  const [name, setName] = useState('');
  const [serial, setSerial] = useState('');
  const [acq, setAcq] = useState(state.today);
  const [start, setStart] = useState('');
  const [cost, setCost] = useState('');
  const [residual, setResidual] = useState('0');
  const [life, setLife] = useState('');
  const [method, setMethod] = useState<'' | DepreciationMethod>('');
  const [location, setLocation] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [post, setPost] = useState<'none' | 'supplier' | 'bank'>('none');
  const banks = state.bankAccounts.filter((b) => b.entityId === entityId && b.active !== false);
  const [bankId, setBankId] = useState(banks[0]?.id ?? '');
  const [vat, setVat] = useState('');
  const [notes, setNotes] = useState('');
  const lifeMonths = Number(life) || cat?.lifeMonths || 60;
  const m = method || cat?.method || 'linear';
  const c = parseAmount(cost) ?? 0;
  const preview = useMemo(() => {
    if (!cat || c <= 0) return [];
    const a: Asset = { id: 'x', entityId, code: 'APERÇU', name, categoryId: cat.id, category: cat.name, acquisitionDate: acq, cost: c, residual: parseAmount(residual) ?? 0, lifeMonths, rate: r2(1200 / lifeMonths), method: m, startDate: start || acq, endDate: '', accumulated: 0, location, status: 'in_service' };
    try { return depreciationSchedule(a); } catch { return []; }
  }, [cat, c, name, acq, residual, lifeMonths, m, start, location, entityId]);
  const save = () => {
    apply((s) => {
      const [s1, a] = addAsset(s, { entityId, name, serial: serial || undefined, categoryId, acquisitionDate: acq, cost: c, residual: parseAmount(residual) ?? 0, lifeMonths: Number(life) || undefined, method: method || undefined, startDate: start || undefined, location, supplierId: supplierId || undefined, notes: notes || undefined, acquisition: post === 'none' ? null : { credit: post, bankAccountId: post === 'bank' ? bankId : undefined, vatAmount: parseAmount(vat) ?? 0 } });
      window.setTimeout(() => onDone(a.id), 0);
      return s1;
    }, post === 'none' ? 'Immobilisation enregistrée' : "Immobilisation enregistrée et écriture d'acquisition comptabilisée");
  };
  return (
    <div className="cols">
      <form className="grow" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="grid3">
            <Field label="Désignation" style={{ gridColumn: 'span 2' }}><input className="in" value={name} onChange={(e) => setName(e.target.value)} placeholder="Serveur de fichiers · Véhicule · Agencement…" /></Field>
            <Field label="N° de série ou référence unique"><input className="in mono" value={serial} onChange={(e) => setSerial(e.target.value)} /></Field>
            <Field label="Catégorie"><Select className="in" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>{cats.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.lifeMonths} mois · {METHOD_FR[x.method]}</option>)}</Select></Field>
            <Field label="Date d'acquisition"><input className="in mono" type="date" value={acq} onChange={(e) => setAcq(e.target.value)} /></Field>
            <Field label="Mise en service (début d'amortissement)"><input className="in mono" type="date" value={start} onChange={(e) => setStart(e.target.value)} placeholder={acq} /></Field>
            <Field label="Valeur d'acquisition (HT)"><input className="in num" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0,00" /></Field>
            <Field label="Valeur résiduelle"><input className="in num" value={residual} onChange={(e) => setResidual(e.target.value)} /></Field>
            <Field label={`Durée (mois) · taux ${r2(1200 / lifeMonths)} %`}><input className="in num" value={life} onChange={(e) => setLife(e.target.value)} placeholder={String(cat?.lifeMonths ?? 60)} /></Field>
            <Field label="Méthode"><Select className="in" value={method} onChange={(e) => setMethod(e.target.value as '' | DepreciationMethod)}><option value="">Catégorie · {METHOD_FR[cat?.method ?? 'linear']}</option><option value="linear">Linéaire</option><option value="declining">Dégressif · coefficient {DECLINING_COEFFICIENT(lifeMonths)}</option></Select></Field>
            <Field label="Localisation"><input className="in" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Étage 3 · bureau 12" /></Field>
            <Field label="Fournisseur"><Select recent="suppliers" className="in" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">—</option>{state.suppliers.filter((s) => s.entityId === entityId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Écriture d'acquisition"><Select className="in" value={post} onChange={(e) => setPost(e.target.value as 'none' | 'supplier' | 'bank')}><option value="none">Aucune (déjà comptabilisée)</option><option value="supplier">Immobilisation D · fournisseur C</option><option value="bank">Immobilisation D · banque C</option></Select></Field>
            {post !== 'none' && <Field label="TVA déductible (montant)"><input className="in num" value={vat} onChange={(e) => setVat(e.target.value)} placeholder="0,00" /></Field>}
            {post === 'bank' && <Field label="Compte bancaire"><Select recent="banks" className="in" value={bankId} onChange={(e) => setBankId(e.target.value)}>{banks.map((b) => <option key={b.id} value={b.id}>{b.bankName} · {b.name}</option>)}</Select></Field>}
            <Field label="Notes" style={{ gridColumn: 'span 3' }}><input className="in" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          </div>
          <div className="actions"><button type="submit" className="btn primary" disabled={!name.trim() || !categoryId || c <= 0 || (post === 'supplier' && !supplierId)}>Enregistrer l'immobilisation</button></div>
        </div>
      </form>
      <aside className="side">
        <div className="card">
          <h2>Plan d'amortissement · aperçu</h2>
          {preview.length ? (
            <table><thead><tr><th>Année</th><th className="num">Mois</th><th className="num">Dotation</th><th className="num">VNC fin</th></tr></thead><tbody>{preview.map((r) => <tr key={r.year}><td>{r.year}</td><td className="num">{r.months}</td><td className="num">{fmt(r.dotation, 0)}</td><td className="num">{fmt(r.closing, 0)}</td></tr>)}</tbody></table>
          ) : <div className="small muted">Saisir la valeur et la catégorie pour calculer le plan (prorata temporis au mois, le mois de mise en service compte en entier).</div>}
          <div className="small muted" style={{ marginTop: 8 }}>Comptes : {cat ? `${state.accounts.find((a) => a.id === cat.assetAccountId)?.code} / ${state.accounts.find((a) => a.id === cat.accDeprAccountId)?.code}` : '—'} · dotation annuelle comptabilisée à la clôture.</div>
        </div>
      </aside>
    </div>
  );
}

function Sheet({ entityId, assetId, onPick }: { entityId: Id; assetId: Id | null; onPick: (id: Id) => void }) {
  const { state, apply, t } = useStore();
  const assets = state.assets.filter((a) => a.entityId === entityId);
  const a = assets.find((x) => x.id === assetId) ?? assets[0];
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(a?.name ?? '');
  const [serial, setSerial] = useState(a?.serial ?? '');
  const [location, setLocation] = useState(a?.location ?? '');
  const [notes, setNotes] = useState(a?.notes ?? '');
  const [life, setLife] = useState(String(a?.lifeMonths ?? ''));
  const [method, setMethod] = useState<DepreciationMethod>(a?.method ?? 'linear');
  const [start, setStart] = useState(a?.startDate ?? '');
  const [status, setStatus] = useState<Asset['status']>(a?.status ?? 'in_service');
  const [tracked, setTracked] = useState(a?.id);
  if (a && tracked !== a.id) { setTracked(a.id); setName(a.name); setSerial(a.serial ?? ''); setLocation(a.location); setNotes(a.notes ?? ''); setLife(String(a.lifeMonths)); setMethod(a.method); setStart(a.startDate); setStatus(a.status); setEdit(false); }
  if (!a) return <div className="card"><div className="muted">Aucune immobilisation. Utilisez « Nouvelle immobilisation ».</div></div>;
  const schedule = depreciationSchedule(a);
  const entries = state.entries.filter((e) => e.entityId === entityId && e.lines.some((l) => l.assetId === a.id)).sort((x, y) => (x.date < y.date ? -1 : 1));
  const cat = state.assetCategories.find((c) => c.id === a.categoryId);
  const locked = a.accumulated > 0;
  const save = () => { if (apply((s) => updateAsset(s, a.id, { name, serial: serial || undefined, location, notes: notes || undefined, status, ...(locked ? {} : { lifeMonths: Number(life) || a.lifeMonths, method, startDate: start }) }), 'Fiche mise à jour')) setEdit(false); };
  return (
    <div className="cols">
      <div className="grow">
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Select className="in" style={{ maxWidth: 360 }} value={a.id} onChange={(e) => onPick(e.target.value)}>{assets.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}</Select>
            <Chip kind={STATUS[a.status][1]}>{STATUS[a.status][0]}</Chip>
            <span style={{ marginLeft: 'auto' }} />
            {!edit && <button className="btn sm" onClick={() => setEdit(true)}>{t('edit')}</button>}
            <DeleteButton table="asset" rowId={a.id} label={`Immobilisation ${a.code} · ${a.name}`} entityId={entityId} />
          </div>
          {edit ? (
            <div className="grid3" style={{ marginTop: 12 }}>
              <Field label="Désignation" style={{ gridColumn: 'span 2' }}><input className="in" value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <Field label="N° de série"><input className="in mono" value={serial} onChange={(e) => setSerial(e.target.value)} /></Field>
              <Field label="Localisation"><input className="in" value={location} onChange={(e) => setLocation(e.target.value)} /></Field>
              <Field label="Statut"><Select className="in" value={status} onChange={(e) => setStatus(e.target.value as Asset['status'])}><option value="in_service">En service</option><option value="wip">En cours</option><option value="disposed">Cédé · sorti</option></Select></Field>
              <Field label={`Durée (mois)${locked ? ' · figée (dotations comptabilisées)' : ''}`}><input className="in num" value={life} disabled={locked} onChange={(e) => setLife(e.target.value)} /></Field>
              <Field label="Méthode"><Select className="in" value={method} disabled={locked} onChange={(e) => setMethod(e.target.value as DepreciationMethod)}><option value="linear">Linéaire</option><option value="declining">Dégressif</option></Select></Field>
              <Field label="Début d'amortissement"><input className="in mono" type="date" value={start} disabled={locked} onChange={(e) => setStart(e.target.value)} /></Field>
              <Field label="Notes" style={{ gridColumn: 'span 3' }}><input className="in" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
              <div className="actions" style={{ gridColumn: 'span 3' }}><button className="btn" onClick={() => setEdit(false)}>Annuler</button><button className="btn primary" onClick={save}>Enregistrer</button></div>
            </div>
          ) : (
            <div className="kv" style={{ marginTop: 12 }}>
              <span className="k">Code</span><span className="mono">{a.code}</span>
              <span className="k">Désignation</span><span>{a.name}</span>
              <span className="k">N° de série / référence</span><span className="mono">{a.serial ?? '—'}</span>
              <span className="k">Catégorie</span><span>{a.category} · comptes {state.accounts.find((x) => x.id === cat?.assetAccountId)?.code} / {state.accounts.find((x) => x.id === cat?.accDeprAccountId)?.code}</span>
              <span className="k">Acquisition</span><span><D iso={a.acquisitionDate} />{a.supplierId ? ` · ${state.suppliers.find((s) => s.id === a.supplierId)?.name}` : ''}</span>
              <span className="k">Valeur d'acquisition</span><Money v={a.cost} />
              <span className="k">Valeur résiduelle</span><Money v={a.residual} />
              <span className="k">Durée · taux</span><span>{a.lifeMonths} mois · {a.rate} % par an · {METHOD_FR[a.method]}{a.method === 'declining' ? ` × ${DECLINING_COEFFICIENT(a.lifeMonths)}` : ''}</span>
              <span className="k">Amortissement</span><span>du <D iso={a.startDate} /> au <D iso={a.endDate} /></span>
              <span className="k">Amortissements cumulés</span><Money v={a.accumulated} />
              <span className="k">Valeur nette comptable</span><Money v={r2(a.cost - a.accumulated)} />
              <span className="k">Localisation</span><span>{a.location}</span>
              {a.notes && <><span className="k">Notes</span><span>{a.notes}</span></>}
            </div>
          )}
        </div>
        <div className="card flush">
          <table>
            <thead><tr><th>Plan d'amortissement</th><th className="num">Mois</th><th className="num">VNC début</th><th className="num">Dotation</th><th className="num">Cumul</th><th className="num">VNC fin</th><th>Comptabilisée</th></tr></thead>
            <tbody>{schedule.map((r) => <tr key={r.year} className={r.year === Number(state.today.slice(0, 4)) ? 'sel' : ''}><td>{r.year}</td><td className="num">{r.months}</td><td className="num">{fmt(r.opening, 0)}</td><td className="num">{fmt(r.dotation, 0)}</td><td className="num">{fmt(r.cumulative, 0)}</td><td className="num">{fmt(r.closing, 0)}</td><td>{r.posted ? <Chip kind="good">oui</Chip> : r.year < Number(state.today.slice(0, 4)) ? <Chip kind="warn">à régulariser</Chip> : <Chip kind="dim">à venir</Chip>}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
      <aside className="side">
        <div className="card">
          <h2>Écritures liées · {entries.length}</h2>
          {entries.length === 0 && <div className="small muted">Aucune écriture rattachée (bien repris en solde d'ouverture).</div>}
          {entries.map((e) => (
            <div key={e.id} style={{ borderTop: '1px solid var(--line)', padding: '6px 0' }}>
              <div className="small"><span className="mono">{entryRef(state, e)}</span> · <D iso={e.date} /> · {e.description}</div>
              {e.lines.filter((l) => l.assetId === a.id).map((l) => <div key={l.lineNo} className="small muted" style={{ display: 'flex', justifyContent: 'space-between' }}><span className="mono">{state.accounts.find((x) => x.id === l.accountId)?.code} {state.accounts.find((x) => x.id === l.accountId)?.nameFr}</span><span>{l.debit ? `D ${fmt(l.debit)}` : `C ${fmt(l.credit)}`}</span></div>)}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function YearEnd({ entityId, fiscalYearId, onOpen }: { entityId: Id; fiscalYearId: Id; onOpen: (id: Id) => void }) {
  const { state, apply, toast } = useStore();
  const fy = state.fiscalYears.find((f) => f.id === fiscalYearId)!;
  const rows = yearDepreciation(state, entityId, fiscalYearId);
  const toPost = r2(rows.reduce((s, r) => s + r.toPost, 0)), scheduled = r2(rows.reduce((s, r) => s + r.scheduled, 0)), posted = r2(rows.reduce((s, r) => s + r.alreadyPosted, 0));
  const runs = state.depreciationRuns.filter((r) => r.entityId === entityId && r.fiscalYearId === fiscalYearId);
  const [date, setDate] = useState(fy.end < state.today ? fy.end : state.today);
  const byCat = [...new Set(rows.map((r) => r.asset.category))].map((c) => ({ c, scheduled: r2(rows.filter((r) => r.asset.category === c).reduce((s, r) => s + r.scheduled, 0)), toPost: r2(rows.filter((r) => r.asset.category === c).reduce((s, r) => s + r.toPost, 0)) }));
  const entity = state.entities.find((e) => e.id === entityId)!;
  const exportXlsx = () => downloadXlsx(`dotations-${entity.code}-${fy.label}.xlsx`, [{ name: `Dotations ${fy.label}`, rows: [['Code', 'Désignation', 'Catégorie', 'Valeur', 'Dotation prévue', 'Déjà comptabilisée', 'À comptabiliser', 'VNC après'], ...rows.map((r) => [r.asset.code, r.asset.name, r.asset.category, r.asset.cost, r.scheduled, r.alreadyPosted, r.toPost, r.nbvAfter])] }], toast);
  return (
    <div className="cols">
      <div className="grow">
        <div className="grid4">
          <div className="kpi"><div className="l">Dotation prévue {fy.label}</div><div className="v">{fmt(scheduled, 0)}</div></div>
          <div className="kpi"><div className="l">Déjà comptabilisée</div><div className="v">{fmt(posted, 0)}</div></div>
          <div className="kpi"><div className="l">Reste à comptabiliser</div><div className="v" style={{ color: toPost ? 'var(--warn)' : 'var(--good)' }}>{fmt(toPost, 0)}</div></div>
          <div className="kpi"><div className="l">Biens concernés</div><div className="v">{rows.length}</div></div>
        </div>
        <div className="card flush">
          <table>
            <thead><tr><th>Code</th><th>Désignation</th><th>Catégorie</th><th className="num">Valeur</th><th className="num">Dotation prévue</th><th className="num">Comptabilisée</th><th className="num">À comptabiliser</th><th className="num">VNC après</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.asset.id} onClick={() => onOpen(r.asset.id)} style={{ cursor: 'pointer' }}><td className="mono">{r.asset.code}</td><td>{r.asset.name}</td><td>{r.asset.category}</td><td className="num">{fmt(r.asset.cost, 0)}</td><td className="num">{fmt(r.scheduled, 0)}</td><td className="num">{fmt(r.alreadyPosted, 0)}</td><td className="num">{fmt(r.toPost, 0)}</td><td className="num">{fmt(r.nbvAfter, 0)}</td></tr>)}</tbody>
            <tfoot><tr><td colSpan={4}>Total</td><td className="num">{fmt(scheduled, 0)}</td><td className="num">{fmt(posted, 0)}</td><td className="num">{fmt(toPost, 0)}</td><td></td></tr></tfoot>
          </table>
        </div>
        <div className="card flush">
          <table><thead><tr><th>Récapitulatif par catégorie</th><th className="num">Dotation prévue</th><th className="num">À comptabiliser</th></tr></thead><tbody>{byCat.map((c) => <tr key={c.c}><td>{c.c}</td><td className="num">{fmt(c.scheduled, 0)}</td><td className="num">{fmt(c.toPost, 0)}</td></tr>)}</tbody></table>
        </div>
      </div>
      <aside className="side">
        <div className="card">
          <h2>Comptabiliser les dotations {fy.label}</h2>
          <Field label="Date de l'écriture (dans l'exercice)"><input className="in mono" type="date" value={date} min={fy.start} max={fy.end} onChange={(e) => setDate(e.target.value)} /></Field>
          <button className="btn primary" style={{ marginTop: 10, width: '100%', justifyContent: 'center' }} disabled={toPost <= 0 || fy.isClosed} onClick={() => apply((s) => postDepreciation(s, entityId, fiscalYearId, date), `Dotations ${fy.label} comptabilisées`)}>Comptabiliser {fmt(toPost, 0)}</button>
          <div className="small muted" style={{ marginTop: 8 }}>Une écriture au journal des immobilisations : 68 dotation D par catégorie · 28 amortissements C par bien. Chaque bien garde la trace de ce qui est comptabilisé ; relancer la simulation après un ajout ne double jamais une dotation.</div>
          <button className="btn" style={{ marginTop: 10, width: '100%', justifyContent: 'center' }} onClick={exportXlsx}>Exporter la simulation (Excel)</button>
        </div>
        {runs.length > 0 && (
          <div className="card">
            <h2>Écritures de dotation {fy.label}</h2>
            {runs.map((r) => { const e = state.entries.find((x) => x.id === r.journalEntryId); return <div key={r.id} className="small" style={{ padding: '4px 0', borderTop: '1px solid var(--line)' }}><span className="mono">{entryRef(state, e)}</span> · <D iso={r.date} /> · {fmt(r.total, 0)} · {r.lines.length} biens</div>; })}
          </div>
        )}
      </aside>
    </div>
  );
}

function Categories({ entityId }: { entityId: Id }) {
  const { state, apply } = useStore();
  const cats = state.assetCategories.filter((c) => c.entityId === entityId);
  const accounts = state.accounts.filter((a) => a.entityId === entityId && a.active && a.isPostable);
  const assetAccounts = accounts.filter((a) => a.code.startsWith('2') && !a.code.startsWith('28') && !a.code.startsWith('29') && !a.code.startsWith('23')).sort((a, b) => a.code.localeCompare(b.code));
  const deprAccounts = accounts.filter((a) => a.code.startsWith('28')).sort((a, b) => a.code.localeCompare(b.code));
  const [editId, setEditId] = useState<Id | null>(null);
  const editing = cats.find((c) => c.id === editId);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [life, setLife] = useState('60');
  const [method, setMethod] = useState<DepreciationMethod>('linear');
  const [assetAcc, setAssetAcc] = useState(assetAccounts[0]?.id ?? '');
  const [deprAcc, setDeprAcc] = useState(deprAccounts[0]?.id ?? '');
  const load = (id: Id | null) => { const c = cats.find((x) => x.id === id); setEditId(id); setCode(c?.code ?? ''); setName(c?.name ?? ''); setLife(String(c?.lifeMonths ?? 60)); setMethod(c?.method ?? 'linear'); setAssetAcc(c?.assetAccountId ?? assetAccounts[0]?.id ?? ''); setDeprAcc(c?.accDeprAccountId ?? deprAccounts[0]?.id ?? ''); };
  const save = () => { if (apply((s) => (editing ? updateAssetCategory(s, editing.id, { name, lifeMonths: Number(life), method, assetAccountId: assetAcc, accDeprAccountId: deprAcc }) : addAssetCategory(s, { entityId, code: code.trim().toUpperCase(), name, lifeMonths: Number(life), method, assetAccountId: assetAcc, accDeprAccountId: deprAcc })), editing ? 'Catégorie mise à jour' : 'Catégorie créée')) load(null); };
  return (
    <div className="cols">
      <div className="grow">
        <div className="card flush">
          <table>
            <thead><tr><th>Code</th><th>Catégorie</th><th className="num">Durée</th><th className="num">Taux</th><th>Méthode</th><th>Compte d'immobilisation</th><th>Compte d'amortissement</th><th className="num">Biens</th><th></th></tr></thead>
            <tbody>{cats.map((c) => <tr key={c.id} className={c.id === editId ? 'sel' : ''}><td className="mono">{c.code}</td><td>{c.name}</td><td className="num">{c.lifeMonths} mois</td><td className="num">{r2(1200 / c.lifeMonths)} %</td><td>{METHOD_FR[c.method]}</td><td className="mono small">{state.accounts.find((a) => a.id === c.assetAccountId)?.code} {state.accounts.find((a) => a.id === c.assetAccountId)?.nameFr}</td><td className="mono small">{state.accounts.find((a) => a.id === c.accDeprAccountId)?.code} {state.accounts.find((a) => a.id === c.accDeprAccountId)?.nameFr}</td><td className="num">{state.assets.filter((a) => a.categoryId === c.id).length}</td><td><button className="btn sm" onClick={() => load(c.id)}>Modifier</button></td></tr>)}</tbody>
          </table>
        </div>
      </div>
      <aside className="side">
        <div className="card">
          <h2>{editing ? `Catégorie · ${editing.code}` : 'Nouvelle catégorie'}</h2>
          {!editing && <Field label="Code (clé de paramétrage)"><input className="in mono" value={code} onChange={(e) => setCode(e.target.value)} placeholder="EQUIPMENT" /></Field>}
          <Field label="Nom" style={{ marginTop: 8 }}><input className="in" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <div className="grid2" style={{ marginTop: 8 }}>
            <Field label="Durée par défaut (mois)"><input className="in num" value={life} onChange={(e) => setLife(e.target.value)} /></Field>
            <Field label="Méthode"><Select className="in" value={method} onChange={(e) => setMethod(e.target.value as DepreciationMethod)}><option value="linear">Linéaire</option><option value="declining">Dégressif</option></Select></Field>
          </div>
          <Field label="Compte d'immobilisation" style={{ marginTop: 8 }}><Select recent="accounts" className="in mono" value={assetAcc} onChange={(e) => setAssetAcc(e.target.value)}>{assetAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.nameFr}</option>)}</Select></Field>
          <Field label="Compte d'amortissements" style={{ marginTop: 8 }}><Select recent="accounts" className="in mono" value={deprAcc} onChange={(e) => setDeprAcc(e.target.value)}>{deprAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.nameFr}</option>)}</Select></Field>
          <div className="actions" style={{ marginTop: 10 }}>
            {editing && <button className="btn" onClick={() => load(null)}>Annuler</button>}
            <button className="btn primary" disabled={!name.trim() || (!editing && !code.trim()) || !assetAcc || !deprAcc} onClick={save}>{editing ? 'Enregistrer' : 'Créer'}</button>
          </div>
          <div className="small muted" style={{ marginTop: 8 }}>Le compte de dotation (68) se règle par clé DEPR_EXPENSE:&lt;code&gt; dans le plan comptable ; à défaut, le compte de dotation général est utilisé.</div>
        </div>
      </aside>
    </div>
  );
}
