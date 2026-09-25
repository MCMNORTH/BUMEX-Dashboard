import type { TimeEntry } from "../../types/timesheet.ts";

export function missionKey(projectId: string, mission: string) {
  return JSON.stringify([projectId, mission.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr")]);
}

export function groupWeeklyEntries(entries: TimeEntry[]) {
  const groups = new Map<string, {
    key: string; projectId: string; projectName: string | null; mission: string;
    minutes: number; days: Map<string, TimeEntry[]>;
  }>();
  for (const entry of entries) {
    const key = missionKey(entry.project_id, entry.mission);
    let group = groups.get(key);
    if (!group) {
      group = { key, projectId: entry.project_id, projectName: entry.project?.name ?? null,
        mission: entry.mission, minutes: 0, days: new Map() };
      groups.set(key, group);
    }
    group.minutes += entry.duration_minutes;
    group.days.set(entry.work_date, [...(group.days.get(entry.work_date) ?? []), entry]);
  }
  return [...groups.values()].sort((a, b) => (a.projectName ?? "").localeCompare(b.projectName ?? "") || a.mission.localeCompare(b.mission));
}
