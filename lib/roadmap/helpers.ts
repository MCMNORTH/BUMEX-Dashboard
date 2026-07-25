import type { RoadmapPeriod, RoadmapProjectRecord, RoadmapSummary, RoadmapView } from "@/types/milestone";

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

export function parseRoadmapDate(value?: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return startOfDay(date);
}

export function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function startOfMonth(date: Date) {
  return startOfDay(new Date(date.getFullYear(), date.getMonth(), 1));
}

export function startOfQuarter(date: Date) {
  const quarterMonth = Math.floor(date.getMonth() / 3) * 3;
  return startOfDay(new Date(date.getFullYear(), quarterMonth, 1));
}

export function addMonths(date: Date, count: number) {
  return startOfDay(new Date(date.getFullYear(), date.getMonth() + count, 1));
}

export function addDays(date: Date, count: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return startOfDay(next);
}

export function addQuarters(date: Date, count: number) {
  return addMonths(date, count * 3);
}

export function getRoadmapStart(view: RoadmapView, value?: string) {
  const reference = parseRoadmapDate(value) ?? new Date();
  return view === "quarter" ? startOfQuarter(reference) : startOfMonth(reference);
}

export function shiftRoadmapStart(view: RoadmapView, value: string, offset: number) {
  const current = getRoadmapStart(view, value);
  return formatDateKey(view === "quarter" ? addQuarters(current, offset) : addMonths(current, offset));
}

export function getRoadmapPeriods(view: RoadmapView, start: Date): RoadmapPeriod[] {
  if (view === "quarter") {
    return Array.from({ length: 4 }, (_, index) => {
      const periodStart = addQuarters(start, index);
      const periodEnd = addDays(addQuarters(periodStart, 1), -1);

      return {
        key: `q-${periodStart.getFullYear()}-${index}`,
        label: `Q${Math.floor(periodStart.getMonth() / 3) + 1} ${periodStart.getFullYear()}`,
        start: formatDateKey(periodStart),
        end: formatDateKey(periodEnd),
      };
    });
  }

  return Array.from({ length: 6 }, (_, index) => {
    const periodStart = addMonths(start, index);
    const periodEnd = addDays(addMonths(periodStart, 1), -1);

    return {
      key: `m-${periodStart.getFullYear()}-${periodStart.getMonth() + 1}`,
      label: new Intl.DateTimeFormat("en-US", {
        month: "short",
        year: "numeric",
      }).format(periodStart),
      start: formatDateKey(periodStart),
      end: formatDateKey(periodEnd),
    };
  });
}

export function getRoadmapRange(view: RoadmapView, value?: string) {
  const start = getRoadmapStart(view, value);
  const periods = getRoadmapPeriods(view, start);
  const end = parseRoadmapDate(periods.at(-1)?.end) ?? start;

  return {
    start,
    end,
    periods,
  };
}

export function formatRoadmapDate(value: string | null) {
  const date = parseRoadmapDate(value);

  if (!date) {
    return "Not scheduled";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function calculateMilestoneCompletion(project: RoadmapProjectRecord) {
  if (!project.totalMilestones) {
    return 0;
  }

  const completed = project.milestones.filter((milestone) => milestone.status === "completed").length;
  return Math.round((completed / project.totalMilestones) * 100);
}

export function getRoadmapSummary(projects: RoadmapProjectRecord[]): RoadmapSummary {
  const milestones = projects.flatMap((project) => project.milestones);

  return {
    visibleProjects: projects.length,
    openMilestones: milestones.filter((milestone) => milestone.status !== "completed" && milestone.status !== "cancelled").length,
    completedMilestones: milestones.filter((milestone) => milestone.status === "completed").length,
    delayedMilestones: milestones.filter((milestone) => milestone.status === "delayed").length,
  };
}

export function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}

export function getLaneWindow(project: RoadmapProjectRecord, rangeStart: Date, rangeEnd: Date) {
  const milestoneDates = project.milestones
    .map((milestone) => parseRoadmapDate(milestone.due_date))
    .filter((value): value is Date => Boolean(value))
    .sort((left, right) => left.getTime() - right.getTime());

  const computedStart = parseRoadmapDate(project.start_date) ?? milestoneDates[0] ?? rangeStart;
  const computedEnd = parseRoadmapDate(project.end_date) ?? milestoneDates.at(-1) ?? computedStart;

  return {
    start: computedStart < rangeStart ? rangeStart : computedStart,
    end: computedEnd > rangeEnd ? rangeEnd : computedEnd,
  };
}

export function getRangePercent(date: Date, rangeStart: Date, rangeEnd: Date) {
  const total = rangeEnd.getTime() - rangeStart.getTime();

  if (total <= 0) {
    return 0;
  }

  return clampPercent(((date.getTime() - rangeStart.getTime()) / total) * 100);
}

