import { BriefcaseBusiness, Mail, PanelsTopLeft, Phone } from "lucide-react";

import { AvailabilityBadge } from "@/components/team/availability-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import type { TeamMemberRecord } from "@/types/team";

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function TeamMemberDetailHeader({ member }: { member: TeamMemberRecord }) {
  return (
    <Card className="surface-highlight overflow-hidden border-border/70 bg-card/72 backdrop-blur-xl">
      <CardContent className="space-y-6 px-6 py-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-4">
            <Avatar className="size-16">
              <AvatarFallback>{getInitials(member.full_name)}</AvatarFallback>
            </Avatar>
            <div className="space-y-3">
              <div>
                <h1 className="text-3xl font-semibold tracking-[-0.05em]">{member.full_name}</h1>
                <p className="mt-2 text-base text-muted-foreground">{member.job_title ?? "Team member"} / {member.department ?? "Operations"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <AvailabilityBadge status={member.availability_status} />
                <div className="rounded-full border border-border/65 bg-background/38 px-3 py-1 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  {member.role}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <ContactLine icon={Mail} label={member.email} />
            <ContactLine icon={Phone} label={member.phone ?? "No phone"} />
            <ContactLine icon={BriefcaseBusiness} label={`${member.active_projects_count} active projects`} />
            <ContactLine icon={PanelsTopLeft} label={`${member.active_tasks_count} active tasks`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ContactLine({ icon: Icon, label }: { icon: typeof Mail; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-border/65 bg-background/38 px-4 py-3 text-sm text-muted-foreground">
      <Icon className="size-4 text-primary" />
      <span>{label}</span>
    </div>
  );
}
