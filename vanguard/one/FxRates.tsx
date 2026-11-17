import { useMemo, useState } from 'react';
import { setFxRate, importFxRates, deleteFxRate, fxRateUsed, fxKey, PARTNER_ROLES, FX_CURRENCIES, type Currency, type FxRate } from '@bumex/domain';
import { useStore } from '../store';
import { Chip, D, Field } from '../ui/common';
import { Select } from '../ui/Select';
import { useSay } from './say';
import { parseFxSheets, type ParsedFxFile } from './fx-import';

// [bumex-one] Réglages › Taux de change (asked on 2026-11-17): the rates every operation outside an invoice reads
// (payments, bank lines, transfers, the treasury's balances), by pair and date; entered, corrected, imported (the BCM's
// file as it publishes it), deleted while no posted entry used them. The lookup takes the latest rate on or before the
// operation's date and reads a pair the other way round when needed. Accounting roles change them; everyone reads them.
const EDIT_ROLES = [...PARTNER_ROLES, 'accountant', 'manager'];

export function FxRatesPanel() {
  const { state, apply, toast } = useStore();
  const say = useSay();
  const canEdit = EDIT_ROLES.includes(state.session.role);
  const functionals = [...new Set(state.entities.map((e) => e.functionalCurrency))] as Currency[];
  const pairs = [...new Set(state.fxRates.map((r) => `${r.from}/${r.to}`))].sort();
  const years = [...new Set(state.fxRates.map((r) => r.date.slice(0, 4)))].sort().reverse();
  const [pair, setPair] = useState('');
  const [year, setYear] = useState(years[0] ?? '');
  const rows = useMemo(
    () => state.fxRates.filter((r) => (!pair || `${r.from}/${r.to}` === pair) && (!year || r.date.startsWith(year))).sort((a, b) => (a.date === b.date ? fxKey(a).localeCompare(fxKey(b)) : a.date < b.date ? 1 : -1)),
    [state.fxRates, pair, year],
  );
  const latest = (from: Currency, to: Currency) => state.fxRates.filter((r) => r.from === from && r.to === to).sort((a, b) => (a.date < b.date ? 1 : -1))[0];

  // the form: a new rate, or the one being corrected (its day and pair fixed)
  const [editing, setEditing] = useState<FxRate | null>(null);
  const [from, setFrom] = useState<Currency>('EUR');
  const [to, setTo] = useState<Currency>(functionals.includes('MRU') ? 'MRU' : functionals[0] ?? 'MRU');
  const [date, setDate] = useState(state.today);
  const [rate, setRate] = useState('');
  const [source, setSource] = useState('BCM');
  const edit = (r: FxRate | null) => { setEditing(r); setFrom(r?.from ?? 'EUR'); setTo(r?.to ?? (functionals.includes('MRU') ? 'MRU' : functionals[0] ?? 'MRU')); setDate(r?.date ?? state.today); setRate(r ? String(r.rate) : ''); setSource(r?.source ?? 'BCM'); };
  const value = (() => { const n = Number(rate.replace(/[\s ]/g, '').replace(',', '.')); return rate.trim() && Number.isFinite(n) && n > 0 ? n : null; })();
  const save = () => { if (value !== null && apply((s) => setFxRate(s, { from, to, date, rate: value, source }), editing ? say('Taux corrigé', 'Rate corrected') : say('Taux enregistré', 'Rate saved'))) edit(null); };

  // the import: read, summed up, filtered, then applied in one change
  const [file, setFile] = useState<{ name: string; parsed: ParsedFxFile } | null>(null);
  const [pick, setPick] = useState<Currency[]>(['EUR', 'USD']);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const read = async (f: File | undefined) => {
    if (!f) return;
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const sheets = wb.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: '' }) }));
      const parsed = parseFxSheets(sheets, functionals.includes('MRU') ? 'MRU' : functionals[0]);
      if (!parsed.format) { toast('error', say('Aucun tableau de taux reconnu (colonnes Date / Devise / Cours, date / currency / value, ou date / currency / rate)', 'No rate table found (columns Date / Devise / Cours, date / currency / value, or date / currency / rate)')); return; }
      setFile({ name: f.name, parsed });
      const dates = parsed.rows.map((r) => r.date).sort();
      setFromDate(dates[0] ?? ''); setToDate(dates.at(-1) ?? '');
    } catch {
      toast('error', say('Fichier illisible', 'Unreadable file'));
    }
  };
  const chosen = file ? file.parsed.rows.filter((r) => pick.includes(r.from) && (!fromDate || r.date >= fromDate) && (!toDate || r.date <= toDate)) : [];
  const found = file ? [...new Set(file.parsed.rows.map((r) => r.from))] : [];
  const runImport = () => {
    const ok = apply((s) => {
      const [next, out] = importFxRates(s, chosen, file?.parsed.format === 'table' ? undefined : 'BCM');
      window.setTimeout(() => toast('ok', say(`Taux importés : ${out.added} ajoutés, ${out.replaced} remplacés, ${out.unchanged} déjà là`, `Rates imported: ${out.added} added, ${out.replaced} replaced, ${out.unchanged} already there`)), 0);
      return next;
    });
    if (ok) setFile(null);
  };

  return (
    <div className="cols">
      <div className="grow">
        <div className="grid4">
          {(['EUR', 'USD'] as Currency[]).map((c) => { const r = latest(c, 'MRU'); return <div key={c} className="kpi"><div className="l">{c}/MRU · {say('dernier taux', 'latest rate')}</div><div className="v">{r ? r.rate : '—'}</div><div className="small muted">{r ? <><D iso={r.date} /> · {r.source}</> : say('aucun taux', 'no rate')}</div></div>; })}
          <div className="kpi"><div className="l">{say('Taux enregistrés', 'Rates on file')}</div><div className="v">{state.fxRates.length}</div><div className="small muted">{state.fxRates.length ? <><D iso={[...state.fxRates].sort((a, b) => (a.date < b.date ? -1 : 1))[0].date} /> → <D iso={[...state.fxRates].sort((a, b) => (a.date < b.date ? 1 : -1))[0].date} /></> : '—'}</div></div>
        </div>
        <div className="card flush">
          <div style={{ display: 'flex', gap: 8, padding: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <Field label={say('Paire', 'Pair')}><Select className="in" value={pair} onChange={(e) => setPair(e.target.value)}><option value="">{say('Toutes', 'All')}</option>{pairs.map((p) => <option key={p} value={p}>{p}</option>)}</Select></Field>
            <Field label={say('Année', 'Year')}><Select className="in" value={year} onChange={(e) => setYear(e.target.value)}><option value="">{say('Toutes', 'All')}</option>{years.map((y) => <option key={y} value={y}>{y}</option>)}</Select></Field>
            <span className="small muted" style={{ marginLeft: 'auto' }}>{rows.length} {say('taux', 'rates')}</span>
          </div>
          <table>
            <thead><tr><th>{say('Date', 'Date')}</th><th>{say('Paire', 'Pair')}</th><th className="num">{say('Taux', 'Rate')}</th><th>{say('Source', 'Source')}</th><th>{say('Utilisé', 'Used')}</th><th></th></tr></thead>
            <tbody>
              {rows.slice(0, 400).map((r) => {
                const used = fxRateUsed(state, r);
                return (
                  <tr key={fxKey(r)} className={editing && fxKey(editing) === fxKey(r) ? 'sel' : ''}>
                    <td><D iso={r.date} /></td><td className="mono">1 {r.from} = … {r.to}</td><td className="num">{r.rate}</td><td>{r.source}</td>
                    <td>{used ? <Chip kind="dim">{say('écriture comptabilisée', 'posted entry')}</Chip> : ''}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{canEdit && <><button className="btn sm" onClick={() => edit(r)}>{say('Modifier', 'Edit')}</button>{' '}<button className="btn sm danger" disabled={used} title={used ? say('A servi à une écriture comptabilisée', 'Used by a posted entry') : undefined} onClick={() => apply((s) => deleteFxRate(s, r), say('Taux supprimé', 'Rate deleted'))}>{say('Supprimer', 'Delete')}</button></>}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={6} className="muted small">{say('Aucun taux : en saisir un, ou importer le fichier de la BCM.', 'No rate: enter one, or import the BCM file.')}</td></tr>}
              {rows.length > 400 && <tr><td colSpan={6} className="muted small">{say(`400 premiers sur ${rows.length} : filtrer par paire ou par année`, `First 400 of ${rows.length}: filter by pair or year`)}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <aside className="side">
        {canEdit && (
          <div className="card">
            <h2>{editing ? say(`Corriger · ${editing.from}/${editing.to} du ${editing.date}`, `Correct · ${editing.from}/${editing.to} of ${editing.date}`) : say('Nouveau taux', 'New rate')}</h2>
            <div className="grid2">
              <Field label={say('Devise', 'Currency')}><Select className="in" value={from} disabled={!!editing} onChange={(e) => setFrom(e.target.value as Currency)}>{FX_CURRENCIES.filter((c) => c !== to).map((c) => <option key={c}>{c}</option>)}</Select></Field>
              <Field label={say('Vers', 'Into')}><Select className="in" value={to} disabled={!!editing} onChange={(e) => setTo(e.target.value as Currency)}>{functionals.filter((c) => c !== from).map((c) => <option key={c}>{c}</option>)}</Select></Field>
              <Field label={say('Date', 'Date')}><input className="in mono" type="date" value={date} disabled={!!editing} onChange={(e) => setDate(e.target.value)} /></Field>
              <Field label={say(`1 ${from} = ? ${to}`, `1 ${from} = ? ${to}`)}><input className="in num" value={rate} onChange={(e) => setRate(e.target.value)} placeholder={latest(from, to) ? String(latest(from, to)!.rate) : '41,25'} /></Field>
            </div>
            <Field label={say('Source', 'Source')} style={{ marginTop: 8 }}><input className="in" value={source} onChange={(e) => setSource(e.target.value)} placeholder="BCM" /></Field>
            <div className="actions" style={{ marginTop: 10 }}>
              {editing && <button className="btn" onClick={() => edit(null)}>{say('Annuler', 'Cancel')}</button>}
              <button className="btn primary" disabled={value === null || !date} onClick={save}>{editing ? say('Corriger', 'Correct') : say('Enregistrer', 'Save')}</button>
            </div>
            <div className="small muted" style={{ marginTop: 6 }}>{say('Un taux par paire et par jour : en saisir un autre le même jour le remplace.', 'One rate per pair and day: entering another on the same day replaces it.')}</div>
          </div>
        )}
        {canEdit && (
          <div className="card">
            <h2>{say('Importer', 'Import')}</h2>
            <div className="small">{say('Le fichier de la BCM tel qu\'il est publié (bcm.mr › Historique des cours de change, « Historique des cours de change journalier ») ou un tableau date · devise · taux (Excel ou CSV).', 'The BCM file as published (bcm.mr › Historique des cours de change) or a date · currency · rate table (Excel or CSV).')}</div>
            <input type="file" accept=".xlsx,.xls,.csv" style={{ marginTop: 8 }} onChange={(e) => { void read(e.target.files?.[0]); e.target.value = ''; }} />
            {file && (
              <div style={{ marginTop: 10 }}>
                <div className="small"><b>{file.name}</b> · {file.parsed.format === 'bcm' ? say('fichier annuel de la BCM', 'BCM yearly file') : file.parsed.format === 'bcm-export' ? say('export du site de la BCM', 'BCM site export') : say('tableau', 'table')} · {file.parsed.rows.length} {say('taux lus', 'rates read')}</div>
                {file.parsed.skipped.map((s) => <div key={s.reason} className="small muted">{s.count} {say('lignes écartées', 'rows left out')} : {s.reason}</div>)}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '8px 0' }}>
                  {found.map((c) => <label key={c} className="small"><input type="checkbox" checked={pick.includes(c)} onChange={(e) => setPick((p) => (e.target.checked ? [...p, c] : p.filter((x) => x !== c)))} /> {c}</label>)}
                </div>
                <div className="grid2">
                  <Field label={say('Du', 'From')}><input className="in mono" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></Field>
                  <Field label={say('Au', 'To')}><input className="in mono" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></Field>
                </div>
                <div className="actions" style={{ marginTop: 10 }}>
                  <button className="btn" onClick={() => setFile(null)}>{say('Annuler', 'Cancel')}</button>
                  <button className="btn primary" disabled={!chosen.length} onClick={runImport}>{say(`Importer ${chosen.length} taux`, `Import ${chosen.length} rates`)}</button>
                </div>
              </div>
            )}
          </div>
        )}
        <div className="card">
          <h2>{say('Comment ils servent', 'How they are used')}</h2>
          <div className="small">{say('Une facture garde le taux saisi sur elle. Tout le reste (encaissements, lignes de relevé, virements entre comptes, soldes en MRU des comptes en devises) prend le dernier taux connu à la date de l\'opération, et lit une paire à l\'envers si besoin (MRU→EUR depuis EUR→MRU). L\'écart entre le taux de la facture et celui de l\'encaissement est comptabilisé en gain ou perte de change.', 'An invoice keeps the rate typed on it. Everything else (receipts, bank lines, transfers, the MRU balances of foreign-currency accounts) takes the latest rate known on the operation\'s date, reading a pair the other way round when needed. The difference between the invoice\'s rate and the receipt\'s is booked as an exchange gain or loss.')}</div>
        </div>
      </aside>
    </div>
  );
}
