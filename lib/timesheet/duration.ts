// A duration as people type it (asked on 2026-10-28: logging time must be effortless): "2", "1h30", "1 h 30", "1,5",
// "1.5h", "1:30", "90", "90m", "45 min", "30mn". A bare whole number up to 24 is hours (a cell of the week: "2" is two
// hours), above it minutes ("90"). Pure; the timesheet's rules (24 h a day, no future day) stay the server's.

export const MAX_MINUTES = 24 * 60;

/** Minutes, or null when the text is not a duration from 1 minute to 24 hours. */
export function parseDuration(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "").replace(",", ".");
  if (!s) return null;
  let minutes: number | null = null;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{1,2}):([0-5]\d)$/))) minutes = Number(m[1]) * 60 + Number(m[2]);
  else if ((m = s.match(/^(\d+(?:\.\d+)?)h(?:([0-5]?\d)(?:m|min|mn)?)?$/))) minutes = Math.round(Number(m[1]) * 60) + (m[2] ? Number(m[2]) : 0);
  else if ((m = s.match(/^(\d+)(?:m|min|mins|mn|minutes?)$/))) minutes = Number(m[1]);
  else if ((m = s.match(/^\d+\.\d+$/))) minutes = Math.round(Number(s) * 60);
  else if ((m = s.match(/^\d+$/))) minutes = Number(s) <= 24 ? Number(s) * 60 : Number(s);
  return minutes !== null && minutes >= 1 && minutes <= MAX_MINUTES ? minutes : null;
}

/** "1 h 30", "2 h", "45 min". */
export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

/** What a cell shows while it is typed into: "1h30", "2". */
export function editDuration(minutes: number) {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? (h ? `${h}h${String(m).padStart(2, "0")}` : `${m}min`) : String(h);
}
