import { useSyncExternalStore } from 'react';

// The screen the app is on (docs/plans/mobile-tablet.md): a phone, a tablet, a PC; and whether it is touched rather
// than pointed at with a mouse. CSS first (vanguard/responsive.css): these are for markup that must differ.
export const PHONE = '(max-width: 640px)';
export const TABLET = '(min-width: 641px) and (max-width: 1024px)';
export const TOUCH = '(hover: none) and (pointer: coarse)';

/** Whether a media query matches (a phone, a screen without hover), following it; false on the server. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** A phone, now (outside React, or for a first value). */
export const isPhone = () => typeof window !== 'undefined' && window.matchMedia(PHONE).matches;
/** A phone or a tablet (by its width or its touch screen): no 3D building there (asked on 2026-10-30). */
export const isPhoneOrTablet = () => typeof window !== 'undefined' && window.matchMedia(`(max-width: 1024px), ${TOUCH}`).matches;
export const isTouch = () => typeof window !== 'undefined' && window.matchMedia(TOUCH).matches;

export function useScreen() {
  return { phone: useMedia(PHONE), tablet: useMedia(TABLET), touch: useMedia(TOUCH) };
}
