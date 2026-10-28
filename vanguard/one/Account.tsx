import { useEffect, useState } from 'react';
import { updateProfileSettingsAction } from '@/app/(app)/settings/profile/actions';
import { updateEmailNotificationsAction } from '@/app/(app)/settings/preferences/actions';
import { updatePasswordAction } from '@/lib/auth/actions';
import { canSee } from '@bumex/domain';
import { myAccountAction, setDefaultEntityAction, type MyAccount } from '@/lib/erp/vanguard/account-actions';
import { useStore } from '../store';
import { Field } from '../ui/common';
import { reload } from './Tasks';
import { useSay } from './say';
import { Select } from '../ui/Select';

// The Settings room's "Mon compte" tab: BUMEX One's profile, preferences and security pages, saved by BUMEX One's
// actions. Everyone's access is the Permissions tab's (Permissions.tsx).

export function MyAccountPanel() {
  const say = useSay();
  const { toast, ui, setLang } = useStore();
  const [me, setMe] = useState<MyAccount | null>(null);
  const [profile, setProfile] = useState({ full_name: '', phone: '', job_title: '' });
  const [avatar, setAvatar] = useState<File | null>(null);
  const [password, setPassword] = useState({ next: '', confirm: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    myAccountAction().then((m) => { if (live) { setMe(m); setProfile({ full_name: m.fullName, phone: m.phone, job_title: m.jobTitle }); } }).catch(() => null);
    return () => { live = false; };
  }, []);

  if (!me) return <span className="muted">{say('Chargement…', 'Loading…')}</span>;
  const saveProfile = async () => {
    const form = new FormData();
    for (const [k, v] of Object.entries(profile)) form.set(k, v);
    if (avatar) form.set('avatar_file', avatar);
    setBusy(true);
    try {
      const result = await updateProfileSettingsAction({}, form);
      if (result.error) { toast('error', result.error); return; }
      toast('ok', say('Profil enregistré', 'Profile saved'));
      setAvatar(null);
      setMe(await myAccountAction());
      await reload();
    } finally {
      setBusy(false);
    }
  };
  const toggleEmails = async () => {
    const result = await updateEmailNotificationsAction(!me.emailNotifications).catch(() => ({ error: say('Serveur injoignable.', 'Server unreachable.') }));
    if (result.error) toast('error', result.error);
    else setMe({ ...me, emailNotifications: !me.emailNotifications });
  };
  const changePassword = async () => {
    if (password.next !== password.confirm) { toast('error', say('Les deux mots de passe diffèrent.', 'The two passwords differ.')); return; }
    setBusy(true);
    try {
      const result = await updatePasswordAction(password.next);
      if (result.error) toast('error', result.error);
      else { toast('ok', say('Mot de passe mis à jour', 'Password updated')); setPassword({ next: '', confirm: '' }); }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cols">
      <div className="grow">
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 style={{ margin: 0 }}>{say('Profil', 'Profile')}</h2>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            {me.avatarUrl
              ? <span role="img" aria-label={me.fullName} style={{ width: 56, height: 56, borderRadius: '50%', background: `center / cover url("${me.avatarUrl}")` }} />
              : <span style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--blue-pale)', display: 'grid', placeItems: 'center', fontWeight: 600 }}>{me.fullName.split(/\s+/).map((w) => w[0]).slice(0, 2).join('')}</span>}
            <Field label={say('Photo (PNG, JPG ou WebP, 512 Ko au plus)', 'Photo (PNG, JPG or WebP, 512 KB at most)')}><input className="in" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setAvatar(e.target.files?.[0] ?? null)} /></Field>
          </div>
          <div className="grid3">
            <Field label={say('Nom complet', 'Full name')}><input className="in" value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} /></Field>
            <Field label={say('Téléphone', 'Phone')}><input className="in" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></Field>
            <Field label={say('Fonction', 'Job title')}><input className="in" value={profile.job_title} onChange={(e) => setProfile({ ...profile, job_title: e.target.value })} /></Field>
          </div>
          <div className="kv">
            <span className="k">E-mail</span><span>{me.email}</span>
            <span className="k">{say('Rôle', 'Role')}</span><span>{say("celui de Vanguard, fixé par l'administrateur", "Vanguard's, set by the administrator")}</span>
          </div>
          <div className="actions"><button className="btn sm primary" disabled={busy || profile.full_name.trim().length < 3} onClick={saveProfile}>{say('Enregistrer le profil', 'Save the profile')}</button></div>
        </div>
      </div>
      <div className="side">
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 style={{ margin: 0 }}>{say('Préférences', 'Preferences')}</h2>
          <Field label={say('Langue', 'Language')}>
            <div className="seg">
              <button className={`btn sm ${ui.lang === 'fr' ? 'on' : ''}`} onClick={() => setLang('fr')}>Français</button>
              <button className={`btn sm ${ui.lang === 'en' ? 'on' : ''}`} onClick={() => setLang('en')}>English</button>
            </div>
          </Field>
          <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={me.emailNotifications} onChange={toggleEmails} /> {say('Recevoir les notifications par e-mail', 'Receive the notifications by e-mail')}</label>
          <DefaultEntity />
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 style={{ margin: 0 }}>{say('Sécurité', 'Security')}</h2>
          <Field label={say('Nouveau mot de passe (8 caractères au moins)', 'New password (at least 8 characters)')}><input className="in" type="password" autoComplete="new-password" value={password.next} onChange={(e) => setPassword({ ...password, next: e.target.value })} /></Field>
          <Field label={say('Confirmer', 'Confirm')}><input className="in" type="password" autoComplete="new-password" value={password.confirm} onChange={(e) => setPassword({ ...password, confirm: e.target.value })} /></Field>
          <div className="actions"><button className="btn sm primary" disabled={busy || password.next.length < 8} onClick={changePassword}>{say('Changer le mot de passe', 'Change the password')}</button></div>
        </div>
      </div>
    </div>
  );
}

// the floor the app opens on and the logo leads back to (0015); their home entity until they choose
function DefaultEntity() {
  const { state, toast } = useStore();
  const say = useSay();
  const [busy, setBusy] = useState(false);
  const floors = state.entities.filter((e) => !e.isTest && canSee(state, e.id));
  if (floors.length < 2) return null;
  const pick = async (id: string) => {
    setBusy(true);
    const result = await setDefaultEntityAction(id).catch(() => ({ error: say('Serveur injoignable.', 'Server unreachable.') }));
    setBusy(false);
    if (result.error) { toast('error', result.error); return; }
    toast('ok', say("Entité par défaut enregistrée : l'application s'ouvrira dessus.", 'Default entity saved: the app will open on it.'));
    await reload();
  };
  return (
    <Field label={say('Entité par défaut', 'Default entity')}>
      <Select className="in" value={state.session.defaultEntityId ?? ''} disabled={busy} onChange={(e) => void pick(e.target.value)} aria-label={say('Entité par défaut', 'Default entity')}>
        {!state.session.defaultEntityId && <option value="">—</option>}
        {floors.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
      </Select>
      <span className="small muted">{say("L'application s'ouvre sur elle, et le logo y ramène.", 'The app opens on it, and the logo leads back to it.')}</span>
    </Field>
  );
}
