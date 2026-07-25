import { Crown, ShieldCheck, Users2, WalletCards } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppRole } from "@/types/auth";

type RoleOverview = {
  role: AppRole;
  label: string;
  description: string;
  accessLevel: string;
  canView: string[];
  canManage: string[];
  restrictions: string[];
  icon: typeof Crown;
  badgeClassName: string;
};

const roleOverviews: RoleOverview[] = [
  {
    role: "admin",
    label: "Admin",
    description: "Full operational and configuration control across the platform.",
    accessLevel: "Full platform access",
    canView: ["All modules", "All finance details", "All settings", "All operational records"],
    canManage: ["Users", "Roles", "Finance", "Settings", "All delivery modules"],
    restrictions: ["No functional restrictions in normal workspace scope"],
    icon: Crown,
    badgeClassName: "border-rose-400/30 bg-rose-50 text-rose-700 dark:bg-rose-500/12 dark:text-rose-100",
  },
  {
    role: "manager",
    label: "Manager",
    description: "Operational ownership across assigned delivery, clients, and planning surfaces.",
    accessLevel: "Scoped operational control",
    canView: ["Assigned projects", "Assigned clients", "Tickets and planning", "Limited finance visibility"],
    canManage: ["Assigned projects", "Assigned clients", "Tickets", "Planning coordination"],
    restrictions: ["Cannot manage system-wide settings", "No unrestricted platform administration"],
    icon: ShieldCheck,
    badgeClassName: "border-sky-400/30 bg-sky-50 text-sky-700 dark:bg-sky-500/12 dark:text-sky-100",
  },
  {
    role: "supervisor",
    label: "Supervisor",
    description: "Workspace-wide operational visibility similar to a manager, but without access to business modules.",
    accessLevel: "Workspace entity control",
    canView: ["Workspace modules", "Entity-wide tickets", "Planning", "Projects and team coordination"],
    canManage: ["Projects", "Tickets", "Planning coordination", "Workspace execution follow-up"],
    restrictions: ["No business module access", "No finance access", "No user or role management"],
    icon: ShieldCheck,
    badgeClassName: "border-violet-400/30 bg-violet-50 text-violet-700 dark:bg-violet-500/12 dark:text-violet-100",
  },
  {
    role: "employee",
    label: "Employee",
    description: "Focused execution access centered on assigned work and personal planning.",
    accessLevel: "Execution access",
    canView: ["Assigned work", "Own planning", "Allowed project context", "Allowed comments and notes"],
    canManage: ["Own ticket updates", "Comments on allowed entities", "Personal delivery actions"],
    restrictions: ["No finance access", "No user or role management", "No system settings management"],
    icon: Users2,
    badgeClassName: "border-emerald-400/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/12 dark:text-emerald-100",
  },
  {
    role: "shareholder",
    label: "Shareholder",
    description: "Read-only executive access designed for governance and high-level visibility.",
    accessLevel: "Executive read-only",
    canView: ["Executive dashboard", "High-level projects", "High-level finance summaries", "High-level roadmap"],
    canManage: ["No operational editing", "No internal workflow management"],
    restrictions: ["No internal ticket details", "No sensitive finance details", "No operational settings control"],
    icon: WalletCards,
    badgeClassName: "border-amber-400/30 bg-amber-50 text-amber-700 dark:bg-amber-500/12 dark:text-amber-100",
  },
];

const matrixRows = [
  {
    label: "Dashboard and overview",
    values: {
      admin: "Full",
      manager: "Full",
      supervisor: "Workspace only",
      employee: "Assigned scope",
      shareholder: "Executive only",
    },
  },
  {
    label: "Projects and clients",
    values: {
      admin: "All",
      manager: "Assigned",
      supervisor: "Assigned entity",
      employee: "Allowed scope",
      shareholder: "High-level only",
    },
  },
  {
    label: "Tickets and planning",
    values: {
      admin: "All",
      manager: "Operational control",
      supervisor: "Operational control",
      employee: "Own work",
      shareholder: "Restricted",
    },
  },
  {
    label: "Finance",
    values: {
      admin: "Full",
      manager: "Limited detail",
      supervisor: "No access",
      employee: "No access",
      shareholder: "Summary only",
    },
  },
  {
    label: "Users and roles",
    values: {
      admin: "Manage",
      manager: "View only",
      supervisor: "View only",
      employee: "No access",
      shareholder: "No access",
    },
  },
  {
    label: "Settings and system control",
    values: {
      admin: "Manage",
      manager: "Restricted",
      supervisor: "Restricted",
      employee: "Personal only",
      shareholder: "Restricted",
    },
  },
] as const;

export function RolesOverview() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Roles & Permissions"
        title="A clear access model for operational control, execution scope, and executive visibility."
        subtitle="This page documents the current role structure and expected module boundaries without exposing an advanced permission editor."
      />

      <div className="grid gap-4 xl:grid-cols-2">
        {roleOverviews.map((role) => {
          const Icon = role.icon;

          return (
            <Card key={role.role} className="border-border/70 bg-card/72 backdrop-blur-xl">
              <CardHeader className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-3">
                    <Badge variant="outline" className={`rounded-full px-3 py-1 ${role.badgeClassName}`}>
                      {role.label}
                    </Badge>
                    <div className="space-y-2">
                      <CardTitle>{role.accessLevel}</CardTitle>
                      <CardDescription>{role.description}</CardDescription>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border/65 bg-background/45 p-3">
                    <Icon className="size-5 text-primary" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <RoleList title="Can view" items={role.canView} />
                <RoleList title="Can edit / manage" items={role.canManage} />
                <RoleList title="Restrictions" items={role.restrictions} />
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-[28px] border border-border/70 bg-card/72 shadow-[var(--shadow-soft)] backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border/65 bg-background/35 text-xs uppercase tracking-[0.16em] text-muted-foreground">
              <tr>
                <th className="px-5 py-4 font-medium">Permission area</th>
                <th className="px-5 py-4 font-medium">Admin</th>
                <th className="px-5 py-4 font-medium">Manager</th>
                <th className="px-5 py-4 font-medium">Supervisor</th>
                <th className="px-5 py-4 font-medium">Employee</th>
                <th className="px-5 py-4 font-medium">Shareholder</th>
              </tr>
            </thead>
            <tbody>
              {matrixRows.map((row) => (
                <tr key={row.label} className="border-b border-border/50 last:border-b-0 hover:bg-background/28">
                  <td className="px-5 py-4 font-medium">{row.label}</td>
                  <td className="px-5 py-4 text-muted-foreground">{row.values.admin}</td>
                  <td className="px-5 py-4 text-muted-foreground">{row.values.manager}</td>
                  <td className="px-5 py-4 text-muted-foreground">{row.values.supervisor}</td>
                  <td className="px-5 py-4 text-muted-foreground">{row.values.employee}</td>
                  <td className="px-5 py-4 text-muted-foreground">{row.values.shareholder}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RoleList({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <div className="space-y-3 rounded-[24px] border border-border/65 bg-background/35 p-4">
      <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{title}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <Badge key={item} variant="secondary" className="rounded-full px-3 py-1">
            {item}
          </Badge>
        ))}
      </div>
    </div>
  );
}
