import { useEffect, useMemo, useState } from 'react'; // [bumex-one] useEffect
import { ROLES, MODULE_KEYS, ROLE_DEFAULT_MODULES, createUser, updateUserAccess, setUserStatus, decideDeletion, pendingDeletions, isAccessAdmin, canDecideDeletions, type Role, type AppUser, type Id } from '@bumex/domain';
import { useStore } from '../../store';
import { Field, Tabs, Chip, saveFile, Icon, DeleteButton } from '../common';
import { History } from '../../one/History'; // [bumex-one] one history: the ERP's audit and BUMEX One's activity
import { MyAccountPanel, PeopleWithoutAccessList } from '../../one/Account'; // [bumex-one]
import { useSay } from '../../one/say'; // [bumex-one]
import logoImage from '../../assets/logo.jpg'; // [bumex-one] Next imports images as objects
const logo = logoImage.src;

type Tab = 'general' | 'account' | 'access' | 'deletions' | 'history'; // [bumex-one] account

const MODULE_LABEL: Record<string, string> = { accounting: 'Comptabilité', bank: 'Trésorerie', clients: 'Clients', suppliers: 'Fournisseurs', missions: 'Missions', assets: 'Immobilisations', hr: 'Ressources humaines', tax: 'Fiscalité', archives: 'Archives', tasks: 'Tâches', reports: 'Rapports', penthouse: 'Holding · consolidé' };
const STATUS_FR: Record<AppUser['status'], string> = { invited: 'Invité · lien non activé', active: 'Actif', disabled: 'Désactivé' };

export function SettingsPanel({ initialTab }: { initialTab?: string | null }) {
  const { state, ui, t, setUi, setLang, setQuality, reset, openRoom, toast } = useStore();
  const admin = isAccessAdmin(state);
  const say = useSay(); // [bumex-one]
  const tabs: { id: Tab; label: string }[] = [{ id: 'general', label: 'Général' }, { id: 'account', label: say('Mon compte', 'My account') }, ...(admin ? [{ id: 'access' as Tab, label: `Comptes & accès · ${state.users.length}` }] : []), { id: 'deletions', label: `Demandes de suppression · ${pendingDeletions(state).length}` }, { id: 'history', label: 'Historique' }];
  const [tab, setTab] = useState<Tab>(initialTab && tabs.some((x) => x.id === initialTab) ? (initialTab as Tab) : 'general');
  useEffect(() => { if (initialTab && tabs.some((x) => x.id === initialTab)) setTab(initialTab as Tab); }, [initialTab]); // [bumex-one] a link to another tab while the room is open
  return (
    <>
      <div className="sheet-head"><h1>{t('set_title')}</h1><Tabs tabs={tabs} value={tab} onChange={setTab} /></div>
      <div className="sheet-body">
        {tab === 'general' && <General />}
        {tab === 'account' && <MyAccountPanel />}{/* [bumex-one] BUMEX One's profile, preferences, security */}
        {tab === 'access' && admin && <Access />}
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
            <Field label={t('set_lang')}><select className="in" value={ui.lang} onChange={(e) => setLang(e.target.value as 'fr' | 'en')}><option value="fr">Français</option><option value="en">English</option></select></Field>
            <Field label={t('fiscal_year')}><select className="in" value={ui.fiscalYearLabel} onChange={(e) => setUi({ fiscalYearLabel: e.target.value })}>{fys.map((f) => <option key={f} value={f}>{f}</option>)}</select></Field>
            <Field label={t('set_entity')}><select className="in" value={ui.entityId ?? ''} onChange={(e) => setUi({ entityId: e.target.value, room: e.target.value === state.entities.find((x) => x.isHolding)?.id ? 'penthouse' : ui.room === 'penthouse' ? 'settings' : ui.room })}>{entities.filter((e) => state.session.entityIds === '*' || state.session.entityIds.includes(e.id)).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
          </div>
          {/* [bumex-one] no demo sign-in: the person is the one signed in to BUMEX One */}
        </div>
        <div className="card">
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

// Demo only: switch to another account without its invitation link, to show what each profile sees.
function DemoSignIn() {
  const { state, signIn, t } = useStore();
  const users = state.users.filter((u) => u.status !== 'disabled');
  return (
    <div style={{ marginTop: 10 }}>
      <div className="small muted" style={{ marginBottom: 4 }}>Démonstration · se connecter en tant que</div>
      <select className="in" value={state.session.userId} onChange={(e) => signIn(e.target.value)}>
        {users.map((u) => <option key={u.id} value={u.id}>{u.name} · {t(u.role)}{u.status === 'invited' ? ' · invité' : ''}</option>)}
      </select>
    </div>
  );
}

function Access() {
  const { state, t, apply, toast } = useStore();
  const [editing, setEditing] = useState<Id | 'new' | null>(null);
  const users = [...state.users].sort((a, b) => a.name.localeCompare(b.name));
  const base = typeof location !== 'undefined' ? location.origin + location.pathname + location.search : '';
  const link = (u: AppUser) => `${base}#invite=${u.inviteToken}`;
  const copy = async (u: AppUser) => {
    try { await navigator.clipboard.writeText(link(u)); toast('ok', `Lien d'invitation copié · ${u.name}`); } catch { toast('info', link(u)); }
  };
  const employee = (u: AppUser) => state.employees.find((e) => e.id === u.employeeId);
  return (
    <>
      {/* [bumex-one] accounts are BUMEX One's: an access opens the ERP to one of its people (no invitation link) */}
      <div className="banner info">Les personnes viennent de BUMEX One : saisissez l'adresse e-mail d'une personne de BUMEX One pour lui ouvrir l'ERP, avec le rôle, les entités et les modules que vous fixez. Ce qui n'est pas autorisé reste éteint dans l'immeuble. Désactiver retire l'accès.</div>
      <div className="actions" style={{ justifyContent: 'flex-start' }}><button className="btn primary" onClick={() => setEditing('new')}><Icon name="plus" size={14} /> Nouveau compte</button></div>
      {editing && <UserForm id={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <div className="card flush">
        <table>
          <thead><tr><th>Personne</th><th>Rôle</th><th>Entités</th><th>Modules</th><th>Statut</th><th>Invité le</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.id === state.session.userId ? 'sel' : ''}>
                <td><b>{u.name}</b><div className="small muted">{u.email}{employee(u) ? ` · ${employee(u)!.code}` : ''}</div></td>
                <td>{t(u.role)}</td>
                <td className="small">{u.entityIds === '*' ? 'Toutes' : u.entityIds.map((id) => state.entities.find((e) => e.id === id)?.code ?? id).join(', ')}</td>
                <td className="small">{u.modules === '*' ? 'Tous' : u.modules.map((m) => MODULE_LABEL[m] ?? m).join(', ')}</td>
                <td><Chip kind={u.status === 'active' ? 'good' : u.status === 'invited' ? 'warn' : 'dim'}>{STATUS_FR[u.status]}</Chip></td>
                <td className="small">{u.invitedAt}{u.activatedAt ? <div className="muted">activé {u.activatedAt}</div> : null}</td>
                <td>
                  <div className="actions" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                    {u.inviteToken && u.status !== 'disabled' && <button className="btn sm" onClick={() => copy(u)} title={link(u)}><Icon name="link" size={13} /> Lien</button>}
                    <button className="btn sm" onClick={() => setEditing(u.id)}>{t('edit')}</button>
                    {u.id !== state.session.userId && (u.status === 'disabled'
                      ? <button className="btn sm" onClick={() => apply((s) => setUserStatus(s, u.id, u.activatedAt ? 'active' : 'invited'), 'Compte réactivé')}>Réactiver</button>
                      : <button className="btn sm" onClick={() => apply((s) => setUserStatus(s, u.id, 'disabled'), 'Compte désactivé')}>Désactiver</button>)}
                    {u.id !== state.session.userId && <DeleteButton table="app_user" rowId={u.id} label={`Compte ${u.name}`} />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PeopleWithoutAccessList />{/* [bumex-one] BUMEX One's people without access (its Users page, merged here) */}
      <div className="card">
        <h2>Droits par rôle</h2>
        <table>
          <thead><tr><th>Rôle</th><th>Modules par défaut</th><th>Comptabilise</th><th>Supprime directement</th><th>Gère les accès</th></tr></thead>
          <tbody>
            {ROLES.map((r) => {
              const m = ROLE_DEFAULT_MODULES[r];
              return <tr key={r}><td>{t(r)}</td><td className="small">{m === '*' ? 'Tous' : m.map((x) => MODULE_LABEL[x] ?? x).join(', ')}</td><td>{['admin', 'partner', 'raf', 'manager', 'accountant'].includes(r) ? 'oui' : '—'}</td><td>{['admin', 'partner'].includes(r) ? 'oui' : 'sur approbation'}</td><td>{r === 'admin' ? 'oui' : '—'}</td></tr>;
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function UserForm({ id, onClose }: { id: Id | null; onClose: () => void }) {
  const { state, t, apply, toast } = useStore();
  const existing = id ? state.users.find((u) => u.id === id) : undefined;
  const [name, setName] = useState(existing?.name ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');
  const [role, setRole] = useState<Role>(existing?.role ?? 'staff');
  const [allEntities, setAllEntities] = useState(existing ? existing.entityIds === '*' : false);
  const [entityIds, setEntityIds] = useState<Id[]>(existing && existing.entityIds !== '*' ? existing.entityIds : []);
  const [customModules, setCustomModules] = useState(existing ? existing.modules !== '*' && JSON.stringify(existing.modules) !== JSON.stringify(ROLE_DEFAULT_MODULES[existing.role]) : false);
  const [modules, setModules] = useState<string[]>(existing && existing.modules !== '*' ? existing.modules : ROLE_DEFAULT_MODULES['staff'] as string[]);
  const [employeeId, setEmployeeId] = useState(existing?.employeeId ?? '');
  const entities = [...state.entities].sort((a, b) => a.floorOrder - b.floorOrder);
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const defaults = ROLE_DEFAULT_MODULES[role];
  const save = () => {
    const input = { name, email, role, entityIds: allEntities ? ('*' as const) : entityIds, modules: customModules ? modules : undefined, employeeId: employeeId || undefined };
    const ok = apply((s) => {
      if (existing) return updateUserAccess(s, existing.id, input);
      const [s1, u] = createUser(s, { ...input, status: 'active' }); // [bumex-one] no invitation: the person signs in to BUMEX One
      window.setTimeout(() => toast('ok', `Accès ERP ouvert à ${u.name}`), 0);
      return s1;
    }, existing ? 'Accès mis à jour' : undefined);
    if (ok) onClose();
  };
  return (
    <div className="card">
      <h2>{existing ? `Modifier · ${existing.name}` : 'Nouveau compte'}</h2>
      <div className="grid3">
        <Field label="Nom"><input className="in" value={name} onChange={(e) => setName(e.target.value)} placeholder="Prénom Nom" /></Field>
        <Field label="E-mail"><input className="in" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom.nom@bumex.mr" /></Field>
        <Field label={t('role')}><select className="in" value={role} onChange={(e) => { setRole(e.target.value as Role); if (!customModules) setModules(ROLE_DEFAULT_MODULES[e.target.value as Role] === '*' ? [...MODULE_KEYS] : (ROLE_DEFAULT_MODULES[e.target.value as Role] as string[])); }}>{ROLES.map((r) => <option key={r} value={r}>{t(r)}</option>)}</select></Field>
        <Field label="Collaborateur RH (facultatif)"><select className="in" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}><option value="">—</option>{state.employees.filter((e) => e.status === 'active').map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName} · {state.entities.find((x) => x.id === e.entityId)?.code}</option>)}</select></Field>
      </div>
      <div className="grid2" style={{ marginTop: 8 }}>
        <div>
          <div className="lbl" style={{ marginBottom: 4 }}>Entités autorisées</div>
          <label className="small" style={{ display: 'block', marginBottom: 4 }}><input type="checkbox" checked={allEntities} onChange={(e) => setAllEntities(e.target.checked)} /> Toutes les entités du groupe</label>
          {!allEntities && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>{entities.map((e) => <label key={e.id} className="small"><input type="checkbox" checked={entityIds.includes(e.id)} onChange={() => setEntityIds((a) => toggle(a, e.id))} /> {e.name}</label>)}</div>}
        </div>
        <div>
          <div className="lbl" style={{ marginBottom: 4 }}>Modules autorisés</div>
          <label className="small" style={{ display: 'block', marginBottom: 4 }}><input type="checkbox" checked={!customModules} onChange={(e) => { setCustomModules(!e.target.checked); if (e.target.checked) setModules(defaults === '*' ? [...MODULE_KEYS] : (defaults as string[])); }} /> Modules par défaut du rôle ({defaults === '*' ? 'tous' : defaults.length})</label>
          {customModules && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>{MODULE_KEYS.map((m) => <label key={m} className="small"><input type="checkbox" checked={modules.includes(m)} onChange={() => setModules((a) => toggle(a, m))} /> {MODULE_LABEL[m]}</label>)}</div>}
        </div>
      </div>
      <div className="actions" style={{ marginTop: 10 }}>
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn primary" onClick={save}>{existing ? 'Enregistrer' : "Ouvrir l'ERP à cette personne" /* [bumex-one] no invitation link */}</button>
      </div>
    </div>
  );
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

