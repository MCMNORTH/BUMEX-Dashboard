"use client";

import { useActionState } from "react";
import { SquarePen } from "lucide-react";

import { updateTeamMemberAction, type TeamActionState } from "@/app/(app)/team/actions";
import { useI18n } from "@/components/layout/i18n-provider";
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
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const isSelf = member.id === currentUserId;
  const canManageRole = viewerRole === "admin";
  const canEditSensitive = viewerRole === "admin" || isSelf;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary" className="rounded-full px-5">
          <SquarePen className="size-4" />
          {isFr ? "Modifier le profil" : "Edit profile"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isFr ? "Modifier le profil collaborateur" : "Edit team profile"}</DialogTitle>
          <DialogDescription>
            {isFr ? "Mettez à jour le profil, la disponibilité et la capacité hebdomadaire pour faciliter la coordination." : "Maintain internal profile, availability, and workload settings for operational coordination."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="member_id" value={member.id} />

          <div className="space-y-2">
            <label htmlFor="team-full-name" className="text-sm font-medium">{isFr ? "Nom complet" : "Full name"}</label>
            <Input id="team-full-name" name="full_name" defaultValue={member.full_name} required disabled={!canEditSensitive && !isSelf} />
          </div>

          <div className="space-y-2">
            <label htmlFor="team-avatar-url" className="text-sm font-medium">{isFr ? "URL de la photo" : "Avatar URL"}</label>
            <Input id="team-avatar-url" name="avatar_url" defaultValue={member.avatar_url ?? ""} disabled={!canEditSensitive && !isSelf} />
          </div>

          <div className="space-y-2">
            <label htmlFor="team-job-title" className="text-sm font-medium">{isFr ? "Poste" : "Job title"}</label>
            <Input id="team-job-title" name="job_title" defaultValue={member.job_title ?? ""} />
          </div>

          <div className="space-y-2">
            <label htmlFor="team-department" className="text-sm font-medium">{isFr ? "Département" : "Department"}</label>
            <Input id="team-department" name="department" defaultValue={member.department ?? ""} />
          </div>

          <div className="space-y-2">
            <label htmlFor="team-role" className="text-sm font-medium">{isFr ? "Rôle" : "Role"}</label>
            <ModernSelect
              id="team-role"
              name="role"
              defaultValue={member.role}
              disabled={!canManageRole}
              options={[
                { value: "admin", label: "Admin" },
                { value: "manager", label: "Manager" },
                { value: "supervisor", label: isFr ? "Superviseur" : "Supervisor" },
                { value: "employee", label: isFr ? "Employé" : "Employee" },
                { value: "shareholder", label: isFr ? "Actionnaire" : "Shareholder" },
              ]}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="team-availability" className="text-sm font-medium">{isFr ? "Disponibilité" : "Availability"}</label>
            <ModernSelect
              id="team-availability"
              name="availability_status"
              defaultValue={member.availability_status}
              options={[
                { value: "available", label: isFr ? "Disponible" : "Available" },
                { value: "busy", label: isFr ? "Occupé" : "Busy" },
                { value: "overloaded", label: isFr ? "Surchargé" : "Overloaded" },
                { value: "away", label: isFr ? "Absent" : "Away" },
                { value: "inactive", label: isFr ? "Inactif" : "Inactive" },
              ]}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="team-capacity" className="text-sm font-medium">{isFr ? "Capacité hebdomadaire en heures" : "Weekly capacity hours"}</label>
            <Input id="team-capacity" name="weekly_capacity_hours" type="number" min="0" max="80" defaultValue={String(member.weekly_capacity_hours)} required />
          </div>

          <div className="space-y-2">
            <label htmlFor="team-phone" className="text-sm font-medium">{isFr ? "Téléphone" : "Phone"}</label>
            <Input id="team-phone" name="phone" defaultValue={member.phone ?? ""} disabled={!canEditSensitive && !isSelf} />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <label htmlFor="team-skills" className="text-sm font-medium">{isFr ? "Compétences" : "Skills"}</label>
            <Input id="team-skills" name="skills" defaultValue={member.skills.join(", ")} placeholder="React, PostgreSQL, Support operations" />
          </div>

          {state.error ? (
            <div className="sm:col-span-2 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-red-200">
              {state.error}
            </div>
          ) : null}

          <div className="space-y-2 sm:col-span-2">
            <label htmlFor="team-context" className="text-sm font-medium">{isFr ? "Contexte du profil" : "Profile context"}</label>
            <Textarea
              id="team-context"
              value={`Email: ${member.email}\n${isFr ? "Équipes" : "Teams"}: ${member.teams.map((team) => team.name).join(", ") || (isFr ? "Aucune équipe affectée" : "No team assigned")}`}
              readOnly
            />
          </div>

          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" className="rounded-2xl px-5">
              {isFr ? "Enregistrer les modifications" : "Save changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
