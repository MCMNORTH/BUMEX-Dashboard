import {
  AlarmClockCheck,
  BriefcaseBusiness,
  CircleDollarSign,
  ClipboardCheck,
  FolderGit2,
  ShieldAlert,
  Siren,
  Tickets,
  TrendingUp,
  UsersRound,
} from "lucide-react";

export const overviewKpis = [
  {
    title: "Active Projects",
    value: "24",
    change: "+12%",
    caption: "4 new launches this month",
    icon: FolderGit2,
    tone: "blue",
    sparkline: [38, 42, 46, 51, 49, 57, 64],
  },
  {
    title: "Open Tickets",
    value: "38",
    change: "-8%",
    caption: "SLA response time improved",
    icon: Tickets,
    tone: "amber",
    sparkline: [62, 58, 56, 49, 46, 41, 38],
  },
  {
    title: "Tasks Completed",
    value: "312",
    change: "+18%",
    caption: "Execution velocity is accelerating",
    icon: ClipboardCheck,
    tone: "emerald",
    sparkline: [110, 132, 148, 176, 204, 244, 312],
  },
  {
    title: "Pending Payments",
    value: "$84K",
    change: "+5%",
    caption: "2 invoices crossing target window",
    icon: CircleDollarSign,
    tone: "violet",
    sparkline: [28, 34, 30, 42, 48, 54, 61],
  },
] as const;

export const weeklyProgress = [
  { day: "Mon", completed: 38, active: 22 },
  { day: "Tue", completed: 46, active: 25 },
  { day: "Wed", completed: 52, active: 21 },
  { day: "Thu", completed: 49, active: 28 },
  { day: "Fri", completed: 64, active: 19 },
  { day: "Sat", completed: 34, active: 13 },
  { day: "Sun", completed: 28, active: 11 },
] as const;

export const workload = [
  { name: "Infrastructure", workload: 74, capacity: 88 },
  { name: "Product", workload: 61, capacity: 84 },
  { name: "Support", workload: 84, capacity: 92 },
  { name: "Security", workload: 56, capacity: 81 },
  { name: "Data", workload: 68, capacity: 87 },
] as const;

export const taskDistribution = [
  { name: "Delivery", value: 42 },
  { name: "Operations", value: 24 },
  { name: "Compliance", value: 18 },
  { name: "Finance", value: 16 },
] as const;

export const projectHealth = [
  { name: "Atlas ERP Rollout", health: 84, status: "Strong", owner: "Infrastructure" },
  { name: "Nimbus Client Portal", health: 72, status: "Watch", owner: "Product" },
  { name: "Orion Security Audit", health: 91, status: "Excellent", owner: "Security" },
  { name: "Vertex Data Hub", health: 63, status: "At risk", owner: "Data" },
] as const;

export const focusToday = [
  {
    icon: TrendingUp,
    label: "Executive pulse",
    title: "Delivery velocity is outperforming the forecast",
    description: "Task completion is tracking 14% above the seven-day benchmark across core teams.",
    tone: "blue",
  },
  {
    icon: UsersRound,
    label: "Team signal",
    title: "Support workload is nearing saturation",
    description: "Triage capacity remains healthy, but the current queue suggests staffing pressure later this week.",
    tone: "amber",
  },
  {
    icon: BriefcaseBusiness,
    label: "Commercial",
    title: "Two enterprise contracts are ready for approval routing",
    description: "Legal comments are resolved and finance sign-off can be triggered when the workspace is connected.",
    tone: "violet",
  },
] as const;

export const activityFeed = [
  {
    title: "Security review cleared for Orion audit",
    description: "Risk controls were validated and the leadership note was published.",
    time: "14 min ago",
    actor: "Security Office",
    tone: "emerald",
  },
  {
    title: "Client escalation received for Nimbus rollout",
    description: "Support and product leads aligned on mitigation and response timing.",
    time: "42 min ago",
    actor: "Client Success",
    tone: "amber",
  },
  {
    title: "Invoice pack generated for April finance cycle",
    description: "Pending payments queue refreshed with two new enterprise items.",
    time: "1 hr ago",
    actor: "Finance Ops",
    tone: "blue",
  },
  {
    title: "Resource update submitted by infrastructure lead",
    description: "Capacity allocation changed for the Atlas migration stream.",
    time: "2 hr ago",
    actor: "PMO",
    tone: "violet",
  },
] as const;

export const atRiskProjects = [
  {
    title: "Vertex Data Hub",
    owner: "Data Platform",
    risk: "Scope expansion is outpacing integration capacity.",
    severity: "High",
    progress: 63,
    icon: ShieldAlert,
  },
  {
    title: "Nimbus Client Portal",
    owner: "Product Delivery",
    risk: "Stakeholder approvals are lagging behind design freeze.",
    severity: "Medium",
    progress: 72,
    icon: Siren,
  },
] as const;

export const upcomingDeadlines = [
  {
    title: "Atlas migration readiness review",
    date: "Tomorrow",
    detail: "Executive checkpoint with infrastructure and finance sponsors.",
    icon: AlarmClockCheck,
  },
  {
    title: "Nimbus client steering memo",
    date: "In 2 days",
    detail: "Status package and revised launch recommendation due.",
    icon: AlarmClockCheck,
  },
  {
    title: "April contract approval window",
    date: "In 5 days",
    detail: "Two enterprise amendments require final confirmation.",
    icon: AlarmClockCheck,
  },
  {
    title: "Security evidence submission",
    date: "In 7 days",
    detail: "Audit artifacts scheduled for delivery to external reviewers.",
    icon: AlarmClockCheck,
  },
] as const;

export const nextSevenDays = [
  { day: "Mon", title: "PMO sync", theme: "Roadmap alignment and blockers" },
  { day: "Tue", title: "Security checkpoint", theme: "Audit evidence and approvals" },
  { day: "Wed", title: "Client steering", theme: "Nimbus escalation follow-up" },
  { day: "Thu", title: "Finance close prep", theme: "Invoice validation and approvals" },
  { day: "Fri", title: "Leadership review", theme: "Board-ready weekly summary" },
  { day: "Sat", title: "Light operations", theme: "Reduced monitoring coverage" },
  { day: "Sun", title: "Planning reset", theme: "Week-ahead sequencing and focus" },
] as const;
