import { useEffect, useState } from 'react';
import { disconnectMailAction, mailIntakeAction, setMailPausedAction, ticketFromMailAction, type MailIntakeView } from '@/lib/erp/vanguard/mail-actions';
import { useStore } from '../store';
import { Chip } from '../ui/common';
import { ago, type Say } from './ticket-history';
import { useSay } from './say';

// Settings, My account: "E-mails → tickets" (lib/mail, 0017). The person connects their Outlook inbox; Claude reads
// each new e-mail and makes the tasks tickets assigned to them, with their files, the replies comments. The card says
// what became of each e-mail of the last 30 days, and makes a ticket of a skipped one on request.

type Row = MailIntakeView['messages'][number];

// why an e-mail was left out (lib/mail/rules.ts SkipReason; "not_a_task: <Claude's sentence>")
function reasonLabel(reason: string | null, say: Say) {
  const code = (reason ?? '').split(':')[0];
  const labels: Record<string, [string, string]> = {
    not_a_task: ['pas une tâche', 'not a task'],
    automatic: ['automatique', 'automatic'],
    newsletter: ['lettre d’information', 'newsletter'],
    calendar: ['invitation', 'invitation'],
    bounce: ['non distribué', 'bounce'],
    vanguard: ['e-mail de Vanguard', 'Vanguard e-mail'],
    empty: ['vide', 'empty'],
    not_direct: ['reçu par un groupe', 'sent to a group'],
    sender_limit: ['trop d’e-mails de cet expéditeur', 'too many from this sender'],
    ai_declined: ['non lu par Claude', 'declined by Claude'],
    no_floor: ['aucune entité', 'no entity'],
    deleted: ['supprimé', 'deleted'],
  };
  const label = labels[code];
  return label ? say(...label) : code || say('ignoré', 'skipped');
}

export function MailIntakeCard() {
  const say = useSay();
  const { toast, openRoom } = useStore();
  const [view, setView] = useState<MailIntakeView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [now] = useState(Date.now);

  const refresh = () => mailIntakeAction().then(setView).catch(() => null);
  useEffect(() => {
    let live = true;
    mailIntakeAction().then((v) => { if (live) setView(v); }).catch(() => null);
    return () => { live = false; };
  }, []);

  if (!view?.enabled) return null;
  const c = view.connection;

  const act = async (key: string, run: () => Promise<{ error?: string }>, done?: string) => {
    setBusy(key);
    try {
      const result = await run().catch(() => ({ error: say('Serveur injoignable.', 'Server unreachable.') }));
      if (result.error) toast('error', result.error);
      else if (done) toast('ok', done);
      await refresh();
    } finally {
      setBusy(null);
    }
  };
  const makeTicket = (row: Row) => act(row.id, async () => {
    const result = await ticketFromMailAction(row.id);
    if (!result.error) toast('ok', result.ticketKey ? say(`Ticket ${result.ticketKey} créé`, `Ticket ${result.ticketKey} created`) : say('Ticket créé', 'Ticket created'));
    return { error: result.error };
  });

  const status = c?.status === 'active'
    ? <Chip kind="good">{say('active', 'active')}</Chip>
    : c?.status === 'paused'
      ? <Chip kind="dim">{say('en pause', 'paused')}</Chip>
      : <Chip kind="crit">{say('à reconnecter', 'to reconnect')}</Chip>;
  const rows = all ? view.messages : view.messages.slice(0, 12);

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 style={{ margin: 0 }}>{say('E-mails → tickets', 'E-mails → tickets')}</h2>
      {!c ? (
        <>
          <p className="small" style={{ margin: 0 }}>
            {say(
              'Connectez votre boîte Outlook : chaque nouvel e-mail qui demande un travail (d’un client ou d’un collègue) devient un ticket qui vous est assigné, avec ses pièces jointes ; les réponses dans le même fil s’ajoutent en commentaires.',
              'Connect your Outlook inbox: every new e-mail that asks for work (from a client or a colleague) becomes a ticket assigned to you, with its attachments; replies in the same thread are added as comments.',
            )}
          </p>
          <p className="small muted" style={{ margin: 0 }}>
            {say(
              'Vanguard lit votre boîte de réception sans rien envoyer, déplacer ni supprimer, et seulement les e-mails reçus après la connexion. Le texte des e-mails qui ne sont ni automatiques ni des lettres d’information est lu par Claude (Anthropic) pour décider s’il s’agit d’une tâche. Vous pouvez mettre en pause ou déconnecter à tout moment.',
              'Vanguard reads your inbox without sending, moving or deleting anything, and only e-mails received after you connect. The text of e-mails that are not automatic or newsletters is read by Claude (Anthropic) to decide whether it is a task. You can pause or disconnect at any time.',
            )}
          </p>
          <div className="actions"><a className="btn sm primary" href="/api/mail/microsoft/connect">{say('Connecter Outlook', 'Connect Outlook')}</a></div>
        </>
      ) : (
        <>
          <div className="kv">
            <span className="k">{say('Boîte', 'Inbox')}</span><span>{c.ms_email}</span>
            <span className="k">{say('État', 'Status')}</span><span>{status}</span>
            <span className="k">{say('Dernière lecture', 'Last checked')}</span><span>{c.last_sync_at ? ago(c.last_sync_at, now, say) : say('pas encore', 'not yet')}</span>
          </div>
          {c.status === 'reconnect' && (
            <p className="small" style={{ margin: 0, color: 'var(--crit)' }}>
              {say('Microsoft ne laisse plus Vanguard lire votre boîte (mot de passe changé, accès retiré…). Reconnectez-la.', 'Microsoft no longer lets Vanguard read your inbox (password changed, access removed…). Reconnect it.')}
            </p>
          )}
          <div className="actions">
            {c.status === 'reconnect'
              ? <a className="btn sm primary" href="/api/mail/microsoft/connect">{say('Reconnecter Outlook', 'Reconnect Outlook')}</a>
              : <button className="btn sm" disabled={busy !== null} onClick={() => act('pause', () => setMailPausedAction(c.status === 'active'), c.status === 'active' ? say('Mis en pause', 'Paused') : say('Reprise : les e-mails reçus à partir de maintenant', 'Resumed: e-mails received from now on'))}>
                  {c.status === 'active' ? say('Mettre en pause', 'Pause') : say('Reprendre', 'Resume')}
                </button>}
            <button className="btn sm" disabled={busy !== null} onClick={() => act('disconnect', disconnectMailAction, say('Outlook déconnecté', 'Outlook disconnected'))}>{say('Déconnecter', 'Disconnect')}</button>
          </div>

          {view.messages.length === 0
            ? <span className="small muted">{say('Aucun e-mail lu ces 30 derniers jours.', 'No e-mail read in the last 30 days.')}</span>
            : (
              <div className="card flush"><table>
                <thead><tr><th>{say('Reçu', 'Received')}</th><th>{say('E-mail', 'E-mail')}</th><th>{say('Résultat', 'Outcome')}</th></tr></thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="small" style={{ whiteSpace: 'nowrap' }}>{row.received_at ? ago(row.received_at, now, say) : ''}</td>
                      <td><b>{row.subject || say('(sans objet)', '(no subject)')}</b><div className="small muted">{row.from_name || row.from_address}</div></td>
                      <td className="small">
                        {(row.status === 'ticket' || row.status === 'comment') && row.ticket_id
                          ? <button className="btn sm ghost" onClick={() => openRoom('tasks', `ticket:${row.ticket_id}`)}>{row.status === 'ticket' ? say('Ticket', 'Ticket') : say('Commentaire sur', 'Comment on')} {row.ticket_key}</button>
                          : row.status === 'skipped' || row.status === 'failed'
                            ? (
                              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                <span title={row.reason?.includes(':') ? row.reason.slice(row.reason.indexOf(':') + 1).trim() : undefined}>
                                  {row.status === 'failed' ? <Chip kind="crit">{say('échec', 'failed')}</Chip> : <Chip kind="dim">{reasonLabel(row.reason, say)}</Chip>}
                                </span>
                                <button className="btn sm" disabled={busy !== null} onClick={() => makeTicket(row)}>{busy === row.id ? say('Création…', 'Creating…') : say('Créer le ticket', 'Create the ticket')}</button>
                              </span>
                            )
                            : <Chip kind="dim">{say('en cours', 'in progress')}</Chip>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          {view.messages.length > 12 && <button className="btn sm ghost" onClick={() => setAll(!all)}>{all ? say('Moins', 'Fewer') : say(`Tout voir (${view.messages.length})`, `See all (${view.messages.length})`)}</button>}
        </>
      )}
    </div>
  );
}
