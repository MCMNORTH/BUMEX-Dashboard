import { useEffect, useRef, useState } from 'react';
import { groupFigures, archiveEngagement, planningCalendar, fmt, r2, type Id } from '@bumex/domain';
import { useStore } from '../../store';
import { Chip, D, STATUS_KIND, STATUS_FR, Lamp, Tabs } from '../common';
import { worstSignal } from '../../three/Building';
import { PlanningView, AvailabilityView } from './Planning';

const STAGES = ['Planification', 'Terrain', 'Revue associé', 'Rapport', 'Facturation'];

type MissionsTab = 'board' | 'planning' | 'availability';

export function MissionsPanel({ entityId, initialTab }: { entityId: Id; initialTab?: string | null }) {
  const { state, t } = useStore();
  const [tab, setTab] = useState<MissionsTab>((initialTab as MissionsTab) || 'board');
  useEffect(() => { if (initialTab) setTab(initialTab as MissionsTab); }, [initialTab]);
  const cal = planningCalendar(state, entityId, state.today, 1);
  const tabs = [
    { id: 'board' as MissionsTab, label: 'Missions' },
    { id: 'planning' as MissionsTab, label: <>Planning {cal.overloaded ? <Chip kind="crit">{cal.overloaded} surcharge</Chip> : cal.free ? <Chip kind="good">{cal.free} dispo.</Chip> : null}</> },
    { id: 'availability' as MissionsTab, label: 'Disponibilités' },
  ];
  return (
    <>
      <div className="sheet-head"><h1>{t('room_missions')}</h1><Tabs tabs={tabs} value={tab} onChange={setTab} /></div>
      <div className="sheet-body">
        {tab === 'board' && <Board entityId={entityId} />}
        {tab === 'planning' && <PlanningView entityId={entityId} />}
        {tab === 'availability' && <AvailabilityView entityId={entityId} />}
      </div>
    </>
  );
}

function Board({ entityId }: { entityId: Id }) {
  const { state, t, ui, setUi, apply, openArchive } = useStore();
  const rows = state.engagements.filter((e) => e.entityId === entityId);
  const wip = rows.filter((e) => e.status === 'active').map((e) => ({ e, value: e.feeType === 'fixed' ? r2((e.fixedFee ?? 0) * Math.min(1, e.budgetHours ? e.actualHours / e.budgetHours : 0)) : r2(e.actualHours * 20000) }));
  const totalWip = r2(wip.reduce((a, w) => a + w.value - w.e.invoicedToDate, 0));
  const completed = rows.filter((e) => e.status === 'completed').sort((a, b) => ((a.completedAt ?? a.deadline) < (b.completedAt ?? b.deadline) ? 1 : -1));
  const focus = ui.focusEngagementId;
  const focusRef = useRef<HTMLDivElement>(null);
  useEffect(() => { focusRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [focus]);
  const tasksOf = (id: Id) => state.tasks.filter((x) => x.engagementId === id && x.status !== 'done').length;
  return (
    <>
        <div className="kanban">
          {STAGES.map((name, i) => (
            <div className="col" key={name}>
              <h3>{name} <span>{rows.filter((e) => e.stage === i + 1 && e.status !== 'completed').length}</span></h3>
              {rows.filter((e) => e.stage === i + 1 && e.status !== 'completed').map((e) => {
                const ratio = e.budgetHours ? e.actualHours / e.budgetHours : 0;
                const late = e.deadline < state.today;
                const open = tasksOf(e.id);
                return (
                  <div className={`desk ${late ? 'late' : ''} ${focus === e.id ? 'focus' : ''}`} key={e.id} ref={focus === e.id ? focusRef : undefined} onClick={() => setUi({ focusEngagementId: e.id })}>
                    <b>{e.name}</b>
                    <span className="muted">{state.customers.find((c) => c.id === e.customerId)?.name} · {e.kind} · <span className="mono">{e.code}</span></span>
                    <div className="bar"><i style={{ width: `${Math.min(100, ratio * 100)}%`, background: ratio > 1 ? 'var(--crit)' : late ? 'var(--warn)' : 'var(--accent)' }} /></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{e.actualHours} h / {e.budgetHours} h</span><span style={{ color: late ? 'var(--warn)' : undefined, fontWeight: late ? 600 : 400 }}>Éch. <D iso={e.deadline} />{late ? ' dépassée' : ''}</span></div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{e.staff.map((s) => <Chip key={s} kind="dim">{s}</Chip>)}{ratio > 1 && <Chip kind="crit">budget dépassé</Chip>}{open > 0 && <Chip kind="warn">{open} tâche{open > 1 ? 's' : ''}</Chip>}</div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="card flush">
          <table>
            <thead><tr><th>Travaux en cours à facturer</th><th>Honoraires</th><th className="num">Heures</th><th className="num">Valeur acquise</th><th className="num">Déjà facturé</th><th className="num">WIP</th></tr></thead>
            <tbody>{wip.filter((w) => w.value - w.e.invoicedToDate > 0).map((w) => <tr key={w.e.id} className={w.e.id === focus ? 'sel' : ''}><td>{w.e.name}</td><td>{w.e.feeType === 'fixed' ? `Forfait ${fmt(w.e.fixedFee ?? 0, 0)}` : 'Temps passé'}</td><td className="num">{w.e.actualHours}</td><td className="num">{fmt(w.value, 0)}</td><td className="num">{fmt(w.e.invoicedToDate, 0)}</td><td className="num">{fmt(r2(w.value - w.e.invoicedToDate), 0)}</td></tr>)}</tbody>
            <tfoot><tr><td colSpan={5}>Total WIP</td><td className="num">{fmt(totalWip, 0)}</td></tr></tfoot>
          </table>
        </div>
        <div className="card flush">
          <table>
            <thead><tr><th>Dossiers terminés · {completed.length}</th><th>Client</th><th>Terminé le</th><th className="num">Honoraires</th><th>Archive</th><th></th></tr></thead>
            <tbody>
              {completed.map((e) => {
                const arc = e.archiveId ? state.archives.find((a) => a.id === e.archiveId) : null;
                return (
                  <tr key={e.id} className={e.id === focus ? 'sel' : ''} ref={e.id === focus ? (focusRef as never) : undefined}>
                    <td><b>{e.name}</b><div className="small muted mono">{e.code}</div></td>
                    <td>{state.customers.find((c) => c.id === e.customerId)?.name}</td>
                    <td><D iso={e.completedAt ?? e.deadline} /></td>
                    <td className="num">{fmt(e.fixedFee ?? 0, 0)}</td>
                    <td>{arc ? <Chip kind={arc.status === 'retrieved' ? 'warn' : arc.status === 'pending_destruction' ? 'crit' : 'good'}>{arc.reference} · {arc.bay}·{arc.shelf}·{arc.slot}</Chip> : <Chip kind="warn">{t('arc_queue')}</Chip>}</td>
                    <td>{arc ? <button className="btn sm" onClick={() => openArchive(arc.id, true)}>{t('rack_view')}</button> : <button className="btn sm primary" onClick={() => apply((s) => { const [s1, rec] = archiveEngagement(s, { engagementId: e.id }); window.setTimeout(() => openArchive(rec.id, true), 0); return s1; }, t('arc_archive_now'))}>{t('arc_archive_now')}</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
    </>
  );
}

export function PenthousePanel() {
  const { state, t, goFloor, openRoom } = useStore();
  const g = groupFigures(state);
  const [tab, setTab] = useState<'board' | 'ic'>('board');
  const ic = state.salesInvoices.filter((i) => i.status !== 'draft' && state.customers.find((c) => c.id === i.customerId)?.groupEntityId);
  return (
    <>
      <div className="sheet-head" style={{ background: '#0b5753', color: '#fff', borderColor: '#9bd9d4' }}>
        <h1>{t('room_penthouse')}</h1>
        <button className={`tab ${tab === 'board' ? 'on' : ''}`} style={{ color: tab === 'board' ? '#fff' : '#cdefec', borderBottomColor: tab === 'board' ? '#9bd9d4' : 'transparent' }} onClick={() => setTab('board')}>Tableau de bord</button>
        <button className={`tab ${tab === 'ic' ? 'on' : ''}`} style={{ color: tab === 'ic' ? '#fff' : '#cdefec', borderBottomColor: tab === 'ic' ? '#9bd9d4' : 'transparent' }} onClick={() => setTab('ic')}>Intercos · {ic.length}</button>
      </div>
      <div className="sheet-body">
        {tab === 'board' ? (
          <>
            <div className="grid4">
              <div className="kpi"><div className="l">Chiffre d'affaires consolidé</div><div className="v">{fmt(g.consolidatedRevenue, 0)}</div><div className="l">après élimination de {fmt(g.intercompanyRevenue, 0)} d'intercos</div></div>
              <div className="kpi"><div className="l">Résultat cumulé des étages</div><div className="v">{fmt(g.result, 0)}</div></div>
              <div className="kpi"><div className="l">Trésorerie groupe (contre-valeur MRU)</div><div className="v">{fmt(g.cash, 0)}</div></div>
              <div className="kpi"><div className="l">Créances en retard · groupe</div><div className="v" style={{ color: 'var(--crit)' }}>{fmt(g.overdue, 0)}</div><div className="l">{g.overdueCount} factures</div></div>
            </div>
            <div className="card flush">
              <table>
                <thead><tr><th>Étage</th><th>Devise</th><th>Plan</th><th className="num">CA (MRU)</th><th className="num">Résultat</th><th className="num">Trésorerie</th><th className="num">En retard</th><th>Missions en retard</th><th className="num">Brouillons</th><th>Signaux</th><th></th></tr></thead>
                <tbody>
                  {g.floors.map((f) => (
                    <tr key={f.entity.id}><td>{f.entity.name}</td><td>{f.entity.functionalCurrency}</td><td>{f.entity.coaTemplate}</td><td className="num">{fmt(f.revenue, 0)}</td><td className="num">{fmt(f.result, 0)}</td><td className="num">{fmt(f.cash, 0)}</td><td className="num">{fmt(f.overdue, 0)}</td><td>{f.lateEngagements} / {f.engagements}</td><td className="num">{f.drafts}</td>
                      <td><span className="sigs"><Lamp kind={f.cashSignal} letter="T" /><Lamp kind={f.overdueSignal} letter="C" /><Lamp kind={f.engagementSignal} letter="M" /><Lamp kind={f.draftSignal === 'good' ? 'off' : f.draftSignal} letter="É" /> <Chip kind={worstSignal(f) === 'off' ? 'dim' : worstSignal(f)}>{worstSignal(f)}</Chip></span></td>
                      <td>{f.visible && !f.entity.isHolding && <button className="btn sm" onClick={() => { goFloor(f.entity.id); openRoom(null); }}>Entrer</button>}</td></tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={3}>Somme des étages</td><td className="num">{fmt(g.sumRevenue, 0)}</td><td className="num">{fmt(g.result, 0)}</td><td className="num">{fmt(g.cash, 0)}</td><td className="num">{fmt(g.overdue, 0)}</td><td colSpan={4}></td></tr>
                  <tr><td colSpan={3}>Éliminations intercos (frais de gestion, refacturations)</td><td className="num" style={{ color: 'var(--crit)' }}>−{fmt(g.intercompanyRevenue, 0)}</td><td colSpan={7}></td></tr>
                  <tr style={{ background: '#e6f2f1' }}><td colSpan={3}>Consolidé · MRU · plan groupe</td><td className="num">{fmt(g.consolidatedRevenue, 0)}</td><td className="num">{fmt(g.result, 0)}</td><td className="num">{fmt(g.cash, 0)}</td><td className="num">{fmt(g.overdue, 0)}</td><td colSpan={4}></td></tr>
                </tfoot>
              </table>
            </div>
            <div className="small muted">Conversion MAD → MRU au taux du jour pour BUMEX Maroc ; la consolidation complète (taux de clôture et moyen, réserve de conversion, versions figées) arrive en phase d'extension.</div>
          </>
        ) : (
          <div className="card flush">
            <table>
              <thead><tr><th>Document</th><th>De</th><th>Vers</th><th>Date</th><th className="num">HT</th><th className="num">TTC</th><th>Statut</th><th>Élimination</th></tr></thead>
              <tbody>{ic.map((i) => { const c = state.customers.find((x) => x.id === i.customerId)!; return <tr key={i.id}><td className="mono">{i.number}</td><td>{state.entities.find((e) => e.id === i.entityId)?.name}</td><td>{state.entities.find((e) => e.id === c.groupEntityId)?.name}</td><td><D iso={i.date} /></td><td className="num">{fmt(i.totalHt, 0)}</td><td className="num">{fmt(i.totalTtc, 0)}</td><td><Chip kind={STATUS_KIND[i.status]}>{STATUS_FR[i.status]}</Chip></td><td><Chip kind="good">CA éliminé · {fmt(i.totalHt, 0)}</Chip></td></tr>; })}</tbody>
            </table>
            <div className="small muted" style={{ padding: 10 }}>Chaque facture interco crée aussi la charge chez l'entité réceptrice (phase d'extension) ; le revenu est éliminé dès maintenant dans le consolidé.</div>
          </div>
        )}
      </div>
    </>
  );
}
