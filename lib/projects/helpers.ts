import type {
  DeadlineState,
  ProjectHealth,
  ProjectPriority,
  ProjectStatusBreakdown,
  ProjectTaskPreview,
} from "@/types/project";

function isArchivedTask(task: ProjectTaskPreview) {
  return task.status === "archived" || task.status === "cancelled";
}

function isDoneTask(task: ProjectTaskPreview) {
  return task.status === "done";
}

function isOpenTask(task: ProjectTaskPreview) {
  return !isArchivedTask(task) && !isDoneTask(task);
}

export function calculateProjectProgress(tasks: ProjectTaskPreview[]) {
  const activeTasks = tasks.filter((task) => !isArchivedTask(task));

  if (!activeTasks.length) {
    return 0;
  }

  const completedTasks = activeTasks.filter(isDoneTask).length;
  return Math.round((completedTasks / activeTasks.length) * 100);
}

export function getDeadlineState(endDate: string | null): DeadlineState {
  if (!endDate) {
    return "none";
  }

  const today = new Date();
  const deadline = new Date(endDate);

  today.setHours(0, 0, 0, 0);
  deadline.setHours(0, 0, 0, 0);

  const diffDays = Math.ceil((deadline.getTime() - today.getTime()) / 86400000);

  if (diffDays < 0) {
    return "overdue";
  }

  if (diffDays <= 7) {
    return "due-soon";
  }

  return "on-track";
}

export function getProjectStatusBreakdown(tasks: ProjectTaskPreview[]): ProjectStatusBreakdown {
  return tasks.reduce<ProjectStatusBreakdown>(
    (acc, task) => {
      if (task.status === "in_review") {
        acc.review += 1;
      } else if (task.status === "cancelled") {
        acc.archived += 1;
      } else if (task.status in acc) {
        acc[task.status as keyof ProjectStatusBreakdown] += 1;
      }

      return acc;
    },
    {
      backlog: 0,
      todo: 0,
      in_progress: 0,
      review: 0,
      blocked: 0,
      done: 0,
      archived: 0,
    },
  );
}

export function getProjectOverdueTasks(tasks: ProjectTaskPreview[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return tasks.filter((task) => {
    if (!task.due_date || !isOpenTask(task)) {
      return false;
    }

    const due = new Date(task.due_date);
    due.setHours(0, 0, 0, 0);

    return due.getTime() < today.getTime();
  });
}

export function getProjectUpcomingDeadlines(tasks: ProjectTaskPreview[]) {
  return tasks
    .filter((task) => task.due_date && isOpenTask(task))
    .sort((left, right) => {
      if (!left.due_date || !right.due_date) {
        return 0;
      }

      return new Date(left.due_date).getTime() - new Date(right.due_date).getTime();
    })
    .slice(0, 5);
}

export function calculateProjectHealth(
  progress: number,
  endDate: string | null,
  _status: string,
  tasks: ProjectTaskPreview[],
) {
  const deadlineState = getDeadlineState(endDate);
  const scopedTasks = tasks.filter((task) => !isArchivedTask(task));
  const overdueTasks = getProjectOverdueTasks(scopedTasks);
  const blockedTasks = scopedTasks.filter((task) => task.status === "blocked").length;
  const urgentTasks = scopedTasks.filter((task) => task.priority === "critical" || task.priority === "high").length;
  const totalOpenTasks = scopedTasks.filter(isOpenTask).length;

  let health: ProjectHealth = "healthy";

  if (deadlineState === "overdue" && progress < 100) {
    health = "delayed";
  } else if (
    overdueTasks.length >= 2
    || blockedTasks >= 2
    || (totalOpenTasks > 0 && (urgentTasks + blockedTasks) / totalOpenTasks >= 0.4)
  ) {
    health = "at_risk";
  } else if (
    deadlineState === "due-soon"
    && progress < 75
  ) {
    health = "warning";
  }

  return {
    health,
    deadlineState,
  };
}

export function formatCurrency(value: number | null) {
  if (value === null) {
    return "Not set";
  }

  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(value: string | null) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function normalizePriority(priority: ProjectPriority | null): ProjectPriority {
  return priority ?? "medium";
}
