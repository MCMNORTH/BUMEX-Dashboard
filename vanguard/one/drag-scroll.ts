import { useEffect, type RefObject } from 'react';

// A board slides under the mouse as under a finger (asked on 2026-11-20: its right side was only reached by the scroll
// bar at its bottom). Pressed in an empty place (a column, between the cards, a column's head) and moved, it follows
// the hand, sideways and, through the page, up and down; let go while moving, it runs on a little. A card is still
// dragged to another column, a field still typed in; a click that ends a slide does nothing. Only where the board is
// wider than its place (the hand shows it, work.css .slidable), and only with a mouse: a finger already slides.

// where a press stays what it was: typing, a card's drag, a link's or a picture's
const KEEP = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [draggable="true"], a[href], img, video';
const SLOP = 5; // px a press moves before it slides
const FRICTION = 0.92; // of the run-on, each frame
const FASTEST = 48; // px a frame the run-on starts at, at most (a hard flick)

// the nearest box around the board that scrolls up and down: the room's sheet, or the page
function pageOf(board: HTMLElement): HTMLElement | null {
  for (let el = board.parentElement; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) return el;
  }
  return null;
}

const wide = (board: HTMLElement) => board.scrollWidth > board.clientWidth + 1;

export function useDragScroll(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const board = ref.current;
    if (!board) return;
    let press: { id: number; x: number; y: number; left: number; top: number; page: HTMLElement | null } | null = null;
    let sliding = false;
    let trail: { t: number; x: number; y: number }[] = [];
    let frame = 0;

    const mark = () => board.classList.toggle('slidable', wide(board));
    const stopRun = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };

    const onDown = (event: PointerEvent) => {
      stopRun();
      if (event.pointerType !== 'mouse' || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      if (!wide(board) || (event.target as Element).closest(KEEP)) return;
      // the board's own scroll bar keeps its thumb
      const box = board.getBoundingClientRect();
      if (event.clientY >= box.top + board.clientTop + board.clientHeight || event.clientX >= box.left + board.clientLeft + board.clientWidth) return;
      const page = pageOf(board);
      press = { id: event.pointerId, x: event.clientX, y: event.clientY, left: board.scrollLeft, top: page?.scrollTop ?? 0, page };
      sliding = false;
      trail = [{ t: event.timeStamp, x: event.clientX, y: event.clientY }];
    };

    const end = (event: PointerEvent) => {
      if (!press || event.pointerId !== press.id) return;
      const { page } = press;
      const slid = sliding;
      press = null;
      sliding = false;
      if (!slid) return;
      board.classList.remove('sliding');
      if (board.hasPointerCapture(event.pointerId)) board.releasePointerCapture(event.pointerId);
      // the click this release makes (on a column's head, a card) is not one
      const swallow = (click: MouseEvent) => {
        click.preventDefault();
        click.stopPropagation();
      };
      window.addEventListener('click', swallow, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
      // let go while moving: it runs on, slower and slower
      const first = trail[0];
      const last = trail[trail.length - 1];
      const span = last.t - first.t;
      if (span <= 0 || event.timeStamp - last.t > 80 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const clamp = (v: number) => Math.max(-FASTEST, Math.min(FASTEST, v));
      let vx = clamp(((last.x - first.x) / span) * 16); // px a frame
      let vy = clamp(((last.y - first.y) / span) * 16);
      const run = () => {
        vx *= FRICTION;
        vy *= FRICTION;
        if (Math.abs(vx) < 0.5 && Math.abs(vy) < 0.5) {
          frame = 0;
          return;
        }
        board.scrollBy({ left: -vx, behavior: 'instant' });
        page?.scrollBy({ top: -vy, behavior: 'instant' });
        frame = requestAnimationFrame(run);
      };
      frame = requestAnimationFrame(run);
    };

    const onMove = (event: PointerEvent) => {
      if (!press || event.pointerId !== press.id) return;
      if (!(event.buttons & 1)) return end(event); // let go outside the window
      const dx = event.clientX - press.x;
      const dy = event.clientY - press.y;
      if (!sliding) {
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
        sliding = true;
        board.setPointerCapture(event.pointerId);
        board.classList.add('sliding');
        window.getSelection()?.removeAllRanges(); // the text the press had started to select
      }
      board.scrollTo({ left: press.left - dx, behavior: 'instant' });
      press.page?.scrollTo({ top: press.top - dy, behavior: 'instant' });
      trail.push({ t: event.timeStamp, x: event.clientX, y: event.clientY });
      if (trail.length > 5) trail.shift();
    };

    const resize = new ResizeObserver(mark);
    resize.observe(board);
    if (board.firstElementChild) resize.observe(board.firstElementChild);
    mark();
    board.addEventListener('pointerenter', mark);
    board.addEventListener('pointerdown', onDown);
    board.addEventListener('pointermove', onMove);
    board.addEventListener('pointerup', end);
    board.addEventListener('pointercancel', end);
    board.addEventListener('wheel', stopRun, { passive: true });
    return () => {
      stopRun();
      resize.disconnect();
      board.removeEventListener('pointerenter', mark);
      board.removeEventListener('pointerdown', onDown);
      board.removeEventListener('pointermove', onMove);
      board.removeEventListener('pointerup', end);
      board.removeEventListener('pointercancel', end);
      board.removeEventListener('wheel', stopRun);
      board.classList.remove('slidable', 'sliding');
    };
  }, [ref]);
}
