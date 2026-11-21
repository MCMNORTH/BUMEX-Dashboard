import { useCallback } from 'react';
import { useStore } from '../store';

// Vanguard's language for the screens of vanguard/one (the delivered screens use i18n.ts): say('français', 'English').
// The same function until the language changes: a screen may depend on it in an effect or a memo without running them
// again at every render (the board's editor reloaded itself and lost its changes, 2026-10-28).
export function useSay() {
  const lang = useStore((s) => s.ui.lang);
  return useCallback((fr: string, en: string) => (lang === 'fr' ? fr : en), [lang]);
}

/** The same outside a component's render (an event's message, a toast, a helper run at that moment): the language at
 *  the moment it is called. In a render, use useSay(), so the screen follows a change of language. */
export const sayNow = (fr: string, en: string) => (useStore.getState().ui.lang === 'fr' ? fr : en);
