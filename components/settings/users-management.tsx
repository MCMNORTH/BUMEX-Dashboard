import { ShieldCheck, Users2 } from "lucide-react";

import { updateSettingsUserEntityAction, updateSettingsUserRoleAction } from "@/app/(app)/settings/users/actions";
import { availableEntityCodes, bumexEntities } from "@/lib/entities/config";
import { AvailabilityBadge } from "@/components/team/availability-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModernSelect } from "@/components/ui/modern-select";
import type { AppRole } from "@/types/auth";
import type { SettingsUserRecord } from "@/lib/settings/users";

const editableRoleOptions: AppRole[] = ["admin", "manager", "employee"];

const roleBadgeStyles: Record<AppRole, string> = {
  admin: "border-rose-400/30 bg-rose-500/12 text-rose-100",
  manager: "border-sky-400/30 bg-sky-500/12 text-sky-100",
  supervisor: "border-violet-400/30 bg-violet-500/12 text-violet-100",
  employee: "border-emerald-400/30 bg-emerald-500/12 text-emerald-100",
  shareholder: "border-amber-400/30 bg-amber-500/12 text-amber-100",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function RoleBadge({ role }: { role: AppRole }) {
  return (
    <Badge variant="outline" className={`rounded-full px-3 py-1 capitalize ${roleBadgeStyles[role]}`}>
      {role}
    </Badge>
  );
}

export function UsersManagement({
  users,
  currentRole,
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
  const isAdmin = currentRole === "admin";

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-[24px] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[28px] border border-border/70 bg-card/72 shadow-[var(--shadow-soft)] backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border/65 bg-background/35 text-xs uppercase tracking-[0.16em] text-muted-foreground">
              <tr>
                <th className="px-5 py-4 font-medium">User</th>
                <th className="px-5 py-4 font-medium">Role</th>
                <th className="px-5 py-4 font-medium">Entity</th>
                <th className="px-5 py-4 font-medium">Status</th>
                <th className="px-5 py-4 font-medium">Created</th>
                <th className="px-5 py-4 font-medium">Access control</th>
              </tr>
            </thead>
            <tbody>
              {users.length ? (
                users.map((user) => (
                  <tr key={user.id} className="border-b border-border/50 last:border-b-0 hover:bg-background/28">
                    <td className="px-5 py-4">
                      <div className="space-y-1">
                        <p className="font-medium">{user.full_name}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {isSuperAdmin ? (
                        <form action={updateSettingsUserRoleAction} className="flex min-w-[220px] items-center gap-2">
                          <input type="hidden" name="user_id" value={user.id} />
                          <ModernSelect
                            name="role"
                            defaultValue={user.role}
                            className="h-10 flex-1"
                            options={editableRoleOptions.map((role) => ({ value: role, label: role }))}
                          />
                          <Button type="submit" variant="secondary" className="rounded-xl px-4">
                            Save
                          </Button>
                        </form>
                      ) : (
                        <RoleBadge role={user.role} />
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {isSuperAdmin && supportsEntityManagement ? (
                        <form action={updateSettingsUserEntityAction} className="flex min-w-[240px] items-center gap-2">
                          <input type="hidden" name="user_id" value={user.id} />
                          <ModernSelect
                            name="entity_code"
                            defaultValue={user.entity_code ?? ""}
                            className="h-10 flex-1"
                            options={bumexEntities.filter((entity) => availableEntityCodes.includes(entity.code)).map((entity) => ({
                              value: entity.code,
                              label: entity.name,
                            }))}
                          />
                          <Button type="submit" variant="secondary" className="rounded-xl px-4">
                            Save
                          </Button>
                        </form>
                      ) : (
                        <div className="space-y-1">
                          <p className="font-medium">{user.entity_name ?? "No entity"}</p>
                          {isSuperAdmin && !supportsEntityManagement ? (
                            <p className="text-xs text-muted-foreground">Entity editing unavailable in current production schema</p>
                          ) : null}
                          {user.is_super_admin ? (
                            <p className="text-xs text-muted-foreground">Super admin scope</p>
                          ) : null}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <AvailabilityBadge status={user.availability_status} />
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">{formatDate(user.created_at)}</td>
                    <td className="px-5 py-4">
                      {isAdmin ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <ShieldCheck className="size-4 text-primary" />
                          {isSuperAdmin ? "Role and entity editing enabled" : "Read-only administration"}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Users2 className="size-4 text-primary" />
                          Read-only view
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-5 py-12">
                    <div className="rounded-[24px] border border-dashed border-border/70 bg-background/30 p-6 text-center">
                      <p className="text-sm font-medium">No users match the current filters.</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Adjust the search or role filter to broaden the visible directory scope.
                      </p>
                    </div>
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
