import { useEffect, useMemo, useState } from 'react'; // [bumex-one] useEffect
import { floorSignals, groupFigures, trialBalance, cashForecast, verifyChain, loanSummaries, planningCalendar, yearDepreciation, headcount, withholdingStatement, vatStatement, pendingDeletions, fmt, r2, type Id } from '@bumex/domain';
import { useStore, MODULE_ROOM } from '../../store';
import type { Room } from '../../i18n';
import { Icon, Tabs } from '../common';
import { ActivityReports } from '../../one/ActivityReports'; // [bumex-one] BUMEX One's activity reports, same room
import { FinanceArchive } from '../../one/FinanceArchive'; // [bumex-one] BUMEX One's finance, read-only
import { useSay } from '../../one/say'; // [bumex-one]
import { PageRefresh } from '../../one/PageRefresh'; // [bumex-one] ↻ at the right of the header (2026-11-22)
// [bumex-one] bilingual: every text follows the person's language, say('français', 'English') (vanguard/one/say.ts, 2026-11-21)

// Reports: each card carries a live figure and opens the module that produces the report, on the right tab.

export function ReportsPanel({ entityId }: { entityId: Id }) {
  const { state, t, ui, setUi, openRoom } = useStore();
  const say = useSay(); // [bumex-one]
  const [part, setPart] = useState<'finance' | 'activity' | 'archive'>(ui.tab === 'activity' || ui.tab === 'archive' ? ui.tab : 'finance'); // [bumex-one] financial reports, activity reports, BUMEX One's finance archive
  useEffect(() => { if (ui.tab === 'activity' || ui.tab === 'archive') setPart(ui.tab); }, [ui.tab]); // [bumex-one]
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
        { title: say('Tableau consolidé', 'Consolidated dashboard'), sub: say(`CA consolidé après élimination de ${fmt(g.intercompanyRevenue, 0)} d'intercos`, `Consolidated revenue after eliminating ${fmt(g.intercompanyRevenue, 0)} of intercompany`), figure: fmt(g.consolidatedRevenue, 0), room: 'penthouse', icon: 'penthouse' },
        { title: say('Créances en retard · groupe', 'Overdue receivables · group'), sub: say(`${g.overdueCount} factures sur les 8 entités`, `${g.overdueCount} invoices across the 8 entities`), figure: fmt(g.overdue, 0), room: 'penthouse', icon: 'clients', kind: g.overdueCount ? 'crit' : 'good' },
        { title: say('Trésorerie groupe', 'Group treasury'), sub: say('Contre-valeur MRU', 'MRU equivalent'), figure: fmt(g.cash, 0), room: 'penthouse', icon: 'bank' },
      ]
    : [
        { title: t('tab_tb'), sub: `${t('fiscal_year')} ${ui.fiscalYearLabel} · ${say(`${tb.length} comptes mouvementés · export CSV`, `${tb.length} accounts with activity · CSV export`)}`, figure: fmt(r2(tb.reduce((a, r) => a + r.debit, 0)), 0), room: 'accounting', tab: 'tb', icon: 'accounting' },
        { title: t('tab_gl'), sub: say('Par compte, période et pièce', 'By account, period and document'), figure: say(`${state.entries.filter((e) => e.entityId === entityId && e.status !== 'draft').length} écritures`, `${state.entries.filter((e) => e.entityId === entityId && e.status !== 'draft').length} journal entries`), room: 'accounting', tab: 'gl', icon: 'accounting' },
        { title: t('tab_journals'), sub: say(`${f.drafts} brouillon${f.drafts > 1 ? 's' : ''} à comptabiliser`, `${f.drafts} draft${f.drafts === 1 ? '' : 's'} to post`), figure: String(f.drafts), room: 'accounting', tab: 'journals', icon: 'accounting', kind: f.drafts ? 'warn' : 'good' },
        { title: t('tab_closing'), sub: say('Périodes, clôture douce, verrouillage, exercices', 'Periods, soft close, locking, fiscal years'), figure: say(`${state.periods.filter((p) => p.entityId === entityId && p.status === 'soft_closed').length} à verrouiller`, `${state.periods.filter((p) => p.entityId === entityId && p.status === 'soft_closed').length} to lock`), room: 'accounting', tab: 'closing', icon: 'tasks', kind: state.periods.some((p) => p.entityId === entityId && p.status === 'soft_closed') ? 'warn' : 'good' },
        { title: t('tab_integrity'), sub: say('Chaîne SHA-256 des écritures, par journal', 'SHA-256 chain of journal entries, per journal'), figure: chainOk ? t('hash_ok') : t('hash_bad'), room: 'accounting', tab: 'integrity', icon: 'tasks', kind: chainOk ? 'good' : 'crit' },
        { title: t('tab_aging'), sub: say(`${f.overdueCount} factures en retard · ${f.over90Count} au-delà de 90 j`, `${f.overdueCount} overdue invoices · ${f.over90Count} over 90 days`), figure: fmt(f.overdue, 0), room: 'clients', tab: 'aging', icon: 'clients', kind: f.overdueSignal === 'off' ? undefined : f.overdueSignal },
        { title: t('tab_dunning'), sub: say('File de relances par niveau', 'Reminder queue by level'), figure: say(`${f.overdueCount} à relancer`, `${f.overdueCount} to remind`), room: 'clients', tab: 'dunning', icon: 'clients' },
        { title: t('tab_forecast'), sub: say('Trésorerie à 13 semaines, point bas', 'Treasury over 13 weeks, low point'), figure: fmt(minForecast, 0), room: 'bank', tab: 'forecast', icon: 'bank', kind: minForecast < entity.cashThreshold ? 'warn' : 'good' },
        { title: t('tab_recon'), sub: say(`${f.unmatchedBank} lignes de relevé en attente`, `${f.unmatchedBank} statement lines pending`), figure: String(f.unmatchedBank), room: 'bank', tab: 'recon', icon: 'bank', kind: f.unmatchedBank ? 'warn' : 'good' },
        { title: say('Dettes fournisseurs', 'Supplier payables'), sub: say(`${f.pendingApprovals} factures à approuver · état des dettes par échéance`, `${f.pendingApprovals} invoices to approve · payables by due date`), figure: fmt(f.payables, 0), room: 'suppliers', tab: 'payables', icon: 'suppliers', kind: f.pendingApprovals ? 'warn' : 'good' },
        { title: t('tab_loans'), sub: say(`${loans.length} emprunt(s) · ${lateInst} échéance(s) en retard`, `${loans.length} loan(s) · ${lateInst} overdue instalment(s)`), figure: fmt(outstanding, 0), room: 'bank', tab: 'loans', icon: 'bank', kind: lateInst ? 'warn' : 'good' },
        { title: say('Travaux en cours · WIP', 'Work in progress · WIP'), sub: say(`${f.engagements} missions actives · ${f.lateEngagements} en retard`, `${f.engagements} active missions · ${f.lateEngagements} late`), figure: `${f.engagements} missions`, room: 'missions', icon: 'missions', kind: f.engagementSignal === 'off' ? undefined : f.engagementSignal },
        { title: say('Planning des missions', 'Mission planning'), sub: say(`${cal.free} disponible(s) · ${cal.overloaded} en surcharge`, `${cal.free} available · ${cal.overloaded} overloaded`), figure: say(`${cal.rows.length} collaborateurs`, `${cal.rows.length} employees`), room: 'missions', tab: 'planning', icon: 'calendar', kind: cal.overloaded ? 'crit' : 'good' },
        { title: say('Registre des immobilisations', 'Fixed asset register'), sub: say(`Valeur brute, amortissements, VNC · dotation ${ui.fiscalYearLabel} ${fmt(deprToPost, 0)} à comptabiliser`, `Gross value, depreciation, net book value · ${ui.fiscalYearLabel} depreciation ${fmt(deprToPost, 0)} to post`), figure: say(`${state.assets.filter((a) => a.entityId === entityId).length} biens`, `${state.assets.filter((a) => a.entityId === entityId).length} assets`), room: 'assets', tab: 'yearend', icon: 'assets', kind: deprToPost > 0 ? 'warn' : 'good' },
        { title: say('Effectifs et paie', 'Headcount and payroll'), sub: say(`${hc.active} collaborateurs · coût employeur mensuel ${fmt(hc.monthlyEmployerCost, 0)}`, `${hc.active} employees · monthly employer cost ${fmt(hc.monthlyEmployerCost, 0)}`), figure: say(`${payrollRuns} paie(s) comptabilisée(s)`, `${payrollRuns} payroll(s) posted`), room: 'hr', tab: 'statements', icon: 'hr' },
        { title: say('Retenues à la source', 'Withholding tax'), sub: say(`Subies ${fmt(wht.sufferedTotal, 0)} · dues ${fmt(wht.dueTotal, 0)} sur l'année`, `Suffered ${fmt(wht.sufferedTotal, 0)} · due ${fmt(wht.dueTotal, 0)} this year`), figure: `${state.taxCodes.filter((x) => x.entityId === entityId && x.kind === 'withholding').length} codes`, room: 'tax', tab: 'withholding', icon: 'tax' },
        { title: say('TVA · synthèse', 'VAT · summary'), sub: say(`Collectée ${fmt(vat.collected, 0)} · déductible ${fmt(vat.deductible, 0)}`, `Collected ${fmt(vat.collected, 0)} · deductible ${fmt(vat.deductible, 0)}`), figure: fmt(vat.net, 0), room: 'tax', tab: 'summary', icon: 'tax' },
        { title: say('Plan comptable', 'Chart of accounts'), sub: say('Export Excel, modèle, import contrôlé', 'Excel export, template, checked import'), figure: say(`${state.accounts.filter((a) => a.entityId === entityId).length} comptes`, `${state.accounts.filter((a) => a.entityId === entityId).length} accounts`), room: 'accounting', tab: 'coa', icon: 'accounting' },
        { title: say('Historique et sécurité', 'History and security'), sub: say(`${pendingDel} demande(s) de suppression en attente`, `${pendingDel} pending deletion request(s)`), figure: say(`${state.auditLog.filter((a) => a.entityId === entityId).length} événements`, `${state.auditLog.filter((a) => a.entityId === entityId).length} events`), room: 'settings', tab: 'history', icon: 'lock', kind: pendingDel ? 'warn' : undefined },
        { title: 'Archives', sub: say('Dossiers de mission sur le rayonnage', 'Mission files on the rack'), figure: say(`${state.archives.filter((a) => a.entityId === entityId && a.status !== 'destroyed').length} boîtes`, `${state.archives.filter((a) => a.entityId === entityId && a.status !== 'destroyed').length} boxes`), room: 'archives', icon: 'archives' },
        { title: say('Tableau consolidé', 'Consolidated dashboard'), sub: say('Penthouse · groupe', 'Penthouse · group'), figure: fmt(g.consolidatedRevenue, 0), room: 'penthouse', icon: 'penthouse' },
      ];
  return (
    <>
      <div className="sheet-head"><h1>{t('rep_title')}</h1><Tabs tabs={[{ id: 'finance' as const, label: say('Pilotage', 'Management') }, { id: 'activity' as const, label: say("Rapports d'activité", 'Activity reports') }, { id: 'archive' as const, label: say('Archives financières', 'Finance archive') }]} value={part} onChange={setPart} />{part === 'finance' && <span className="muted small">{t('rep_sub')}</span>}<PageRefresh /></div>
      <div className="sheet-body">
        {part === 'archive' ? <FinanceArchive /> : part === 'activity' ? <ActivityReports /> : (
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
        )}
      </div>
    </>
  );
}
