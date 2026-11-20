import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

// A dialog over the page (ask.tsx's questions, the deletion's, work-ui's Dialog, Time's, Log time…), as Fluent's
// (2026-11-20):
// - Tab and Shift+Tab go round the dialog, never to the page behind it;
// - Escape closes it, and only it: the room behind stays open (ui/Header.tsx and the others ask modalOpen() first);
// - closed, the focus goes back where it was when it opened (a backdrop that closes on mousedown calls
//   preventDefault, or the browser then moves the focus to the page).
// Only the last dialog opened listens (a question asked over a form keeps the keys). A list a field opened (Select's,
// drawn outside the dialog) keeps its own keys: Escape closes the list, not the dialog.
//
//   const box = useRef<HTMLDivElement>(null);
//   useModal(box, onClose);                      // Escape closes it, wherever the focus is
//   useModal(box, onClose, { ownKeys: true });   // its fields answer Escape themselves (an inline editor, a list); the
//                                                // dialog's own onKeyDown closes it, this only when the focus is outside

const open: HTMLElement[] = [];

/** A dialog is open: the keys are its own, not the page's behind it. */
export const modalOpen = () => open.length > 0;

const FOCUSABLE = 'a[href], area[href], button, input:not([type="hidden"]), select, textarea, iframe, [tabindex], [contenteditable="true"], [contenteditable=""]';

function focusables(box: HTMLElement): HTMLElement[] {
  return [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.tabIndex >= 0 && !(el as HTMLButtonElement).disabled && !el.closest('[inert]') && (el.checkVisibility?.() ?? true),
  );
}

export function useModal(ref: RefObject<HTMLElement | null>, onClose: () => void, { active = true, ownKeys = false }: { active?: boolean; ownKeys?: boolean } = {}) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  // a layout effect: the focus is read before the dialog's own effects move it inside
  useLayoutEffect(() => {
    const box = ref.current;
    if (!active || !box) return;
    const before = document.activeElement instanceof HTMLElement && !box.contains(document.activeElement) ? document.activeElement : null;
    open.push(box);

    const onKey = (event: KeyboardEvent) => {
      if (open[open.length - 1] !== box) return;
      const at = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
      // the focus in a list a field opened (drawn outside the dialog), or on a field whose list is open: theirs
      const inList = at !== null && (!box.contains(at) || at.getAttribute('aria-expanded') === 'true');

      if (event.key === 'Escape') {
        if (inList || (ownKeys && at !== null)) return;
        event.preventDefault();
        event.stopPropagation();
        close.current();
      } else if (event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey) {
        if (at !== null && !box.contains(at)) return;
        const all = focusables(box);
        if (!all.length) {
          event.preventDefault();
          return;
        }
        const first = all[0];
        const last = all[all.length - 1];
        const wrap = at === null || at === box ? (event.shiftKey ? last : first) : !event.shiftKey && at === last ? first : event.shiftKey && at === first ? last : null;
        if (wrap) {
          event.preventDefault();
          wrap.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);

    return () => {
      window.removeEventListener('keydown', onKey, true);
      open.splice(open.indexOf(box), 1);
      const now = document.activeElement;
      if (before?.isConnected && (!now || now === document.body || box.contains(now))) before.focus({ preventScroll: true });
    };
  }, [ref, active, ownKeys]);
}
