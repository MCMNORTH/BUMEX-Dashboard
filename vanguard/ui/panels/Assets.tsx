import { useEffect, useMemo, useState } from 'react';
import {
  assetRegister, addAsset, updateAsset, depreciationSchedule, yearDepreciation, postDepreciation, addAssetCategory, updateAssetCategory, DECLINING_COEFFICIENT, isLandCategory,
  fmt, r2, parseAmount, type Id, type Asset, type DepreciationMethod,
  favoritesFirst, // [bumex-one]
} from '@bumex/domain';
import { useStore } from '../../store';
import { Tabs, Field, Chip, D, Money, DeleteButton, downloadXlsx, entryRef } from '../common';
import { Select } from '../Select';
import { useSay } from '../../one/say';
import { PageRefresh } from '../../one/PageRefresh'; // [bumex-one] ↻ at the right of the header (2026-11-22)
// [bumex-one] bilingual: every text follows the person's language, say('français', 'English') (vanguard/one/say.ts, 2026-11-21)

type Tab = 'register' | 'new' | 'sheet' | 'yearend' | 'categories';
const METHOD_FR: Record<DepreciationMethod, string> = { linear: 'Linéaire', declining: 'Dégressif' }; // also the Excel export's text: stays French
const METHOD_EN: Record<DepreciationMethod, string> = { linear: 'Straight-line', declining: 'Declining balance' }; // [bumex-one] on screen only
const NA = 'N/A'; // [bumex-one] land: no depreciation (isLandCategory)
const STATUS: Record<Asset['status'], [string, 'good' | 'warn' | 'dim']> = { in_service: ['En service', 'good'], wip: ['En cours', 'warn'], disposed: ['Cédé · sorti', 'dim'] };
const STATUS_EN: Record<Asset['status'], string> = { in_service: 'In service', wip: 'In progress', disposed: 'Disposed · retired' }; // [bumex-one] on screen only

export function AssetsPanel({ entityId, initialTab }: { entityId: Id; initialTab?: string | null }) {
  const { state, t, ui } = useStore();
  const say = useSay();
  const [tab, setTab] = useState<Tab>((initialTab as Tab) || 'register');
  useEffect(() => { if (initialTab) setTab(initialTab as Tab); }, [initialTab]);
  const [assetId, setAssetId] = useState<Id | null>(null);
  const fy = state.fiscalYears.find((f) => f.entityId === entityId && f.label === ui.fiscalYearLabel) ?? state.fiscalYears.filter((f) => f.entityId === entityId).sort((a, b) => (a.label < b.label ? 1 : -1))[0];
  const yearRows = useMemo(() => (fy ? yearDepreciation(state, entityId, fy.id) : []), [state, entityId, fy]);
  const toPost = r2(yearRows.reduce((s, r) => s + r.toPost, 0));
  const tabs = [
    { id: 'register' as Tab, label: `${say('Registre', 'Register')} · ${state.assets.filter((a) => a.entityId === entityId).length}` },
    { id: 'new' as Tab, label: say('Nouvelle immobilisation', 'New fixed asset') },
    { id: 'sheet' as Tab, label: assetId ? `${say('Fiche', 'Details')} · ${state.assets.find((a) => a.id === assetId)?.code ?? ''}` : say('Fiche', 'Details') },
    { id: 'yearend' as Tab, label: <>{say('Dotations', 'Depreciation charges')} {fy?.label} {toPost > 0 ? <Chip kind="warn">{fmt(toPost, 0)}</Chip> : <Chip kind="good">{say('À jour', 'Up to date')}</Chip>}</> },
    { id: 'categories' as Tab, label: say('Catégories', 'Categories') },
  ];
  const open = (id: Id) => { setAssetId(id); setTab('sheet'); };
  return (
    <>
      <div className="sheet-head"><h1>{t('room_assets')}</h1><Tabs tabs={tabs} value={tab} onChange={setTab} /><PageRefresh /></div>
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
  const say = useSay();
  const rows = assetRegister(state, entityId);
  const entity = state.entities.find((e) => e.id === entityId)!;
  const live = rows.filter((r) => r.asset.status !== 'disposed');
  const cost = r2(live.reduce((a, x) => a + x.asset.cost, 0)), acc = r2(live.reduce((a, x) => a + x.asset.accumulated, 0)), year = r2(live.reduce((a, x) => a + x.yearDotation, 0));
  const byCat = [...new Set(live.map((r) => r.asset.category))].map((c) => ({ c, n: live.filter((r) => r.asset.category === c).length, cost: r2(live.filter((r) => r.asset.category === c).reduce((a, x) => a + x.asset.cost, 0)), nbv: r2(live.filter((r) => r.asset.category === c).reduce((a, x) => a + x.nbv, 0)) }));
  const exportXlsx = () => downloadXlsx(`immobilisations-${entity.code}-${state.today}.xlsx`, [{ name: 'Registre', rows: [['Code', 'Désignation', 'N° de série', 'Catégorie', 'Acquisition', 'Valeur', 'Résiduelle', 'Durée (mois)', 'Taux %', 'Méthode', 'Début', 'Fin', 'Amort. cumulé', 'VNC', 'Dotation exercice', 'Localisation', 'Statut'], ...rows.map((r) => [r.asset.code, r.asset.name, r.asset.serial ?? '', r.asset.category, r.asset.acquisitionDate, r.asset.cost, ...(isLandCategory(r.category) ? [NA, NA, NA, NA, NA, NA] : [r.asset.residual, r.asset.lifeMonths, r.asset.rate, METHOD_FR[r.asset.method], r.asset.startDate, r.asset.endDate]), r.asset.accumulated, r.nbv, r.yearDotation, r.asset.location, STATUS[r.asset.status][0]])] }], toast);
  return (
    <>
      <div className="grid4">
        <div className="kpi"><div className="l">{say('Biens en service ou en cours', 'Assets in service or in progress')}</div><div className="v">{live.length}</div></div>
        <div className="kpi"><div className="l">{say('Valeur brute', 'Gross value')}</div><div className="v">{fmt(cost, 0)}</div></div>
        <div className="kpi"><div className="l">{say('Amortissements cumulés', 'Accumulated depreciation')}</div><div className="v">{fmt(acc, 0)}</div><div className="l">{Math.round((acc / Math.max(1, cost)) * 100)} {say('% amorti', '% depreciated')}</div></div>
        <div className="kpi"><div className="l">{say('Valeur nette comptable', 'Net book value')}</div><div className="v">{fmt(r2(cost - acc), 0)}</div><div className="l">{say("Dotation de l'exercice", 'Depreciation charge for the year')} {fmt(year, 0)}</div></div>
      </div>
      <div className="card flush">
        <div style={{ display: 'flex', gap: 8, padding: 10, alignItems: 'center' }}>
          <span className="small muted">{say("Cliquer une ligne pour la fiche, le plan d'amortissement et les écritures", 'Click a row for its details, depreciation schedule and journal entries')}</span>
          <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={exportXlsx}>{say('Exporter (Excel)', 'Export (Excel)')}</button>
        </div>
        <table>
          <thead><tr><th>Code</th><th>{say('Désignation', 'Name')}</th><th>{say('Catégorie', 'Category')}</th><th>{say('Acquisition', 'Acquired')}</th><th className="num">{say('Valeur', 'Value')}</th><th>{say('Durée · taux', 'Useful life · rate')}</th><th>{say('Méthode', 'Method')}</th><th className="num">{say('Amort. cumulé', 'Accum. depr.')}</th><th className="num">{say('VNC', 'NBV')}</th><th className="num">{say('Dotation exercice', 'Charge for the year')}</th><th>{say('Avancement', 'Progress')}</th><th>{say('Statut', 'Status')}</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.asset.id} onClick={() => onOpen(r.asset.id)} style={{ cursor: 'pointer' }}>
                <td className="mono">{r.asset.code}</td><td>{r.asset.name}<div className="small muted">{r.asset.serial ? `S/N ${r.asset.serial} · ` : ''}{r.asset.location}</div></td><td>{r.asset.category}</td><td><D iso={r.asset.acquisitionDate} /></td><td className="num">{fmt(r.asset.cost, 0)}</td><td>{isLandCategory(r.category) ? NA : say(`${r.asset.lifeMonths} mois · ${r.asset.rate} %`, `${r.asset.lifeMonths} months · ${r.asset.rate} %`)}</td><td>{isLandCategory(r.category) ? NA : say(METHOD_FR[r.asset.method], METHOD_EN[r.asset.method])}</td><td className="num">{fmt(r.asset.accumulated, 0)}</td><td className="num">{fmt(r.nbv, 0)}</td><td className="num">{fmt(r.yearDotation, 0)}</td>
                <td><div className="bar" style={{ width: 90 }}><i style={{ width: `${Math.round(r.progress * 100)}%` }} /></div></td><td><Chip kind={STATUS[r.asset.status][1]}>{say(STATUS[r.asset.status][0], STATUS_EN[r.asset.status])}</Chip></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card flush">
        <table>
          <thead><tr><th>{say('Par catégorie', 'By category')}</th><th className="num">{say('Biens', 'Assets')}</th><th className="num">{say('Valeur brute', 'Gross value')}</th><th className="num">{say('VNC', 'NBV')}</th></tr></thead>
          <tbody>{byCat.map((c) => <tr key={c.c}><td>{c.c}</td><td className="num">{c.n}</td><td className="num">{fmt(c.cost, 0)}</td><td className="num">{fmt(c.nbv, 0)}</td></tr>)}</tbody>
        </table>
      </div>
    </>
  );
}

function NewAsset({ entityId, onDone }: { entityId: Id; onDone: (id: Id) => void }) {
  const { state, apply } = useStore();
  const say = useSay();
  const cats = state.assetCategories.filter((c) => c.entityId === entityId);
  const [categoryId, setCategoryId] = useState(cats[0]?.id ?? '');
  const cat = cats.find((c) => c.id === categoryId);
  const land = isLandCategory(cat); // [bumex-one] no service date, residual value, duration or method: N/A
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
  const banks = favoritesFirst(state.bankAccounts.filter((b) => b.entityId === entityId && b.active !== false)); // [bumex-one] favourites first
  const [bankId, setBankId] = useState(banks[0]?.id ?? '');
  const [vat, setVat] = useState('');
  const [notes, setNotes] = useState('');
  const lifeMonths = Number(life) || cat?.lifeMonths || 60;
  const m = method || cat?.method || 'linear';
  const c = parseAmount(cost) ?? 0;
  const preview = useMemo(() => {
    if (!cat || c <= 0) return [];
    const a: Asset = { id: 'x', entityId, code: 'APERÇU', name, categoryId: cat.id, category: cat.name, acquisitionDate: acq, cost: c, residual: parseAmount(residual) ?? 0, lifeMonths, rate: r2(1200 / lifeMonths), method: m, startDate: start || acq, endDate: '', accumulated: 0, location, status: 'in_service' };
    try { return depreciationSchedule(a, cat); } catch { return []; }
  }, [cat, c, name, acq, residual, lifeMonths, m, start, location, entityId]);
  const save = () => {
    apply((s) => {
      const [s1, a] = addAsset(s, { entityId, name, serial: serial || undefined, categoryId, acquisitionDate: acq, cost: c, ...(land ? {} : { residual: parseAmount(residual) ?? 0, lifeMonths: Number(life) || undefined, method: method || undefined, startDate: start || undefined }), location, supplierId: supplierId || undefined, notes: notes || undefined, acquisition: post === 'none' ? null : { credit: post, bankAccountId: post === 'bank' ? bankId : undefined, vatAmount: parseAmount(vat) ?? 0 } });
      window.setTimeout(() => onDone(a.id), 0);
      return s1;
    }, post === 'none' ? say('Immobilisation enregistrée', 'Fixed asset saved') : say("Immobilisation enregistrée et écriture d'acquisition comptabilisée", 'Fixed asset saved and acquisition entry posted'));
  };
  return (
    <div className="cols">
      <form className="grow" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="grid3">
            <Field label={say('Désignation', 'Name')} style={{ gridColumn: 'span 2' }}><input className="in" value={name} onChange={(e) => setName(e.target.value)} placeholder={say('Serveur de fichiers · Véhicule · Agencement…', 'File server · Vehicle · Fit-out…')} /></Field>
            <Field label={say('N° de série ou référence unique', 'Serial number or unique reference')}><input className="in mono" value={serial} onChange={(e) => setSerial(e.target.value)} /></Field>
            <Field label={say('Catégorie', 'Category')}><Select className="in" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>{cats.map((x) => <option key={x.id} value={x.id}>{x.name} · {isLandCategory(x) ? say('non amortissable', 'not depreciable') : say(`${x.lifeMonths} mois · ${METHOD_FR[x.method]}`, `${x.lifeMonths} months · ${METHOD_EN[x.method]}`)}</option>)}</Select></Field>
            <Field label={say("Date d'acquisition", 'Acquisition date')}><input className="in mono" type="date" value={acq} onChange={(e) => setAcq(e.target.value)} /></Field>
            <Field label={say("Mise en service (début d'amortissement)", 'In service since (depreciation start)')}>{land ? <input className="in" value={NA} disabled /> : <input className="in mono" type="date" value={start} onChange={(e) => setStart(e.target.value)} placeholder={acq} />}</Field>
            <Field label={say("Valeur d'acquisition (HT)", 'Acquisition cost (excl. tax)')}><input className="in num" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0,00" /></Field>
            <Field label={say('Valeur résiduelle', 'Residual value')}>{land ? <input className="in num" value={NA} disabled /> : <input className="in num" value={residual} onChange={(e) => setResidual(e.target.value)} />}</Field>
            <Field label={land ? say('Durée (mois)', 'Useful life (months)') : say(`Durée (mois) · taux ${r2(1200 / lifeMonths)} %`, `Useful life (months) · rate ${r2(1200 / lifeMonths)} %`)}>{land ? <input className="in num" value={NA} disabled /> : <input className="in num" value={life} onChange={(e) => setLife(e.target.value)} placeholder={String(cat?.lifeMonths ?? 60)} />}</Field>
            <Field label={say('Méthode', 'Method')}>{land ? <Select className="in" value="" disabled><option value="">{NA}</option></Select> : <Select className="in" value={method} onChange={(e) => setMethod(e.target.value as '' | DepreciationMethod)}><option value="">{say('Catégorie', 'Category')} · {say(METHOD_FR[cat?.method ?? 'linear'], METHOD_EN[cat?.method ?? 'linear'])}</option><option value="linear">{say('Linéaire', 'Straight-line')}</option><option value="declining">{say('Dégressif', 'Declining balance')} · coefficient {DECLINING_COEFFICIENT(lifeMonths)}</option></Select>}</Field>
            <Field label={say('Localisation', 'Location')}><input className="in" value={location} onChange={(e) => setLocation(e.target.value)} placeholder={say('Étage 3 · bureau 12', 'Floor 3 · office 12')} /></Field>
            <Field label={say('Fournisseur', 'Supplier')}><Select recent="suppliers" className="in" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">—</option>{state.suppliers.filter((s) => s.entityId === entityId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label={say("Écriture d'acquisition", 'Acquisition entry')}><Select className="in" value={post} onChange={(e) => setPost(e.target.value as 'none' | 'supplier' | 'bank')}><option value="none">{say('Aucune (déjà comptabilisée)', 'None (already posted)')}</option><option value="supplier">{say('Immobilisation D · fournisseur C', 'Fixed asset Dr · supplier Cr')}</option><option value="bank">{say('Immobilisation D · banque C', 'Fixed asset Dr · bank Cr')}</option></Select></Field>
            {post !== 'none' && <Field label={say('TVA déductible (montant)', 'Deductible VAT (amount)')}><input className="in num" value={vat} onChange={(e) => setVat(e.target.value)} placeholder="0,00" /></Field>}
            {post === 'bank' && <Field label={say('Compte bancaire', 'Bank account')}><Select className="in" value={bankId} onChange={(e) => setBankId(e.target.value)}>{banks.map((b) => <option key={b.id} value={b.id}>{b.favorite ? '★ ' : ''}{b.bankName} · {b.name}</option>)}</Select></Field>}
            <Field label="Notes" style={{ gridColumn: 'span 3' }}><input className="in" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          </div>
          <div className="actions"><button type="submit" className="btn primary" disabled={!name.trim() || !categoryId || c <= 0 || (post === 'supplier' && !supplierId)}>{say("Enregistrer l'immobilisation", 'Save fixed asset')}</button></div>
        </div>
      </form>
      <aside className="side">
        <div className="card">
          <h2>{say("Plan d'amortissement · aperçu", 'Depreciation schedule · preview')}</h2>
          {land ? <div className="small muted">{say("Terrain : non amortissable. Aucune dotation, la valeur nette reste la valeur d'acquisition.", 'Land: not depreciable. No depreciation charge; the net value stays at the acquisition cost.')}</div> : preview.length ? (
            <table><thead><tr><th>{say('Année', 'Year')}</th><th className="num">{say('Mois', 'Months')}</th><th className="num">{say('Dotation', 'Charge')}</th><th className="num">{say('VNC fin', 'Closing NBV')}</th></tr></thead><tbody>{preview.map((r) => <tr key={r.year}><td>{r.year}</td><td className="num">{r.months}</td><td className="num">{fmt(r.dotation, 0)}</td><td className="num">{fmt(r.closing, 0)}</td></tr>)}</tbody></table>
          ) : <div className="small muted">{say('Saisir la valeur et la catégorie pour calculer le plan (prorata temporis au mois, le mois de mise en service compte en entier).', 'Enter the cost and the category to calculate the schedule (pro rata by month; the month placed in service counts in full).')}</div>}
          <div className="small muted" style={{ marginTop: 8 }}>{say('Comptes : ', 'Accounts: ')}{cat ? `${state.accounts.find((a) => a.id === cat.assetAccountId)?.code} / ${state.accounts.find((a) => a.id === cat.accDeprAccountId)?.code}` : '—'}{say(' · dotation annuelle comptabilisée à la clôture.', ' · annual depreciation charge posted at year-end closing.')}</div>
        </div>
      </aside>
    </div>
  );
}

function Sheet({ entityId, assetId, onPick }: { entityId: Id; assetId: Id | null; onPick: (id: Id) => void }) {
  const { state, apply, t } = useStore();
  const say = useSay();
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
  if (!a) return <div className="card"><div className="muted">{say('Aucune immobilisation. Utilisez « Nouvelle immobilisation ».', 'No fixed assets. Use "New fixed asset".')}</div></div>;
  const entries = state.entries.filter((e) => e.entityId === entityId && e.lines.some((l) => l.assetId === a.id)).sort((x, y) => (x.date < y.date ? -1 : 1));
  const cat = state.assetCategories.find((c) => c.id === a.categoryId);
  const land = isLandCategory(cat ?? { code: '', name: a.category }); // [bumex-one] not depreciated: N/A
  const schedule = depreciationSchedule(a, cat);
  const locked = a.accumulated > 0;
  const save = () => { if (apply((s) => updateAsset(s, a.id, { name, serial: serial || undefined, location, notes: notes || undefined, status, ...(locked || land ? {} : { lifeMonths: Number(life) || a.lifeMonths, method, startDate: start }) }), say('Fiche mise à jour', 'Fixed asset updated'))) setEdit(false); };
  return (
    <div className="cols">
      <div className="grow">
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Select className="in" style={{ maxWidth: 360 }} value={a.id} onChange={(e) => onPick(e.target.value)}>{assets.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}</Select>
            <Chip kind={STATUS[a.status][1]}>{say(STATUS[a.status][0], STATUS_EN[a.status])}</Chip>
            <span style={{ marginLeft: 'auto' }} />
            {!edit && <button className="btn sm" onClick={() => setEdit(true)}>{t('edit')}</button>}
            <DeleteButton table="asset" rowId={a.id} label={`Immobilisation ${a.code} · ${a.name}`} entityId={entityId} />
          </div>
          {edit ? (
            <div className="grid3" style={{ marginTop: 12 }}>
              <Field label={say('Désignation', 'Name')} style={{ gridColumn: 'span 2' }}><input className="in" value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <Field label={say('N° de série', 'Serial number')}><input className="in mono" value={serial} onChange={(e) => setSerial(e.target.value)} /></Field>
              <Field label={say('Localisation', 'Location')}><input className="in" value={location} onChange={(e) => setLocation(e.target.value)} /></Field>
              <Field label={say('Statut', 'Status')}><Select className="in" value={status} onChange={(e) => setStatus(e.target.value as Asset['status'])}><option value="in_service">{say('En service', STATUS_EN.in_service)}</option><option value="wip">{say('En cours', STATUS_EN.wip)}</option><option value="disposed">{say('Cédé · sorti', STATUS_EN.disposed)}</option></Select></Field>
              <Field label={say(`Durée (mois)${locked && !land ? ' · figée (dotations comptabilisées)' : ''}`, `Useful life (months)${locked && !land ? ' · locked (charges posted)' : ''}`)}>{land ? <input className="in num" value={NA} disabled /> : <input className="in num" value={life} disabled={locked} onChange={(e) => setLife(e.target.value)} />}</Field>
              <Field label={say('Méthode', 'Method')}>{land ? <Select className="in" value="" disabled><option value="">{NA}</option></Select> : <Select className="in" value={method} disabled={locked} onChange={(e) => setMethod(e.target.value as DepreciationMethod)}><option value="linear">{say('Linéaire', 'Straight-line')}</option><option value="declining">{say('Dégressif', 'Declining balance')}</option></Select>}</Field>
              <Field label={say("Début d'amortissement", 'Depreciation start')}>{land ? <input className="in" value={NA} disabled /> : <input className="in mono" type="date" value={start} disabled={locked} onChange={(e) => setStart(e.target.value)} />}</Field>
              <Field label="Notes" style={{ gridColumn: 'span 3' }}><input className="in" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
              <div className="actions" style={{ gridColumn: 'span 3' }}><button className="btn" onClick={() => setEdit(false)}>{say('Annuler', 'Cancel')}</button><button className="btn primary" onClick={save}>{say('Enregistrer', 'Save')}</button></div>
            </div>
          ) : (
            <div className="kv" style={{ marginTop: 12 }}>
              <span className="k">Code</span><span className="mono">{a.code}</span>
              <span className="k">{say('Désignation', 'Name')}</span><span>{a.name}</span>
              <span className="k">{say('N° de série / référence', 'Serial number / reference')}</span><span className="mono">{a.serial ?? '—'}</span>
              <span className="k">{say('Catégorie', 'Category')}</span><span>{a.category} · {say('comptes', 'accounts')} {state.accounts.find((x) => x.id === cat?.assetAccountId)?.code} / {state.accounts.find((x) => x.id === cat?.accDeprAccountId)?.code}</span>
              <span className="k">{say('Acquisition', 'Acquired')}</span><span><D iso={a.acquisitionDate} />{a.supplierId ? ` · ${state.suppliers.find((s) => s.id === a.supplierId)?.name}` : ''}</span>
              <span className="k">{say("Valeur d'acquisition", 'Acquisition cost')}</span><Money v={a.cost} />
              <span className="k">{say('Valeur résiduelle', 'Residual value')}</span>{land ? <span>{NA}</span> : <Money v={a.residual} />}
              <span className="k">{say('Durée · taux', 'Useful life · rate')}</span>{land ? <span>{NA} · {say('terrain non amortissable', 'land, not depreciable')}</span> : <span>{a.lifeMonths} {say('mois', 'months')} · {a.rate} {say('% par an', '% per year')} · {say(METHOD_FR[a.method], METHOD_EN[a.method])}{a.method === 'declining' ? ` × ${DECLINING_COEFFICIENT(a.lifeMonths)}` : ''}</span>}
              <span className="k">{say('Amortissement', 'Depreciation')}</span>{land ? <span>{NA}</span> : <span>{say('du', 'from')} <D iso={a.startDate} /> {say('au', 'to')} <D iso={a.endDate} /></span>}
              <span className="k">{say('Amortissements cumulés', 'Accumulated depreciation')}</span><Money v={a.accumulated} />
              <span className="k">{say('Valeur nette comptable', 'Net book value')}</span><Money v={r2(a.cost - a.accumulated)} />
              <span className="k">{say('Localisation', 'Location')}</span><span>{a.location}</span>
              {a.notes && <><span className="k">Notes</span><span>{a.notes}</span></>}
            </div>
          )}
        </div>
        <div className="card flush">
          <table>
            <thead><tr><th>{say("Plan d'amortissement", 'Depreciation schedule')}</th><th className="num">{say('Mois', 'Months')}</th><th className="num">{say('VNC début', 'Opening NBV')}</th><th className="num">{say('Dotation', 'Charge')}</th><th className="num">{say('Cumul', 'Cumulative')}</th><th className="num">{say('VNC fin', 'Closing NBV')}</th><th>{say('Comptabilisée', 'Posted')}</th></tr></thead>
            <tbody>{land && <tr><td colSpan={7} className="muted">{say('Terrain : non amortissable, aucune dotation.', 'Land: not depreciable, no depreciation charge.')}</td></tr>}{schedule.map((r) => <tr key={r.year} className={r.year === Number(state.today.slice(0, 4)) ? 'sel' : ''}><td>{r.year}</td><td className="num">{r.months}</td><td className="num">{fmt(r.opening, 0)}</td><td className="num">{fmt(r.dotation, 0)}</td><td className="num">{fmt(r.cumulative, 0)}</td><td className="num">{fmt(r.closing, 0)}</td><td>{r.posted ? <Chip kind="good">{say('oui', 'Yes')}</Chip> : r.year < Number(state.today.slice(0, 4)) ? <Chip kind="warn">{say('à régulariser', 'Catch-up due')}</Chip> : <Chip kind="dim">{say('à venir', 'Upcoming')}</Chip>}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
      <aside className="side">
        <div className="card">
          <h2>{say('Écritures liées', 'Linked journal entries')} · {entries.length}</h2>
          {entries.length === 0 && <div className="small muted">{say("Aucune écriture rattachée (bien repris en solde d'ouverture).", 'No linked journal entry (asset brought in through the opening balance).')}</div>}
          {entries.map((e) => (
            <div key={e.id} style={{ borderTop: '1px solid var(--line)', padding: '6px 0' }}>
              <div className="small"><span className="mono">{entryRef(state, e)}</span> · <D iso={e.date} /> · {e.description}</div>
              {e.lines.filter((l) => l.assetId === a.id).map((l) => <div key={l.lineNo} className="small muted" style={{ display: 'flex', justifyContent: 'space-between' }}><span className="mono">{state.accounts.find((x) => x.id === l.accountId)?.code} {state.accounts.find((x) => x.id === l.accountId)?.nameFr}</span><span>{l.debit ? say(`D ${fmt(l.debit)}`, `Dr ${fmt(l.debit)}`) : say(`C ${fmt(l.credit)}`, `Cr ${fmt(l.credit)}`)}</span></div>)}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function YearEnd({ entityId, fiscalYearId, onOpen }: { entityId: Id; fiscalYearId: Id; onOpen: (id: Id) => void }) {
  const { state, apply, toast } = useStore();
  const say = useSay();
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
          <div className="kpi"><div className="l">{say('Dotation prévue', 'Scheduled charge')} {fy.label}</div><div className="v">{fmt(scheduled, 0)}</div></div>
          <div className="kpi"><div className="l">{say('Déjà comptabilisée', 'Already posted')}</div><div className="v">{fmt(posted, 0)}</div></div>
          <div className="kpi"><div className="l">{say('Reste à comptabiliser', 'Left to post')}</div><div className="v" style={{ color: toPost ? 'var(--warn)' : 'var(--good)' }}>{fmt(toPost, 0)}</div></div>
          <div className="kpi"><div className="l">{say('Biens concernés', 'Assets included')}</div><div className="v">{rows.length}</div></div>
        </div>
        <div className="card flush">
          <table>
            <thead><tr><th>Code</th><th>{say('Désignation', 'Name')}</th><th>{say('Catégorie', 'Category')}</th><th className="num">{say('Valeur', 'Value')}</th><th className="num">{say('Dotation prévue', 'Scheduled charge')}</th><th className="num">{say('Comptabilisée', 'Posted')}</th><th className="num">{say('À comptabiliser', 'To post')}</th><th className="num">{say('VNC après', 'NBV after')}</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.asset.id} onClick={() => onOpen(r.asset.id)} style={{ cursor: 'pointer' }}><td className="mono">{r.asset.code}</td><td>{r.asset.name}</td><td>{r.asset.category}</td><td className="num">{fmt(r.asset.cost, 0)}</td><td className="num">{fmt(r.scheduled, 0)}</td><td className="num">{fmt(r.alreadyPosted, 0)}</td><td className="num">{fmt(r.toPost, 0)}</td><td className="num">{fmt(r.nbvAfter, 0)}</td></tr>)}</tbody>
            <tfoot><tr><td colSpan={4}>Total</td><td className="num">{fmt(scheduled, 0)}</td><td className="num">{fmt(posted, 0)}</td><td className="num">{fmt(toPost, 0)}</td><td></td></tr></tfoot>
          </table>
        </div>
        <div className="card flush">
          <table><thead><tr><th>{say('Récapitulatif par catégorie', 'Summary by category')}</th><th className="num">{say('Dotation prévue', 'Scheduled charge')}</th><th className="num">{say('À comptabiliser', 'To post')}</th></tr></thead><tbody>{byCat.map((c) => <tr key={c.c}><td>{c.c}</td><td className="num">{fmt(c.scheduled, 0)}</td><td className="num">{fmt(c.toPost, 0)}</td></tr>)}</tbody></table>
        </div>
      </div>
      <aside className="side">
        <div className="card">
          <h2>{say('Comptabiliser les dotations', 'Post depreciation charges')} {fy.label}</h2>
          <Field label={say("Date de l'écriture (dans l'exercice)", 'Entry date (within the fiscal year)')}><input className="in mono" type="date" value={date} min={fy.start} max={fy.end} onChange={(e) => setDate(e.target.value)} /></Field>
          <button className="btn primary" style={{ marginTop: 10, width: '100%', justifyContent: 'center' }} disabled={toPost <= 0 || fy.isClosed} onClick={() => apply((s) => postDepreciation(s, entityId, fiscalYearId, date), say(`Dotations ${fy.label} comptabilisées`, `Depreciation charges ${fy.label} posted`))}>{say('Comptabiliser', 'Post')} {fmt(toPost, 0)}</button>
          <div className="small muted" style={{ marginTop: 8 }}>{say('Une écriture au journal des immobilisations : 68 dotation D par catégorie · 28 amortissements C par bien. Chaque bien garde la trace de ce qui est comptabilisé ; relancer la simulation après un ajout ne double jamais une dotation.', 'One journal entry in the fixed asset journal: 68 depreciation charge Dr per category · 28 accumulated depreciation Cr per asset. Each asset keeps track of what has been posted; running the simulation again after an addition never doubles a charge.')}</div>
          <button className="btn" style={{ marginTop: 10, width: '100%', justifyContent: 'center' }} onClick={exportXlsx}>{say('Exporter la simulation (Excel)', 'Export the simulation (Excel)')}</button>
        </div>
        {runs.length > 0 && (
          <div className="card">
            <h2>{say('Écritures de dotation', 'Depreciation entries')} {fy.label}</h2>
            {runs.map((r) => { const e = state.entries.find((x) => x.id === r.journalEntryId); return <div key={r.id} className="small" style={{ padding: '4px 0', borderTop: '1px solid var(--line)' }}><span className="mono">{entryRef(state, e)}</span> · <D iso={r.date} /> · {fmt(r.total, 0)} · {r.lines.length} {say('biens', 'assets')}</div>; })}
          </div>
        )}
      </aside>
    </div>
  );
}

function Categories({ entityId }: { entityId: Id }) {
  const { state, apply } = useStore();
  const say = useSay();
  const cats = state.assetCategories.filter((c) => c.entityId === entityId);
  const accounts =state.accounts.filter((a) => a.entityId === entityId && a.active && a.isPostable);
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
  const save = () => { if (apply((s) => (editing ? updateAssetCategory(s, editing.id, { name, lifeMonths: Number(life), method, assetAccountId: assetAcc, accDeprAccountId: deprAcc }) : addAssetCategory(s, { entityId, code: code.trim().toUpperCase(), name, lifeMonths: Number(life), method, assetAccountId: assetAcc, accDeprAccountId: deprAcc })), editing ? say('Catégorie mise à jour', 'Category updated') : say('Catégorie créée', 'Category created'))) load(null); };
  return (
    <div className="cols">
      <div className="grow">
        <div className="card flush">
          <table>
            <thead><tr><th>Code</th><th>{say('Catégorie', 'Category')}</th><th className="num">{say('Durée', 'Useful life')}</th><th className="num">{say('Taux', 'Rate')}</th><th>{say('Méthode', 'Method')}</th><th>{say("Compte d'immobilisation", 'Fixed asset account')}</th><th>{say("Compte d'amortissement", 'Depreciation account')}</th><th className="num">{say('Biens', 'Assets')}</th><th></th></tr></thead>
            <tbody>{cats.map((c) => <tr key={c.id} className={c.id === editId ? 'sel' : ''}><td className="mono">{c.code}</td><td>{c.name}</td><td className="num">{isLandCategory(c) ? NA : say(`${c.lifeMonths} mois`, `${c.lifeMonths} months`)}</td><td className="num">{isLandCategory(c) ? NA : `${r2(1200 / c.lifeMonths)} %`}</td><td>{isLandCategory(c) ? <Chip kind="dim">{say('non amortissable', 'Not depreciable')}</Chip> : say(METHOD_FR[c.method], METHOD_EN[c.method])}</td><td className="mono small">{state.accounts.find((a) => a.id === c.assetAccountId)?.code} {state.accounts.find((a) => a.id === c.assetAccountId)?.nameFr}</td><td className="mono small">{state.accounts.find((a) => a.id === c.accDeprAccountId)?.code} {state.accounts.find((a) => a.id === c.accDeprAccountId)?.nameFr}</td><td className="num">{state.assets.filter((a) => a.categoryId === c.id).length}</td><td><button className="btn sm" onClick={() => load(c.id)}>{say('Modifier', 'Edit')}</button></td></tr>)}</tbody>
          </table>
        </div>
      </div>
      <aside className="side">
        <div className="card">
          <h2>{editing ? `${say('Catégorie', 'Category')} · ${editing.code}` : say('Nouvelle catégorie', 'New category')}</h2>
          {!editing && <Field label={say('Code (clé de paramétrage)', 'Code (settings key)')}><input className="in mono" value={code} onChange={(e) => setCode(e.target.value)} placeholder="EQUIPMENT" /></Field>}
          <Field label={say('Nom', 'Name')} style={{ marginTop: 8 }}><input className="in" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <div className="grid2" style={{ marginTop: 8 }}>
            <Field label={say('Durée par défaut (mois)', 'Default useful life (months)')}><input className="in num" value={life} onChange={(e) => setLife(e.target.value)} /></Field>
            <Field label={say('Méthode', 'Method')}><Select className="in" value={method} onChange={(e) => setMethod(e.target.value as DepreciationMethod)}><option value="linear">{say('Linéaire', 'Straight-line')}</option><option value="declining">{say('Dégressif', 'Declining balance')}</option></Select></Field>
          </div>
          <Field label={say("Compte d'immobilisation", 'Fixed asset account')} style={{ marginTop: 8 }}><Select recent="accounts" className="in mono" value={assetAcc} onChange={(e) => setAssetAcc(e.target.value)}>{assetAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.nameFr}</option>)}</Select></Field>
          <Field label={say("Compte d'amortissements", 'Accumulated depreciation account')} style={{ marginTop: 8 }}><Select recent="accounts" className="in mono" value={deprAcc} onChange={(e) => setDeprAcc(e.target.value)}>{deprAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.nameFr}</option>)}</Select></Field>
          <div className="actions" style={{ marginTop: 10 }}>
            {editing && <button className="btn" onClick={() => load(null)}>{say('Annuler', 'Cancel')}</button>}
            <button className="btn primary" disabled={!name.trim() || (!editing && !code.trim()) || !assetAcc || !deprAcc} onClick={save}>{editing ? say('Enregistrer', 'Save') : say('Créer', 'Create')}</button>
          </div>
          <div className="small muted" style={{ marginTop: 8 }}>{say('Le compte de dotation (68) se règle par clé DEPR_EXPENSE:<code> dans le plan comptable ; à défaut, le compte de dotation général est utilisé.', 'The depreciation charge account (68) is set with the key DEPR_EXPENSE:<code> in the chart of accounts; otherwise, the general depreciation charge account is used.')}</div>
        </div>
      </aside>
    </div>
  );
}
