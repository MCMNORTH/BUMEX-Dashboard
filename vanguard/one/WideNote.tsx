import { useScreen } from './screen';
import { useSay } from './say';

// [mobile] On a phone, over the editors made for a large screen (a journal entry, an invoice, the bank reconciliation,
// the tax rules, a board's workflow, the permissions): they still work, sideways (docs/plans/mobile-tablet.md, step 8).
export function WideNote() {
  const { phone } = useScreen();
  const say = useSay();
  if (!phone) return null;
  return <div className="banner info small" role="note">{say('Cet écran est plus confortable sur un ordinateur ou une tablette en paysage.', 'This screen is easier on a computer or a tablet in landscape.')}</div>;
}
