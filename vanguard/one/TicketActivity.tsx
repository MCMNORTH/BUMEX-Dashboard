import { useMemo, useRef, useState, type ReactNode } from 'react';
import { createCommentAction, deleteCommentAction, updateCommentAction } from '@/app/(app)/comments/actions';
import type { TicketView } from '@/lib/erp/vanguard/ticket-actions';
import { findStage } from '@/lib/tickets/workflow';
import { useStore } from '../store';
import { Icon } from '../ui/common';
import type { Run, Say } from './Conversation';
import { ago, describeHistory, type HistoryValue } from './ticket-history';
import { Avatar, Lozenge, hoursText, stageTone } from './work-ui';

// [bumex-one] A ticket's activity as Jira shows it (vanguard/one/Ticket.tsx): all of it, the comments, the history,
// the work log; newest or oldest first. Comments mention people with @Full Name (BUMEX One's format: they are
// notified); typing @ suggests them.

type Tab = 'all' | 'comments' | 'history' | 'worklog';
type Entry = { id: string; at: string; who: string; kind: 'comment' | 'history' | 'worklog'; node: ReactNode };

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, value] of Object.entries(fields)) data.set(k, value);
  return data;
};

// a comment's text with its mentions and addresses marked
function Body({ text, names }: { text: string; names: string[] }) {
  const parts = useMemo(() => {
    const escaped = names.filter(Boolean).sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`(${escaped.length ? `@(?:${escaped.join('|')})|` : ''}https?:\\/\\/[^\\s)]+)`, 'g');
    return text.split(pattern);
  }, [text, names]);
  return (
    <div className="tk-cbody">
      {parts.map((p, i) => (i % 2 === 1
        ? p.startsWith('@') ? <span key={i} className="mention">{p}</span> : <a key={i} href={p} target="_blank" rel="noreferrer">{p}</a>
        : <span key={i}>{p}</span>))}
    </div>
  );
}

function Composer({ view, busy, run, say }: { view: TicketView; busy: boolean; run: Run; say: Say }) {
  const me = useStore((s) => s.state.session.actorName);
  const [body, setBody] = useState('');
  const [open, setOpen] = useState(false);
  const [internal, setInternal] = useState(true);
  const [mention, setMention] = useState<{ query: string; at: number } | null>(null);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  const matches = mention ? view.people.filter((p) => p.name.toLocaleLowerCase('fr').includes(mention.query.toLocaleLowerCase('fr'))).slice(0, 6) : [];
  const track = (value: string, caret: number) => {
    const before = value.slice(0, caret);
    const m = /(^|\s)@([^\s@]{0,20}(?: [^\s@]{0,20})?)$/u.exec(before);
    setMention(m ? { query: m[2], at: caret - m[2].length - 1 } : null);
    setActive(0);
  };
  const pick = (name: string) => {
    if (!mention) return;
    const caret = ref.current?.selectionStart ?? body.length;
    const next = `${body.slice(0, mention.at)}@${name} ${body.slice(caret)}`;
    setBody(next);
    setMention(null);
    requestAnimationFrame(() => { const at = mention.at + name.length + 2; ref.current?.focus(); ref.current?.setSelectionRange(at, at); });
  };
  const send = async () => {
    const ok = await run(() => createCommentAction({}, form({ body, entity_type: 'ticket', entity_id: view.ticket.id, return_path: '', is_internal: internal ? 'on' : '' })), say('Commentaire ajouté', 'Comment added'));
    if (ok) { setBody(''); setOpen(false); }
  };
  if (!view.canComment) return <span className="small muted">{say('Les commentaires ne sont pas ouverts à votre rôle.', 'Comments are not open to your role.')}</span>;
  return (
    <div className="tk-composer">
      <Avatar name={me} size={30} />
      <div className="grow">
        {!open ? (
          <button className="tk-empty" onClick={() => { setOpen(true); requestAnimationFrame(() => ref.current?.focus()); }}>{say('Ajouter un commentaire…', 'Add a comment…')}</button>
        ) : (
          <div className="tk-compose">
            <div style={{ position: 'relative' }}>
              <textarea ref={ref} className="in" rows={4} value={body} placeholder={say('Une mise à jour, un blocage, une passation… @ pour mentionner', 'An update, a blocker, a handoff… @ to mention')}
                onChange={(e) => { setBody(e.target.value); track(e.target.value, e.target.selectionStart ?? e.target.value.length); }}
                onKeyDown={(e) => {
                  if (mention && matches.length) {
                    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((active + 1) % matches.length); return; }
                    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((active - 1 + matches.length) % matches.length); return; }
                    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(matches[active].name); return; }
                  }
                  if (e.key === 'Escape') { e.stopPropagation(); if (mention) setMention(null); else if (!body.trim()) setOpen(false); }
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && body.trim()) void send();
                }} />
              {mention && matches.length > 0 && (
                <div className="tk-mentions" role="listbox">
                  {matches.map((p, i) => <button key={p.id} role="option" aria-selected={i === active} className={i === active ? 'on' : ''} onMouseDown={(e) => { e.preventDefault(); pick(p.name); }}><Avatar name={p.name} size={20} /> {p.name}</button>)}
                </div>
              )}
            </div>
            <div className="tk-compose-bar">
              {view.role !== 'shareholder' && <label className="small"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> {say('interne', 'internal')}</label>}
              <span className="grow" />
              <button className="btn sm" onClick={() => { setBody(''); setOpen(false); }}>{say('Annuler', 'Cancel')}</button>
              <button className="btn sm primary" disabled={busy || !body.trim()} onClick={send}>{say('Enregistrer', 'Save')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function TicketActivity({ view, busy, run, say }: { view: TicketView; busy: boolean; run: Run; say: Say }) {
  const { state } = useStore();
  const [tab, setTab] = useState<Tab>('all');
  const [newest, setNewest] = useState(true);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [now] = useState(Date.now);
  const names = view.people.map((p) => p.name);
  const person = (id: string) => view.people.find((p) => p.id === id)?.name ?? null;
  const mission = (id: string) => state.engagements.find((e) => e.id === id || (e as { projectId?: string }).projectId === id)?.name ?? null;
  const toneOf = (name: string) => stageTone(view.workflow.stages.find((s) => s.name === name) ?? findStage(view.workflow, name));
  const ctx = { say, person, mission, stageTone: toneOf };
  const value = (v: HistoryValue | null | undefined) => (v ? (v.tone && v.tone !== 'plain' ? <Lozenge tone={v.tone}>{v.text}</Lozenge> : <span className="tk-hval">{v.text}</span>) : null);

  const entries = useMemo(() => {
    const list: Entry[] = [];
    for (const c of view.comments) {
      const mine = view.role === 'admin' || c.author_id === view.me;
      list.push({
        id: `c${c.id}`, at: c.created_at, who: c.author?.full_name ?? '—', kind: 'comment',
        node: editing?.id === c.id ? (
          <div className="tk-compose">
            <textarea className="in" rows={3} value={editing.body} onChange={(e) => setEditing({ id: c.id, body: e.target.value })} autoFocus onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setEditing(null); } }} />
            <div className="tk-compose-bar"><span className="grow" />
              <button className="btn sm" onClick={() => setEditing(null)}>{say('Annuler', 'Cancel')}</button>
              <button className="btn sm primary" disabled={busy || !editing.body.trim()} onClick={async () => { if (await run(() => updateCommentAction({}, form({ body: editing.body, comment_id: c.id, return_path: '' })))) setEditing(null); }}>{say('Enregistrer', 'Save')}</button>
            </div>
          </div>
        ) : (
          <>
            <Body text={c.body} names={names} />
            {c.updated_at && c.updated_at.slice(0, 19) !== c.created_at.slice(0, 19) && <span className="small muted">{say('(modifié)', '(edited)')}</span>}
            {mine && (
              <div className="tk-cacts">
                <button className="linkish small" onClick={() => setEditing({ id: c.id, body: c.body })}>{say('Modifier', 'Edit')}</button>
                <button className="linkish small" disabled={busy} onClick={() => { if (window.confirm(say('Supprimer ce commentaire ?', 'Delete this comment?'))) void run(() => deleteCommentAction(form({ comment_id: c.id, return_path: '' })), say('Commentaire supprimé', 'Comment deleted')); }}>{say('Supprimer', 'Delete')}</button>
              </div>
            )}
          </>
        ),
      });
      if (c.is_internal) list[list.length - 1].who += '\u0000internal';
      list[list.length - 1].who += `\u0001${say('a ajouté un commentaire', 'added a comment')}`;
    }
    for (const h of view.history) {
      const line = describeHistory(h.action, h.metadata, ctx);
      list.push({
        id: `h${h.id}`, at: h.at, who: h.who || say('Système', 'System'), kind: 'history',
        node: (line.from || line.to) ? (
          <div className="tk-change">{value(line.from)}{line.from && line.to && <span aria-hidden="true">→</span>}{value(line.to)}{line.note && <span className="small muted"> · {line.note}</span>}</div>
        ) : line.note ? <div className="small muted">{line.note}</div> : null,
      });
      list[list.length - 1].who += `\u0001${line.verb}`;
    }
    for (const w of view.worklog) {
      list.push({
        id: `w${w.id}`, at: w.at, who: w.who, kind: 'worklog',
        node: <div className="tk-change"><span className="tk-hval">{hoursText(w.minutes / 60, say)}</span><span className="small muted">{say('le', 'on')} {w.date.split('-').reverse().join('/')}</span>{w.note && <span className="small"> · {w.note}</span>}</div>,
      });
      list[list.length - 1].who += `\u0001${say('a enregistré du temps', 'logged time')}`;
    }
    return list;
    // ctx is rebuilt each render from the same view
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, editing, busy, say]);

  const shown = entries
    .filter((e) => tab === 'all' || (tab === 'comments' && e.kind === 'comment') || (tab === 'history' && e.kind === 'history') || (tab === 'worklog' && e.kind === 'worklog'))
    .sort((a, b) => (newest ? (a.at < b.at ? 1 : -1) : a.at < b.at ? -1 : 1));
  const tabs: [Tab, string, number][] = [
    ['all', say('Tout', 'All'), entries.length],
    ['comments', say('Commentaires', 'Comments'), view.comments.length],
    ['history', say('Historique', 'History'), view.history.length],
    ['worklog', say('Journal du travail', 'Work log'), view.worklog.length],
  ];
  const kindTag: Record<Entry['kind'], string> = { comment: say('Commentaire', 'Comment'), history: say('Historique', 'History'), worklog: say('Journal du travail', 'Work log') };
  return (
    <section className="tk-sec">
      <div className="tk-sec-h"><h2 style={{ margin: 0 }}>{say('Activité', 'Activity')}</h2></div>
      <div className="tk-acttabs">
        <div className="seg-mini" role="tablist">
          {tabs.map(([id, label, n]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}{n > 0 && id !== 'all' ? ` · ${n}` : ''}</button>)}
        </div>
        <button className="btn sm ghost" onClick={() => setNewest(!newest)} title={newest ? say('Plus récents en premier', 'Newest first') : say('Plus anciens en premier', 'Oldest first')}><Icon name={newest ? 'chevronDown' : 'chevronUp'} size={13} /> {newest ? say('Plus récents', 'Newest') : say('Plus anciens', 'Oldest')}</button>
      </div>
      {view.role === 'shareholder' && tab !== 'comments' && <span className="small muted">{say("L'historique détaillé est masqué en mode synthèse.", 'The detailed history is hidden in summary mode.')}</span>}
      {(tab === 'all' || tab === 'comments') && <Composer view={view} busy={busy} run={run} say={say} />}
      <div className="tk-feed">
        {shown.map((e) => {
          const [nameAndFlag, verb] = e.who.split('\u0001');
          const [name, flag] = nameAndFlag.split('\u0000');
          return (
            <div key={e.id} className={`tk-entry ${e.kind}`}>
              <Avatar name={name} size={30} />
              <div className="grow">
                <div className="tk-entry-h">
                  <b>{name}</b> {verb ? <span>{verb}</span> : null}
                  {flag === 'internal' && <span className="tag dim">{say('interne', 'internal')}</span>}
                  <span className="small muted" title={new Date(e.at).toLocaleString(say('fr-FR', 'en-GB'))}>{ago(e.at, now, say)}</span>
                </div>
                {tab === 'all' && <span className="tag dim tk-kind">{kindTag[e.kind]}</span>}
                {e.node}
              </div>
            </div>
          );
        })}
        {!shown.length && <span className="small muted">{tab === 'worklog' ? say('Aucun temps enregistré sur ce ticket.', 'No time logged on this ticket.') : tab === 'comments' ? say('Aucun commentaire.', 'No comment.') : say('Rien pour le moment.', 'Nothing yet.')}</span>}
      </div>
    </section>
  );
}
