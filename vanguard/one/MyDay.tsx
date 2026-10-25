import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { moveTicketStageAction } from '@/app/(app)/tickets/actions';
import { reloadVanguardAction } from '@/lib/erp/vanguard/actions';
import { myDayAction, type MyDayData } from '@/lib/erp/vanguard/myday-actions';
import type { VanguardData } from '@/lib/erp/vanguard/run';
import { useStore } from '../store';
import { Chip, D } from '../ui/common';
import { useSay } from './say';

// "My day": the home's panel (the building stays the home), with what BUMEX One's overview showed: my tickets, what
// waits for my sign-off, the missions at risk, the coming deadlines and the team's workload.

const PRIORITY: Record<string, [string, string]> = { low: ['Basse', 'Low'], medium: ['Moyenne', 'Medium'], high: ['Haute', 'High'], urgent: ['Urgente', 'Urgent'] };
const HEALTH: Record<string, [string, string, 'crit' | 'warn' | 'good']> = { delayed: ['En retard', 'Delayed', 'crit'], at_risk: ['À risque', 'At risk', 'crit'], warning: ['À surveiller', 'Watch', 'warn'], healthy: ['Sain', 'Healthy', 'good'] };
const REASON: Record<string, [string, string]> = { blocked: ['Bloqué', 'Blocked'], overdue: ['En retard', 'Overdue'], urgent: ['Urgent', 'Urgent'], unassigned: ['Sans responsable', 'Unassigned'] };

// the rail's entry, under the overview (ui/Sidebar.tsx)
export function MyDayButton() {
  const { ui, openRoom } = useStore();
  const say = useSay();
  const on = ui.room === 'myday';
  return (
    <button className={`sb-item ${on ? 'on' : ''}`} onClick={() => openRoom(on ? null : 'myday')} aria-label={say('Ma journée', 'My day')}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      <span className="lbl">{say('Ma journée', 'My day')}</span>
      <span className="tip">{say('Ma journée', 'My day')}</span>
    </button>
  );
}

export function MyDay() {
  const { state, toast, setUi, openRoom } = useStore();
  const say = useSay();
  const router = useRouter();
  const loadedAt = useStore((s) => s.loadedAt);
  const [data, setData] = useState<MyDayData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void myDayAction().then((d) => live && setData(d)).catch(() => live && toast('error', say('Ma journée est indisponible.', 'My day is unavailable.')));
    return () => { live = false; };
    // read again with the state (a ticket moved, a mission changed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedAt]);

  const openTask = (id: string) => {
    const task = state.tasks.find((t) => t.id === id);
    if (task) { setUi({ entityId: task.entityId, focusTaskId: id }); openRoom('tasks'); } else router.push(`/tickets/${id}`);
  };
  const openMission = (projectId: string) => {
    const mission = state.engagements.find((e) => (e as { projectId?: string }).projectId === projectId);
    if (mission) { setUi({ entityId: mission.entityId, focusEngagementId: mission.id }); openRoom('missions'); } else router.push(`/projects/${projectId}`);
  };
  const signOff = async (id: string, stageId: string, title: string) => {
    setBusy(id);
    try {
      const result = await moveTicketStageAction(id, { stageId });
      if (result.error) toast('error', result.error);
      else toast('ok', `${say('Validé', 'Signed off')} · ${title}`);
      const fresh = await reloadVanguardAction().catch(() => null);
      if (fresh?.state) useStore.getState().hydrate(fresh as VanguardData);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="sheet-head"><h1>{say('Ma journée', 'My day')}</h1><span className="small muted">{state.session.actorName}</span></div>
      <div className="sheet-body">
        {!data ? <span className="muted">{say('Chargement…', 'Loading…')}</span> : (
          <>
            <div className="grid4">
              <div className="kpi"><div className="l">{say('Mes tâches ouvertes', 'My open tasks')}</div><div className="v">{data.myTickets.total}</div></div>
              <div className="kpi"><div className="l">{say('À valider', 'To sign off')}</div><div className="v" style={{ color: data.signOff.total ? 'var(--warn)' : undefined }}>{data.signOff.total}</div></div>
              <div className="kpi"><div className="l">{say('Missions à risque', 'Missions at risk')}</div><div className="v" style={{ color: data.kpis.atRiskProjects ? 'var(--crit)' : undefined }}>{data.kpis.atRiskProjects ?? '—'}</div></div>
              <div className="kpi"><div className="l">{say('Tâches à suivre', 'Tasks needing attention')}</div><div className="v">{data.kpis.attentionTickets ?? '—'}</div></div>
            </div>
            <div className="grid2">
              <div className="card flush">
                <table>
                  <thead><tr><th>{say('Mes tâches', 'My tasks')}</th><th>{say('Priorité', 'Priority')}</th><th>{say('Échéance', 'Due')}</th></tr></thead>
                  <tbody>
                    {data.myTickets.items.map((t) => (
                      <tr key={t.id} className="click" onClick={() => openTask(t.id)}>
                        <td><b>{t.title}</b><div className="small muted">{t.projectName ?? '—'}{t.stageName ? ` · ${t.stageName}` : ''}</div></td>
                        <td><Chip kind={t.priority === 'urgent' || t.priority === 'high' ? 'warn' : 'dim'}>{say(...(PRIORITY[t.priority] ?? [t.priority, t.priority]))}</Chip></td>
                        <td>{t.dueDate ? <D iso={t.dueDate} /> : '—'}</td>
                      </tr>
                    ))}
                    {!data.myTickets.items.length && <tr><td colSpan={3} className="muted" style={{ padding: 14 }}>{say('Aucune tâche ouverte à votre nom.', 'No open task assigned to you.')}</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="card flush">
                <table>
                  <thead><tr><th>{say('À valider (vous êtes le demandeur)', 'To sign off (you reported them)')}</th><th></th></tr></thead>
                  <tbody>
                    {data.signOff.items.map((t) => (
                      <tr key={t.id}>
                        <td className="click" onClick={() => openTask(t.id)}><b>{t.title}</b><div className="small muted">{t.projectName ?? '—'} · {t.assigneeName ?? '—'}</div></td>
                        <td><div className="toolbar" style={{ justifyContent: 'flex-end' }}><button className="btn sm primary" disabled={busy === t.id} onClick={() => signOff(t.id, t.completedStageId, t.title)}>{say('Valider', 'Sign off')} · {t.completedStageName}</button></div></td>
                      </tr>
                    ))}
                    {!data.signOff.items.length && <tr><td colSpan={2} className="muted" style={{ padding: 14 }}>{say('Rien n\'attend votre validation.', 'Nothing waits for your sign-off.')}</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="card flush">
                <table>
                  <thead><tr><th>{say('Missions à surveiller', 'Missions to watch')}</th><th>{say('État', 'Health')}</th><th>{say('Échéance', 'Deadline')}</th></tr></thead>
                  <tbody>
                    {data.attentionProjects.map((p) => {
                      const h = HEALTH[p.health];
                      return (
                        <tr key={p.id} className="click" onClick={() => openMission(p.id)}>
                          <td><b>{p.name}</b><div className="small muted">{p.owner ?? '—'}</div></td>
                          <td>{h ? <Chip kind={h[2]}>{say(h[0], h[1])}</Chip> : p.health}</td>
                          <td>{p.endDate ? <D iso={p.endDate} /> : '—'}</td>
                        </tr>
                      );
                    })}
                    {!data.attentionProjects.length && <tr><td colSpan={3} className="muted" style={{ padding: 14 }}>{say('Aucune mission à risque.', 'No mission at risk.')}</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="card flush">
                <table>
                  <thead><tr><th>{say('Échéances · 14 jours', 'Deadlines · 14 days')}</th><th></th></tr></thead>
                  <tbody>
                    {data.upcoming.map((u) => (
                      <tr key={u.key} className="click" onClick={() => router.push(u.href)}>
                        <td><b>{u.title}</b><div className="small muted">{u.context ?? (u.kind === 'project' ? say('Mission', 'Mission') : say('Tâche', 'Task'))}</div></td>
                        <td className="mono"><D iso={u.date} /></td>
                      </tr>
                    ))}
                    {!data.upcoming.length && <tr><td colSpan={2} className="muted" style={{ padding: 14 }}>{say('Rien dans les 14 jours.', 'Nothing in the next 14 days.')}</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
            {data.attentionTickets.length > 0 && (
              <div className="card flush">
                <table>
                  <thead><tr><th>{say('Tâches à suivre', 'Tasks needing attention')}</th><th>{say('Pourquoi', 'Why')}</th></tr></thead>
                  <tbody>{data.attentionTickets.map((t) => <tr key={t.id} className="click" onClick={() => openTask(t.id)}><td><b>{t.title}</b><div className="small muted">{t.projectName ?? '—'}</div></td><td><Chip kind="warn">{say(...(REASON[t.reason] ?? [t.reason, t.reason]))}</Chip></td></tr>)}</tbody>
                </table>
              </div>
            )}
            {data.workload.length > 0 && (
              <div className="card flush">
                <table>
                  <thead><tr><th>{say("Charge de l'équipe", "Team's workload")}</th><th className="num">{say('Occupation', 'Utilisation')}</th><th className="num">{say('Tâches actives', 'Active tasks')}</th><th className="num">{say('En retard', 'Overdue')}</th></tr></thead>
                  <tbody>{data.workload.map((p) => <tr key={p.id}><td>{p.name}</td><td className="num">{Math.round(p.utilization)} %</td><td className="num">{p.activeItems}</td><td className="num" style={{ color: p.overdueItems ? 'var(--crit)' : undefined }}>{p.overdueItems}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
