import Link from "next/link";
import {
  BadgeCheck,
  Building2,
  LockKeyhole,
  Palette,
  ShieldCheck,
  Users2,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type SettingsSectionKey =
  | "profile"
  | "users"
  | "roles"
  | "workspace"
  | "security"
  | "preferences";

type SettingsSectionConfig = {
  key: SettingsSectionKey;
  href: `/settings/${SettingsSectionKey}`;
  title: string;
  description: string;
  eyebrow: string;
  icon: typeof BadgeCheck;
  highlights: [string, string, string];
};

export const settingsSections: SettingsSectionConfig[] = [
  {
    key: "profile",
    href: "/settings/profile",
    title: "Profile",
    description: "Identity, avatar, contact details, and personal workspace presentation.",
    eyebrow: "Personal",
    icon: BadgeCheck,
    highlights: ["Identity details", "Role context", "Profile completeness"],
  },
  {
    key: "users",
    href: "/settings/users",
    title: "Users",
    description: "People directory administration, access inventory, and account coverage.",
    eyebrow: "Administration",
    icon: Users2,
    highlights: ["User list", "Account lifecycle", "Access coverage"],
  },
  {
    key: "roles",
    href: "/settings/roles",
    title: "Roles & Permissions",
    description: "Operational access model, role boundaries, and permission structure.",
    eyebrow: "Access model",
    icon: ShieldCheck,
    highlights: ["Role matrix", "Permission layers", "Governance controls"],
  },
  {
    key: "workspace",
    href: "/settings/workspace",
    title: "Workspace",
    description: "Organization identity, workspace defaults, and internal operating setup.",
    eyebrow: "Workspace",
    icon: Building2,
    highlights: ["Brand details", "Workspace defaults", "Operating context"],
  },
  {
    key: "security",
    href: "/settings/security",
    title: "Security",
    description: "Authentication posture, session hygiene, and internal protection controls.",
    eyebrow: "Protection",
    icon: LockKeyhole,
    highlights: ["Session posture", "Authentication rules", "Audit readiness"],
  },
  {
    key: "preferences",
    href: "/settings/preferences",
    title: "Preferences",
    description: "Interface choices, notification defaults, and personal working preferences.",
    eyebrow: "Preferences",
    icon: Palette,
    highlights: ["UI defaults", "Notification choices", "Personal setup"],
  },
];

function isAdminOnlySection(sectionKey: SettingsSectionKey) {
  return sectionKey === "users" || sectionKey === "roles";
}

function getSection(sectionKey: SettingsSectionKey) {
  const section = settingsSections.find((item) => item.key === sectionKey);

  if (!section) {
    throw new Error(`Unknown settings section: ${sectionKey}`);
  }

  return section;
}

export function SettingsOverviewGrid({ isAdmin }: { isAdmin: boolean }) {
  const visibleSections = settingsSections.filter((section) => (
    isAdmin || !isAdminOnlySection(section.key)
  ));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="A structured control area for people, permissions, workspace defaults, and security posture."
        subtitle="Use this surface to reach the main administrative and personal configuration areas without exposing unfinished backend behavior."
      />

      <div className="grid gap-4 xl:grid-cols-2">
        {visibleSections.map((section) => {
          const Icon = section.icon;

          return (
            <Card key={section.key} className="border-border/70 bg-card/72 backdrop-blur-xl">
              <CardHeader className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-3">
                    <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px] tracking-[0.16em] uppercase">
                      {section.eyebrow}
                    </Badge>
                    <div className="space-y-2">
                      <CardTitle>{section.title}</CardTitle>
                      <CardDescription>{section.description}</CardDescription>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border/65 bg-background/45 p-3">
                    <Icon className="size-5 text-primary" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-3">
                  {section.highlights.map((highlight) => (
                    <div key={highlight} className="rounded-2xl border border-border/65 bg-background/35 px-3 py-3 text-xs text-muted-foreground">
                      {highlight}
                    </div>
                  ))}
                </div>
                <Separator className="bg-border/60" />
                <Button asChild variant="secondary" className="rounded-full px-4">
                  <Link href={section.href}>Open {section.title}</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export function SettingsPlaceholderSection({ sectionKey }: { sectionKey: SettingsSectionKey }) {
  const section = getSection(sectionKey);
  const Icon = section.icon;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={section.eyebrow}
        title={section.title}
        subtitle={section.description}
      />

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
          <CardHeader className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-border/65 bg-background/45 p-3">
                <Icon className="size-5 text-primary" />
              </div>
              <div className="space-y-1">
                <CardTitle>{section.title} module</CardTitle>
                <CardDescription>Premium placeholder shell aligned with the existing enterprise workspace.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {section.highlights.map((highlight) => (
                <div key={highlight} className="rounded-2xl border border-border/65 bg-background/35 p-4">
                  <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Ready area</p>
                  <p className="mt-3 text-sm font-medium">{highlight}</p>
                </div>
              ))}
            </div>

            <div className="rounded-[24px] border border-dashed border-border/70 bg-background/30 p-5">
              <p className="text-sm font-medium">UI foundation staged</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                This section is intentionally limited to structure, spacing, and visual hierarchy so backend rules and forms can be added later without reworking the shell.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base sm:text-lg">Section status</CardTitle>
              <Badge variant="outline" className="rounded-full px-3 py-1">
                UI only
              </Badge>
            </div>
            <CardDescription>Minimal placeholder content, ready for future configuration logic.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-border/65 bg-background/35 p-4">
              <p className="text-sm font-medium">Next implementation lane</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Future work can introduce forms, policy logic, audit context, and data connections without changing the page composition.
              </p>
            </div>
            <Button asChild variant="ghost" className="rounded-full px-4">
              <Link href="/settings">Back to settings</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
