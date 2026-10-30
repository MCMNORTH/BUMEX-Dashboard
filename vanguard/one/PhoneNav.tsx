import { useMemo, useState } from 'react';
import type { Room } from '../i18n';
import { useStore } from '../store';
import { Icon } from '../ui/common';
import { Select } from '../ui/Select';
import { FloorList, useNavItems, type Item } from '../ui/Sidebar';
import { useBackLayer } from './back';
import { useSay } from './say';

// A phone's navigation (docs/plans/mobile-tablet.md, step 3): the rail is hidden, a bar at the bottom carries the
// person's work, and "Plus" opens a sheet with everything else (the floors, the modules, the settings, the language
// and the fiscal year). Rendered by vanguard/App.tsx on a phone only; styles in vanguard/responsive.css.

const BAR: { room: Room; icon: string; fr: string; en: string }[] = [
  { room: 'myday', icon: 'myday', fr: 'Ma journée', en: 'My day' },
  { room: 'mywork', icon: 'mywork', fr: 'Mon travail', en: 'My work' },
  { room: 'tasks', icon: 'tasks', fr: 'Tâches', en: 'Tasks' },
  { room: 'time', icon: 'clock', fr: 'Temps', en: 'Time' },
];

export function PhoneNav() {
  const { ui, openRoom } = useStore();
  const say = useSay();
  const { work } = useNavItems();
  const [more, setMore] = useState(false);
  const current: Room = ui.room ?? 'myday';
  const badge = (room: Room) => work.find((w) => w.room === room)?.badge;
  const inBar = BAR.some((b) => b.room === current);
  return (
    <>
      <nav className="pnav" aria-label="Navigation">
        {BAR.map((b) => (
          <button key={b.room} className={!more && current === b.room ? 'on' : ''} aria-current={current === b.room ? 'page' : undefined} onClick={() => { setMore(false); openRoom(b.room); }}>
            <Icon name={b.icon} size={22} />
            <span>{say(b.fr, b.en)}</span>
            {badge(b.room) ? <i>{badge(b.room)}</i> : null}
          </button>
        ))}
        <button className={more || !inBar ? 'on' : ''} aria-haspopup="dialog" aria-expanded={more} onClick={() => setMore(!more)}>
          <Icon name="more" size={22} />
          <span>{say('Plus', 'More')}</span>
        </button>
      </nav>
      {more && <PhoneMore onClose={() => setMore(false)} />}
    </>
  );
}

function PhoneMore({ onClose }: { onClose: () => void }) {
  const { state, ui, t, setUi, setLang, openRoom } = useStore();
  const say = useSay();
  const { entity, modules, work, reports, settings, open } = useNavItems();
  useBackLayer(true, onClose); // the phone's Back closes the sheet
  const fys = useMemo(() => [...new Set(state.fiscalYears.map((f) => f.label))].sort().reverse(), [state.fiscalYears]);
  const go = (room: Room) => { onClose(); openRoom(room); };
  const pick = (item: Item) => {
    if (item.off) return;
    onClose();
    if (ui.room !== item.room) open(item);
  };
  const archives = work.find((w) => w.room === 'archives');
  return (
    <>
      <div className="pm-back" onClick={onClose} />
      <section className="pm-sheet" role="dialog" aria-label={say('Plus', 'More')}>
        <div className="pm-h">
          <b>{entity.name}</b>
          <button className="btn ghost" onClick={onClose} aria-label={t('close')}><Icon name="close" size={18} /></button>
        </div>
        <h3>{t('nav_floors')}</h3>
        <div className="pm-floors flyout-list"><FloorList onPick={onClose} /></div>
        <h3>{t('grp_work')}</h3>
        <button className={`pm-row ${ui.room === 'overview' ? 'on' : ''}`} onClick={() => go('overview')}><Icon name="overview" size={20} /><span>{t('nav_overview')}</span></button>
        <button className={`pm-row ${ui.room === 'inbox' ? 'on' : ''}`} onClick={() => go('inbox')}><Icon name="bell" size={20} /><span>{t('nav_inbox')}</span></button>
        {archives && <Row item={archives} on={ui.room === archives.room} pick={pick} />}
        <h3>{t('grp_modules')}</h3>
        {modules.map((m) => <Row key={m.id} item={m} on={ui.room === m.room} pick={pick} />)}
        <Row item={reports} on={ui.room === reports.room} pick={pick} />
        <Row item={settings} on={ui.room === settings.room} pick={pick} />
        <h3>{say('Préférences', 'Preferences')}</h3>
        <div className="pm-prefs">
          <label>{say('Langue', 'Language')}</label>
          <div className="seg" role="group">
            <button className={`btn ${ui.lang === 'fr' ? 'primary' : ''}`} onClick={() => setLang('fr')}>Français</button>
            <button className={`btn ${ui.lang === 'en' ? 'primary' : ''}`} onClick={() => setLang('en')}>English</button>
          </div>
          <label>{t('fiscal_year')}</label>
          <Select className="in" aria-label={t('fiscal_year')} value={ui.fiscalYearLabel} onChange={(e) => setUi({ fiscalYearLabel: e.target.value })}>
            {fys.map((f) => <option key={f} value={f}>{t('fiscal_year')} {f}</option>)}
          </Select>
        </div>
      </section>
    </>
  );
}

function Row({ item, on, pick }: { item: Item; on: boolean; pick: (item: Item) => void }) {
  const say = useSay();
  return (
    <button className={`pm-row ${on ? 'on' : ''}`} disabled={item.off} onClick={() => pick(item)}>
      <Icon name={item.icon} size={20} />
      <span>{item.label}{item.off ? <small> · {say('accès non autorisé', 'no access')}</small> : null}</span>
      {item.badge ? <i>{item.badge}</i> : null}
    </button>
  );
}
