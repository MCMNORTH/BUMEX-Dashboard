// The fiscal years one chooses from (the title bar, Settings, a phone's menu): the floors' years, latest first, and
// always the one chosen, so the field is never blank; none at all (an entity without a fiscal year yet): "Aucun
// exercice", the field off (asked on 2026-11-20: the title bar's field showed nothing).
export function fiscalYearChoices(labels: string[], chosen: string): string[] {
  const all = [...new Set(labels)];
  if (!all.length) return [];
  if (chosen && !all.includes(chosen)) all.push(chosen);
  return all.sort().reverse();
}

export const NO_FISCAL_YEAR: [string, string] = ['Aucun exercice', 'No fiscal year'];
