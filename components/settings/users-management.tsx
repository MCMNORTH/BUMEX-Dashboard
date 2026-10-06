import { updateSettingsUserEntityAction, updateSettingsUserRoleAction } from "@/app/(app)/settings/users/actions";
import { availableEntityCodes, bumexEntities } from "@/lib/entities/config";
import { roleLabels } from "@/lib/auth/permissions";
import { getCurrentLocale } from "@/lib/i18n/server";
import { AvailabilityBadge } from "@/components/team/availability-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModernSelect } from "@/components/ui/modern-select";
import type { AppRole } from "@/types/auth";
import type { SettingsUserRecord } from "@/lib/settings/users";

const editableRoleOptions: AppRole[] = ["admin", "manager", "employee"];

const frenchRoleLabels: Record<AppRole, string> = {
  admin: "Administrateur",
  manager: "Manager",
  supervisor: "Superviseur",
  employee: "Collaborateur",
  shareholder: "Actionnaire",
};

const roleBadgeStyles: Record<AppRole, string> = {
  admin: "border-rose-400/30 bg-rose-500/12 text-rose-700 dark:text-rose-100",
  manager: "border-sky-400/30 bg-sky-500/12 text-sky-700 dark:text-sky-100",
  supervisor: "border-violet-400/30 bg-violet-500/12 text-violet-700 dark:text-violet-100",
  employee: "border-emerald-400/30 bg-emerald-500/12 text-emerald-700 dark:text-emerald-100",
  shareholder: "border-amber-400/30 bg-amber-500/12 text-amber-700 dark:text-amber-100",
};

export async function UsersManagement({
  users,
  isSuperAdmin,
  supportsEntityManagement,
  error,
  success,
}: {
  users: SettingsUserRecord[];
  currentUserId: string;
  currentRole: AppRole;
  isSuperAdmin: boolean;
  supportsEntityManagement: boolean;
  error?: string;
  success?: string;
}) {
  const isFr = (await getCurrentLocale()) === "fr";
  const tr = (fr: string, en: string) => (isFr ? fr : en);
  const roleLabel = (role: AppRole) => (isFr ? frenchRoleLabels[role] : roleLabels[role]);
  const dateFormatter = new Intl.DateTimeFormat(isFr ? "fr-FR" : "en-US", { dateStyle: "medium" });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{tr("Utilisateurs", "Users")}</h1>
        <p className="text-sm text-muted-foreground">
          {isSuperAdmin
            ? tr("Modifiez le rôle ou l’entité d’une personne, puis enregistrez la ligne.", "Change a person’s role or entity, then save that row.")
            : tr("Seul un super administrateur peut modifier les rôles et les entités.", "Only a super administrator can change roles and entities.")}
        </p>
      </div>

      {error ? (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      {success ? (
        <div role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          {success}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-soft)]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{tr("Utilisateur", "User")}</th>
                <th className="px-4 py-3 font-medium">{tr("Rôle", "Role")}</th>
                <th className="px-4 py-3 font-medium">{tr("Entité", "Entity")}</th>
                <th className="px-4 py-3 font-medium">{tr("Disponibilité", "Availability")}</th>
                <th className="px-4 py-3 font-medium">{tr("Créé le", "Created")}</th>
              </tr>
            </thead>
            <tbody>
              {users.length ? (
                users.map((user) => (
                  <tr key={user.id} className="border-b border-border/60 last:border-b-0">
                    <td className="px-4 py-3">
                      <p className="font-medium">{user.full_name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      {isSuperAdmin ? (
                        <form action={updateSettingsUserRoleAction} className="flex min-w-[220px] items-center gap-2">
                          <input type="hidden" name="user_id" value={user.id} />
                          <ModernSelect
                            name="role"
                            defaultValue={user.role}
                            className="flex-1"
                            options={editableRoleOptions.map((role) => ({ value: role, label: roleLabel(role) }))}
                          />
                          <Button type="submit" variant="secondary">
                            {tr("Enregistrer", "Save")}
                          </Button>
                        </form>
                      ) : (
                        <Badge variant="outline" className={roleBadgeStyles[user.role]}>
                          {roleLabel(user.role)}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isSuperAdmin && supportsEntityManagement ? (
                        <form action={updateSettingsUserEntityAction} className="flex min-w-[240px] items-center gap-2">
                          <input type="hidden" name="user_id" value={user.id} />
                          <ModernSelect
                            name="entity_code"
                            defaultValue={user.entity_code ?? ""}
                            className="flex-1"
                            options={bumexEntities.filter((entity) => availableEntityCodes.includes(entity.code)).map((entity) => ({
                              value: entity.code,
                              label: entity.name,
                            }))}
                          />
                          <Button type="submit" variant="secondary">
                            {tr("Enregistrer", "Save")}
                          </Button>
                        </form>
                      ) : (
                        <div>
                          <p className="font-medium">{user.entity_name ?? tr("Aucune entité", "No entity")}</p>
                          {user.is_super_admin ? (
                            <p className="text-xs text-muted-foreground">{tr("Super administrateur", "Super administrator")}</p>
                          ) : null}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <AvailabilityBadge status={user.availability_status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{dateFormatter.format(new Date(user.created_at))}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    {tr("Aucun utilisateur.", "No users yet.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
