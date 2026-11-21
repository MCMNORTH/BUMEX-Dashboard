import { useMemo } from 'react';
import { allFloors, floorSignals, canUseModule, fmt, type FloorSignals } from '@bumex/domain';
import { useStore } from '../store';
import { Lamp, Chip, Icon } from './common';
import { worstSignal } from '../three/Building';
import { useSay } from '../one/say';
// [bumex-one] bilingual: every text follows the person's language, say('français', 'English') (vanguard/one/say.ts, 2026-11-21)

function Sigs({ f }: { f: FloorSignals }) {
  const say = useSay();
  return (
    <span className="sigs">
      <Lamp kind={f.cashSignal} letter="T" />
      <Lamp kind={f.overdueSignal} letter={say('C', 'R')} />
      <Lamp kind={f.engagementSignal} letter={say('M', 'E')} />
      <Lamp kind={f.draftSignal === 'good' ? 'off' : f.draftSignal} letter={say('É', 'J')} />
    </span>
  );
}

export function TowerHud() {
  const { state, ui, t, setUi, goFloor, openRoom } = useStore();
  const say = useSay();
  const floors = useMemo(() => allFloors(state), [state]);
  const hot = floors.find((f) => f.entity.id === ui.hoverFloor) ?? floors.find((f) => f.entity.id === ui.entityId) ?? floors[0];
  const fy = state.fiscalYears.find((f) => f.entityId === hot.entity.id && f.label === ui.fiscalYearLabel);
  // financial figures only for accounts that may open the finance modules; the others see the operational lines
  const finance = canUseModule(state, 'accounting') || canUseModule(state, 'bank');
  const enter = (f: FloorSignals) => {
    if (!f.visible) return;
    goFloor(f.entity.id);
    if (f.entity.isHolding) openRoom('penthouse');
  };
  return (
    <>
      <div className="hud left">
        <section className="panel">
          <h2>{t('group')}</h2>
          <div className="floorlist">
            {floors.map((f) => (
              <button
                key={f.entity.id}
                className={`${ui.hoverFloor === f.entity.id ? 'hot' : ''} ${f.visible ? '' : 'off'} ${ui.entityId === f.entity.id ? 'cur' : ''}`}
                onMouseEnter={() => f.visible && setUi({ hoverFloor: f.entity.id })}
                onMouseLeave={() => setUi({ hoverFloor: null })}
                onClick={() => enter(f)}
              >
                <span>
                  {f.entity.name}
                  <span className="small muted" style={{ marginLeft: 6 }}>{f.entity.functionalCurrency}</span>
                </span>
                {f.visible ? <Sigs f={f} /> : <span className="small">{say('non autorisé', 'not authorised')}</span>}
              </button>
            ))}
          </div>
          <div className="small muted" style={{ marginTop: 8 }}>{t('legend_text')}</div>
        </section>
      </div>
      <div className="hud right">
        <section className="panel">
          <h2>{ui.hoverFloor ? t('hovered') : t('current_floor')} · {hot.entity.name}</h2>
          {finance && <>
            <div className="row"><span>{t('cash')}</span><span className="mono">{fmt(hot.cash, 0)} {hot.entity.functionalCurrency}</span></div>
            <div className="row sub"><span>{t('threshold')} {fmt(hot.entity.cashThreshold, 0)}</span><Chip kind={hot.cashSignal === 'off' ? 'dim' : hot.cashSignal}>{hot.cashSignal === 'good' ? t('ok') : t('attention')}</Chip></div>
            <div className="row"><span>{t('overdue')}</span><span className="mono">{fmt(hot.overdue, 0)}</span></div>
            <div className="row sub"><span>{hot.overdueCount} {t('invoices_n')} · {hot.over90Count} {t('over90')}</span><Chip kind={hot.overdueSignal === 'off' ? 'dim' : hot.overdueSignal}>{hot.overdueSignal === 'crit' ? t('action') : hot.overdueSignal === 'warn' ? t('attention') : t('ok')}</Chip></div>
          </>}
          <div className="row"><span>{t('late_eng')}</span><span className="mono">{hot.lateEngagements} / {hot.engagements}</span></div>
          {finance && <div className="row"><span>{t('drafts')}</span><span className="mono">{hot.drafts}</span></div>}
          <div className="row"><span>{t('present')}</span><span className="mono">{hot.entity.staffPresent} / {hot.entity.staffTotal}</span></div>
          {finance && <div className="row"><span>{t('result')} {fy?.label ?? ''}</span><span className="mono">{fmt(hot.result, 0)}</span></div>}
          <button className="btn on" style={{ marginTop: 10, width: '100%', justifyContent: 'center' }} onClick={() => enter(hot)}>
            {t('enter')}
          </button>
        </section>
      </div>
      <div className="hint">
        {t('click_floor')} · {t('explore').toLowerCase()}{say(' : glisser pour tourner, molette pour zoomer', ': drag to rotate, scroll to zoom')} · <kbd>Ctrl</kbd>+<kbd>K</kbd>
      </div>
    </>
  );
}

export function FloorHud() {
  const { state, ui, t, goTower, focusRoom, setUi } = useStore();
  const say = useSay();
  const f = useMemo(() => (ui.entityId ? floorSignals(state, ui.entityId) : null), [state, ui.entityId]);
  if (!f) return null;
  const worst = worstSignal(f);
  const floorsAbove = state.entities.filter((e) => e.floorOrder < f.entity.floorOrder).length;
  const finance = canUseModule(state, 'accounting') || canUseModule(state, 'bank');
  const openTasks = state.tasks.filter((x) => x.entityId === f.entity.id && x.status !== 'done').length;
  return (
    <>
      <div className="hud left" style={{ width: 'auto' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn dark" onClick={goTower} title={`${t('back_overview')} · ${say('Échap', 'Esc')}`}><Icon name="back" size={16} /> {t('back_overview')}</button>
          {(ui.focusRoom || ui.rackFocus) && <button className="btn dark" onClick={() => { focusRoom(null); setUi({ rackFocus: false, archiveId: null }); }}>{t('back_floor')}</button>}
        </div>
      </div>
      {!ui.focusRoom && !ui.rackFocus && <div className="hud right">
        <section className="panel">
          <h2>{f.entity.name} · {t('floor')} {f.entity.isTest ? '−1' : state.entities.filter((e) => !e.isTest).length - f.entity.floorOrder} · {ui.fiscalYearLabel}</h2>
          {finance ? <>
            <div className="row"><span>{t('revenue')}</span><span className="mono">{fmt(f.revenue, 0)}</span></div>
            <div className="row"><span>{t('result')}</span><span className="mono">{fmt(f.result, 0)}</span></div>
            <div className="row"><span>{t('cash')}</span><span className="mono">{fmt(f.cash, 0)}</span></div>
            <div className="row"><span>{t('receivables')}</span><span className="mono">{fmt(f.receivables, 0)}</span></div>
            <div className="row"><span>{t('payables')}</span><span className="mono">{fmt(f.payables, 0)}</span></div>
          </> : <>
            <div className="row"><span>{t('bar_engagements')}</span><span className="mono">{f.engagements} {t('bar_ongoing')}</span></div>
            <div className="row"><span>{t('late_eng')}</span><span className="mono">{f.lateEngagements}</span></div>
            <div className="row"><span>{t('nav_tasks')}</span><span className="mono">{openTasks}</span></div>
            <div className="row"><span>{t('present')}</span><span className="mono">{f.entity.staffPresent} / {f.entity.staffTotal}</span></div>
          </>}
          <div className="row"><span>{say("État de l'étage", 'Floor status')}</span><Chip kind={worst === 'off' ? 'dim' : worst}>{worst === 'crit' ? t('action') : worst === 'warn' ? t('attention') : t('ok')}</Chip></div>
          <div className="small muted" style={{ marginTop: 6 }}>{f.entity.functionalCurrency} · {finance ? say('écritures comptabilisées · ', 'posted journal entries · ') : ''}{floorsAbove} {floorsAbove > 1 ? say('étages au-dessus masqués', 'floors above hidden') : say('étage au-dessus masqué', 'floor above hidden')}</div>
        </section>
        {finance && <section className="panel">
          <h2>{t('decor_title')}</h2>
          <div className="row"><span>{f.cashSignal === 'good' ? say('Coffre éclairé', 'Safe lit') : say('Coffre éteint', 'Safe dark')}{say(' · lampe du trésorier', " · treasurer's lamp")}</span><Chip kind={f.cashSignal === 'off' ? 'dim' : f.cashSignal}>{t('cash')}</Chip></div>
          <div className="row"><span>{f.overdueCount} {say('dossiers rouges · clients', 'red files · clients')}</span><Chip kind={f.overdueSignal === 'off' ? 'dim' : f.overdueSignal}>{t('overdue')}</Chip></div>
          <div className="row"><span>{f.engagements} {say('postes', 'desks')} · {f.lateEngagements} {say('lampes ambre', 'amber lamps')}</span><Chip kind={f.engagementSignal === 'off' ? 'dim' : f.engagementSignal}>{t('room_missions')}</Chip></div>
          <div className="row"><span>{say('Lampe de bureau · comptabilité', 'Desk lamp · accounting')}</span><Chip kind={f.drafts ? 'warn' : 'good'}>{f.drafts} {t('draft').toLowerCase()}</Chip></div>
          <div className="row"><span>{f.pendingApprovals} {say('bannettes ambre', 'amber trays')} · {f.pendingApprovals ? say('coursier', 'courier') : say('pas de coursier', 'no courier')}</span><Chip kind={f.pendingApprovals ? 'warn' : 'good'}>{t('room_suppliers')}</Chip></div>
          <div className="row"><span>{state.archives.filter((a) => a.entityId === f.entity.id && a.status !== 'destroyed').length} {say('boîtes sur le rayonnage', 'boxes on the rack')}</span><Chip kind="dim">{t('nav_archives')}</Chip></div>
          <div className="row"><span>{t('present')}</span><Chip kind="dim">{f.entity.staffPresent} / {f.entity.staffTotal}</Chip></div>
        </section>}
      </div>}
      {!ui.rackFocus && <div className="hint">
        {ui.focusRoom ? <>{say('Molette pour zoomer, glisser pour déplacer', 'Scroll to zoom, drag to move')} · <kbd>{say('Échap', 'Esc')}</kbd> {t('back_floor')}</> : <>{say('Survoler une salle pour son nom · cliquer pour zoomer, encore pour ouvrir le module · vue fixe : molette pour zoomer, glisser pour déplacer', 'Hover a room for its name · click to zoom, again to open the module · fixed view: scroll to zoom, drag to move')} · <kbd>{say('Échap', 'Esc')}</kbd> {t('back_overview')}</>}
      </div>}
    </>
  );
}
