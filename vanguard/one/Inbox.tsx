import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { archiveNotificationAction, listNotificationsAction, markAllNotificationsAsReadAction, markNotificationAsReadAction } from '@/lib/notifications/actions';
import { getNotificationLink } from '@/lib/notifications/helpers';
import type { NotificationRecord, NotificationType } from '@/types/notification';
import { Chip } from '../ui/common';
import { when } from './Conversation';
import { useSay } from './say';
import { Select } from '../ui/Select';
import { Loading, SkList } from './skeleton';
import { localizeNotification } from '@/lib/notifications/localize';
import { useStore } from '../store';
import { PageRefresh } from './PageRefresh';
import { invalidate, useCached, useLastRead } from './cache';
import { POLICY } from './policies';

// The notifications' panel (the header's bell opens a few; "see them all" opens this): BUMEX One's Notifications page.
// A notification opens what it is about through BUMEX One's link, which lands in the right room
// (lib/erp/vanguard/retired.ts).

const TYPES: Record<NotificationType, [string, string, 'good' | 'warn' | 'crit' | 'dim']> = {
  mention: ['Mention', 'Mention', 'warn'],
  assignment: ['Assignation', 'Assignment', 'dim'],
  status_change: ['Changement', 'Status change', 'dim'],
  comment: ['Commentaire', 'Comment', 'dim'],
  deadline: ['Échéance', 'Deadline', 'warn'],
  overdue: ['En retard', 'Overdue', 'crit'],
  payment_due: ['Paiement', 'Payment', 'warn'],
  contract_due: ['Contrat', 'Contract', 'warn'],
  system: ['Système', 'System', 'dim'],
};
const NONE: NotificationRecord[] = [];

export function Inbox() {
  const say = useSay();
  const lang = useStore((st) => (st.ui.lang === 'en' ? 'en' : 'fr'));
  const router = useRouter();
  const [q, setQ] = useState('');
  const [type, setType] = useState<NotificationType | ''>('');
  const [unreadOnly, setUnreadOnly] = useState(false);

  // each search kept between visits; read again when notifications move (the bell's check, the person's own change:
  // one/policies.ts). The list shown stays while another search is read (each letter typed); unreadable, it shows empty.
  const list = useCached<NotificationRecord[]>(['inbox', 200, q, type, unreadOnly], () => listNotificationsAction(200, { search: q, type, unreadOnly }), POLICY.inbox);
  const last = useLastRead(list.data);
  const items = list.data ?? (list.error ? NONE : (last ?? null));
  // after the person's own change: this list read again, and the others that show notifications made stale (the other
  // searches, My work's and My day's mentions)
  const load = async () => {
    invalidate(['notifications']);
    await list.refresh();
  };

  const open = async (n: NotificationRecord) => {
    if (!n.is_read) {
      await markNotificationAsReadAction(n.id).catch(() => null);
      invalidate(['notifications']);
    }
    router.push(getNotificationLink(n.entity_type, n.entity_id));
  };
  const unread = items?.filter((n) => !n.is_read).length ?? 0;

  return (
    <>
      <div className="sheet-head"><h1>{say('Notifications', 'Notifications')}</h1>{unread > 0 && <Chip kind="warn">{unread} {say('non lue(s)', 'unread')}</Chip>}<PageRefresh /></div>
      <div className="sheet-body">
        <div className="actions" style={{ justifyContent: 'flex-start' }}>
          <input className="in" style={{ maxWidth: 280 }} placeholder={say('Rechercher…', 'Search…')} value={q} onChange={(e) => setQ(e.target.value)} />
          <Select className="in" style={{ width: 180 }} value={type} onChange={(e) => setType(e.target.value as NotificationType | '')}><option value="">{say('Tous les types', 'Every type')}</option>{(Object.keys(TYPES) as NotificationType[]).map((k) => <option key={k} value={k}>{say(TYPES[k][0], TYPES[k][1])}</option>)}</Select>
          <label className="small"><input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} /> {say('Non lues seulement', 'Unread only')}</label>
          {unread > 0 && <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={async () => { await markAllNotificationsAsReadAction().catch(() => null); await load(); }}>{say('Tout marquer comme lu', 'Mark all as read')}</button>}
        </div>
        <div className="card flush">
          {items === null && <Loading style={{ padding: '4px 14px' }}><SkList rows={6} /></Loading>}
          {items?.map((n) => {
            const t = TYPES[n.type] ?? TYPES.system;
            return (
              <div key={n.id} className="ib-row" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderBottom: '1px solid var(--line)', background: n.is_read ? undefined : 'var(--blue-pale)' }}>
                <span className="status-dot" style={{ marginTop: 6, background: n.is_read ? 'transparent' : 'var(--accent)' }} />
                <div className="click" style={{ flex: 1, minWidth: 0 }} onClick={() => open(n)}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><b>{localizeNotification(n, lang).title}</b><Chip kind={t[2]}>{say(t[0], t[1])}</Chip><span className="small muted mono" style={{ marginLeft: 'auto' }}>{when(n.created_at)}</span></div>
                  <div className="small muted">{localizeNotification(n, lang).body}</div>
                </div>
                <div className="toolbar">
                  {!n.is_read && <button className="btn sm ghost" onClick={async () => { await markNotificationAsReadAction(n.id).catch(() => null); await load(); }}>{say('Lu', 'Read')}</button>}
                  <button className="btn sm ghost" onClick={async () => { await archiveNotificationAction(n.id).catch(() => null); await load(); }}>{say('Archiver', 'Archive')}</button>
                </div>
              </div>
            );
          })}
          {items?.length === 0 && <div className="muted" style={{ padding: 14 }}>{say('Aucune notification.', 'No notification.')}</div>}
        </div>
      </div>
    </>
  );
}
