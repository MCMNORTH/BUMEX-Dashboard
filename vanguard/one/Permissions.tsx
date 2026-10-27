import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { erpConsolidationRoles, erpEntityModuleKeys, erpModules, erpRoleLabels, resolveErpModules } from '@/lib/erp/config';
import type { PermissionPerson, PermissionsData, PermissionsError, PersonAccess } from '@/lib/erp/permissions';
import { invitePersonAction, permissionsAction, prepareTestFloorAction, removeAccessAction, resendInvitationAction, savePermissionsAction } from '@/lib/erp/vanguard/permission-actions';
import { erpRoles, type ErpModuleKey, type ErpRole } from '@/types/erp';
import type { BumexEntityCode, ErpEntityCode } from '@/types/entity';
import { useStore } from '../store';
import { Chip, Field, Icon } from '../ui/common';
import { reload } from './Tasks';
import { useSay } from './say';

// The Settings room's Permissions tab, for the administrators who manage access (the "role modifiers"): who sees which
// entity, and which parts of each. A role gives its standard parts; each person's can be tweaked per entity (a tweaked
// cell is marked). Missions, tasks and time are everyone's, by their role and their missions. The building in 3D is
// an option, off unless given (0010); so is the test floor (the basement, 0011), a row of its own that "every entity"
// leaves out. Saved by lib/erp/permissions.ts, in the modifier's own session: the database refuses anyone else.

type Filter = 'all' | 'access' | 'none' | 'modifiers';
type Draft = PersonAccess & { homeEntity: BumexEntityCode | null };

const SHORT: Record<string, [string, string]> = {
  accounting: ['Compta', 'Acct'], clients: ['Clients', 'Sales'], suppliers: ['Fourn.', 'Supp.'], bank: ['Tréso.', 'Bank'], assets: ['Immo.', 'Assets'],
  hr: ['RH', 'HR'], tax: ['Fisc.', 'Tax'], archives: ['Arch.', 'Arch.'], reports: ['Rapp.', 'Rep.'],
};
const standard = (role: ErpRole): ErpModuleKey[] => resolveErpModules(role, null).filter((m) => m !== 'consolidation');
const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));
const cell: CSSProperties = { padding: '3px 4px', textAlign: 'center', borderBottom: '1px solid var(--line)' };

// The page's words for the server's refusals, and the roles' names.
function useWords() {
  const say = useSay();
  const lang: 'fr' | 'en' = useStore((s) => s.ui.lang) === 'fr' ? 'fr' : 'en';
  const errorText = (e: PermissionsError) => ({
    not_allowed: say("Seul un administrateur qui gère les accès peut les modifier.", 'Only an administrator who manages access can change it.'),
    own_access: say("Vous ne pouvez pas retirer votre propre accès, votre rôle d'administrateur ni la gestion des accès.", 'You cannot remove your own access, administrator role or access management.'),
    invalid: say('Choix invalide.', 'Invalid choice.'),
    no_entity: say('Choisissez au moins une entité.', 'Choose at least one entity.'),
    email: say('Adresse invalide : @bumex.mr ou @bumex.ma uniquement.', 'Invalid address: @bumex.mr or @bumex.ma only.'),
    name: say('Le nom est obligatoire.', 'The name is required.'),
    exists: say('Cette personne a déjà un compte : elle est sélectionnée.', 'This person already has an account: they are selected.'),
    signed_in: say("Cette personne s'est déjà connectée.", 'This person has already signed in.'),
    expired: say('Lien expiré.', 'Link expired.'),
    password: say('Mot de passe trop court.', 'Password too short.'),
    unavailable: say('Serveur injoignable, réessayez.', 'Server unreachable, try again.'),
  })[e];
  return { say, lang, errorText, roleName: (role: ErpRole) => erpRoleLabels[role][lang] };
}

// the real entities (the test floor is apart)
const realEntities = (data: PermissionsData) => data.entities.filter((e) => !e.isTest).map((e) => e.code as BumexEntityCode);

function draftOf(p: PermissionPerson, entities: BumexEntityCode[]): Draft {
  if (p.access) return { ...p.access, homeEntity: p.homeEntity };
  const home = p.homeEntity ?? entities[0];
  return { role: 'staff', allEntities: false, parts: { [home]: standard('staff') }, consolidation: false, managesAccess: false, view3d: false, homeEntity: p.homeEntity };
}

export function PermissionsPanel() {
  const { say, lang, roleName } = useWords();
  const loadedAt = useStore((s) => s.loadedAt);
  const [data, setData] = useState<PermissionsData | null | undefined>(undefined);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [showRoles, setShowRoles] = useState(false);

  useEffect(() => {
    let live = true;
    permissionsAction().then((d) => { if (live) setData(d); }, () => { if (live) setData(null); });
    return () => { live = false; };
  }, [loadedAt]);
  const refresh = async () => setData(await permissionsAction().catch(() => null));

  if (data === undefined) return <span className="muted">{say('Chargement…', 'Loading…')}</span>;
  if (data === null) return <div className="banner info">{say("Les accès sont gérés par les administrateurs qui modifient les rôles.", 'Access is managed by the administrators who modify roles.')}</div>;

  const floorOf = (code: ErpEntityCode | null) => data.entities.find((e) => e.code === code);
  const testCode = data.entities.find((e) => e.isTest)?.code ?? null;
  const scope = (p: PermissionPerson) => {
    if (!p.access) return p.removed ? say('Accès retiré', 'Access removed') : say('Sans accès', 'No access');
    const seen = Object.keys(p.access.parts) as ErpEntityCode[];
    const real = seen.filter((c) => !floorOf(c)?.isTest);
    const tweaked = seen.some((code) => !sameSet(p.access!.parts[code] ?? [], standard(p.access!.role)));
    return `${roleName(p.access.role)} · ${p.access.allEntities ? say('toutes entités', 'all entities') : real.map((c) => floorOf(c)?.floor ?? c).join(', ') || '—'}${tweaked ? ' · ' + say('ajusté', 'tweaked') : ''}`;
  };
  const q = query.trim().toLowerCase();
  const people = data.people.filter((p) =>
    (!q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
    && (filter === 'all' || (filter === 'access' && p.access) || (filter === 'none' && !p.access) || (filter === 'modifiers' && p.access?.managesAccess)));
  const person = data.people.find((p) => p.id === selected) ?? null;
  const counts = { all: data.people.length, access: data.people.filter((p) => p.access).length, none: data.people.filter((p) => !p.access).length, modifiers: data.people.filter((p) => p.access?.managesAccess).length };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
      <div className="card flush" style={{ flex: '1 1 250px', maxWidth: 340, minWidth: 0 }}>
        <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6, borderBottom: '1px solid var(--border)' }}>
          <div className="toolbar" style={{ flexWrap: 'nowrap' }}>
            <input className="in" style={{ height: 28 }} placeholder={say('Rechercher…', 'Search…')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={say('Rechercher', 'Search')} />
            <button className="btn sm primary" onClick={() => { setInviting(true); setSelected(null); }} title={say('Inviter une personne', 'Invite someone')}><Icon name="plus" size={13} /> {say('Inviter', 'Invite')}</button>
          </div>
          <div className="toolbar" style={{ gap: 4 }}>
            {(['all', 'access', 'none', 'modifiers'] as Filter[]).map((f) => (
              <button key={f} className={`btn sm ${filter === f ? 'primary' : 'ghost'}`} style={{ height: 22, padding: '0 7px', fontSize: 11.5 }} onClick={() => setFilter(f)}>
                {{ all: say('Tous', 'All'), access: say('Avec accès', 'With access'), none: say('Sans', 'Without'), modifiers: say('Modificateurs', 'Modifiers') }[f]} · {counts[f]}
              </button>
            ))}
          </div>
        </div>
        <div style={{ maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' }}>
          {people.map((p) => (
            <button key={p.id} onClick={() => { setSelected(p.id); setInviting(false); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', border: 'none', borderBottom: '1px solid var(--line)', cursor: 'pointer', background: p.id === selected ? 'var(--blue-pale)' : 'transparent', boxShadow: p.id === selected ? 'inset 3px 0 0 var(--accent)' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center' }}>
                <b style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</b>
                <span style={{ display: 'flex', gap: 3, flex: 'none' }}>
                  {p.access?.managesAccess && <Chip kind="good">{say('Rôles', 'Roles')}</Chip>}
                  {p.access?.view3d && <Chip kind="dim">3D</Chip>}
                  {testCode && p.access?.parts[testCode] && <Chip kind="warn">TEST</Chip>}
                  {p.neverSignedIn && <Chip kind="warn">{say('Invité', 'Invited')}</Chip>}
                  {!p.access && <Chip kind="dim">{p.removed ? say('Retiré', 'Removed') : '—'}</Chip>}
                </span>
              </div>
              <div className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{scope(p)}</div>
            </button>
          ))}
          {!people.length && <div className="small muted" style={{ padding: 12 }}>{say('Personne.', 'Nobody.')}</div>}
        </div>
      </div>

      <div style={{ flex: '3 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {inviting && <InviteForm data={data} onClose={() => setInviting(false)} onDone={async (id) => { await refresh(); setInviting(false); setSelected(id); }} />}
        {person && !inviting && <Editor key={`${person.id}:${JSON.stringify(person.access)}:${person.homeEntity}`} person={person} data={data} onSaved={refresh} />}
        {!person && !inviting && <div className="card small muted">{say("Choisissez une personne pour voir et ajuster ce qu'elle voit, ou invitez-en une.", 'Choose a person to see and adjust what they reach, or invite someone.')}</div>}
        {testCode && <TestFloorCard ready={data.testFloorReady} testers={data.people.filter((p) => p.access?.parts[testCode]).length} onDone={refresh} />}
        <div className="card" style={{ padding: '8px 12px' }}>
          <button className="btn ghost sm" style={{ padding: 0 }} onClick={() => setShowRoles(!showRoles)}>{showRoles ? '▾' : '▸'} {say('Standard de chaque rôle', "Each role's standard")}</button>
          {showRoles && (
            <table style={{ marginTop: 6, fontSize: 12 }}>
              <thead><tr><th style={{ padding: '4px 6px' }}>{say('Rôle', 'Role')}</th>{erpEntityModuleKeys.map((m) => <th key={m} style={{ ...cell, fontSize: 10.5 }} title={erpModules[m].label[lang]}>{SHORT[m][lang === 'fr' ? 0 : 1]}</th>)}<th style={{ ...cell, fontSize: 10.5 }}>{say('Groupe', 'Group')}</th></tr></thead>
              <tbody>
                {erpRoles.map((r) => (
                  <tr key={r}>
                    <td style={{ padding: '3px 6px' }}>{roleName(r)}</td>
                    {erpEntityModuleKeys.map((m) => <td key={m} style={cell}>{standard(r).includes(m) ? '●' : <span className="muted">·</span>}</td>)}
                    <td style={cell}>{resolveErpModules(r, null).includes('consolidation') ? '●' : <span className="muted">·</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {showRoles && <div className="small muted" style={{ marginTop: 6 }}>{say("Missions, tâches et temps : ouverts à tous, selon le rôle et les missions de chacun. Bâtiment 3D : désactivé par défaut, pour tous les rôles. Seuls les administrateurs « modificateurs de rôles » changent les accès.", "Missions, tasks and time: open to everyone, by their role and missions. 3D building: off by default, for every role. Only administrators who are 'role modifiers' change access.")}</div>}
        </div>
      </div>
    </div>
  );
}

function Editor({ person, data, onSaved }: { person: PermissionPerson; data: PermissionsData; onSaved: () => Promise<void> }) {
    const { say, lang, errorText, roleName } = useWords();
    const { toast } = useStore();
    const entityCodes = realEntities(data);
    const testCode = data.entities.find((e) => e.isTest)?.code ?? null;
    const initial = useMemo(() => draftOf(person, realEntities(data)), [person, data]);
    const [draft, setDraft] = useState<Draft>(initial);
    const [busy, setBusy] = useState(false);
    const self = person.id === data.me;
    // the test floor is ticked on its own, whatever "every entity" says
    const seen = (code: ErpEntityCode) => (code === testCode ? false : draft.allEntities) || Boolean(draft.parts[code]);
    const dirty = JSON.stringify(draft) !== JSON.stringify(initial) || !person.access;
    const group = erpConsolidationRoles.includes(draft.role);

    const setRole = (role: ErpRole) => setDraft((d) => ({
      ...d,
      role,
      parts: Object.fromEntries(Object.keys(d.parts).map((code) => [code, standard(role)])),
      consolidation: erpConsolidationRoles.includes(role),
      managesAccess: role === 'admin' && d.managesAccess,
    }));
    const setAll = (all: boolean) => setDraft((d) => ({ ...d, allEntities: all, parts: all ? Object.fromEntries(entityCodes.map((code) => [code, d.parts[code] ?? standard(d.role)])) : d.parts }));
    const toggleEntity = (code: ErpEntityCode) => setDraft((d) => {
      const parts = { ...d.parts };
      if (parts[code]) delete parts[code];
      else parts[code] = standard(d.role);
      return { ...d, parts };
    });
    const toggleCell = (code: ErpEntityCode, m: ErpModuleKey) => setDraft((d) => {
      const now = d.parts[code] ?? [];
      return { ...d, parts: { ...d.parts, [code]: now.includes(m) ? now.filter((x) => x !== m) : [...now, m] } };
    });
    const visible = data.entities.map((e) => e.code).filter(seen);
    const toggleColumn = (m: ErpModuleKey) => setDraft((d) => {
      const on = visible.every((code) => d.parts[code]?.includes(m));
      return { ...d, parts: { ...d.parts, ...Object.fromEntries(visible.map((code) => { const now = d.parts[code] ?? []; return [code, on ? now.filter((x) => x !== m) : [...new Set([...now, m])]]; })) } };
    });
    const toggleRow = (code: ErpEntityCode) => setDraft((d) => ({ ...d, parts: { ...d.parts, [code]: (d.parts[code]?.length ?? 0) === erpEntityModuleKeys.length ? [] : [...erpEntityModuleKeys] } }));
    const resetToRole = () => setDraft((d) => ({ ...d, parts: Object.fromEntries(Object.keys(d.parts).map((code) => [code, standard(d.role)])), consolidation: erpConsolidationRoles.includes(d.role), view3d: false }));

    const run = async (work: () => Promise<{ error?: PermissionsError }>, ok: string) => {
      setBusy(true);
      try {
        const result = await work().catch(() => ({ error: 'unavailable' as const }));
        if (result.error) { toast('error', errorText(result.error)); return; }
        toast('ok', ok);
        await onSaved();
        if (self) await reload();
      } finally {
        setBusy(false);
      }
    };
    const save = () => run(() => savePermissionsAction(person.id, draft), person.access ? say('Accès enregistrés', 'Access saved') : say(`Accès ouvert · ${person.name}`, `Access opened · ${person.name}`));
    const remove = () => {
      if (!window.confirm(say(`Retirer l'accès de ${person.name} ? Cette personne ne pourra plus ouvrir Vanguard.`, `Remove ${person.name}'s access? They will no longer open Vanguard.`))) return;
      run(() => removeAccessAction(person.id), say('Accès retiré', 'Access removed'));
    };
    const resend = async () => {
      setBusy(true);
      const result = await resendInvitationAction(person.id).catch(() => ({ error: 'unavailable' as const, mailed: undefined }));
      setBusy(false);
      if (result.error) toast('error', errorText(result.error));
      else if (!result.mailed) toast('error', say("Le lien est prêt mais l'e-mail n'est pas parti : réessayez.", 'The link is ready but the e-mail did not go out: try again.'));
      else { toast('ok', say('Invitation renvoyée', 'Invitation sent again')); await onSaved(); }
    };

    return (
      <div className="card" style={{ padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <b style={{ fontSize: 14 }}>{person.name}</b>{self && <span className="small muted"> · {say('vous', 'you')}</span>}
            <div className="small muted">{person.email}{person.jobTitle ? ` · ${person.jobTitle}` : ''}</div>
            {person.neverSignedIn && <div className="small" style={{ color: 'var(--warn)' }}>{person.invitedUntil && new Date(person.invitedUntil) > new Date() ? say(`Invitation envoyée, valable jusqu'au ${person.invitedUntil.slice(0, 10)}`, `Invitation sent, valid until ${person.invitedUntil.slice(0, 10)}`) : say("Pas encore connecté·e", 'Not signed in yet')}</div>}
          </div>
          <div className="toolbar" style={{ gap: 6 }}>
            {person.neverSignedIn && <button className="btn sm" disabled={busy} onClick={resend}>{say("Renvoyer l'invitation", 'Send invitation again')}</button>}
            {person.access && !self && <button className="btn sm danger" disabled={busy} onClick={remove}>{say("Retirer l'accès", 'Remove access')}</button>}
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10, alignItems: 'flex-end' }}>
          <Field label={say('Rôle', 'Role')} style={{ width: 190 }}>
            <select className="in" style={{ height: 28 }} value={draft.role} disabled={self} onChange={(e) => setRole(e.target.value as ErpRole)}>{erpRoles.map((r) => <option key={r} value={r}>{roleName(r)}</option>)}</select>
          </Field>
          <Field label={say('Entité de rattachement', 'Home entity')} style={{ width: 190 }}>
            <select className="in" style={{ height: 28 }} value={draft.homeEntity ?? ''} onChange={(e) => setDraft({ ...draft, homeEntity: (e.target.value || null) as BumexEntityCode | null })}>
              {!draft.homeEntity && <option value="">—</option>}
              {data.entities.filter((e) => !e.isTest).map((e) => <option key={e.code} value={e.code}>{e.name}</option>)}
            </select>
          </Field>
          <label className="small" style={{ display: 'flex', gap: 5, alignItems: 'center', height: 28, opacity: draft.role === 'admin' ? 1 : 0.45 }} title={say("Réservé aux administrateurs : change les rôles et les accès de chacun", "Administrators only: changes everyone's roles and access")}>
            <input type="checkbox" checked={draft.managesAccess} disabled={draft.role !== 'admin' || self} onChange={(e) => setDraft({ ...draft, managesAccess: e.target.checked })} />
            {say('Modificateur de rôles', 'Role modifier')}
          </label>
          <label className="small" style={{ display: 'flex', gap: 5, alignItems: 'center', height: 28, opacity: group ? 1 : 0.45 }} title={say('Vue consolidée du groupe (associés, RAF, administrateurs) : lit les comptes de toutes les entités', "The group's consolidated view (partners, finance lead, administrators): reads every entity's books")}>
            <input type="checkbox" checked={group && draft.consolidation} disabled={!group} onChange={(e) => setDraft({ ...draft, consolidation: e.target.checked })} />
            {say('Consolidation du groupe', 'Group consolidation')}
          </label>
          <label className="small" style={{ display: 'flex', gap: 5, alignItems: 'center', height: 28 }} title={say("Le bâtiment en 3D ; sans cette option, les pages à plat uniquement (par défaut). Les données sont les mêmes", 'The building in 3D; without this option, the flat pages only (the default). The data is the same')}>
            <input type="checkbox" checked={draft.view3d} onChange={(e) => setDraft({ ...draft, view3d: e.target.checked })} />
            {say('Bâtiment 3D', '3D building')}
          </label>
        </div>

        <div className="toolbar" style={{ marginTop: 10, gap: 12 }}>
          <label className="small" style={{ display: 'flex', gap: 5, alignItems: 'center' }}><input type="radio" checked={draft.allEntities} onChange={() => setAll(true)} /> {say("Toutes les entités, et les futures (hors étage de test)", 'Every entity, and future ones (not the test floor)')}</label>
          <label className="small" style={{ display: 'flex', gap: 5, alignItems: 'center' }}><input type="radio" checked={!draft.allEntities} onChange={() => setAll(false)} /> {say('Entités choisies', 'Chosen entities')}</label>
        </div>

        <div style={{ overflowX: 'auto', marginTop: 6 }}>
          <table style={{ fontSize: 12.5, minWidth: 560 }}>
            <thead>
              <tr>
                <th style={{ padding: '4px 6px' }}>{say('Entité', 'Entity')}</th>
                {erpEntityModuleKeys.map((m) => (
                  <th key={m} style={{ ...cell, fontSize: 10.5, cursor: 'pointer' }} title={`${erpModules[m].label[lang]} · ${say('cliquer : toute la colonne', 'click: the whole column')}`} onClick={() => toggleColumn(m)}>{SHORT[m][lang === 'fr' ? 0 : 1]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.entities.map((e) => {
                const on = seen(e.code);
                const parts = draft.parts[e.code] ?? [];
                return (
                  <tr key={e.code} style={{ opacity: on ? 1 : 0.5, background: e.isTest ? 'var(--warn-bg)' : undefined, borderTop: e.isTest ? '2px dashed var(--border)' : undefined }}
                    title={e.isTest ? say("Étage de test (sous-sol) : à part de « toutes les entités », désactivé par défaut. Rien n'y touche les autres étages.", "The test floor (basement): apart from 'every entity', off by default. Nothing there touches the other floors.") : undefined}>
                    <td style={{ padding: '3px 6px', whiteSpace: 'nowrap', borderBottom: '1px solid var(--line)' }}>
                      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input type="checkbox" checked={on} disabled={draft.allEntities && !e.isTest} onChange={() => toggleEntity(e.code)} aria-label={say(`Voit ${e.name}`, `Sees ${e.name}`)} />
                        <span style={{ fontWeight: 600, width: 34 }}>{e.floor}</span>
                        <span className="muted" style={{ cursor: on ? 'pointer' : 'default' }} title={on ? say('cliquer : toute la ligne', 'click: the whole row') : undefined} onClick={(ev) => { ev.preventDefault(); if (on) toggleRow(e.code); }}>{e.name}</span>
                      </label>
                    </td>
                    {erpEntityModuleKeys.map((m) => {
                      const has = parts.includes(m);
                      const tweaked = on && !e.isTest && has !== standard(draft.role).includes(m);
                      return (
                        <td key={m} style={{ ...cell, background: tweaked ? 'var(--warn-bg)' : undefined }} title={tweaked ? say('Différent du standard du rôle', "Differs from the role's standard") : undefined}>
                          <input type="checkbox" checked={on && has} disabled={!on} onChange={() => toggleCell(e.code, m)} aria-label={`${e.name} · ${erpModules[m].label[lang]}`} />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          <span className="small muted"><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--warn-bg)', border: '1px solid var(--border)', marginRight: 4, verticalAlign: -1 }} />{say('différent du standard du rôle', "differs from the role's standard")}</span>
          <div className="actions">
            <button className="btn sm" disabled={busy} onClick={resetToRole}>{say('Standard du rôle', "Role's standard")}</button>
            <button className="btn sm" disabled={busy || !dirty || !person.access} onClick={() => setDraft(initial)}>{say('Annuler', 'Cancel')}</button>
            <button className="btn sm primary" disabled={busy || !dirty} onClick={save}>{person.access ? say('Enregistrer', 'Save') : say("Ouvrir l'accès", 'Open access')}</button>
          </div>
        </div>
      </div>
    );
}

// The test floor (the basement): who has it, and its sample data, put there once.
function TestFloorCard({ ready, testers, onDone }: { ready: boolean; testers: number; onDone: () => Promise<void> }) {
    const say = useSay();
    const { toast } = useStore();
    const [busy, setBusy] = useState(false);
    const prepare = async () => {
      setBusy(true);
      const result = await prepareTestFloorAction().catch(() => ({ error: 'unavailable' as const }));
      setBusy(false);
      if (result.error && result.error !== 'ready') { toast('error', say("L'étage de test n'a pas pu être préparé, réessayez.", 'The test floor could not be prepared, try again.')); return; }
      toast('ok', say('Étage de test prêt : exemples ajoutés', 'Test floor ready: samples added'));
      await onDone();
      await reload();
    };
    return (
      <div className="card" style={{ padding: '8px 12px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: 'var(--warn-bg)' }}>
        <b style={{ fontSize: 13 }}>{say('Étage de test · sous-sol', 'Test floor · basement')}</b>
        <span className="small muted" style={{ flex: '1 1 260px' }}>
          {say(`Pour essayer l'application sans rien toucher ailleurs : invisible sans l'avoir, pas d'e-mails, temps à part. ${testers} personne(s) l'ont ; cochez sa ligne pour la donner.`,
            `To try the app without touching anything else: invisible without it, no e-mails, time kept apart. ${testers} person(s) have it; tick its row to give it.`)}
        </span>
        {ready ? <Chip kind="good">{say('Exemples en place', 'Samples in place')}</Chip>
          : <button className="btn sm primary" disabled={busy} onClick={prepare}>{busy ? say('Préparation…', 'Preparing…') : say('Remplir avec des exemples', 'Fill with samples')}</button>}
      </div>
    );
}

function InviteForm({ data, onClose, onDone }: { data: PermissionsData; onClose: () => void; onDone: (id: string) => Promise<void> }) {
    const { say, errorText, roleName } = useWords();
    const { toast } = useStore();
    const [form, setForm] = useState({ fullName: '', email: '', homeEntity: realEntities(data)[0] ?? ('' as BumexEntityCode), role: 'staff' as ErpRole });
    const [busy, setBusy] = useState(false);
    const send = async () => {
      setBusy(true);
      try {
        const result = await invitePersonAction(form).catch(() => ({ error: 'unavailable' as const, id: undefined, mailed: undefined }));
        if (result.error === 'exists' && result.id) { toast('info', errorText('exists')); await onDone(result.id); return; }
        if (result.error || !result.id) { toast('error', errorText(result.error ?? 'unavailable')); return; }
        toast(result.mailed ? 'ok' : 'error', result.mailed
          ? say(`Invitation envoyée à ${form.email}`, `Invitation sent to ${form.email}`)
          : say("Compte créé, mais l'e-mail n'est pas parti : utilisez « Renvoyer l'invitation ».", "Account created, but the e-mail did not go out: use 'Send invitation again'."));
        await onDone(result.id);
      } finally {
        setBusy(false);
      }
    };
    return (
      <div className="card" style={{ padding: 12 }}>
        <h2 style={{ marginBottom: 6 }}>{say('Inviter une personne', 'Invite someone')}</h2>
        <div className="small muted" style={{ marginBottom: 8 }}>{say("Son compte est créé avec le standard du rôle sur son entité (toutes les entités pour un administrateur, un associé ou un RAF), à ajuster ensuite. Elle reçoit un lien pour choisir son mot de passe, valable 7 jours.", "Their account gets the role's standard on their entity (every entity for an administrator, partner or finance lead), to adjust afterwards. They receive a link to choose their password, valid for 7 days.")}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
          <Field label={say('Nom complet', 'Full name')} style={{ flex: '1 1 160px' }}><input className="in" style={{ height: 28 }} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Prénom Nom" /></Field>
          <Field label="E-mail" style={{ flex: '1 1 180px' }}><input className="in" style={{ height: 28 }} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="prenom.nom@bumex.mr" /></Field>
          <Field label={say('Entité', 'Entity')} style={{ flex: '1 1 150px' }}><select className="in" style={{ height: 28 }} value={form.homeEntity} onChange={(e) => setForm({ ...form, homeEntity: e.target.value as BumexEntityCode })}>{data.entities.filter((e) => !e.isTest).map((e) => <option key={e.code} value={e.code}>{e.name}</option>)}</select></Field>
          <Field label={say('Rôle', 'Role')} style={{ flex: '1 1 150px' }}><select className="in" style={{ height: 28 }} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as ErpRole })}>{erpRoles.map((r) => <option key={r} value={r}>{roleName(r)}</option>)}</select></Field>
          <div className="actions">
            <button className="btn sm" disabled={busy} onClick={onClose}>{say('Annuler', 'Cancel')}</button>
            <button className="btn sm primary" disabled={busy || !form.fullName.trim() || !form.email.trim()} onClick={send}>{busy ? say('Envoi…', 'Sending…') : say('Inviter', 'Invite')}</button>
          </div>
        </div>
      </div>
    );
}
