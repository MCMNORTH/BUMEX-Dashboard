"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Building2 } from "lucide-react";

import { setActiveEntityAction } from "@/app/(app)/entity-actions";
import { EntityLogo } from "@/components/entities/entity-logo";
import { useI18n } from "@/components/layout/i18n-provider";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useEntity } from "@/hooks/use-entity";
import { useUser } from "@/hooks/use-user";
import { getEntityCopy } from "@/lib/entities/config";

type EntitySwitchContextValue = {
  canSwitchEntities: boolean;
  openEntitySwitcher: () => void;
  entityError: string;
  entityWarning: string;
};

const EntitySwitchContext = createContext<EntitySwitchContextValue | null>(null);

export function useEntitySwitch() {
  const context = useContext(EntitySwitchContext);

  if (!context) {
    throw new Error("useEntitySwitch must be used within EntitySwitchProvider.");
  }

  return context;
}

export function EntitySwitchProvider({ children }: { children: React.ReactNode }) {
  const [entityDialogOpen, setEntityDialogOpen] = useState(false);
  const [pendingEntityCode, setPendingEntityCode] = useState<string | null>(null);
  const [entityActionError, setEntityActionError] = useState<string>("");
  const [entityActionWarning, setEntityActionWarning] = useState<string>("");
  const syncRepairEntityCodeRef = useRef<string | null>(null);
  const [isSwitchingEntity, startSwitchingEntity] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const { profile } = useUser();
  const { locale } = useI18n();
  const { activeEntity, activeEntityCode, availableEntities } = useEntity();
  const canSwitchEntities = Boolean(profile?.is_super_admin && availableEntities.length > 1);
  const hasSessionEntityOverride = Boolean(
    profile?.is_super_admin
      && activeEntityCode
      && profile.entity_code
      && activeEntityCode !== profile.entity_code,
  );
  const displayEntityError = hasSessionEntityOverride ? "" : entityActionError;
  const displayEntityWarning = hasSessionEntityOverride
    ? (entityActionWarning || (
        locale === "fr"
          ? `L'entité ${activeEntity?.name ?? activeEntityCode} est bien active pour votre session super admin. La synchronisation définitive en base reste en attente.`
          : `${activeEntity?.name ?? activeEntityCode} is active for your super admin session. The final database profile sync is still pending.`
      ))
    : profile?.entity_code && profile.entity_code === activeEntityCode
      ? ""
      : entityActionWarning;

  const handleEntitySwitch = useCallback((entityCode: string, closeDialog = true) => {
    setPendingEntityCode(entityCode);
    setEntityActionError("");
    if (closeDialog) {
      setEntityActionWarning("");
    }
    startSwitchingEntity(async () => {
      const formData = new FormData();
      formData.set("entity_code", entityCode);
      formData.set("redirect_path", pathname);
      try {
        const result = await setActiveEntityAction(formData);
        if (!result.ok) {
          setEntityActionError(result.error);
          return;
        }
        setEntityActionWarning(result.warning ?? "");
        if (closeDialog) {
          setEntityDialogOpen(false);
        }
        router.refresh();
      } catch (error) {
        setEntityActionError(error instanceof Error ? error.message : "The entity could not be updated.");
      } finally {
        setPendingEntityCode(null);
      }
    });
  }, [pathname, router]);

  useEffect(() => {
    if (!hasSessionEntityOverride) {
      syncRepairEntityCodeRef.current = null;
      return;
    }

    if (
      !activeEntityCode
      || isSwitchingEntity
      || pendingEntityCode
      || syncRepairEntityCodeRef.current === activeEntityCode
    ) {
      return;
    }

    syncRepairEntityCodeRef.current = activeEntityCode;
    handleEntitySwitch(activeEntityCode, false);
  }, [
    activeEntityCode,
    handleEntitySwitch,
    hasSessionEntityOverride,
    isSwitchingEntity,
    pendingEntityCode,
  ]);

  const openEntitySwitcher = useCallback(() => {
    if (canSwitchEntities) {
      setEntityDialogOpen(true);
    }
  }, [canSwitchEntities]);

  const value = useMemo<EntitySwitchContextValue>(
    () => ({
      canSwitchEntities,
      openEntitySwitcher,
      entityError: displayEntityError,
      entityWarning: displayEntityWarning,
    }),
    [canSwitchEntities, displayEntityError, displayEntityWarning, openEntitySwitcher],
  );

  return (
    <EntitySwitchContext.Provider value={value}>
      {children}
      <Dialog open={entityDialogOpen} onOpenChange={setEntityDialogOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {locale === "fr" ? "Changer l'entité active" : "Change active entity"}
            </DialogTitle>
            <DialogDescription>
              {locale === "fr"
                ? "Cette action met à jour votre profil super admin et l'entité affichée dans toute l'application."
                : "This updates your super admin profile and the entity shown across application."}
            </DialogDescription>
          </DialogHeader>

          {displayEntityError ? (
            <div className="rounded-lg border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger dark:border-danger/20 dark:bg-danger/12">
              {displayEntityError}
            </div>
          ) : displayEntityWarning ? (
            <div className="rounded-lg border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-warning dark:border-warning/20 dark:bg-warning/12">
              {displayEntityWarning}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            {availableEntities.map((entity) => (
              <button
                key={entity.code}
                type="button"
                onClick={() => handleEntitySwitch(entity.code)}
                className="flex w-full items-start gap-4 rounded-xl border border-border bg-card px-4 py-4 text-left transition-colors hover:bg-muted disabled:cursor-default disabled:bg-muted/40"
                disabled={entity.code === activeEntityCode || isSwitchingEntity}
              >
                <EntityLogo entity={entity} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold break-words">{entity.name}</p>
                    {entity.code === activeEntityCode ? (
                      <Badge variant="secondary">{locale === "fr" ? "Active" : "Active"}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {getEntityCopy(entity, locale).title}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {entity.code === pendingEntityCode && isSwitchingEntity
                      ? locale === "fr"
                        ? "Mise à jour en cours..."
                        : "Updating entity..."
                      : entity.code === activeEntityCode
                        ? locale === "fr"
                          ? "Entité actuellement active."
                          : "Currently active."
                        : locale === "fr"
                          ? "Cliquer pour utiliser cette entité."
                          : "Click to use this entity."}
                  </p>
                </div>
                {entity.code !== activeEntityCode ? (
                  <Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                ) : null}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </EntitySwitchContext.Provider>
  );
}
