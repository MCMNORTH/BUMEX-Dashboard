import { useEffect, useState } from 'react';
import { teamYearAction, type TeamYear } from '@/lib/erp/vanguard/time-actions';
import { addDays } from '@/lib/timesheet/validation';
import { useStore } from '../store';
import { Icon } from '../ui/common';
import { useSay } from './say';

// The "Temps" room's "Calendrier" tab (asked on 2026-11-02): the reviewer's year week by week, month by month. A past
// week where someone sent their timesheet and nobody approved it yet stands out, with who is waiting, so a reviewer
// picks it up; a week clicked opens in the review ("Toute l'entreprise" / "Mon équipe") on that week.

type Week = { week: string; no: number; pending: string[]; approved: number; returned: number };

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
// the Monday of the week holding a day
const mondayOf = (iso: string) => addDays(iso, -((utc(iso).getUTCDay() + 6) % 7));
// ISO week number: the week of its Thursday
function weekNo(monday: string) {
  const thursday = utc(addDays(monday, 3));
  const jan1 = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.floor((thursday.getTime() - jan1) / 86400000 / 7) + 1;
}

/** The year's weeks (each in the month of its Thursday), with the people's sent weeks on them. */
function weeksOf(data: TeamYear): Week[][] {
  const months: Week[][] = Array.from({ length: 12 }, () => []);
  for (let w = mondayOf(`${data.year}-01-01`); w < `${data.year + 1}-01-01`; w = addDays(w, 7)) {
    const thursday = utc(addDays(w, 3));
    if (thursday.getUTCFullYear() !== data.year) continue;
    const rows = data.weeks.filter((x) => x.week === w);
    months[thursday.getUTCMonth()].push({
      week: w,
      no: weekNo(w),
      pending: rows.filter((x) => x.status === 'submitted').map((x) => x.name),
      approved: rows.filter((x) => x.status === 'approved').length,
      returned: rows.filter((x) => x.status === 'returned').length,
    });
  }
  return months;
}

export function TeamCalendar({ onWeek }: { onWeek: (week: string) => void }) {
  const say = useSay();
  const lang = useStore((s) => s.ui.lang);
  const [year, setYear] = useState<number | null>(null);
  const [data, setData] = useState<TeamYear | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    teamYearAction(year).then((d) => live && setData(d)).catch(() => live && setData(null));
    return () => { live = false; };
  }, [year]);

  if (data === undefined) return <span className="muted">{say('Chargement…', 'Loading…')}</span>;
  if (data === null) return <div className="banner warn">{say("Le calendrier des feuilles est réservé à l'administrateur et aux managers.", 'The timesheet calendar is for the administrator and managers.')}</div>;
  const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', { ...o, timeZone: 'UTC' }).format(utc(iso));
  const months = weeksOf(data);
  const late = months.flat().filter((w) => w.pending.length && w.week < data.week);
  const stateOf = (w: Week) =>
    w.pending.length ? (w.week < data.week ? 'late' : 'pending') : w.week > data.week ? 'future' : w.returned ? 'returned' : w.approved ? 'done' : 'empty';

  return (
    <div className="ts ts-cal">
      <div className="ts-cal-head">
        <div className="ts-weeknav">
          <button className="btn sm" onClick={() => setYear(data.year - 1)} aria-label={say('Année précédente', 'Previous year')}><Icon name="chevronLeft" size={14} /></button>
          <h2 aria-live="polite">{data.year}</h2>
          <button className="btn sm" onClick={() => setYear(data.year + 1)} aria-label={say('Année suivante', 'Next year')}><Icon name="chevronRight" size={14} /></button>
          {data.year !== Number(data.today.slice(0, 4)) && <button className="btn sm ghost" onClick={() => setYear(Number(data.today.slice(0, 4)))}>{say('Cette année', 'This year')}</button>}
        </div>
        <div className="ts-cal-legend small">
          <span className="late">{say('Passée, à valider', 'Past, to approve')}</span>
          <span className="pending">{say('En cours, à valider', 'This week, to approve')}</span>
          <span className="returned">{say('Retournée', 'Returned')}</span>
          <span className="done">{say('Validée', 'Approved')}</span>
        </div>
      </div>

      {late.length ? (
        <div className="banner crit ts-cal-late">
          <b>{say(`${late.length} semaine(s) passée(s) attendent une validation`, `${late.length} past week(s) waiting for approval`)}</b>
          <div className="ts-cal-chips">
            {late.map((w) => <button key={w.week} className="btn sm" onClick={() => onWeek(w.week)} title={w.pending.join(', ')}>{say('S', 'W')}{w.no} · {fmt(w.week, { day: 'numeric', month: 'short' })} · {w.pending.length}</button>)}
          </div>
        </div>
      ) : (
        <div className="banner info small">{say(`Aucune semaine passée en attente de validation en ${data.year}.`, `No past week waiting for approval in ${data.year}.`)}</div>
      )}

      <div className="ts-cal-months">
        {months.map((weeks, m) => (
          <section key={m} className="ts-cal-month">
            <h3>{fmt(`${data.year}-${String(m + 1).padStart(2, '0')}-01`, { month: 'long' })}</h3>
            {weeks.map((w) => {
              const st = stateOf(w);
              return (
                <button key={w.week} className={`ts-cal-w ${st} ${w.week === data.week ? 'now' : ''}`} onClick={() => onWeek(w.week)}
                  title={w.pending.length ? `${say('À valider', 'To approve')} : ${w.pending.join(', ')}` : undefined}>
                  <span className="no">{say('S', 'W')}{w.no}</span>
                  <span className="dates">{fmt(w.week, { day: 'numeric', month: 'short' })} – {fmt(addDays(w.week, 6), { day: 'numeric', month: 'short' })}</span>
                  <span className="what">
                    {w.pending.length > 0 && <b>{w.pending.length} {say('à valider', 'to approve')}</b>}
                    {!w.pending.length && w.returned > 0 && <>{w.returned} {say('à corriger', 'returned')}</>}
                    {!w.pending.length && !w.returned && w.approved > 0 && <>✓ {w.approved}</>}
                  </span>
                </button>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}
