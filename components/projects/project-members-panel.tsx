"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, X } from "lucide-react";

import { addProjectMemberAction, removeProjectMemberAction } from "@/app/(app)/projects/member-actions";
import { useI18n } from "@/components/layout/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ModernSelect } from "@/components/ui/modern-select";
import { getBumexEntity } from "@/lib/entities/config";
import { buildPeopleOptions, isOutsidePerson, type PickerPerson } from "@/lib/entities/people-options";
import type { BumexEntityCode } from "@/types/entity";
import type { ProjectMember } from "@/types/project";

export function ProjectMembersPanel({
  projectId,
  homeEntityCode,
  members,
  candidates,
  canManage,
}: {
  projectId: string;
  /** The project's entity (its owner's when unset); members from elsewhere get a badge. */
  homeEntityCode: BumexEntityCode | null;
  members: ProjectMember[];
  /** People who may join, from every entity. Only loaded for the project's managers. */
  candidates: PickerPerson[];
  canManage: boolean;
}) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [personId, setPersonId] = useState("");
  const [removing, setRemoving] = useState<ProjectMember | null>(null);
  const [error, setError] = useState("");
  const homeEntity = getBumexEntity(homeEntityCode);
  const options = useMemo(() => buildPeopleOptions(candidates, homeEntityCode, locale), [candidates, homeEntityCode, locale]);

  function run(change: () => Promise<{ ok: true } | { ok: false; error: string }>, done: () => void) {
    setError("");
    startTransition(async () => {
      const result = await change();

      if (!result.ok) {
        setError(result.error);
        return;
      }

      done();
      router.refresh();
    });
  }

  function openAdd(open: boolean) {
    setAddOpen(open);
    setPersonId("");
    setError("");
  }

  return (
    <div className="rounded-xl border border-border/65 bg-background/38 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{isFr ? "Membres" : "Members"}</p>
        {canManage ? (
          <Button type="button" size="sm" variant="secondary" onClick={() => openAdd(true)}>
            <UserPlus />
            {isFr ? "Ajouter un membre" : "Add member"}
          </Button>
        ) : null}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {members.length ? (
          members.map((member) => {
            const outsideEntity = member.user && isOutsidePerson(member.user, homeEntityCode)
              ? getBumexEntity(member.user.entity_code)
              : null;

            return (
              <div key={member.id} className="relative rounded-xl border border-border/65 bg-background/45 p-4">
                <p className="pr-7 text-sm font-medium">{member.user?.full_name ?? "Unknown member"}</p>
                <p className="mt-1 text-xs text-muted-foreground">{member.user?.email ?? "No email"}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline" className="rounded-full px-3 py-1">
                    {member.role}
                  </Badge>
                  {outsideEntity ? (
                    <Badge variant="secondary" className="rounded-full px-3 py-1">
                      {outsideEntity.name}
                    </Badge>
                  ) : null}
                </div>
                {canManage && member.user ? (
                  <button
                    type="button"
                    onClick={() => {
                      setError("");
                      setRemoving(member);
                    }}
                    className="absolute top-3 right-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={isFr ? `Retirer ${member.user.full_name} de l’équipe` : `Remove ${member.user.full_name} from the team`}
                    title={isFr ? "Retirer de l’équipe" : "Remove from the team"}
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </div>
            );
          })
        ) : (
          <div className="sm:col-span-2 rounded-xl border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
            {isFr ? "Aucun membre n’est encore lié." : "No members are linked yet."}
          </div>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={openAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isFr ? "Ajouter un membre" : "Add a team member"}</DialogTitle>
            <DialogDescription>
              {homeEntity
                ? isFr
                  ? `Cherchez par nom, e-mail ou poste. Les personnes de ${homeEntity.name} apparaissent en premier.`
                  : `Search by name, email or job title. People from ${homeEntity.name} are listed first.`
                : isFr
                  ? "Cherchez par nom, e-mail ou poste."
                  : "Search by name, email or job title."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              run(() => addProjectMemberAction(projectId, personId), () => openAdd(false));
            }}
          >
            <ModernSelect
              name="user_id"
              aria-label={isFr ? "Personne" : "Person"}
              searchable
              required
              value={personId}
              onValueChange={setPersonId}
              placeholder={isFr ? "Choisir une personne" : "Choose a person"}
              searchPlaceholder={isFr ? "Nom, e-mail ou poste..." : "Name, email or job title..."}
              options={options}
            />
            {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost" className="rounded-full px-5">
                  {isFr ? "Annuler" : "Cancel"}
                </Button>
              </DialogClose>
              <Button type="submit" className="rounded-full px-5" disabled={isPending || !personId}>
                {isPending ? (isFr ? "Ajout..." : "Adding...") : isFr ? "Ajouter" : "Add"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(removing)} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isFr ? "Retirer de l’équipe ?" : "Remove from the team?"}</DialogTitle>
            <DialogDescription>
              {isFr
                ? `${removing?.user?.full_name ?? "Cette personne"} ne fera plus partie de l’équipe du projet. Ses tickets restent assignés.`
                : `${removing?.user?.full_name ?? "This person"} will no longer be on the project team. Their tickets stay assigned to them.`}
            </DialogDescription>
          </DialogHeader>
          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" className="rounded-full px-5">
                {isFr ? "Annuler" : "Cancel"}
              </Button>
            </DialogClose>
            <Button
              type="button"
              className="rounded-full bg-danger px-5 text-white hover:bg-danger"
              disabled={isPending}
              onClick={() => {
                const userId = removing?.user?.id;
                if (userId) run(() => removeProjectMemberAction(projectId, userId), () => setRemoving(null));
              }}
            >
              {isPending ? (isFr ? "Retrait..." : "Removing...") : isFr ? "Retirer" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
