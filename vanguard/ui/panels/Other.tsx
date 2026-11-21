import { useEffect, useState } from 'react';
import { groupFigures, archiveEngagement, planningCalendar, fmt, r2, type Id } from '@bumex/domain';
import { useStore } from '../../store';
import { Chip, D, STATUS_KIND, STATUS_FR, StatusChip, Lamp, Tabs } from '../common';
import { worstSignal } from '../../three/Building';
import { PlanningView, AvailabilityView } from './Planning';
import { MissionList } from '../../one/MissionList'; // [bumex-one] missions are BUMEX One's projects: cards or a list
import { useSay } from '../../one/say'; // [bumex-one]
import { WeekView } from '../../one/Week'; // [bumex-one] BUMEX One's weekly planning
import { MissionPanel } from '../../one/Mission'; // [bumex-one] a mission's page (BUMEX One's project page)
import { CalendarView } from '../../one/Calendar'; // [bumex-one] BUMEX One's Calendar
import { MilestonesView } from '../../one/Milestones'; // [bumex-one] BUMEX One's Roadmap
// [bumex-one] bilingual: every text follows the person's language, say('français', 'English') (vanguard/one/say.ts, 2026-11-21)

type MissionsTab = 'board' | 'week' | 'calendar' | 'milestones' | 'billing' | 'planning' | 'availability'; // [bumex-one] week, calendar, milestones, billing

export function MissionsPanel({ entityId, initialTab }: { entityId: Id; initialTab?: string | null }) {
  const { state, t } = useStore();
  const say = useSay(); // [bumex-one]
  const [tab, setTab] = useState<MissionsTab>((initialTab as MissionsTab) || 'board');
  useEffect(() => { if (initialTab) setTab(initialTab as MissionsTab); }, [initialTab]);
  const cal = planningCalendar(state, entityId, state.today, 1);
  const tabs = [
    { id: 'board' as MissionsTab, label: 'Missions' },
    { id: 'week' as MissionsTab, label: say('Semaine', 'Week') }, // [bumex-one] the tickets' week (vanguard/one/Week.tsx)
    { id: 'calendar' as MissionsTab, label: say('Calendrier', 'Calendar') }, // [bumex-one] vanguard/one/Calendar.tsx
    { id: 'milestones' as MissionsTab, label: say('Jalons', 'Milestones') }, // [bumex-one] vanguard/one/Milestones.tsx
    { id: 'billing' as MissionsTab, label: say('Facturation', 'Billing') }, // [bumex-one] the work to invoice and the finished files, off the list (2026-10-28)
    { id: 'planning' as MissionsTab, label: <>Planning {cal.overloaded ? <Chip kind="crit">{say(`${cal.overloaded} surcharge`, `${cal.overloaded} overloaded`)}</Chip> : cal.free ? <Chip kind="good">{say(`${cal.free} dispo.`, `${cal.free} available`)}</Chip> : null}</> },
    { id: 'availability' as MissionsTab, label: say('Disponibilités', 'Availability') },
  ];
  return (
    <>
      <div className="sheet-head"><h1>{t('room_missions')}</h1><Tabs tabs={tabs} value={tab} onChange={setTab} /></div>
      <div className="sheet-body">
        {/* [bumex-one] "mission:<project>" opens that mission's page */}
        {tab.startsWith('mission:') && <MissionPanel key={tab} projectId={tab.split(':')[1]} onClose={() => { setTab('board'); useStore.getState().setUi({ tab: null }); }} />}
        {tab === 'board' && <MissionList entityId={entityId} />}
        {tab === 'billing' && <Billing entityId={entityId} />}
        {tab === 'week' && <WeekView entityId={entityId} />}
        {tab === 'calendar' && <CalendarView entityId={entityId} />}
        {tab === 'milestones' && <MilestonesView entityId={entityId} />}
        {tab === 'planning' && <PlanningView entityId={entityId} />}
        {tab === 'availability' && <AvailabilityView entityId={entityId} />}
      </div>
    </>
  );
}

// [bumex-one] The board of desks by stage gave way to the mission list (vanguard/one/MissionList.tsx, 2026-10-28); what
// stays here is the ERP's billing side: the work in progress to invoice and the finished files, with their archive.
function Billing({ entityId }: { entityId: Id }) {
  const { state, t, apply, openArchive } = useStore();
  const say = useSay();
  const rows = state.engagements.filter((e) => e.entityId === entityId);
  const wip = rows.filter((e) => e.status === 'active').map((e) => ({ e, value: e.feeType === 'fixed' ? r2((e.fixedFee ?? 0) * Math.min(1, e.budgetHours ? e.actualHours / e.budgetHours : 0)) : r2(e.actualHours * 20000) }));
  const toInvoice = wip.filter((w) => w.value - w.e.invoicedToDate > 0);
  const totalWip = r2(toInvoice.reduce((a, w) => a + w.value - w.e.invoicedToDate, 0));
  const completed = rows.filter((e) => e.status === 'completed').sort((a, b) => ((a.completedAt ?? a.deadline) < (b.completedAt ?? b.deadline) ? 1 : -1));
  const unarchived = completed.filter((e) => !e.archiveId).length;
  const openMission = (e: { projectId?: string }) => { if (e.projectId) useStore.getState().openRoom('missions', `mission:${e.projectId}`); };
  return (
    <>
      <div className="ov-figs">
        <div className="ov-fig"><span className="ov-fig-v">{fmt(totalWip, 0)}</span><span className="ov-fig-l">{say('Travaux en cours à facturer', 'Work in progress to invoice')}</span></div>
        <div className="ov-fig"><span className="ov-fig-v">{toInvoice.length}</span><span className="ov-fig-l">{say('Missions avec du travail à facturer', 'Missions with work to invoice')}</span></div>
        <div className={`ov-fig ${unarchived ? 'warn' : 'good'}`}><span className="ov-fig-v">{unarchived}</span><span className="ov-fig-l">{say('Dossiers terminés à archiver', 'Finished files to archive')}</span></div>
      </div>
      <div className="card flush">
        <table>
          <thead><tr><th>{say('Travaux en cours à facturer', 'Work in progress to invoice')}</th><th>{say('Honoraires', 'Fee')}</th><th className="num">{say('Heures', 'Hours')}</th><th className="num">{say('Valeur acquise', 'Earned value')}</th><th className="num">{say('Déjà facturé', 'Invoiced')}</th><th className="num">WIP</th></tr></thead>
          <tbody>
            {toInvoice.map((w) => <tr key={w.e.id} className="click" onClick={() => openMission(w.e as { projectId?: string })}><td><b>{w.e.name}</b><div className="small muted mono">{w.e.code}</div></td><td>{w.e.feeType === 'fixed' ? `${say('Forfait', 'Fixed')} ${fmt(w.e.fixedFee ?? 0, 0)}` : say('Temps passé', 'Time spent')}</td><td className="num">{w.e.actualHours}</td><td className="num">{fmt(w.value, 0)}</td><td className="num">{fmt(w.e.invoicedToDate, 0)}</td><td className="num">{fmt(r2(w.value - w.e.invoicedToDate), 0)}</td></tr>)}
            {!toInvoice.length && <tr><td colSpan={6} className="muted" style={{ padding: 14 }}>{say('Rien à facturer pour le moment.', 'Nothing to invoice for now.')}</td></tr>}
          </tbody>
          {toInvoice.length > 0 && <tfoot><tr><td colSpan={5}>{say('Total WIP', 'Total WIP')}</td><td className="num">{fmt(totalWip, 0)}</td></tr></tfoot>}
        </table>
      </div>
      <div className="card flush">
        <table>
          <thead><tr><th>{say('Dossiers terminés', 'Finished files')} · {completed.length}</th><th>Client</th><th>{say('Terminé le', 'Finished on')}</th><th className="num">{say('Honoraires', 'Fee')}</th><th>Archive</th><th></th></tr></thead>
          <tbody>
            {completed.map((e) => {
              const arc = e.archiveId ? state.archives.find((a) => a.id === e.archiveId) : null;
              return (
                <tr key={e.id}>
                  <td><button className="linkish" onClick={() => openMission(e as { projectId?: string })}><b>{e.name}</b></button><div className="small muted mono">{e.code}</div></td>
                  <td>{state.customers.find((c) => c.id === e.customerId)?.name}</td>
                  <td><D iso={e.completedAt ?? e.deadline} /></td>
                  <td className="num">{fmt(e.fixedFee ?? 0, 0)}</td>
                  <td>{arc ? <Chip kind={arc.status === 'retrieved' ? 'warn' : arc.status === 'pending_destruction' ? 'crit' : 'good'}>{arc.reference} · {arc.bay}·{arc.shelf}·{arc.slot}</Chip> : <Chip kind="warn">{t('arc_queue')}</Chip>}</td>
                  <td>{arc ? <button className="btn sm" onClick={() => openArchive(arc.id, true)}>{t('rack_view')}</button> : <button className="btn sm primary" onClick={() => apply((s) => { const [s1, rec] = archiveEngagement(s, { engagementId: e.id }); window.setTimeout(() => openArchive(rec.id, true), 0); return s1; }, t('arc_archive_now'))}>{t('arc_archive_now')}</button>}</td>
                </tr>
              );
            })}
            {!completed.length && <tr><td colSpan={6} className="muted" style={{ padding: 14 }}>{say('Aucun dossier terminé.', 'No finished file.')}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function PenthousePanel() {
  const { state, t, goFloor, openRoom } = useStore();
  const say = useSay();
  const g = groupFigures(state);
  const [tab, setTab] = useState<'board' | 'ic'>('board');
  const ic = state.salesInvoices.filter((i) => (i.status === 'posted' || i.status === 'paid') && state.customers.find((c) => c.id === i.customerId)?.groupEntityId);
  return (
    <>
      <div className="sheet-head">{/* [bumex-one] Fluent's page header, as every room's (2026-11-19) */}
        <h1>{t('room_penthouse')}</h1>
        <button className={`tab ${tab === 'board' ? 'on' : ''}`} onClick={() => setTab('board')}>{say('Tableau de bord', 'Dashboard')}</button>
        <button className={`tab ${tab === 'ic' ? 'on' : ''}`} onClick={() => setTab('ic')}>{say('Intercos', 'Intercompany')} · {ic.length}</button>
      </div>
      <div className="sheet-body">
        {tab === 'board' ? (
          <>
            <div className="grid4">
              <div className="kpi"><div className="l">{say("Chiffre d'affaires consolidé", 'Consolidated revenue')}</div><div className="v">{fmt(g.consolidatedRevenue, 0)}</div><div className="l">{say(`après élimination de ${fmt(g.intercompanyRevenue, 0)} d'intercos`, `after eliminating ${fmt(g.intercompanyRevenue, 0)} of intercompany`)}</div></div>
              <div className="kpi"><div className="l">{say('Résultat cumulé des étages', 'Combined result of the floors')}</div><div className="v">{fmt(g.result, 0)}</div></div>
              <div className="kpi"><div className="l">{say('Trésorerie groupe (contre-valeur MRU)', 'Group treasury (MRU equivalent)')}</div><div className="v">{fmt(g.cash, 0)}</div></div>
              <div className="kpi"><div className="l">{say('Créances en retard · groupe', 'Overdue receivables · group')}</div><div className="v" style={{ color: 'var(--crit)' }}>{fmt(g.overdue, 0)}</div><div className="l">{say(`${g.overdueCount} factures`, `${g.overdueCount} invoices`)}</div></div>
            </div>
            <div className="card flush">
              <table>
                <thead><tr><th>{say('Étage', 'Floor')}</th><th>{say('Devise', 'Currency')}</th><th>{say('Plan', 'Chart')}</th><th className="num">{say('CA (MRU)', 'Revenue (MRU)')}</th><th className="num">{say('Résultat', 'Result')}</th><th className="num">{say('Trésorerie', 'Treasury')}</th><th className="num">{say('En retard', 'Overdue')}</th><th>{say('Missions en retard', 'Late missions')}</th><th className="num">{say('Brouillons', 'Drafts')}</th><th>{say('Signaux', 'Signals')}</th><th></th></tr></thead>
                <tbody>
                  {g.floors.map((f) => (
                    <tr key={f.entity.id}><td>{f.entity.name}</td><td>{f.entity.functionalCurrency}</td><td>{f.entity.coaTemplate}</td><td className="num">{fmt(f.revenue, 0)}</td><td className="num">{fmt(f.result, 0)}</td><td className="num">{fmt(f.cash, 0)}</td><td className="num">{fmt(f.overdue, 0)}</td><td>{f.lateEngagements} / {f.engagements}</td><td className="num">{f.drafts}</td>
                      <td><span className="sigs"><Lamp kind={f.cashSignal} letter="T" /><Lamp kind={f.overdueSignal} letter={say('C', 'R')} /><Lamp kind={f.engagementSignal} letter={say('M', 'E')} /><Lamp kind={f.draftSignal === 'good' ? 'off' : f.draftSignal} letter={say('É', 'J')} /> <Chip kind={worstSignal(f) === 'off' ? 'dim' : worstSignal(f)}>{worstSignal(f)}</Chip></span></td>
                      <td>{f.visible && !f.entity.isHolding && <button className="btn sm" onClick={() => { goFloor(f.entity.id); openRoom(null); }}>{say('Entrer', 'Enter')}</button>}</td></tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={3}>{say('Somme des étages', 'Sum of the floors')}</td><td className="num">{fmt(g.sumRevenue, 0)}</td><td className="num">{fmt(g.result, 0)}</td><td className="num">{fmt(g.cash, 0)}</td><td className="num">{fmt(g.overdue, 0)}</td><td colSpan={4}></td></tr>
                  <tr><td colSpan={3}>{say('Éliminations intercos (frais de gestion, refacturations)', 'Intercompany eliminations (management fees, recharges)')}</td><td className="num" style={{ color: 'var(--crit)' }}>−{fmt(g.intercompanyRevenue, 0)}</td><td colSpan={7}></td></tr>
                  <tr style={{ background: 'var(--brand-tint)' }}><td colSpan={3}>{say('Consolidé · MRU · plan groupe', 'Consolidated · MRU · group chart')}</td><td className="num">{fmt(g.consolidatedRevenue, 0)}</td><td className="num">{fmt(g.result, 0)}</td><td className="num">{fmt(g.cash, 0)}</td><td className="num">{fmt(g.overdue, 0)}</td><td colSpan={4}></td></tr>
                </tfoot>
              </table>
            </div>
            <div className="small muted">{say("Conversion MAD → MRU au taux du jour pour BUMEX Maroc ; la consolidation complète (taux de clôture et moyen, réserve de conversion, versions figées) arrive en phase d'extension.", "MAD → MRU conversion at the day's rate for BUMEX Maroc; full consolidation (closing and average rates, translation reserve, frozen versions) comes in the extension phase.")}</div>
          </>
        ) : (
          <div className="card flush">
            <table>
              <thead><tr><th>Document</th><th>{say('De', 'From')}</th><th>{say('Vers', 'To')}</th><th>Date</th><th className="num">{say('HT', 'Excl. tax')}</th><th className="num">{say('TTC', 'Incl. tax')}</th><th>{say('Statut', 'Status')}</th><th>{say('Élimination', 'Elimination')}</th></tr></thead>
              <tbody>{ic.map((i) => { const c = state.customers.find((x) => x.id === i.customerId)!; return <tr key={i.id}><td className="mono">{i.number}</td><td>{state.entities.find((e) => e.id === i.entityId)?.name}</td><td>{state.entities.find((e) => e.id === c.groupEntityId)?.name}</td><td><D iso={i.date} /></td><td className="num">{fmt(i.totalHt, 0)}</td><td className="num">{fmt(i.totalTtc, 0)}</td><td><StatusChip status={i.status} /></td><td><Chip kind="good">{say('CA éliminé', 'Revenue eliminated')} · {fmt(i.totalHt, 0)}</Chip></td></tr>; })}</tbody>
            </table>
            <div className="small muted" style={{ padding: 10 }}>{say("Chaque facture interco crée aussi la charge chez l'entité réceptrice (phase d'extension) ; le revenu est éliminé dès maintenant dans le consolidé.", 'Each intercompany invoice also creates the expense at the receiving entity (extension phase); the revenue is already eliminated in the consolidation.')}</div>
          </div>
        )}
      </div>
    </>
  );
}
