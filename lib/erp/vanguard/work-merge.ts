import type { State } from "@/lib/erp/engine";
import type { VanguardWork } from "@/lib/erp/vanguard/load";

/**
 * A state with a change's work put in (lib/erp/vanguard/load.ts loadVanguardWork; vanguard/store.ts hydrateWork): what
 * a whole read would give of its tickets, missions and history. The tickets asked are replaced by those sent (one asked
 * and not sent is gone or archived), new ones added; the missions replaced; the history's new rows put after the others,
 * the rows before its window's start (500 rows) dropped. withMissions false: the tickets only (a change of the books on
 * its way brings the rest).
 */
export function mergeWork<S extends Pick<State, "tasks" | "engagements" | "auditLog">>(state: S, work: VanguardWork, withMissions = true): S {
  const asked = new Set(work.taskIds);
  const sent = new Map(work.tasks.map((t) => [t.id, t]));
  const tasks = state.tasks.flatMap((t) => (asked.has(t.id) ? (sent.has(t.id) ? [sent.get(t.id)!] : []) : [t]));
  const known = new Set(state.tasks.map((t) => t.id));
  for (const t of work.tasks) if (!known.has(t.id)) tasks.push(t);
  if (!withMissions) return { ...state, tasks };
  const kept = state.auditLog.filter((r) => r.logId !== undefined && r.logId >= work.auditFrom);
  return { ...state, tasks, engagements: work.engagements, auditLog: [...kept, ...work.auditLogAdded] };
}
