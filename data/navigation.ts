import {
  Activity,
  BellDot,
  CalendarDays,
  ChartColumnIncreasing,
  Files,
  FolderOpenDot,
  Grid2X2,
  Handshake,
  KanbanSquare,
  LayoutGrid,
  ListTodo,
  Route,
  ScrollText,
  Settings,
  UserRoundPlus,
  Users2,
  WalletMinimal,
} from "lucide-react";

import type {
  AppRouteKey,
  NavigationGroup,
  PlaceholderPageContent,
} from "@/types/navigation";

export const navigationGroups: NavigationGroup[] = [
  {
    title: "Workspace",
    items: [
      {
        href: "/overview",
        label: "Overview",
        icon: LayoutGrid,
        description: "Cross-functional visibility and executive pulse.",
        allowedRoles: ["admin", "manager", "supervisor", "employee", "shareholder"],
      },
      {
        href: "/projects",
        label: "Projects",
        icon: FolderOpenDot,
        description: "Delivery programs, milestones, and ownership.",
        allowedRoles: ["admin", "manager", "supervisor", "employee", "shareholder"],
      },
      {
        href: "/tickets",
        label: "Tickets",
        icon: KanbanSquare,
        description: "Operational issues, incidents, and requests.",
        allowedRoles: ["admin", "manager", "supervisor", "employee", "shareholder"],
      },
      {
        href: "/my-work",
        label: "My Work",
        icon: ListTodo,
        description: "Assigned execution, deadlines, and recent delivery updates.",
        allowedRoles: ["admin", "manager", "supervisor", "employee"],
      },
      {
        href: "/staffing",
        label: "Staffing",
        icon: UserRoundPlus,
        description: "Match people to projects, periods, and capacity needs.",
        allowedRoles: ["admin", "manager"],
      },
      {
        href: "/planning",
        label: "Planning",
        icon: Grid2X2,
        description: "Roadmaps, capacity, and upcoming execution.",
        allowedRoles: ["admin", "manager", "supervisor", "employee", "shareholder"],
      },
      {
        href: "/roadmap",
        label: "Roadmap",
        icon: Route,
        description: "Milestones, delivery phases, and future horizon.",
        allowedRoles: ["admin", "manager", "supervisor", "employee", "shareholder"],
      },
      {
        href: "/calendar",
        label: "Calendar",
        icon: CalendarDays,
        description: "Operational dates, deadlines, and upcoming milestones.",
        allowedRoles: ["admin", "manager", "supervisor", "employee", "shareholder"],
      },
      {
        href: "/team",
        label: "Team",
        icon: Users2,
        description: "People, roles, and team coordination.",
        allowedRoles: ["admin", "manager", "supervisor", "employee", "shareholder"],
      },
      {
        href: "/reports",
        label: "Reports",
        icon: ChartColumnIncreasing,
        description: "Daily, weekly, project, and executive work summaries.",
        allowedRoles: ["admin", "manager", "supervisor", "employee", "shareholder"],
      },
    ],
  },
  {
    title: "Business",
    items: [
      {
        href: "/clients",
        label: "Clients",
        icon: Handshake,
        description: "Customer accounts and delivery relationships.",
        allowedRoles: ["admin", "manager", "shareholder"],
      },
      {
        href: "/contracts",
        label: "Contracts",
        icon: ScrollText,
        description: "Commercial agreements and commitments.",
        allowedRoles: ["admin", "manager", "shareholder"],
      },
      {
        href: "/documents",
        label: "Documents",
        icon: Files,
        description: "Internal assets, files, and controlled records.",
        allowedRoles: ["admin", "manager", "shareholder"],
      },
      {
        href: "/finance",
        label: "Finance",
        icon: WalletMinimal,
        description: "Costs, billing, and financial oversight.",
        allowedRoles: ["admin", "manager", "shareholder"],
      },
    ],
  },
  {
    title: "System",
    items: [
      {
        href: "/settings",
        label: "Settings",
        icon: Settings,
        description: "Application preferences and configuration.",
        allowedRoles: ["admin", "manager", "supervisor", "employee", "shareholder"],
      },
      {
        href: "/notifications",
        label: "Notifications",
        icon: BellDot,
        description: "Mentions, assignments, and operational updates.",
        allowedRoles: ["admin", "manager", "supervisor", "employee", "shareholder"],
      },
      {
        href: "/activity",
        label: "Activity",
        icon: Activity,
        description: "Recent actions, operational trails, and events.",
        allowedRoles: ["admin"],
      },
    ],
  },
] as const;

export const placeholderPages: Record<AppRouteKey, PlaceholderPageContent> = {
  staffing: {
    title: "Staffing",
    subtitle: "Project assignments, capacity and talent matching.",
    eyebrow: "Resource management",
    emptyTitle: "No staffing assignment yet",
    emptyDescription: "Create an assignment to connect a person, a project and a capacity period.",
    placeholderLabel: "Staffing workspace",
  },
  overview: {
    title: "Overview",
    subtitle: "High-level visibility across operations, delivery, and business health.",
    eyebrow: "Command center",
    emptyTitle: "Overview modules will live here",
    emptyDescription:
      "This surface is reserved for KPIs, executive summaries, and the most important operational signals.",
    placeholderLabel: "Dashboard overview",
  },
  projects: {
    title: "Projects",
    subtitle: "A premium workspace for tracking delivery execution, milestones, and timelines.",
    eyebrow: "Execution",
    emptyTitle: "Project intelligence is not connected yet",
    emptyDescription:
      "Use this page later for portfolios, milestones, owners, and delivery health once data modules are introduced.",
    placeholderLabel: "Project portfolio",
  },
  tickets: {
    title: "Tickets",
    subtitle: "Incident and request management space designed for clarity and speed.",
    eyebrow: "Operations",
    emptyTitle: "Ticket streams will appear here",
    emptyDescription:
      "This placeholder is ready for queues, SLAs, incident states, and support workflow visualization.",
    placeholderLabel: "Support operations",
  },
  "my-work": {
    title: "My Work",
    subtitle: "Personal execution view for assigned work, priorities, and upcoming delivery pressure.",
    eyebrow: "Execution focus",
    emptyTitle: "Your assigned work will appear here",
    emptyDescription:
      "This space is reserved for personal queues, due dates, completed work, and work-in-progress visibility.",
    placeholderLabel: "Personal work view",
  },
  planning: {
    title: "Planning",
    subtitle: "Roadmap and resource planning surface for disciplined execution.",
    eyebrow: "Forecasting",
    emptyTitle: "Planning tools are still empty",
    emptyDescription:
      "Future iterations can add roadmap views, resourcing boards, calendars, and delivery forecasts here.",
    placeholderLabel: "Planning horizon",
  },
  roadmap: {
    title: "Roadmap",
    subtitle: "Forward-looking visibility across milestones, delivery windows, and project health.",
    eyebrow: "Milestones",
    emptyTitle: "Roadmap views are ready to be connected",
    emptyDescription:
      "This space is intended for executive timelines, milestone markers, and delivery horizon monitoring.",
    placeholderLabel: "Roadmap timeline",
  },
  calendar: {
    title: "Calendar",
    subtitle: "A central operational calendar for delivery dates, milestones, and upcoming obligations.",
    eyebrow: "Calendar",
    emptyTitle: "Calendar views are ready to be connected",
    emptyDescription:
      "This surface is designed for month, week, and agenda views across tickets, projects, milestones, and business dates.",
    placeholderLabel: "Operational calendar",
  },
  team: {
    title: "Team",
    subtitle: "A structured area for headcount, responsibilities, and internal coordination.",
    eyebrow: "People",
    emptyTitle: "Team insights will be added later",
    emptyDescription:
      "This page is prepared for member directories, org snapshots, staffing indicators, and team rituals.",
    placeholderLabel: "Team structure",
  },
  reports: {
    title: "Reports",
    subtitle: "A deterministic reporting workspace for daily, weekly, and executive work summaries.",
    eyebrow: "Reporting",
    emptyTitle: "Reporting tools are ready to be connected",
    emptyDescription:
      "This surface is intended for internal work summaries, project progress reports, and executive delivery updates.",
    placeholderLabel: "Work reporting",
  },
  notifications: {
    title: "Notifications",
    subtitle: "A focused in-app inbox for assignments, mentions, and operational changes.",
    eyebrow: "Inbox",
    emptyTitle: "Notifications will be collected here",
    emptyDescription:
      "This surface is designed for actionable updates, unread items, and quick links to related work.",
    placeholderLabel: "Notification center",
  },
  clients: {
    title: "Clients",
    subtitle: "Relationship-oriented surface for account visibility and service context.",
    eyebrow: "Accounts",
    emptyTitle: "Client records are not loaded yet",
    emptyDescription:
      "Use this page later for account directories, engagement status, contacts, and service history.",
    placeholderLabel: "Client workspace",
  },
  contracts: {
    title: "Contracts",
    subtitle: "A controlled environment for agreements, renewals, and obligations.",
    eyebrow: "Commercial",
    emptyTitle: "Contract management starts here",
    emptyDescription:
      "This placeholder is ready for agreement summaries, renewal schedules, and document controls.",
    placeholderLabel: "Contract ledger",
  },
  documents: {
    title: "Documents",
    subtitle: "Secure and polished space for internal files, templates, and records.",
    eyebrow: "Knowledge base",
    emptyTitle: "Document library will be introduced later",
    emptyDescription:
      "Future work can add categorized storage, recent files, approvals, and document-level actions.",
    placeholderLabel: "Document repository",
  },
  finance: {
    title: "Finance",
    subtitle: "Calm, executive-grade space for financial monitoring and reporting.",
    eyebrow: "Financials",
    emptyTitle: "Finance modules are still placeholder-only",
    emptyDescription:
      "Reserve this area for budgets, billing status, margin snapshots, and contract-linked revenue views.",
    placeholderLabel: "Finance cockpit",
  },
  activity: {
    title: "Activity",
    subtitle: "System-wide trail of notable work, events, and platform movement.",
    eyebrow: "Timeline",
    emptyTitle: "Activity feeds will populate this page",
    emptyDescription:
      "This section is intended for audit trails, recent actions, operational alerts, and change history.",
    placeholderLabel: "Activity stream",
  },
  shareholders: {
    title: "Shareholders",
    subtitle: "Governance-oriented area for ownership visibility and strategic context.",
    eyebrow: "Governance",
    emptyTitle: "Shareholder information can be staged here",
    emptyDescription:
      "Use this page later for ownership structure, board context, key documents, and strategic notes.",
    placeholderLabel: "Ownership overview",
  },
  settings: {
    title: "Settings",
    subtitle: "Refined configuration surface for workspace preferences and system behavior.",
    eyebrow: "Control panel",
    emptyTitle: "Settings modules have not been enabled",
    emptyDescription:
      "This page is ready for workspace preferences, permissions, notification rules, and UI controls.",
    placeholderLabel: "System preferences",
  },
};
