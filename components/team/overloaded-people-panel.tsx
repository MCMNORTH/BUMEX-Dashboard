"use client";

import { CapacityBar } from "@/components/team/capacity-bar";
import { useI18n } from "@/components/layout/i18n-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TeamWorkloadRecord } from "@/types/team";

export function OverloadedPeoplePanel({ members }: { members: TeamWorkloadRecord[] }) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  return (
    <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
      <CardHeader>
        <CardTitle>{isFr ? "Forte utilisation de capacité" : "High capacity usage"}</CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">{isFr ? "Personnes pouvant nécessiter un rééquilibrage selon la charge estimée et les éléments en retard." : "People who may need rebalance based on visible estimated work and overdue items."}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {members.length ? members.map((member) => (
          <div key={member.id} className="rounded-[22px] border border-border/65 bg-background/38 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{member.full_name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{member.overdue_items} overdue / {member.estimated_hours_total.toFixed(1)}h estimated</p>
              </div>
              <p className="text-sm font-semibold">{member.utilization_percentage}%</p>
            </div>
            <div className="mt-3">
              <CapacityBar percentage={Math.min(member.utilization_percentage, 100)} tone="critical" />
            </div>
          </div>
        )) : (
          <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
            {isFr ? "Aucune forte utilisation de capacité n’est actuellement visible." : "No high-capacity usage is currently visible."}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
