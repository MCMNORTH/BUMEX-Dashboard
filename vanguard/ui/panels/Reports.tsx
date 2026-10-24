import { useMemo } from 'react';
import { floorSignals, groupFigures, trialBalance, cashForecast, verifyChain, loanSummaries, planningCalendar, yearDepreciation, headcount, withholdingStatement, vatStatement, pendingDeletions, fmt, r2, type Id } from '@bumex/domain';
import { useStore, MODULE_ROOM } from '../../store';
import type { Room } from '../../i18n';
import { Icon } from '../common';

// Reports: each card carries a live figure and opens the module that produces the report, on the right tab.

export function ReportsPanel({ entityId }: { entityId: Id }) {
  const { state, t, ui, setUi, openRoom } = useStore();
  const entity = state.entities.find((e) => e.id === entityId)!;
  const f = useMemo(() => floorSignals(state, entityId), [state, entityId]);
  const g = useMemo(() => groupFigures(state), [state]);
  const fy = state.fiscalYears.find((x) => x.entityId === entityId && x.label === ui.fiscalYearLabel);
  const tb = useMemo(() => trialBalance(state, entityId, { fiscalYearId: fy?.id }), [state, entityId, fy?.id]);
  const forecast = useMemo(() => { try { return cashForecast(state, entityId, 13); } catch { return []; } }, [state, entityId]);
  const chainOk = useMemo(() => state.journals.filter((j) => j.entityId === entityId).every((j) => verifyChain(state, entityId, j.id).every((c) => c.ok)), [state, entityId]);
  const minForecast = forecast.length ? Math.min(...forecast.map((w) => w.balance)) : 0;
  const loans = useMemo(() => loanSummaries(state, entityId), [state, entityId]);
  const lateInst = loans.reduce((n, l) => n + l.overdue.length, 0);
  const outstanding = r2(loans.filter((l) => l.loan.status === 'active').reduce((a, l) => a + l.outstanding, 0));
  const cal = useMemo(() => planningCalendar(state, entityId, state.today, 1), [state, entityId]);
  const deprToPost = useMemo(() => { try { return fy ? r2(yearDepreciation(state, entityId, fy.id).reduce((a, r) => a + r.toPost, 0)) : 0; } catch { return 0; } }, [state, entityId, fy]);
  const hc = useMemo(() => headcount(state, entityId), [state, entityId]);
  const payrollRuns = state.payrollRuns.filter((r) => r.entityId === entityId && r.status === 'posted').length;
  const wht = useMemo(() => withholdingStatement(state, entityId, state.today.slice(0, 4) + '-01-01', state.today), [state, entityId]);
  const vat = useMemo(() => vatStatement(state, entityId, state.today.slice(0, 4) + '-01-01', state.today), [state, entityId]);
  const pendingDel = pendingDeletions(state, entityId).length;
  const go = (room: Room, tab?: string) => {
    if (ui.view === 'floor') { const target = MODULE_ROOM[room] ?? room; if (!['penthouse', 'tasks', 'reports', 'settings'].includes(target as string)) useStore.getState().focusRoom(target as string); }
    if (room === 'penthouse') { const hold = state.entities.find((e) => e.isHolding)!; if (hold.id !== entityId) setUi({ entityId: hold.id }); }
    openRoom(room, tab ?? null);
  };
  const cards: { title: string; sub: string; figure: string; room: Room; tab?: string; icon: string; kind?: 'good' | 'warn' | 'crit' }[] = entity.isHolding
    ? [
        { title: 'Tableau consolidé', sub: `CA consolidé après élimination de ${fmt(g.intercompanyRevenue, 0)} d'intercos`, figure: fmt(g.consolidatedRevenue, 0), room: 'penthouse', icon: 'penthouse' },
        { title: 'Créances en retard · groupe', sub: `${g.overdueCount} factures sur les 8 entités`, figure: fmt(g.overdue, 0), room: 'penthouse', icon: 'clients', kind: g.overdueCount ? 'crit' : 'good' },
        { title: 'Trésorerie groupe', sub: 'Contre-valeur MRU', figure: fmt(g.cash, 0), room: 'penthouse', icon: 'bank' },
      ]
    : [
        { title: t('tab_tb'), sub: `${t('fiscal_year')} ${ui.fiscalYearLabel} · ${tb.length} comptes mouvementés · export CSV`, figure: fmt(r2(tb.reduce((a, r) => a + r.debit, 0)), 0), room: 'accounting', tab: 'tb', icon: 'accounting' },
        { title: t('tab_gl'), sub: 'Par compte, période et pièce', figure: `${state.entries.filter((e) => e.entityId === entityId && e.status !== 'draft').length} écritures`, room: 'accounting', tab: 'gl', icon: 'accounting' },
        { title: t('tab_journals'), sub: `${f.drafts} brouillon${f.drafts > 1 ? 's' : ''} à comptabiliser`, figure: String(f.drafts), room: 'accounting', tab: 'journals', icon: 'accounting', kind: f.drafts ? 'warn' : 'good' },
        { title: t('tab_closing'), sub: 'Périodes, clôture douce, verrouillage, exercices', figure: `${state.periods.filter((p) => p.entityId === entityId && p.status === 'soft_closed').length} à verrouiller`, room: 'accounting', tab: 'closing', icon: 'tasks', kind: state.periods.some((p) => p.entityId === entityId && p.status === 'soft_closed') ? 'warn' : 'good' },
        { title: t('tab_integrity'), sub: 'Chaîne SHA-256 des écritures, par journal', figure: chainOk ? t('hash_ok') : t('hash_bad'), room: 'accounting', tab: 'integrity', icon: 'tasks', kind: chainOk ? 'good' : 'crit' },
        { title: t('tab_aging'), sub: `${f.overdueCount} factures en retard · ${f.over90Count} au-delà de 90 j`, figure: fmt(f.overdue, 0), room: 'clients', tab: 'aging', icon: 'clients', kind: f.overdueSignal === 'off' ? undefined : f.overdueSignal },
        { title: t('tab_dunning'), sub: 'File de relances par niveau', figure: `${f.overdueCount} à relancer`, room: 'clients', tab: 'dunning', icon: 'clients' },
        { title: t('tab_forecast'), sub: 'Trésorerie à 13 semaines, point bas', figure: fmt(minForecast, 0), room: 'bank', tab: 'forecast', icon: 'bank', kind: minForecast < entity.cashThreshold ? 'warn' : 'good' },
        { title: t('tab_recon'), sub: `${f.unmatchedBank} lignes de relevé en attente`, figure: String(f.unmatchedBank), room: 'bank', tab: 'recon', icon: 'bank', kind: f.unmatchedBank ? 'warn' : 'good' },
        { title: 'Dettes fournisseurs', sub: `${f.pendingApprovals} factures à approuver · état des dettes par échéance`, figure: fmt(f.payables, 0), room: 'suppliers', tab: 'payables', icon: 'suppliers', kind: f.pendingApprovals ? 'warn' : 'good' },
        { title: t('tab_loans'), sub: `${loans.length} emprunt(s) · ${lateInst} échéance(s) en retard`, figure: fmt(outstanding, 0), room: 'bank', tab: 'loans', icon: 'bank', kind: lateInst ? 'warn' : 'good' },
        { title: 'Travaux en cours · WIP', sub: `${f.engagements} missions actives · ${f.lateEngagements} en retard`, figure: `${f.engagements} missions`, room: 'missions', icon: 'missions', kind: f.engagementSignal === 'off' ? undefined : f.engagementSignal },
        { title: 'Planning des missions', sub: `${cal.free} disponible(s) · ${cal.overloaded} en surcharge`, figure: `${cal.rows.length} collaborateurs`, room: 'missions', tab: 'planning', icon: 'calendar', kind: cal.overloaded ? 'crit' : 'good' },
        { title: 'Registre des immobilisations', sub: `Valeur brute, amortissements, VNC · dotation ${ui.fiscalYearLabel} ${fmt(deprToPost, 0)} à comptabiliser`, figure: `${state.assets.filter((a) => a.entityId === entityId).length} biens`, room: 'assets', tab: 'yearend', icon: 'assets', kind: deprToPost > 0 ? 'warn' : 'good' },
        { title: 'Effectifs et paie', sub: `${hc.active} collaborateurs · coût employeur mensuel ${fmt(hc.monthlyEmployerCost, 0)}`, figure: `${payrollRuns} paie(s) comptabilisée(s)`, room: 'hr', tab: 'statements', icon: 'hr' },
        { title: 'Retenues à la source', sub: `Subies ${fmt(wht.sufferedTotal, 0)} · dues ${fmt(wht.dueTotal, 0)} sur l'année`, figure: `${state.taxCodes.filter((x) => x.entityId === entityId && x.kind === 'withholding').length} codes`, room: 'tax', tab: 'withholding', icon: 'tax' },
        { title: 'TVA · synthèse', sub: `Collectée ${fmt(vat.collected, 0)} · déductible ${fmt(vat.deductible, 0)}`, figure: fmt(vat.net, 0), room: 'tax', tab: 'summary', icon: 'tax' },
        { title: 'Plan comptable', sub: 'Export Excel, modèle, import contrôlé', figure: `${state.accounts.filter((a) => a.entityId === entityId).length} comptes`, room: 'accounting', tab: 'coa', icon: 'accounting' },
        { title: 'Historique et sécurité', sub: `${pendingDel} demande(s) de suppression en attente`, figure: `${state.auditLog.filter((a) => a.entityId === entityId).length} événements`, room: 'settings', tab: 'history', icon: 'lock', kind: pendingDel ? 'warn' : undefined },
        { title: 'Archives', sub: 'Dossiers de mission sur le rayonnage', figure: `${state.archives.filter((a) => a.entityId === entityId && a.status !== 'destroyed').length} boîtes`, room: 'archives', icon: 'archives' },
        { title: 'Tableau consolidé', sub: 'Penthouse · groupe', figure: fmt(g.consolidatedRevenue, 0), room: 'penthouse', icon: 'penthouse' },
      ];
  return (
    <>
      <div className="sheet-head"><h1>{t('rep_title')}</h1><span className="muted small">{t('rep_sub')}</span></div>
      <div className="sheet-body">
        <div className="grid3">
          {cards.map((c, i) => (
            <button key={i} className="card" style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'flex-start' }} onClick={() => go(c.room, c.tab)}>
              <span style={{ color: 'var(--blue)', marginTop: 2 }}><Icon name={c.icon} size={22} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 600 }}>{c.title}</span>
                <span className="small muted" style={{ display: 'block' }}>{c.sub}</span>
                <span className="mono" style={{ display: 'block', fontSize: 18, marginTop: 6, color: c.kind === 'crit' ? 'var(--crit)' : c.kind === 'warn' ? 'var(--warn)' : undefined }}>{c.figure}</span>
              </span>
              <span className="muted"><Icon name="chevronRight" size={16} /></span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
