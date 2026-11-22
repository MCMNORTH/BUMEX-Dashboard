import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { removeTicketAction } from '@/app/(app)/tickets/actions';
import { useStore } from '../store';
import { confirmAsk } from './ask';
import { useModal } from './modal';
import { useSay } from './say';
import { TEAM_ROLES, reload, type TicketTask } from './Tasks';

// A ticket's menu on a right click, wherever the ticket is shown (asked on 2026-11-22): a board's card, a list's row,
// My work, My day, a mission, a person, a client, the overview, the calendar, the week, a ticket's links. The same
// choices as the open ticket's ••• (Ticket.tsx), with "Open" first. The keyboard's menu key (or Shift+F10) on a
// focused ticket opens it too; text selected in the ticket, a field or a link keeps the browser's own menu.
//
//   <div {...ticketMenu({ id })}>…</div>                                   // a ticket the store knows (state.tasks)
//   <tr {...ticketMenu({ id, key, projectId, title })}>…</tr>               // one it may not: what the menu needs
//
// TicketMenuHost (App.tsx) listens once for the whole app.

type Shown = { id: string; key?: string | null; projectId?: string | null; title?: string | null };

/** What an element showing a ticket carries for its menu. */
export const ticketMenu = ({ id, key, projectId, title }: Shown) => ({
  'data-ticket': id,
  'data-ticket-key': key ?? undefined,
  'data-ticket-project': projectId ?? undefined,
  'data-ticket-title': title ?? undefined,
});

// where a right click stays the browser's: typing, a link (open in a new tab)
const KEEP = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], a[href]';

type Opened = { id: string; key: string | null; projectId: string | null; title: string; x: number; y: number };

export function TicketMenuHost() {
  const [opened, setOpened] = useState<Opened | null>(null);

  useEffect(() => {
    const onMenu = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const el = target?.closest<HTMLElement>('[data-ticket]');
      if (!target || !el || !el.closest('.vanguard') || target.closest(KEEP)) return;
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && selection.anchorNode && el.contains(selection.anchorNode)) return; // text to copy
      event.preventDefault();
      const id = el.dataset.ticket!;
      const task = useStore.getState().state.tasks.find((x) => x.id === id) as TicketTask | undefined;
      // from the keyboard the point may be anywhere: under the ticket then
      const box = el.getBoundingClientRect();
      const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
      setOpened({
        id,
        key: task?.ticket.key ?? el.dataset.ticketKey ?? null,
        projectId: task?.ticket.project_id ?? el.dataset.ticketProject ?? null,
        title: task?.title ?? el.dataset.ticketTitle ?? '',
        x: inside ? event.clientX : box.left,
        y: inside ? event.clientY : box.bottom,
      });
    };
    document.addEventListener('contextmenu', onMenu);
    return () => document.removeEventListener('contextmenu', onMenu);
  }, []);

  return opened ? <TicketMenu key={`${opened.id}:${opened.x}:${opened.y}`} opened={opened} onClose={() => setOpened(null)} /> : null;
}

function TicketMenu({ opened, onClose }: { opened: Opened; onClose: () => void }) {
  const say = useSay();
  const role = useStore((s) => s.state.session.role);
  const box = useRef<HTMLDivElement>(null);
  // Escape closes it and the focus goes back to the ticket (modal.ts)
  useModal(box, onClose);

  // inside the window: to the cursor's left near the right edge, above it near the bottom; measured before it is seen
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    el.style.left = `${Math.max(8, Math.min(opened.x, window.innerWidth - width - 8))}px`;
    el.style.top = `${opened.y + height > window.innerHeight - 8 ? Math.max(8, opened.y - height) : opened.y}px`;
    el.style.visibility = 'visible';
    el.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [opened.x, opened.y]);

  // a press elsewhere, a scroll, the window resized or left: it closes
  useEffect(() => {
    const away = (event: Event) => {
      if (!(event.target instanceof Node) || !box.current?.contains(event.target)) onClose();
    };
    const close = () => onClose();
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('scroll', away, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('scroll', away, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
    };
  }, [onClose]);

  const store = useStore.getState;
  const copy = async (text: string, done: string) => {
    onClose();
    try { await navigator.clipboard.writeText(text); store().toast('ok', done); } catch { /* the browser refused: nothing to say */ }
  };
  const open = () => {
    onClose();
    store().openRoom('tasks', `ticket:${opened.id}`);
    store().setUi({ focusTaskId: opened.id }); // the tasks room already open on this ticket's tab opens it again
  };
  const mission = () => {
    onClose();
    store().openRoom('missions', `mission:${opened.projectId}`);
  };
  const remove = async () => {
    onClose();
    const name = opened.title || opened.key || say('ce ticket', 'this ticket');
    if (!(await confirmAsk({ title: say(`Supprimer le ticket « ${name} » ?`, `Delete the ticket "${name}"?`), confirm: say('Supprimer', 'Delete'), danger: true }))) return;
    try {
      const result = await removeTicketAction(opened.id);
      if (result.error) { store().toast('error', result.error); return; }
      store().toast('ok', say('Ticket supprimé', 'Ticket deleted'));
      await reload();
    } catch {
      store().toast('error', say("Serveur injoignable : le ticket n'est pas supprimé.", 'Server unreachable: the ticket was not deleted.'));
    }
  };

  // the arrows go from choice to choice, round; Tab leaves the menu
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(box.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const go = (i: number) => { event.preventDefault(); items[(i + items.length) % items.length]?.focus(); };
    if (event.key === 'ArrowDown') go(at + 1);
    else if (event.key === 'ArrowUp') go(at < 0 ? items.length - 1 : at - 1);
    else if (event.key === 'Home') go(0);
    else if (event.key === 'End') go(items.length - 1);
    else if (event.key === 'Tab') { event.preventDefault(); onClose(); }
  };

  return (
    <div
      ref={box}
      className="menu tk-ctx"
      role="menu"
      aria-label={opened.key ? `Ticket ${opened.key}` : 'Ticket'}
      style={{ left: opened.x, top: opened.y, visibility: 'hidden' }}
      onKeyDown={keys}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button role="menuitem" tabIndex={-1} onClick={open}>{say('Ouvrir le ticket', 'Open the ticket')}</button>
      {opened.key && <button role="menuitem" tabIndex={-1} onClick={() => copy(opened.key!, say('Clé copiée', 'Key copied'))}>{say('Copier la clé', 'Copy the key')} · {opened.key}</button>}
      <button role="menuitem" tabIndex={-1} onClick={() => copy(`${window.location.origin}/vanguard?room=tasks&tab=${encodeURIComponent(`ticket:${opened.id}`)}`, say('Lien copié', 'Link copied'))}>{say('Copier le lien', 'Copy the link')}</button>
      {opened.projectId && <button role="menuitem" tabIndex={-1} onClick={mission}>{say('Ouvrir la mission', 'Open the mission')}</button>}
      {TEAM_ROLES.includes(role) && <><div className="tk-ctx-sep" role="separator" /><button role="menuitem" tabIndex={-1} className="danger" onClick={remove}>{say('Supprimer le ticket', 'Delete the ticket')}</button></>}
    </div>
  );
}
