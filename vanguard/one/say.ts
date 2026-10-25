import { useStore } from '../store';

// Vanguard's language for the screens of vanguard/one (the delivered screens use i18n.ts): say('français', 'English').
export function useSay() {
  const lang = useStore((s) => s.ui.lang);
  return (fr: string, en: string) => (lang === 'fr' ? fr : en);
}
