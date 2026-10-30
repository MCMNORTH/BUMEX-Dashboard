import { useEffect, useMemo, useState } from 'react'; // [bumex-one] useEffect
import { decideDeletion, pendingDeletions, canDecideDeletions } from '@bumex/domain'; // [bumex-one] accounts: the Permissions tab
import { useStore } from '../../store';
import { Field, Tabs, Chip, saveFile } from '../common';
import { History } from '../../one/History'; // [bumex-one] one history: the ERP's audit and BUMEX One's activity
import { MyAccountPanel } from '../../one/Account'; // [bumex-one]
import { PermissionsPanel } from '../../one/Permissions'; // [bumex-one] who sees which entity, and which parts of it
import { useSay } from '../../one/say'; // [bumex-one]
import logoImage from '../../assets/logo.jpg'; // [bumex-one] Next imports images as objects
const logo = logoImage.src;
import { Select } from '../Select';

type Tab = 'general' | 'account' | 'access' | 'deletions' | 'history'; // [bumex-one] account

const MODULE_LABEL: Record<string, string> = { accounting: 'Comptabilité', bank: 'Trésorerie', clients: 'Clients', suppliers: 'Fournisseurs', missions: 'Missions', assets: 'Immobilisations', hr: 'Ressources humaines', tax: 'Fiscalité', archives: 'Archives', tasks: 'Tâches', reports: 'Rapports', penthouse: 'Holding · consolidé' };

export function SettingsPanel({ initialTab }: { initialTab?: string | null }) {
  const { state, ui, t, setUi, setLang, setQuality, reset, openRoom, toast } = useStore();
  const admin = state.session.managesAccess === true; // [bumex-one] the role modifiers (0009)
  const say = useSay(); // [bumex-one]
  const tabs: { id: Tab; label: string }[] = [{ id: 'general', label: 'Général' }, { id: 'account', label: say('Mon compte', 'My account') }, ...(admin ? [{ id: 'access' as Tab, label: say('Permissions', 'Permissions') }] : []), { id: 'deletions', label: `Demandes de suppression · ${pendingDeletions(state).length}` }, { id: 'history', label: 'Historique' }];
  const [tab, setTab] = useState<Tab>(initialTab && tabs.some((x) => x.id === initialTab) ? (initialTab as Tab) : 'general');
  useEffect(() => { if (initialTab && tabs.some((x) => x.id === initialTab)) setTab(initialTab as Tab); }, [initialTab]); // [bumex-one] a link to another tab while the room is open
  return (
    <>
      <div className="sheet-head"><h1>{t('set_title')}</h1><Tabs tabs={tabs} value={tab} onChange={setTab} /></div>
      <div className="sheet-body">
        {tab === 'general' && <General />}
        {tab === 'account' && <MyAccountPanel />}{/* [bumex-one] BUMEX One's profile, preferences, security */}
        {tab === 'access' && admin && <PermissionsPanel />}
        {tab === 'deletions' && <Deletions />}
        {tab === 'history' && <History />}
        {tab === 'general' && (
          <div className="card" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <img src={logo} alt="BUMEX" style={{ width: 72, height: 'auto', borderRadius: 8 }} />
            <div>
              <div style={{ fontWeight: 600, letterSpacing: '.08em' }}>BUMEX VANGUARD</div>
              <div className="small muted">{state.group.name} · Nouakchott · Casablanca Finance City · Aptos / Aptos Narrow</div>
            </div>
          </div>
        )}
      </div>
    </>
  );

  function General() {
    const fys = useMemo(() => [...new Set(state.fiscalYears.map((f) => f.label))].sort().reverse(), [state.fiscalYears]);
    const entities = [...state.entities].sort((a, b) => a.floorOrder - b.floorOrder);
    const exportJson = () => saveFile(`bumex-vanguard-${state.today}.json`, JSON.stringify(state, null, 1), 'application/json', toast);
    const Toggle = ({ label, sub, value, onChange }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void }) => (
      <label className="row" style={{ borderTopColor: 'var(--line)', color: 'var(--ink)', cursor: 'pointer' }}>
        <span>{label}{sub && <div className="small muted">{sub}</div>}</span>
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      </label>
    );
    const me = state.users.find((u) => u.id === state.session.userId);
    const scope = state.session.entityIds === '*' ? 'toutes les entités' : state.session.entityIds.map((id) => state.entities.find((e) => e.id === id)?.name).join(', ');
    const mods = state.session.modules === '*' ? 'tous les modules' : state.session.modules.map((m) => MODULE_LABEL[m] ?? m).join(', ');
    return (
      <div className="grid2">
        <div className="card">
          <h2>{t('set_session')}</h2>
          <div className="row" style={{ borderTop: 0 }}><span>{state.session.actorName}{me ? <div className="small muted">{me.email}</div> : null}</span><Chip kind="good">{t(state.session.role)}</Chip></div>
          <div className="small muted" style={{ margin: '6px 0 10px' }}>Accès : {scope} · {mods}</div>
          <div className="grid2">
            <Field label={t('set_lang')}><Select className="in" value={ui.lang} onChange={(e) => setLang(e.target.value as 'fr' | 'en')}><option value="fr">Français</option><option value="en">English</option></Select></Field>
            <Field label={t('fiscal_year')}><Select className="in" value={ui.fiscalYearLabel} onChange={(e) => setUi({ fiscalYearLabel: e.target.value })}>{fys.map((f) => <option key={f} value={f}>{f}</option>)}</Select></Field>
            <Field label={t('set_entity')}><Select className="in" value={ui.entityId ?? ''} onChange={(e) => setUi({ entityId: e.target.value, room: e.target.value === state.entities.find((x) => x.isHolding)?.id ? 'penthouse' : ui.room === 'penthouse' ? 'settings' : ui.room })}>{entities.filter((e) => state.session.entityIds === '*' || state.session.entityIds.includes(e.id)).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select></Field>
          </div>
          {/* [bumex-one] no demo sign-in: the person is the one signed in to BUMEX One */}
        </div>
        <div className="card set-display">{/* [mobile] hidden on a phone, which has no building (responsive.css) */}
          <h2>{t('set_display')}</h2>
          <div className="small muted" style={{ marginBottom: 6 }}>{t('set_quality_sub')}</div>
          <Toggle label={t('set_shadows')} value={ui.quality.shadows} onChange={(v) => setQuality({ shadows: v })} />
          <Toggle label={t('set_ao')} value={ui.quality.ao} onChange={(v) => setQuality({ ao: v })} />
          <Toggle label={t('set_people')} value={ui.quality.people} onChange={(v) => setQuality({ people: v })} />
          <Toggle label={t('nav_tasks')} sub={t('bar_tasks') + ' · ' + t('expand').toLowerCase()} value={ui.barOpen} onChange={(v) => setUi({ barOpen: v })} />
          <Toggle label={t('expand') + ' · ' + t('nav_modules').toLowerCase()} value={ui.sidebarOpen} onChange={(v) => setUi({ sidebarOpen: v })} />
        </div>
        <div className="card">
          <h2>Paramétrage métier</h2>
          <div className="small muted">Plans comptables, codes taxe, règles de paie et catégories d'immobilisations se règlent dans leur module, par entité.</div>
          <div className="actions" style={{ marginTop: 10, justifyContent: 'flex-start', flexWrap: 'wrap' }}>
            <button className="btn sm" onClick={() => openRoom('accounting', 'coa')}>{t('tab_coa')}</button>
            <button className="btn sm" onClick={() => openRoom('tax', 'codes')}>{t('room_tax')} · codes</button>
            <button className="btn sm" onClick={() => openRoom('hr', 'rules')}>Règles de paie</button>
            <button className="btn sm" onClick={() => openRoom('assets', 'categories')}>Catégories d'immobilisations</button>
            <button className="btn sm" onClick={() => openRoom('accounting', 'closing')}>{t('tab_closing')}</button>
          </div>
        </div>
        <div className="card">
          <h2>{t('set_data')}</h2>
          <div className="small muted">{t('demo_note')} · {state.entries.length} écritures · {state.employees.length} collaborateurs · {state.assets.length} immobilisations · {state.tasks.length} tâches</div>
          <div className="actions" style={{ marginTop: 10, justifyContent: 'flex-start' }}>
            <button className="btn sm" onClick={exportJson}>Exporter les données (JSON)</button>
            <button className="btn sm" onClick={() => reset()}>{t('reset')}</button>{/* [bumex-one] reloads the database's state */}
          </div>
        </div>
      </div>
    );
  }
}

function Deletions() {
  const { state, t, apply } = useStore();
  const can = canDecideDeletions(state);
  const [note, setNote] = useState<Record<string, string>>({});
  const all = [...state.deletionRequests].sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1));
  const pending = all.filter((d) => d.status === 'pending');
  const done = all.filter((d) => d.status !== 'pending');
  const row = (d: (typeof all)[number]) => (
    <tr key={d.id}>
      <td className="small">{d.requestedAt.slice(0, 16).replace('T', ' ')}</td>
      <td><b>{d.label}</b><div className="small muted">{d.table} · {state.entities.find((e) => e.id === d.entityId)?.code ?? 'groupe'}</div></td>
      <td>{d.requestedByName}</td>
      <td className="small">{d.reason}</td>
      <td><Chip kind={d.status === 'pending' ? 'warn' : d.status === 'approved' ? 'good' : 'dim'}>{d.status === 'pending' ? 'En attente' : d.status === 'approved' ? 'Approuvée · supprimé' : 'Rejetée'}</Chip>{d.decidedBy ? <div className="small muted">{d.decidedBy} · {d.decidedAt?.slice(0, 10)}{d.decisionNote ? ` · ${d.decisionNote}` : ''}</div> : null}</td>
      <td>
        {d.status === 'pending' && can && d.requestedBy !== state.session.actorId && (
          <div className="actions" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
            <input className="in" placeholder="Note" style={{ width: 120 }} value={note[d.id] ?? ''} onChange={(e) => setNote({ ...note, [d.id]: e.target.value })} />
            <button className="btn sm danger" onClick={() => apply((s) => decideDeletion(s, d.id, 'approved', note[d.id]), 'Suppression approuvée et exécutée')}>Approuver</button>
            <button className="btn sm" onClick={() => apply((s) => decideDeletion(s, d.id, 'rejected', note[d.id]), 'Demande rejetée')}>Rejeter</button>
          </div>
        )}
        {d.status === 'pending' && d.requestedBy === state.session.actorId && <span className="small muted">votre demande</span>}
      </td>
    </tr>
  );
  return (
    <>
      <div className="banner info">{can ? 'Vous approuvez ou rejetez les demandes des autres profils ; chaque décision est tracée. Vous ne pouvez pas trancher votre propre demande.' : t('delete_note_other')}</div>
      <div className="card flush">
        <table>
          <thead><tr><th>Demandée le</th><th>Élément</th><th>Par</th><th>Motif</th><th>Statut</th><th></th></tr></thead>
          <tbody>{pending.length ? pending.map(row) : <tr><td colSpan={6} className="muted small">Aucune demande en attente</td></tr>}</tbody>
        </table>
      </div>
      {done.length > 0 && <div className="card flush"><table><thead><tr><th>Traitée</th><th>Élément</th><th>Par</th><th>Motif</th><th>Décision</th><th></th></tr></thead><tbody>{done.slice(0, 30).map(row)}</tbody></table></div>}
    </>
  );
}

