import type { Say } from './ticket-history';

// The Microsoft sign-in's return (app/api/mail/microsoft/callback: /vanguard?room=settings&tab=account&mail=…), said
// by the shell as it opens the tab (components/vanguard/vanguard-shell.tsx; the card is MailIntake.tsx).

/** What the Microsoft sign-in's return (?mail=…, read by the shell) says. */
export function mailOutcomeMessage(outcome: string, say: Say): { kind: 'ok' | 'error'; text: string } | null {
  const messages: Record<string, ['ok' | 'error', string, string]> = {
    connected: ['ok', 'Outlook est connecté : vos nouveaux e-mails deviennent des tickets.', 'Outlook is connected: your new e-mails become tickets.'],
    wrong_account: ['error', 'Connectez-vous avec votre propre boîte BUMEX (celle de votre compte Vanguard).', 'Sign in with your own BUMEX mailbox (your Vanguard account’s).'],
    cancelled: ['error', 'La connexion à Outlook a été annulée.', 'The Outlook sign-in was cancelled.'],
    expired: ['error', 'La connexion a expiré ; recommencez.', 'The sign-in expired; try again.'],
    unavailable: ['error', 'Les e-mails → tickets ne sont pas activés.', 'E-mails to tickets is not enabled.'],
    failed: ['error', 'Outlook n’a pas pu être connecté ; réessayez.', 'Outlook could not be connected; try again.'],
  };
  const m = messages[outcome];
  return m ? { kind: m[0], text: say(m[1], m[2]) } : null;
}
