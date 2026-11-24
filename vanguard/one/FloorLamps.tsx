import { fmt, type FloorSignals } from '@bumex/domain';
import { Lamp } from '../ui/common';
import { useSay } from './say';

// [bumex-one] A floor's four lamps (the floor list, the building's panel, the group report), each saying on hover what
// it measures, where the floor stands and when it turns orange or red (asked on 2026-11-24). The rules are the
// engine's (lib/erp/engine/signals.ts floorSignals).
export function FloorLamps({ f }: { f: FloorSignals }) {
  const say = useSay();
  const cur = f.entity.functionalCurrency;
  const lamps = [
    {
      kind: f.cashSignal, letter: 'T',
      title: say(
        `T · Trésorerie : ${fmt(f.cash, 0)} ${cur}\nVert à partir du seuil de ${fmt(f.entity.cashThreshold, 0)} ${cur}, orange à partir de 70 % du seuil, rouge en dessous`,
        `T · Treasury: ${fmt(f.cash, 0)} ${cur}\nGreen from the threshold of ${fmt(f.entity.cashThreshold, 0)} ${cur}, orange from 70 % of it, red below`,
      ),
    },
    {
      kind: f.overdueSignal, letter: say('C', 'R'),
      title: say(
        `C · Créances échues : ${f.overdueCount} facture(s), ${fmt(f.overdue, 0)} ${cur}${f.over90Count ? `, dont ${f.over90Count} à plus de 90 jours` : ''}\nVert : aucune · orange : jusqu'à 5 · rouge : plus de 5, ou une à plus de 90 jours`,
        `R · Overdue receivables: ${f.overdueCount} invoice(s), ${fmt(f.overdue, 0)} ${cur}${f.over90Count ? `, ${f.over90Count} over 90 days` : ''}\nGreen: none · orange: up to 5 · red: more than 5, or one over 90 days`,
      ),
    },
    {
      kind: f.engagementSignal, letter: say('M', 'E'),
      title: say(
        `M · Missions en retard : ${f.lateEngagements} sur ${f.engagements} en cours (échéance passée)\nVert : aucune · orange : 1 à 3 · rouge : plus de 3`,
        `E · Late engagements: ${f.lateEngagements} of ${f.engagements} active (deadline passed)\nGreen: none · orange: 1 to 3 · red: more than 3`,
      ),
    },
    {
      kind: f.draftSignal === 'good' ? ('off' as const) : f.draftSignal, letter: say('É', 'J'),
      title: say(
        `É · Écritures à finir : ${f.drafts} brouillon(s), ${f.unmatchedBank} ligne(s) de relevé à rapprocher\nGris : rien en attente · orange : quelque chose à finir`,
        `J · Journal work to finish: ${f.drafts} draft(s), ${f.unmatchedBank} statement line(s) to reconcile\nGrey: nothing pending · orange: something to finish`,
      ),
    },
  ];
  return <span className="sigs">{lamps.map((l) => <Lamp key={l.letter} kind={l.kind} letter={l.letter} title={l.title} />)}</span>;
}
