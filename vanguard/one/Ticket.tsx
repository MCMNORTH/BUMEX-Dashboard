import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addTicketLinkAction, removeTicketLinkAction, searchTicketsAction, ticketViewAction, type TicketLink, type TicketLinkKind, type TicketView } from '@/lib/erp/vanguard/ticket-actions';
import { ARCHIVED_STAGE_VALUE, evaluateTransition, findStage, getActiveStages, getCompletedStage, getCompletionRule, getSignOffStage } from '@/lib/tickets/workflow';
import { moveTicketStageAction, removeTicketAction, updateTicketFieldAction, type TicketField, createSubtaskAction, toggleSubtaskAction, renameSubtaskAction, setSubtaskOwnerAction, setSubtaskDueDateAction, reorderSubtasksAction, deleteSubtaskAction } from '@/app/(app)/tickets/actions';
import { changeDocumentAction, saveDocumentAction } from '@/app/(app)/documents/actions';
import { remainingHours } from '@/lib/work/load';
import { useStore } from '../store';
import { Icon } from '../ui/common';
import { Select, Suggest } from '../ui/Select';
import { PRIORITY, TYPES, reload } from './Tasks';
import { type Result, type Run, type Say } from './Conversation';
import { useSay } from './say';
import { Markdown } from './markdown';
import { LINK_WORDS, ago } from './ticket-history';
import { TicketActivity } from './TicketActivity';
import { Avatar, Lozenge, PriorityIcon, TypeIcon, hoursText, levelLabel, stageTone } from './work-ui';
import { SHORT_REASONS, StageLozenge } from './stages';
import { RichText } from './RichText';
import { QuickLogButton } from './QuickLog';

// A ticket in the Tasks room, laid out as Jira's (asked on 2026-10-27): its key and place in the breadcrumb; on the
// left its description, attachments, sub-tasks, linked tickets and activity (comments, history, work log); on the
// right its status and every detail, changed in place. Every change goes through BUMEX One's actions
// (lib/erp/vanguard/ticket-actions.ts says which), whose rules hold; the database writes the history (0012).

const ESTIMATES = [1, 2, 4, 8, 16];

// backLabel: where back leads (the Tasks room's list by default; My work, 2026-10-29)
export function TicketPanel({ id, onClose, backLabel }: { id: string; onClose: () => void; backLabel?: string }) {
  const { toast } = useStore();
  const [now] = useState(Date.now);
  const say = useSay();
  const [view, setView] = useState<TicketView | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<'subtask' | 'link' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const next = await ticketViewAction(id).catch(() => null);
    setView(next);
  }, [id]);
  useEffect(() => {
    let live = true;
    ticketViewAction(id).catch(() => null).then((next) => { if (live) setView(next); });
    return () => { live = false; };
  }, [id]);

  // a change through BUMEX One's code, then the ticket and Vanguard's state as they now are
  const run: Run = async (work: () => Promise<Result | void>, done?: string) => {
    setBusy(true);
    try {
      const result = await work();
      if (result && result.error) { toast('error', result.error); return false; }
      if (done) toast('ok', done);
      await Promise.all([load(), reload()]);
      return true;
    } catch {
      toast('error', say("Serveur injoignable : rien n'a changé.", 'Server unreachable: nothing changed.'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (view === undefined) return <div className="card"><span className="muted">{say('Chargement du ticket…', 'Loading the ticket…')}</span></div>;
  if (view === null) {
    return (
      <div className="card">
        <div className="banner warn">{say("Ce ticket n'existe plus ou ne vous est pas accessible.", 'This ticket no longer exists or is not open to you.')}</div>
        <div className="actions" style={{ marginTop: 10 }}><button className="btn sm" onClick={onClose}>{backLabel ?? say('Retour aux tâches', 'Back to the tasks')}</button></div>
      </div>
    );
  }

  const { ticket } = view;
  const setField = (field: TicketField, value: string | string[] | null, done?: string) => run(() => updateTicketFieldAction(ticket.id, field, value), done);
  const attach = async (files: FileList | null) => {
    const list = [...(files ?? [])];
    if (!list.length) return;
    await run(async () => {
      for (const file of list) {
        const form = new FormData();
        for (const [k, v] of Object.entries({ title: file.name.replace(/\.[^.]+$/, '') || file.name, description: '', document_type: 'other', related_type: 'task', related_id: ticket.id, visibility: 'internal' })) form.set(k, v);
        form.set('file', file);
        const result = await saveDocumentAction(form);
        if (result.error) return result;
      }
    }, list.length > 1 ? say(`${list.length} pièces jointes ajoutées`, `${list.length} attachments added`) : say('Pièce jointe ajoutée', 'Attachment added'));
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="tk">
      <TopBar view={view} busy={busy} say={say} onClose={onClose} run={run} backLabel={backLabel}
        onAdd={(what) => (what === 'file' ? fileRef.current?.click() : setAdding(what))} />
      <input ref={fileRef} type="file" multiple hidden onChange={(e) => attach(e.target.files)} />
      <div className="tk-grid">
        <div className="tk-main">
          <Title view={view} busy={busy} say={say} onSave={(title) => setField('title', title)} />
          <Description view={view} busy={busy} say={say} onSave={(text) => setField('description', text)} />
          <Attachments view={view} busy={busy} say={say} run={run} onAdd={() => fileRef.current?.click()} />
          <Subtasks view={view} busy={busy} run={run} say={say} open={adding === 'subtask'} onOpened={() => setAdding(null)} />
          <Links view={view} busy={busy} run={run} say={say} open={adding === 'link'} onOpened={() => setAdding(null)} />
          <TicketActivity view={view} busy={busy} run={run} say={say} />
        </div>
        <aside className="tk-side">
          <StatusControl view={view} busy={busy} run={run} say={say} />
          <NextAction view={view} say={say} />
          <Details view={view} busy={busy} say={say} setField={setField} onLogged={() => { void load(); void reload(); }} />
          <div className="tk-stamps small muted">
            <div title={ticket.created_at}>{say('Création', 'Created')} {ago(ticket.created_at, now, say)}</div>
            <div title={ticket.updated_at}>{say('Mis à jour', 'Updated')} {ago(ticket.updated_at, now, say)}</div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ---- the top: back, breadcrumb (floor › mission › key), add and more ----
function TopBar({ view, busy, say, onClose, run, onAdd, backLabel }: { view: TicketView; busy: boolean; say: Say; onClose: () => void; run: Run; onAdd: (what: 'subtask' | 'link' | 'file') => void; backLabel?: string }) {
  const { state, openRoom } = useStore();
  const { ticket } = view;
  const [menu, setMenu] = useState<'add' | 'more' | null>(null);
  const mission = state.engagements.find((e) => e.id === ticket.project_id || (e as { projectId?: string }).projectId === ticket.project_id);
  const floor = state.entities.find((e) => e.id === mission?.entityId) ?? null;
  const copy = async (text: string, done: string) => {
    setMenu(null);
    try { await navigator.clipboard.writeText(text); useStore.getState().toast('ok', done); } catch { /* the browser refused: nothing to say */ }
  };
  const remove = async () => {
    setMenu(null);
    if (!window.confirm(say(`Supprimer le ticket « ${ticket.title} » ?`, `Delete the ticket "${ticket.title}"?`))) return;
    if (await run(() => removeTicketAction(ticket.id), say('Ticket supprimé', 'Ticket deleted'))) onClose();
  };
  const canAdd = view.canUpdate || view.canAttach || view.canLink;
  return (
    <div className="tk-top">
      <button className="btn sm ghost" onClick={onClose} aria-label={backLabel ?? say('Retour aux tâches', 'Back to the tasks')} title={backLabel ?? say('Retour aux tâches', 'Back to the tasks')}><Icon name="back" size={14} /></button>
      <nav className="tk-crumbs" aria-label={say('Emplacement du ticket', "The ticket's place")}>
        <span>{floor?.name ?? say('Étage', 'Floor')}</span><span aria-hidden="true">/</span>
        <button className="linkish" onClick={() => openRoom('missions', `mission:${ticket.project_id}`)}>{mission?.code ?? ticket.projectName ?? say('Mission', 'Mission')}</button><span aria-hidden="true">/</span>
        <span className="tk-key"><TypeIcon type={ticket.type} say={say} /> {ticket.key ?? '—'}</span>
      </nav>
      <div className="tk-top-actions">
        {canAdd && (
          <div className="menu-wrap">
            <button className="btn sm" disabled={busy} onClick={() => setMenu(menu === 'add' ? null : 'add')} aria-haspopup="menu" aria-expanded={menu === 'add'}><Icon name="plus" size={13} /> {say('Ajouter', 'Add')}</button>
            {menu === 'add' && (
              <div className="menu" role="menu" onMouseLeave={() => setMenu(null)}>
                {view.canUpdate && <button role="menuitem" onClick={() => { setMenu(null); onAdd('subtask'); }}>{say('Sous-tâche', 'Sub-task')}</button>}
                {view.canLink && <button role="menuitem" onClick={() => { setMenu(null); onAdd('link'); }}>{say('Lien vers un ticket', 'Link to a ticket')}</button>}
                {view.canAttach && <button role="menuitem" onClick={() => { setMenu(null); onAdd('file'); }}>{say('Pièce jointe', 'Attachment')}</button>}
              </div>
            )}
          </div>
        )}
        <div className="menu-wrap">
          <button className="btn sm ghost" onClick={() => setMenu(menu === 'more' ? null : 'more')} aria-label={say('Plus d’actions', 'More actions')} aria-haspopup="menu" aria-expanded={menu === 'more'}>•••</button>
          {menu === 'more' && (
            <div className="menu right" role="menu" onMouseLeave={() => setMenu(null)}>
              {ticket.key && <button role="menuitem" onClick={() => copy(ticket.key!, say('Clé copiée', 'Key copied'))}>{say('Copier la clé', 'Copy the key')} · {ticket.key}</button>}
              <button role="menuitem" onClick={() => copy(`${window.location.origin}/vanguard?room=tasks&tab=${encodeURIComponent(`ticket:${ticket.id}`)}`, say('Lien copié', 'Link copied'))}>{say('Copier le lien', 'Copy the link')}</button>
              <button role="menuitem" onClick={() => { setMenu(null); openRoom('missions', `mission:${ticket.project_id}`); }}>{say('Ouvrir la mission', 'Open the mission')}</button>
              {view.canManage && <button role="menuitem" className="danger" onClick={remove}>{say('Supprimer le ticket', 'Delete the ticket')}</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Title({ view, busy, say, onSave }: { view: TicketView; busy: boolean; say: Say; onSave: (title: string) => Promise<boolean> }) {
  const [draft, setDraft] = useState<string | null>(null);
  const { ticket } = view;
  if (draft === null) {
    return <h1 className={`tk-title ${view.canUpdate ? 'editable' : ''}`} onClick={() => view.canUpdate && setDraft(ticket.title)} title={view.canUpdate ? say('Cliquer pour modifier', 'Click to edit') : undefined}>{ticket.title}</h1>;
  }
  const save = async () => {
    const next = draft.trim();
    if (!next || next === ticket.title) { setDraft(null); return; }
    if (await onSave(next)) setDraft(null);
  };
  return (
    <input className="in tk-title-in" value={draft} autoFocus disabled={busy} maxLength={200} aria-label={say('Titre', 'Title')}
      onChange={(e) => setDraft(e.target.value)} onBlur={save}
      onKeyDown={(e) => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') { e.stopPropagation(); setDraft(null); } }} />
  );
}

function Section({ title, count, extra, children }: { title: string; count?: number; extra?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="tk-sec">
      <div className="tk-sec-h">
        <button className="tk-fold" onClick={() => setOpen(!open)} aria-expanded={open}><Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} /> <h2>{title}</h2>{count !== undefined && <span className="tk-count">{count}</span>}</button>
        <div className="tk-sec-x">{extra}</div>
      </div>
      {open && <div className="tk-sec-b">{children}</div>}
    </section>
  );
}

function Description({ view, busy, say, onSave }: { view: TicketView; busy: boolean; say: Say; onSave: (text: string) => Promise<boolean> }) {
  const [draft, setDraft] = useState<string | null>(null);
  const text = view.ticket.description ?? '';
  return (
    <Section title="Description">
      {draft === null ? (
        text
          ? <div className={view.canUpdate ? 'tk-desc editable' : 'tk-desc'} onClick={(e) => { if (view.canUpdate && !(e.target as HTMLElement).closest('a')) setDraft(text); }}><Markdown source={text} /></div>
          : view.canUpdate
            ? <button className="tk-empty" onClick={() => setDraft('')}>{say('Ajouter une description…', 'Add a description…')}</button>
            : <span className="small muted">{say('Aucune description.', 'No description.')}</span>
      ) : (
        <div className="tk-desc-edit">
          <div onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setDraft(null); } }}>
            <RichText value={draft} autoFocus minHeight={160} onChange={setDraft} onSubmit={() => void onSave(draft).then((ok) => ok && setDraft(null))} />
          </div>
          <div className="tk-desc-bar">
            <span className="small muted">{say('Ctrl/⌘ Entrée pour enregistrer · Échap pour annuler', 'Ctrl/⌘ Enter to save · Esc to cancel')}</span>
            <button className="btn sm" onClick={() => setDraft(null)}>{say('Annuler', 'Cancel')}</button>
            <button className="btn sm primary" disabled={busy} onClick={async () => { if (await onSave(draft)) setDraft(null); }}>{say('Enregistrer', 'Save')}</button>
          </div>
        </div>
      )}
    </Section>
  );
}

const sizeText = (bytes: number | null, say: Say) => (!bytes ? '—' : bytes > 1048576 ? `${(bytes / 1048576).toFixed(1).replace('.', say(',', '.'))} ${say('Mo', 'MB')}` : `${Math.max(1, Math.round(bytes / 1024))} ${say('Ko', 'KB')}`);

function Attachments({ view, busy, say, run, onAdd }: { view: TicketView; busy: boolean; say: Say; run: Run; onAdd: () => void }) {
  const [kind, setKind] = useState<'all' | 'images' | 'docs'>('all');
  if (view.role === 'shareholder') return null;
  const isImage = (mime: string | null) => Boolean(mime?.startsWith('image/'));
  const shown = view.attachments.filter((a) => kind === 'all' || (kind === 'images') === isImage(a.mime));
  const date = (iso: string) => new Date(iso).toLocaleDateString(say('fr-FR', 'en-GB'), { day: '2-digit', month: 'short', year: 'numeric' });
  return (
    <Section title={say('Pièces jointes', 'Attachments')} count={view.attachments.length}
      extra={<>
        {view.attachments.length > 0 && <div className="seg-mini">{(['all', 'images', 'docs'] as const).map((k) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{k === 'all' ? say('Tout', 'All') : k === 'images' ? say('Images', 'Images') : say('Documents', 'Documents')}</button>)}</div>}
        {view.canAttach && <button className="btn sm ghost" disabled={busy} onClick={onAdd} aria-label={say('Ajouter une pièce jointe', 'Add an attachment')}><Icon name="plus" size={14} /></button>}
      </>}>
      {view.attachments.length ? (
        <table className="tk-table">
          <thead><tr><th>{say('Nom', 'Name')}</th><th>{say("Date d'ajout", 'Added')}</th><th className="num">{say('Taille', 'Size')}</th><th /></tr></thead>
          <tbody>
            {shown.map((a) => (
              <tr key={a.id}>
                <td><a className="tk-file" href={`/api/documents/${a.id}/download`} target="_blank" rel="noreferrer"><span className={`ficon ${isImage(a.mime) ? 'img' : ''}`} aria-hidden="true" />{a.fileName ?? a.title}</a>{a.by && <span className="small muted"> · {a.by}</span>}</td>
                <td className="small">{date(a.at)}</td>
                <td className="num small">{sizeText(a.size, say)}</td>
                <td className="num">{view.canAttach && <button className="btn sm ghost" disabled={busy} onClick={() => { if (window.confirm(say(`Supprimer « ${a.fileName ?? a.title} » ?`, `Delete "${a.fileName ?? a.title}"?`))) void run(() => changeDocumentAction(a.id, 'delete'), say('Pièce jointe supprimée', 'Attachment deleted')); }} aria-label={say('Supprimer', 'Delete')}><Icon name="close" size={13} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : view.canAttach
        ? <button className="tk-drop" onClick={onAdd}>{say('Déposez un fichier ici ou cliquez pour en ajouter', 'Drop a file here or click to add one')}</button>
        : <span className="small muted">{say('Aucune pièce jointe.', 'No attachment.')}</span>}
    </Section>
  );
}

function Subtasks({ view, busy, run, say, open, onOpened }: { view: TicketView; busy: boolean; run: Run; say: Say; open: boolean; onOpened: () => void }) {
  const { ticket, subtasks, canUpdate, canManage, me } = view;
  const [title, setTitle] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { inputRef.current?.focus(); onOpened(); } }, [open, onOpened]);
  if (view.role === 'shareholder') {
    return <Section title={say('Sous-tâches', 'Sub-tasks')}><span className="small muted">{ticket.subtasks_done ?? 0} / {ticket.subtasks_total ?? 0}</span></Section>;
  }
  const done = subtasks.filter((s) => s.is_done).length;
  const move = (index: number, by: number) => {
    const ids = subtasks.map((s) => s.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + by, 0, moved);
    void run(() => reorderSubtasksAction(ticket.id, ids));
  };
  const add = async () => { if (title.trim() && (await run(() => createSubtaskAction(ticket.id, title)))) setTitle(''); };
  return (
    <Section title={say('Sous-tâches', 'Sub-tasks')} count={subtasks.length} extra={subtasks.length > 0 && <span className="small muted">{done} / {subtasks.length} {say('terminées', 'done')}</span>}>
      {subtasks.length > 0 && <div className="bar" style={{ marginBottom: 6 }}><i style={{ width: `${(done / subtasks.length) * 100}%`, background: 'var(--good)' }} /></div>}
      <div className="tk-rows">
        {subtasks.map((s, i) => {
          const canTick = canUpdate || s.assignee_id === me;
          const owner = view.people.find((p) => p.id === s.assignee_id)?.name ?? null;
          return (
            <div key={s.id} className="tk-row">
              <input type="checkbox" checked={s.is_done} disabled={!canTick || busy} onChange={(e) => run(() => toggleSubtaskAction(s.id, e.target.checked))} aria-label={s.title} />
              {renaming?.id === s.id
                ? <input className="in" style={{ flex: 1 }} value={renaming.title} autoFocus onChange={(e) => setRenaming({ id: s.id, title: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter' && renaming.title.trim()) { void run(() => renameSubtaskAction(s.id, renaming.title)); setRenaming(null); } if (e.key === 'Escape') { e.stopPropagation(); setRenaming(null); } }} />
                : <span className="grow" style={{ textDecoration: s.is_done ? 'line-through' : undefined, color: s.is_done ? 'var(--muted)' : undefined, cursor: canUpdate ? 'text' : undefined }} onClick={() => canUpdate && setRenaming({ id: s.id, title: s.title })}>{s.title}</span>}
              {canManage
                ? <Select recent="people" className="in tk-mini" value={s.assignee_id ?? ''} disabled={busy} onChange={(e) => run(() => setSubtaskOwnerAction(s.id, e.target.value || null))} aria-label={say('Responsable', 'Owner')}><option value="">—</option>{view.people.map((p) => <option key={p.id} value={p.id} data-hint={view.loads[p.id] ? `${hoursText(view.loads[p.id].weekHours, say)} / ${hoursText(view.loads[p.id].capacityHours, say)}` : undefined} data-tone={view.loads[p.id]?.level}>{p.name}</option>)}</Select>
                : <Avatar name={owner} size={22} />}
              <input className="in mono tk-date" type="date" value={s.due_date?.slice(0, 10) ?? ''} disabled={!canUpdate || busy} onChange={(e) => run(() => setSubtaskDueDateAction(s.id, e.target.value || null))} aria-label={say('Échéance', 'Due')} />
              {canUpdate && <>
                <button className="btn sm ghost" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label={say('Monter', 'Up')}><Icon name="chevronUp" size={13} /></button>
                <button className="btn sm ghost" disabled={busy || i === subtasks.length - 1} onClick={() => move(i, 1)} aria-label={say('Descendre', 'Down')}><Icon name="chevronDown" size={13} /></button>
                <button className="btn sm ghost" disabled={busy} onClick={() => run(() => deleteSubtaskAction(s.id))} aria-label={say('Supprimer', 'Delete')}><Icon name="close" size={13} /></button>
              </>}
            </div>
          );
        })}
      </div>
      {canUpdate
        ? <div className="tk-add"><input ref={inputRef} className="in" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={say('Ajouter une sous-tâche', 'Add a sub-task')} onKeyDown={(e) => { if (e.key === 'Enter') void add(); }} /><button className="btn sm" disabled={busy || !title.trim()} onClick={add}>{say('Ajouter', 'Add')}</button></div>
        : !subtasks.length && <span className="small muted">{say('Aucune sous-tâche.', 'No sub-task.')}</span>}
    </Section>
  );
}

const KINDS: [TicketLinkKind, 'out' | 'in'][] = [['blocks', 'out'], ['blocks', 'in'], ['relates', 'out'], ['action_item', 'out'], ['action_item', 'in'], ['duplicates', 'out'], ['duplicates', 'in']];

function Links({ view, busy, run, say, open, onOpened }: { view: TicketView; busy: boolean; run: Run; say: Say; open: boolean; onOpened: () => void }) {
  const { openRoom } = useStore();
  const [form, setForm] = useState(false);
  const [choice, setChoice] = useState('blocks:out');
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<{ id: string; key: string | null; title: string; status: string }[]>([]);
  // "Ajouter › Lien" opens the form (the request is acknowledged once seen)
  const [seenOpen, setSeenOpen] = useState(open);
  if (open !== seenOpen) {
    setSeenOpen(open);
    if (open) setForm(true);
  }
  useEffect(() => { if (open) onOpened(); }, [open, onOpened]);
  useEffect(() => {
    if (!form || query.trim().length < 1) return;
    let live = true;
    const timer = setTimeout(() => { void searchTicketsAction(query, view.ticket.id).then((rows) => live && setFound(rows)).catch(() => {}); }, 180);
    return () => { live = false; clearTimeout(timer); };
  }, [query, form, view.ticket.id]);
  const groups = useMemo(() => {
    const map = new Map<string, TicketLink[]>();
    for (const l of view.links) {
      const words = LINK_WORDS[l.kind] ?? LINK_WORDS.relates;
      const label = say(...words[l.direction]);
      map.set(label, [...(map.get(label) ?? []), l]);
    }
    return [...map];
  }, [view.links, say]);
  if (view.role === 'shareholder' && !view.links.length) return null;
  const link = async (other: string) => {
    const [kind, direction] = choice.split(':') as [TicketLinkKind, 'out' | 'in'];
    const [from, to] = direction === 'out' ? [view.ticket.id, other] : [other, view.ticket.id];
    if (await run(() => addTicketLinkAction(from, to, kind), say('Lien ajouté', 'Link added'))) { setQuery(''); setFound([]); setForm(false); }
  };
  return (
    <Section title={say('Tickets associés', 'Linked tickets')} count={view.links.length}
      extra={view.canLink && !form && <button className="btn sm ghost" onClick={() => setForm(true)} aria-label={say('Lier un ticket', 'Link a ticket')}><Icon name="plus" size={14} /></button>}>
      {groups.map(([label, links]) => (
        <div key={label} className="tk-linkgrp">
          <div className="small muted tk-linkh">{label}</div>
          {links.map((l) => (
            <div key={l.id} className="tk-link">
              <TypeIcon type={l.ticket.type} say={say} />
              <button className="linkish mono" onClick={() => openRoom('tasks', `ticket:${l.ticket.id}`)}>{l.ticket.key ?? '—'}</button>
              <button className="linkish grow tk-link-t" onClick={() => openRoom('tasks', `ticket:${l.ticket.id}`)}>{l.ticket.title}</button>
              <StageLozenge name={l.ticket.stageName} status={l.ticket.status} />
              <Avatar name={l.ticket.assigneeName} size={22} />
              <PriorityIcon priority={l.ticket.priority} say={say} />
              {l.canRemove && <button className="btn sm ghost" disabled={busy} onClick={() => run(() => removeTicketLinkAction(l.id), say('Lien retiré', 'Link removed'))} aria-label={say('Retirer le lien', 'Remove the link')}><Icon name="close" size={13} /></button>}
            </div>
          ))}
        </div>
      ))}
      {form && (
        <div className="tk-linkform">
          <Select className="in" style={{ width: 190 }} value={choice} onChange={(e) => setChoice(e.target.value)} aria-label={say('Relation', 'Relation')}>
            {KINDS.map(([k, d]) => <option key={`${k}:${d}`} value={`${k}:${d}`}>{say(...(LINK_WORDS[k][d]))}</option>)}
          </Select>
          <div className="grow tk-search">
            <input className="in" autoFocus value={query} onChange={(e) => { setQuery(e.target.value); if (!e.target.value.trim()) setFound([]); }} placeholder={say('Clé (AUD-12) ou titre…', 'Key (AUD-12) or title…')} aria-label={say('Rechercher un ticket', 'Search a ticket')} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setForm(false); } if (e.key === 'Enter' && found[0]) void link(found[0].id); }} />
            {found.length > 0 && (
              <div className="tk-found" role="listbox">
                {found.map((t) => <button key={t.id} role="option" aria-selected="false" disabled={busy} onClick={() => link(t.id)}><span className="mono">{t.key}</span> {t.title}</button>)}
              </div>
            )}
          </div>
          <button className="btn sm" onClick={() => { setForm(false); setQuery(''); setFound([]); }}>{say('Annuler', 'Cancel')}</button>
        </div>
      )}
      {!view.links.length && !form && <span className="small muted">{say('Aucun ticket associé.', 'No linked ticket.')}</span>}
    </Section>
  );
}

// ---- the right: status, next action, details ----
function StatusControl({ view, busy, run, say }: { view: TicketView; busy: boolean; run: Run; say: Say }) {
  const { ticket, workflow } = view;
  const [asking, setAsking] = useState<{ stageId: string; name: string; message: string } | null>(null);
  const [reason, setReason] = useState('');
  const stages = getActiveStages(workflow);
  const current = ticket.status === 'archived' ? ARCHIVED_STAGE_VALUE : ticket.stage_id;
  const stage = findStage(workflow, ticket.stage_id);
  const tone = ticket.status === 'archived' ? 'archived' : stageTone(stage);
  const move = async (stageId: string, why?: string) => {
    if (stageId === current) return;
    const name = stageId === ARCHIVED_STAGE_VALUE ? say('Archivé', 'Archived') : stages.find((s) => s.id === stageId)?.name ?? '';
    let answer: { error?: string; code?: string } = {};
    const ok = await run(async () => {
      // archiving, and leaving the archive, go through the edit (its rules: managers only); a move through the board's
      answer = stageId === ARCHIVED_STAGE_VALUE || current === ARCHIVED_STAGE_VALUE ? await updateTicketFieldAction(ticket.id, 'stage_id', stageId) : await moveTicketStageAction(ticket.id, { stageId }, why);
      return answer.code === 'reason_required' ? undefined : answer;
    }, undefined);
    if (answer.code === 'reason_required') { setAsking({ stageId, name, message: answer.error ?? '' }); return; }
    if (ok && !answer.error) { setAsking(null); setReason(''); useStore.getState().toast('ok', `${ticket.key ?? ticket.title} → ${name}`); }
  };
  const canMove = view.canUpdate || view.isReporter;
  const me = useStore.getState().state.session.userId;
  const rules = getCompletionRule({ reporter_id: ticket.reporter_id, assignee_id: ticket.assignee_id }, me);
  return (
    <div className="tk-status">
      <div className="tk-status-row">
        {canMove ? (
          <Select className={`stsel ${tone}`} value={current} disabled={busy} onChange={(e) => move(e.target.value)} aria-label={say('État', 'Status')}>
            {stages.map((s) => {
              // the board's rules for this ticket and this person: refused moves greyed with why, the ones asking a reason said
              if (s.id === current) return <option key={s.id} value={s.id}>{s.name}</option>;
              const check = evaluateTransition(workflow, ticket.stage_id ?? ticket.status, s.id, 'motif', rules);
              const plain = check.ok ? evaluateTransition(workflow, ticket.stage_id ?? ticket.status, s.id, null, rules) : null;
              const hint = !check.ok ? say(...(SHORT_REASONS[check.error.code] ?? ['non permis', 'not allowed'])) : plain && !plain.ok && plain.error.code === 'reason_required' ? say('motif demandé', 'reason asked') : undefined;
              return <option key={s.id} value={s.id} disabled={!check.ok && current !== ARCHIVED_STAGE_VALUE} data-hint={hint}>{s.name}</option>;
            })}
            {view.canManage && <option value={ARCHIVED_STAGE_VALUE}>{say('Archivé', 'Archived')}</option>}
          </Select>
        ) : <Lozenge tone={tone}>{stage?.name ?? ticket.status}</Lozenge>}
        {view.signOff && <button className="btn sm primary" disabled={busy} onClick={() => move(view.signOff!.stageId)}>{say('Valider', 'Sign off')} → {view.signOff.stageName}</button>}
      </div>
      {asking && (
        <div className="tk-reason">
          <span className="small">{asking.message || say('Ce déplacement demande un motif.', 'This move needs a reason.')}</span>
          <input className="in" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder={say('Motif', 'Reason')} onKeyDown={(e) => { if (e.key === 'Enter' && reason.trim()) void move(asking.stageId, reason.trim()); }} />
          <div className="actions">
            <button className="btn sm" onClick={() => { setAsking(null); setReason(''); }}>{say('Annuler', 'Cancel')}</button>
            <button className="btn sm primary" disabled={!reason.trim() || busy} onClick={() => move(asking.stageId, reason.trim())}>{say('Déplacer vers', 'Move to')} {asking.name}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// What BUMEX One's page recommended doing next, from the same signals: a line above the details.
function NextAction({ view, say }: { view: TicketView; say: Say }) {
  const { state } = useStore();
  const { ticket, workflow } = view;
  const open = ticket.status !== 'done' && ticket.status !== 'archived';
  if (!open) return null;
  const completedName = getCompletedStage(workflow)?.name ?? say('Terminé', 'Done');
  const awaiting = getSignOffStage(workflow)?.id === ticket.stage_id;
  const estimated = Number(ticket.estimated_hours ?? 0);
  const spent = (ticket.logged_minutes ?? 0) / 60;
  const allDone = view.subtasks.length > 0 && view.subtasks.every((s) => s.is_done);
  const late = ticket.due_date && ticket.due_date.slice(0, 10) < state.today;
  const [kind, text]: ['info' | 'warn' | 'crit', string] = !ticket.assignee_id
    ? ['info', say('Personne ne le porte encore : assignez-le.', 'No one carries it yet: assign it.')]
    : awaiting && view.isReporter
      ? ['info', say(`Il attend votre validation : vérifiez-le, puis passez-le à « ${completedName} ».`, `It waits for your sign-off: check it, then move it to ${completedName}.`)]
      : awaiting
        ? ['info', ticket.reporterName ? say(`En attente de validation par ${ticket.reporterName}.`, `Waiting for ${ticket.reporterName}'s sign-off.`) : say('En attente de validation par un responsable du projet.', "Waiting for a project lead's sign-off.")]
        : ticket.status === 'blocked'
          ? ['crit', say('Bloqué : documentez le blocage dans les commentaires.', 'Blocked: document the blocker in the comments.')]
          : late
            ? ['warn', say("Échéance dépassée : convenez d'une nouvelle date.", 'Past its due date: agree on a new date.')]
            : estimated > 0 && spent > estimated
              ? ['warn', say(`Le temps passé dépasse l'estimation (${Math.round((spent / estimated) * 100)} %).`, `Time spent is over the estimate (${Math.round((spent / estimated) * 100)}%).`)]
              : !estimated
                ? ['info', say('Pas encore estimé : il ne compte pas dans la charge.', 'Not estimated yet: it does not count in the load.')]
                : allDone && !['review', 'done', 'archived'].includes(ticket.status)
                  ? ['info', say('Toutes les sous-tâches sont terminées : passez-le en revue.', 'Every sub-task is done: move it to review.')]
                  : ['info', ''];
  if (!text) return null;
  return <div className={`banner ${kind} small`}>{text}</div>;
}

function Details({ view, busy, say, setField, onLogged }: { view: TicketView; busy: boolean; say: Say; setField: (field: TicketField, value: string | string[] | null, done?: string) => Promise<boolean>; onLogged: () => void }) {
  const { state, openRoom } = useStore();
  const { ticket, canUpdate, canManage, me } = view;
  const [estimate, setEstimate] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const estimated = Number(ticket.estimated_hours ?? 0);
  const spent = (ticket.logged_minutes ?? 0) / 60;
  const left = remainingHours(ticket);
  const usage = estimated > 0 ? Math.round((spent / estimated) * 100) : 0;
  const late = ticket.status !== 'done' && ticket.due_date && ticket.due_date.slice(0, 10) < state.today;
  const load = (personId: string) => view.loads[personId];
  const person = (personId: string | null) => view.people.find((p) => p.id === personId)?.name ?? null;
  const assigneeLoad = ticket.assignee_id ? load(ticket.assignee_id) : undefined;
  const option = (p: { id: string; name: string }) => {
    const l = load(p.id);
    return <option key={p.id} value={p.id} data-hint={l ? `${hoursText(l.weekHours, say)} / ${hoursText(l.capacityHours, say)}` : undefined} data-tone={l?.level}>{p.name}</option>;
  };
  const saveEstimate = async (value: string) => {
    const clean = value.replace(',', '.').replace(/\s*h$/i, '').trim();
    if (clean && (Number.isNaN(Number(clean)) || Number(clean) < 0)) { useStore.getState().toast('error', say('Une estimation est un nombre d’heures.', 'An estimate is a number of hours.')); return; }
    if (await setField('estimated_hours', clean)) setEstimate(null);
  };
  const addLabel = async (raw: string) => {
    const next = raw.trim();
    if (!next || ticket.labels.some((l) => l.toLowerCase() === next.toLowerCase())) { setLabel(''); return; }
    if (await setField('labels', [...ticket.labels, next])) setLabel('');
  };
  return (
    <div className="tk-details">
      <div className="tk-details-h">{say('Détails', 'Details')}</div>
      <dl>
        <dt>{say('Assigné', 'Assignee')}</dt>
        <dd>
          {canManage
            ? <Select recent="people" className="in tk-fieldsel" value={ticket.assignee_id ?? ''} disabled={busy} onChange={(e) => setField('assignee_id', e.target.value)} aria-label={say('Assigné', 'Assignee')}><option value="">{say('Non assigné', 'Unassigned')}</option>{view.people.map(option)}</Select>
            : <span className="tk-person"><Avatar name={ticket.assigneeName} />{ticket.assigneeName ?? say('Non assigné', 'Unassigned')}</span>}
          {canManage && ticket.assignee_id !== me && <button className="linkish small" disabled={busy} onClick={() => setField('assignee_id', me)}>{say("M'assigner", 'Assign to me')}</button>}
          {assigneeLoad && <div className={`small tk-loadline ${assigneeLoad.level}`}>{say('Charge', 'Load')} : {hoursText(assigneeLoad.weekHours, say)} / {hoursText(assigneeLoad.capacityHours, say)} · {levelLabel(assigneeLoad.level, say)}</div>}
        </dd>
        <dt>{say('Rapporteur', 'Reporter')}</dt>
        <dd>
          {canManage
            ? <Select recent="people" className="in tk-fieldsel" value={ticket.reporter_id ?? ''} disabled={busy} onChange={(e) => setField('reporter_id', e.target.value)} aria-label={say('Rapporteur', 'Reporter')}><option value="">—</option>{view.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
            : <span className="tk-person"><Avatar name={ticket.reporterName ?? person(ticket.reporter_id)} />{ticket.reporterName ?? '—'}</span>}
        </dd>
        <dt>{say('Priorité', 'Priority')}</dt>
        <dd>
          {canUpdate
            ? <div className="tk-inline"><PriorityIcon priority={ticket.priority} say={say} /><Select className="in tk-fieldsel" value={ticket.priority} disabled={busy} onChange={(e) => setField('priority', e.target.value)} aria-label={say('Priorité', 'Priority')}>{Object.entries(PRIORITY).map(([k, [fr, en]]) => <option key={k} value={k}>{say(fr, en)}</option>)}</Select></div>
            : <span className="tk-inline"><PriorityIcon priority={ticket.priority} say={say} />{say(...(PRIORITY[ticket.priority] ?? [ticket.priority, ticket.priority]))}</span>}
        </dd>
        <dt>{say('Estimation', 'Estimate')}</dt>
        <dd>
          {estimate === null ? (
            <button className={`tk-value ${canUpdate ? 'editable' : ''}`} disabled={!canUpdate} onClick={() => setEstimate(ticket.estimated_hours ? String(ticket.estimated_hours) : '')}>
              {estimated ? hoursText(estimated, say) : <span className="muted">{say('Non estimé', 'No estimate')}</span>}
            </button>
          ) : (
            <div className="tk-estimate">
              <div className="tk-presets">{ESTIMATES.map((h) => <button key={h} className="btn sm" disabled={busy} onClick={() => saveEstimate(String(h))}>{h} h</button>)}</div>
              <div className="tk-inline">
                <input className="in num" autoFocus value={estimate} onChange={(e) => setEstimate(e.target.value)} placeholder={say('heures', 'hours')} aria-label={say('Estimation en heures', 'Estimate in hours')}
                  onKeyDown={(e) => { if (e.key === 'Enter') void saveEstimate(estimate); if (e.key === 'Escape') { e.stopPropagation(); setEstimate(null); } }} />
                <button className="btn sm primary" disabled={busy} onClick={() => saveEstimate(estimate)}>OK</button>
                <button className="btn sm ghost" onClick={() => setEstimate(null)} aria-label={say('Annuler', 'Cancel')}><Icon name="close" size={13} /></button>
              </div>
            </div>
          )}
        </dd>
        <dt>{say('Temps passé', 'Time spent')}</dt>
        <dd>
          <div className="tk-time">
            <span>{hoursText(spent, say)}{estimated > 0 && <span className="muted"> · {say('reste', 'left')} {hoursText(left, say)}</span>}</span>
            {view.role !== 'shareholder' && <QuickLogButton ticketId={ticket.id} label={say('Enregistrer du temps', 'Log time')} className="linkish small" onSaved={onLogged} />}
          </div>
          {estimated > 0 && <div className="bar" style={{ marginTop: 4 }}><i style={{ width: `${Math.min(100, usage)}%`, background: usage > 100 ? 'var(--crit)' : usage >= 80 ? 'var(--warn)' : 'var(--accent)' }} /></div>}
        </dd>
        <dt>{say('Échéance', 'Due')}</dt>
        <dd>
          {canUpdate
            ? <input className={`in mono tk-date ${late ? 'late' : ''}`} type="date" value={ticket.due_date?.slice(0, 10) ?? ''} disabled={busy} onChange={(e) => setField('due_date', e.target.value)} aria-label={say('Échéance', 'Due')} />
            : <span className={late ? 'late' : ''}>{ticket.due_date ? ticket.due_date.slice(0, 10).split('-').reverse().join('/') : '—'}</span>}
        </dd>
        <dt>Type</dt>
        <dd>
          {canUpdate
            ? <div className="tk-inline"><TypeIcon type={ticket.type} say={say} /><Select className="in tk-fieldsel" value={ticket.type} disabled={busy} onChange={(e) => setField('type', e.target.value)} aria-label="Type">{TYPES.map(([k, fr, en]) => <option key={k} value={k}>{say(fr, en)}</option>)}</Select></div>
            : <span className="tk-inline"><TypeIcon type={ticket.type} say={say} />{say(...((TYPES.find(([k]) => k === ticket.type) ?? [ticket.type, ticket.type, ticket.type]).slice(1) as [string, string]))}</span>}
        </dd>
        <dt>{say('Étiquettes', 'Labels')}</dt>
        <dd>
          <div className="tk-labels">
            {ticket.labels.map((l) => (
              <span key={l} className="tag">{l}{canUpdate && <button disabled={busy} onClick={() => setField('labels', ticket.labels.filter((x) => x !== l))} aria-label={say(`Retirer ${l}`, `Remove ${l}`)}>×</button>}</span>
            ))}
            {!ticket.labels.length && !canUpdate && <span className="muted">{say('Aucune', 'None')}</span>}
          </div>
          {canUpdate && ticket.labels.length < 10 && (
            <div onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addLabel(label); } }}>
              <Suggest className="in tk-labelin" value={label} onChange={(e) => { const v = e.target.value; if (view.labels.includes(v) && !ticket.labels.includes(v)) void addLabel(v); else setLabel(v); }} options={view.labels.filter((l) => !ticket.labels.includes(l))} placeholder={say('Ajouter une étiquette', 'Add a label')} maxLength={40} aria-label={say('Ajouter une étiquette', 'Add a label')} />
            </div>
          )}
        </dd>
        <dt>{say('Mission', 'Mission')}</dt>
        <dd>
          {canManage
            ? <Select recent="missions" className="in tk-fieldsel" value={ticket.project_id} disabled={busy} onChange={(e) => { if (window.confirm(say('Déplacer le ticket vers cette mission ? Il reprend à la première étape de son tableau.', "Move the ticket to this mission? It restarts at its board's first stage."))) void setField('project_id', e.target.value); }} aria-label={say('Mission', 'Mission')}>{view.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
            : <button className="linkish" onClick={() => openRoom('missions', `mission:${ticket.project_id}`)}>{ticket.projectName ?? '—'}</button>}
        </dd>
        {ticket.clientName && <><dt>{say('Client', 'Client')}</dt><dd>{ticket.clientName}</dd></>}
        {(ticket.github_issue_url || canUpdate) && <>
          <dt>GitHub</dt>
          <dd>{ticket.github_issue_url ? <a href={ticket.github_issue_url} target="_blank" rel="noreferrer">{say("Ouvrir l'incident", 'Open the issue')}</a> : null}
            {canUpdate && <button className="linkish small" style={{ marginLeft: ticket.github_issue_url ? 8 : 0 }} onClick={() => { const url = window.prompt(say("Adresse de l'incident GitHub (vide pour retirer)", 'GitHub issue address (empty to remove)'), ticket.github_issue_url ?? ''); if (url !== null) void setField('github_issue_url', url.trim()); }}>{ticket.github_issue_url ? say('Modifier', 'Edit') : say('Ajouter un lien', 'Add a link')}</button>}
          </dd>
        </>}
      </dl>
    </div>
  );
}
