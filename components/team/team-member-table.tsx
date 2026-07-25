import Link from "next/link";

import { AvailabilityBadge } from "@/components/team/availability-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { TeamMemberRecord } from "@/types/team";

export function TeamMemberTable({ members }: { members: TeamMemberRecord[] }) {
  return (
    <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
      <CardContent className="px-0 py-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-border/70 bg-background/30 text-left text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              <tr>
                <th className="px-5 py-4">Member</th>
                <th className="px-5 py-4">Role</th>
                <th className="px-5 py-4">Availability</th>
                <th className="px-5 py-4">Teams</th>
                <th className="px-5 py-4">Projects</th>
                <th className="px-5 py-4">Active tasks</th>
                <th className="px-5 py-4">Workload</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id} className="border-b border-border/60 last:border-b-0 hover:bg-background/28">
                  <td className="px-5 py-4">
                    <Link href={`/team/${member.id}`} className="block">
                      <p className="font-medium">{member.full_name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{member.job_title ?? "Team member"} / {member.department ?? "Operations"}</p>
                    </Link>
                  </td>
                  <td className="px-5 py-4 capitalize text-muted-foreground">{member.role}</td>
                  <td className="px-5 py-4"><AvailabilityBadge status={member.availability_status} /></td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-2">
                      {member.teams.length ? member.teams.map((team) => <Badge key={team.id} variant="secondary" className="rounded-full px-3 py-1">{team.name}</Badge>) : <span className="text-muted-foreground">None</span>}
                    </div>
                  </td>
                  <td className="px-5 py-4">{member.active_projects_count}</td>
                  <td className="px-5 py-4">{member.active_tasks_count}</td>
                  <td className="px-5 py-4">
                    <div className="space-y-2">
                      <div className="h-2 w-28 overflow-hidden rounded-full bg-secondary/70">
                        <div className="h-full rounded-full bg-gradient-to-r from-sky-400 via-cyan-300 to-indigo-300" style={{ width: `${member.workload_score}%` }} />
                      </div>
                      <p className="text-xs text-muted-foreground">{member.workload_level} / {member.workload_score}%</p>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
