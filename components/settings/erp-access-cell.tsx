"use client";

import { useActionState, useState } from "react";

import { saveErpAccessAction, type ErpAccessActionState } from "@/app/(app)/settings/users/erp-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ModernSelect } from "@/components/ui/modern-select";
import { bumexEntities, getBumexEntity } from "@/lib/entities/config";
import { erpConsolidationRoles, erpModules, erpRoleLabels, isErpRole, resolveErpModules } from "@/lib/erp/config";
import type { Locale } from "@/lib/i18n/config";
import { erpModuleKeys, erpRoles, type ErpAccessGrant, type ErpRole } from "@/types/erp";

type ErpAccessCellProps = {
  userId: string;
  userName: string;
  grant: ErpAccessGrant | null;
  canManage: boolean;
  locale: Locale;
};

// One cell of Settings → Users: the person's ERP access, and for managers a dialog to change it.
export function ErpAccessCell({ userId, userName, grant, canManage, locale }: ErpAccessCellProps) {
  const [open, setOpen] = useState(false);
  const tr = (fr: string, en: string) => (locale === "fr" ? fr : en);

  const entitiesSummary = !grant
    ? null
    : grant.entityCodes === null
      ? tr("Toutes les entités", "Every entity")
      : grant.entityCodes.length <= 2
        ? grant.entityCodes.map((code) => getBumexEntity(code)?.name ?? code).join(", ")
        : tr(`${grant.entityCodes.length} entités`, `${grant.entityCodes.length} entities`);
  const modulesSummary = !grant
    ? null
    : grant.modules === null
      ? tr("modules du rôle", "role’s modules")
      : tr(`${resolveErpModules(grant.role, grant.modules).length} module(s)`, `${resolveErpModules(grant.role, grant.modules).length} module(s)`);

  return (
    <div className="flex min-w-[240px] items-center justify-between gap-3">
      {grant ? (
        <div className="min-w-0 space-y-1">
          <Badge variant="secondary">{erpRoleLabels[grant.role][locale]}</Badge>
          <p className="truncate text-xs text-muted-foreground">
            {entitiesSummary} · {modulesSummary}
          </p>
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">{tr("Aucun accès", "No access")}</span>
      )}
      {canManage ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="secondary" size="sm">
              {grant ? tr("Modifier", "Edit") : tr("Donner l’accès", "Grant access")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <ErpAccessForm userId={userId} userName={userName} grant={grant} locale={locale} onSaved={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

// Mounted with the dialog, so a new opening starts from the saved access and without the last error.
function ErpAccessForm({
  userId,
  userName,
  grant,
  locale,
  onSaved,
}: Omit<ErpAccessCellProps, "canManage"> & { onSaved: () => void }) {
  const tr = (fr: string, en: string) => (locale === "fr" ? fr : en);
  const [role, setRole] = useState<ErpRole | "none">(grant?.role ?? "none");
  const [entitiesMode, setEntitiesMode] = useState<"all" | "some">(grant?.entityCodes ? "some" : "all");
  const [modulesMode, setModulesMode] = useState<"role" | "some">(grant?.modules ? "some" : "role");
  const [state, formAction, pending] = useActionState(async (previous: ErpAccessActionState, formData: FormData) => {
    const result = await saveErpAccessAction(previous, formData);
    if (result.success) {
      onSaved();
    }
    return result;
  }, {});
  const roleModules = role === "none" ? [] : resolveErpModules(role, null);

  return (
    <form action={formAction} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>
          {tr("Accès ERP", "ERP access")} · {userName}
        </DialogTitle>
        <DialogDescription>
          {tr("Son rôle BUMEX One ne change pas : l’accès ERP s’y ajoute.", "Their BUMEX One role does not change: ERP access comes on top of it.")}
        </DialogDescription>
      </DialogHeader>
      <input type="hidden" name="user_id" value={userId} />

      <label className="grid gap-1.5">
        <span className="text-sm font-medium">{tr("Rôle ERP", "ERP role")}</span>
        <ModernSelect
          name="erp_role"
          value={role}
          onValueChange={(value) => setRole(isErpRole(value) ? value : "none")}
          options={[
            { value: "none", label: tr("Aucun accès ERP", "No ERP access") },
            ...erpRoles.map((value) => ({ value, label: erpRoleLabels[value][locale] })),
          ]}
        />
      </label>

      {role === "none" ? (
        grant ? (
          <p className="text-sm text-muted-foreground">
            {tr("Enregistrer retire l’accès ERP de cette personne.", "Saving removes this person’s ERP access.")}
          </p>
        ) : null
      ) : (
        <>
          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-sm font-medium">{tr("Entités", "Entities")}</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="entities_mode" value="all" checked={entitiesMode === "all"} onChange={() => setEntitiesMode("all")} className="size-4 accent-[var(--primary)]" />
              {tr("Toutes les entités", "Every entity")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="entities_mode" value="some" checked={entitiesMode === "some"} onChange={() => setEntitiesMode("some")} className="size-4 accent-[var(--primary)]" />
              {tr("Seulement certaines", "Only some")}
            </label>
            {entitiesMode === "some" ? (
              <div className="grid gap-1.5 rounded-lg border border-border p-3 sm:grid-cols-2">
                {bumexEntities.map((entity) => (
                  <label key={entity.code} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="entity_codes"
                      value={entity.code}
                      defaultChecked={grant?.entityCodes?.includes(entity.code) ?? false}
                      className="size-4 accent-[var(--primary)]"
                    />
                    {entity.name}
                  </label>
                ))}
              </div>
            ) : null}
          </fieldset>

          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-sm font-medium">{tr("Modules", "Modules")}</legend>
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" name="modules_mode" value="role" checked={modulesMode === "role"} onChange={() => setModulesMode("role")} className="mt-0.5 size-4 accent-[var(--primary)]" />
              <span>
                {tr("Ceux du rôle", "The role’s modules")}
                <span className="block text-xs text-muted-foreground">
                  {roleModules.length ? roleModules.map((key) => erpModules[key].label[locale]).join(", ") : tr("aucun", "none")}
                </span>
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="modules_mode" value="some" checked={modulesMode === "some"} onChange={() => setModulesMode("some")} className="size-4 accent-[var(--primary)]" />
              {tr("Choisir", "Choose")}
            </label>
            {modulesMode === "some" ? (
              <div className="grid gap-1.5 rounded-lg border border-border p-3 sm:grid-cols-2">
                {erpModuleKeys.map((key) => {
                  const groupOnly = key === "consolidation" && !erpConsolidationRoles.includes(role);
                  return (
                    <label key={key} className="flex items-center gap-2 text-sm" title={groupOnly ? tr("Réservé à l’administrateur, aux associés et au RAF", "Only for the administrator, partners and the finance lead") : undefined}>
                      <input
                        type="checkbox"
                        name="modules"
                        value={key}
                        disabled={groupOnly}
                        defaultChecked={grant?.modules ? grant.modules.includes(key) : roleModules.includes(key)}
                        className="size-4 accent-[var(--primary)]"
                      />
                      <span className={groupOnly ? "text-muted-foreground" : undefined}>{erpModules[key].label[locale]}</span>
                    </label>
                  );
                })}
              </div>
            ) : null}
          </fieldset>
        </>
      )}

      {state.error ? (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? tr("Enregistrement…", "Saving…") : tr("Enregistrer", "Save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
