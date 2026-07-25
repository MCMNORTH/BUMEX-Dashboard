"use client";

import { useActionState } from "react";
import { SquarePen } from "lucide-react";

import { updateTeamMemberAction, type TeamActionState } from "@/app/(app)/team/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ModernSelect } from "@/components/ui/modern-select";
import { Textarea } from "@/components/ui/textarea";
import type { AppRole } from "@/types/auth";
import type { TeamMemberRecord } from "@/types/team";

const initialState: TeamActionState = {};

export function TeamMemberForm({
  member,
  viewerRole,
  currentUserId,
}: {
  member: TeamMemberRecord;
  viewerRole: AppRole;
  currentUserId: string;
}) {
  const [state, formAction] = useActionState(updateTeamMemberAction, initialState);
  const isSelf = member.id === currentUserId;
  const canManageRole = viewerRole === "admin";
  const canEditSensitive = viewerRole === "admin" || isSelf;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary" className="rounded-full px-5">
          <SquarePen className="size-4" />
          Edit profile
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit team profile</DialogTitle>
          <DialogDescription>
            Maintain internal profile, availability, and workload settings for operational coordination.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="member_id" value={member.id} />

          <div className="space-y-2">
            <label htmlFor="team-full-name" className="text-sm font-medium">Full name</label>
            <Input id="team-full-name" name="full_name" defaultValue={member.full_name} required disabled={!canEditSensitive && !isSelf} />
          </div>

          <div className="space-y-2">
            <label htmlFor="team-avatar-url" className="text-sm font-medium">Avatar URL</label>
            <Input id="team-avatar-url" name="avatar_url" defaultValue={member.avatar_url ?? ""} disabled={!canEditSensitive && !isSelf} />
          </div>

          <div className="space-y-2">
            <label htmlFor="team-job-title" className="text-sm font-medium">Job title</label>
            <Input id="team-job-title" name="job_title" defaultValue={member.job_title ?? ""} />
          </div>

          <div className="space-y-2">
            <label htmlFor="team-department" className="text-sm font-medium">Department</label>
            <Input id="team-department" name="department" defaultValue={member.department ?? ""} />
          </div>

          <div className="space-y-2">
            <label htmlFor="team-role" className="text-sm font-medium">Role</label>
            <ModernSelect
              id="team-role"
              name="role"
              defaultValue={member.role}
              disabled={!canManageRole}
              options={[
                { value: "admin", label: "Admin" },
                { value: "manager", label: "Manager" },
                { value: "supervisor", label: "Supervisor" },
                { value: "employee", label: "Employee" },
                { value: "shareholder", label: "Shareholder" },
              ]}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="team-availability" className="text-sm font-medium">Availability</label>
            <ModernSelect
              id="team-availability"
              name="availability_status"
              defaultValue={member.availability_status}
              options={[
                { value: "available", label: "Available" },
                { value: "busy", label: "Busy" },
                { value: "overloaded", label: "Overloaded" },
                { value: "away", label: "Away" },
                { value: "inactive", label: "Inactive" },
              ]}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="team-capacity" className="text-sm font-medium">Weekly capacity hours</label>
            <Input id="team-capacity" name="weekly_capacity_hours" type="number" min="0" max="80" defaultValue={String(member.weekly_capacity_hours)} required />
          </div>

          <div className="space-y-2">
            <label htmlFor="team-phone" className="text-sm font-medium">Phone</label>
            <Input id="team-phone" name="phone" defaultValue={member.phone ?? ""} disabled={!canEditSensitive && !isSelf} />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <label htmlFor="team-skills" className="text-sm font-medium">Skills</label>
            <Input id="team-skills" name="skills" defaultValue={member.skills.join(", ")} placeholder="React, PostgreSQL, Support operations" />
          </div>

          {state.error ? (
            <div className="sm:col-span-2 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-red-200">
              {state.error}
            </div>
          ) : null}

          <div className="space-y-2 sm:col-span-2">
            <label htmlFor="team-context" className="text-sm font-medium">Profile context</label>
            <Textarea
              id="team-context"
              value={`Email: ${member.email}\nTeams: ${member.teams.map((team) => team.name).join(", ") || "No team assigned"}`}
              readOnly
            />
          </div>

          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" className="rounded-2xl px-5">
              Save changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
