import { useState } from 'react';
import { createCommentAction, deleteCommentAction, updateCommentAction } from '@/app/(app)/comments/actions';
import { archiveNoteAction, createNoteAction, togglePinnedNoteAction, updateNoteAction } from '@/app/(app)/notes/actions';
import type { AppRole } from '@/types/auth';
import type { CommentEntityType, CommentRecord } from '@/types/comment';
import { canCreateNoteByRole, getAllowedNoteVisibilities, type InternalNoteEntityType, type InternalNoteRecord, type NoteVisibility } from '@/types/note';
import { Chip, Field } from '../ui/common';

// The conversation that travels with a ticket, a mission, a client or a contract, as BUMEX One had it: comments
// (mentions with @Full Name, which BUMEX One notifies; internal ones hidden from shareholders) and internal notes
// (pinned, with a visibility). Saved by BUMEX One's comment and note actions.

export type Say = (fr: string, en: string) => string;
export type Result = { error?: string };
export type Run = (work: () => Promise<Result | void>, done?: string) => Promise<boolean>;

export const when = (iso: string) => iso.slice(0, 16).replace('T', ' ');

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, value] of Object.entries(fields)) data.set(k, value);
  return data;
};

export function Comments({ entityType, entityId, comments, people, role, me, canComment, busy, run, say }: {
  entityType: CommentEntityType;
  entityId: string;
  comments: CommentRecord[];
  people: { id: string; name: string }[];
  role: AppRole;
  me: string;
  canComment: boolean;
  busy: boolean;
  run: Run;
  say: Say;
}) {
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(true);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const send = async () => {
    const ok = await run(() => createCommentAction({}, form({ body, entity_type: entityType, entity_id: entityId, return_path: '', is_internal: internal ? 'on' : '' })), say('Commentaire ajouté', 'Comment added'));
    if (ok) setBody('');
  };
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h2 style={{ margin: 0 }}>{say('Commentaires', 'Comments')} <span className="small muted">{comments.length}</span></h2>
      {canComment ? (
        <>
          <textarea className="in" style={{ height: 70, padding: 8 }} value={body} onChange={(e) => setBody(e.target.value)} placeholder={say('Une mise à jour, un blocage, une passation… @Nom pour mentionner', 'An update, a blocker, a handoff… @Name to mention')} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="in" style={{ width: 170 }} value="" onChange={(e) => { const name = e.target.value; if (name) setBody((b) => `${b}${b && !b.endsWith(' ') ? ' ' : ''}@${name} `); }} aria-label={say('Mentionner', 'Mention')}>
              <option value="">{say('Mentionner…', 'Mention…')}</option>{people.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
            {role !== 'shareholder' && <label className="small"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> {say('interne', 'internal')}</label>}
            <button className="btn sm primary" style={{ marginLeft: 'auto' }} disabled={busy || !body.trim()} onClick={send}>{say('Publier', 'Post')}</button>
          </div>
        </>
      ) : <span className="small muted">{say('Les commentaires ne sont pas ouverts à votre rôle.', 'Comments are not open to your role.')}</span>}
      {comments.map((c) => {
        const mine = role === 'admin' || c.author_id === me;
        return (
          <div key={c.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 7 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }} className="small">
              <span><b>{c.author?.full_name ?? '—'}</b>{c.is_internal && <> <Chip kind="dim">{say('interne', 'internal')}</Chip></>}</span>
              <span className="muted mono">{when(c.created_at)}</span>
            </div>
            {editing?.id === c.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                <textarea className="in" style={{ height: 60, padding: 8 }} value={editing.body} onChange={(e) => setEditing({ id: c.id, body: e.target.value })} />
                <div className="actions">
                  <button className="btn sm" onClick={() => setEditing(null)}>{say('Annuler', 'Cancel')}</button>
                  <button className="btn sm primary" disabled={busy || !editing.body.trim()} onClick={async () => { if (await run(() => updateCommentAction({}, form({ body: editing.body, comment_id: c.id, return_path: '' })))) setEditing(null); }}>{say('Enregistrer', 'Save')}</button>
                </div>
              </div>
            ) : (
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, marginTop: 3 }}>{c.body}</div>
            )}
            {c.attachments.length > 0 && <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>{c.attachments.map((a) => a.file_url ? <a key={a.id} className="chip dim" href={a.file_url} target="_blank" rel="noreferrer">{a.file_name ?? say('Pièce jointe', 'Attachment')}</a> : <Chip key={a.id} kind="dim">{a.file_name ?? say('Pièce jointe', 'Attachment')}</Chip>)}</div>}
            {mine && editing?.id !== c.id && (
              <div className="actions" style={{ justifyContent: 'flex-start', marginTop: 3 }}>
                <button className="btn sm ghost" onClick={() => setEditing({ id: c.id, body: c.body })}>{say('Modifier', 'Edit')}</button>
                <button className="btn sm ghost" disabled={busy} onClick={() => { if (window.confirm(say('Supprimer ce commentaire ?', 'Delete this comment?'))) void run(() => deleteCommentAction(form({ comment_id: c.id, return_path: '' })), say('Commentaire supprimé', 'Comment deleted')); }}>{say('Supprimer', 'Delete')}</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const VISIBILITY: Record<NoteVisibility, [string, string]> = {
  private: ['Privée', 'Private'],
  team: ['Équipe', 'Team'],
  management: ['Direction', 'Management'],
  shareholders: ['Actionnaires', 'Shareholders'],
};

export function Notes({ entityType, entityId, notes, role, me, busy, run, say }: {
  entityType: InternalNoteEntityType;
  entityId: string;
  notes: InternalNoteRecord[];
  role: AppRole;
  me: string;
  busy: boolean;
  run: Run;
  say: Say;
}) {
  const allowed = getAllowedNoteVisibilities(role);
  const blank = { id: '', title: '', body: '', visibility: allowed[0] ?? 'private', pinned: false };
  const [draft, setDraft] = useState<typeof blank | null>(null);
  const [filter, setFilter] = useState<'all' | NoteVisibility>('all');
  const shown = [...notes].filter((n) => !n.archived_at && (filter === 'all' || n.visibility === filter)).sort((a, b) => Number(b.pinned) - Number(a.pinned) || (a.updated_at < b.updated_at ? 1 : -1));
  const save = async () => {
    if (!draft) return;
    const fields = { title: draft.title, body: draft.body, visibility: draft.visibility, pinned: draft.pinned ? 'on' : '', entity_type: entityType, entity_id: entityId, return_path: '' };
    const ok = await run(() => (draft.id ? updateNoteAction({}, form({ ...fields, note_id: draft.id })) : createNoteAction({}, form(fields))), draft.id ? say('Note mise à jour', 'Note updated') : say('Note ajoutée', 'Note added'));
    if (ok) setDraft(null);
  };
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>{say('Notes internes', 'Internal notes')} <span className="small muted">{shown.length}</span></h2>
        <select className="in" style={{ width: 160, marginLeft: 'auto' }} value={filter} onChange={(e) => setFilter(e.target.value as 'all' | NoteVisibility)} aria-label={say('Visibilité', 'Visibility')}>
          <option value="all">{say('Toutes', 'All')}</option>
          {(Object.keys(VISIBILITY) as NoteVisibility[]).map((v) => <option key={v} value={v}>{say(...VISIBILITY[v])}</option>)}
        </select>
        {canCreateNoteByRole(role, entityType) && !draft && <button className="btn sm primary" onClick={() => setDraft(blank)}>{say('Nouvelle note', 'New note')}</button>}
      </div>
      {draft && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
          <div className="grid3">
            <Field label={say('Titre', 'Title')} style={{ gridColumn: 'span 2' }}><input className="in" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
            <Field label={say('Visibilité', 'Visibility')}><select className="in" value={draft.visibility} onChange={(e) => setDraft({ ...draft, visibility: e.target.value as NoteVisibility })}>{allowed.map((v) => <option key={v} value={v}>{say(...VISIBILITY[v])}</option>)}</select></Field>
          </div>
          <textarea className="in" style={{ height: 90, padding: 8 }} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          <div className="actions">
            <label className="small" style={{ marginRight: 'auto' }}><input type="checkbox" checked={draft.pinned} onChange={(e) => setDraft({ ...draft, pinned: e.target.checked })} /> {say('épinglée', 'pinned')}</label>
            <button className="btn sm" onClick={() => setDraft(null)}>{say('Annuler', 'Cancel')}</button>
            <button className="btn sm primary" disabled={busy || !draft.title.trim() || !draft.body.trim()} onClick={save}>{say('Enregistrer', 'Save')}</button>
          </div>
        </div>
      )}
      {shown.map((n) => {
        const mine = role === 'admin' || n.author_id === me;
        return (
          <div key={n.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 7 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <b>{n.pinned ? '📌 ' : ''}{n.title}</b>
              <span className="small"><Chip kind="dim">{say(...VISIBILITY[n.visibility])}</Chip> <span className="muted mono">{when(n.updated_at)}</span></span>
            </div>
            <div className="small muted">{n.author?.full_name ?? '—'}</div>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, marginTop: 3 }}>{n.body}</div>
            {mine && (
              <div className="actions" style={{ justifyContent: 'flex-start', marginTop: 3 }}>
                <button className="btn sm ghost" onClick={() => setDraft({ id: n.id, title: n.title, body: n.body, visibility: n.visibility, pinned: n.pinned })}>{say('Modifier', 'Edit')}</button>
                <button className="btn sm ghost" disabled={busy} onClick={() => run(() => togglePinnedNoteAction(form({ note_id: n.id, pinned: n.pinned ? '' : 'on', return_path: '' })))}>{n.pinned ? say('Désépingler', 'Unpin') : say('Épingler', 'Pin')}</button>
                <button className="btn sm ghost" disabled={busy} onClick={() => { if (window.confirm(say('Archiver cette note ?', 'Archive this note?'))) void run(() => archiveNoteAction(form({ note_id: n.id, return_path: '' })), say('Note archivée', 'Note archived')); }}>{say('Archiver', 'Archive')}</button>
              </div>
            )}
          </div>
        );
      })}
      {!shown.length && !draft && <span className="small muted">{say('Aucune note.', 'No note.')}</span>}
    </div>
  );
}
