"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  ChevronsUpDown,
  Menu,
} from "lucide-react";

import { setActiveEntityAction } from "@/app/(app)/entity-actions";
import { signOutAction } from "@/app/login/actions";
import { EntityLogo } from "@/components/entities/entity-logo";
import { useI18n } from "@/components/layout/i18n-provider";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { GlobalSearch } from "@/components/layout/global-search";
import { useEntity } from "@/hooks/use-entity";
import { roleLabels } from "@/lib/auth/permissions";
import { getEntityCopy } from "@/lib/entities/config";
import { siteConfig } from "@/lib/site";
import { useUser } from "@/hooks/use-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type AppHeaderProps = {
  onOpenMobileSidebar: () => void;
};

export function AppHeader({ onOpenMobileSidebar }: AppHeaderProps) {
  const [entityDialogOpen, setEntityDialogOpen] = useState(false);
  const [signOutDialogOpen, setSignOutDialogOpen] = useState(false);
  const [pendingEntityCode, setPendingEntityCode] = useState<string | null>(null);
  const [entityActionError, setEntityActionError] = useState<string>("");
  const [entityActionWarning, setEntityActionWarning] = useState<string>("");
  const syncRepairEntityCodeRef = useRef<string | null>(null);
  const [isSwitchingEntity, startSwitchingEntity] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const { profile } = useUser();
  const { locale, t } = useI18n();
  const { activeEntity, activeEntityCode, availableEntities } = useEntity();
  const canSwitchEntities = Boolean(profile?.is_super_admin && availableEntities.length > 1);
  const initials =
    profile?.full_name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || siteConfig.user.initials;
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

  return (
    <header className="sticky top-0 z-20 w-full border-b border-border bg-background/96 backdrop-blur supports-[backdrop-filter]:bg-background/88">
      <div className="flex w-full min-w-0 items-center gap-1.5 px-3 py-2.5 sm:gap-2 sm:px-5 lg:px-6">
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 border border-border bg-card lg:hidden"
          onClick={onOpenMobileSidebar}
          aria-label="Open navigation"
        >
          <Menu className="size-4" />
        </Button>

        <div className="min-w-0 flex-1">
          <GlobalSearch />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <LanguageSwitcher />

          <NotificationBell />

          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-9 shrink-0 border border-border bg-card px-2">
                <Avatar className="size-7.5">
                  {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} alt={profile.full_name ?? siteConfig.user.name} /> : null}
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <span className="hidden max-w-[10rem] text-left xl:block">
                  <span className="block truncate text-[13px] font-medium">
                    {profile?.full_name ?? siteConfig.user.name}
                  </span>
                </span>
                <ChevronsUpDown className="hidden size-4 text-muted-foreground md:block" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-[130] w-64">
              <DropdownMenuLabel>
                <div className="space-y-1">
                  <p className="font-medium">{profile?.full_name ?? siteConfig.user.name}</p>
                  <p className="text-xs font-normal text-muted-foreground">
                    {profile ? roleLabels[profile.role] : siteConfig.user.role}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings/profile">{t("common.actions.profile", "Profile")}</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {activeEntity ? (
                <>
                  <div className="px-2 py-1.5">
                    <p className="px-2 text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                      {locale === "fr" ? "Entité active" : "Active entity"}
                    </p>
                    <button
                      type="button"
                      className="mt-2 flex w-full items-start gap-3 rounded-2xl border border-border bg-muted/30 px-3 py-3 text-left transition-colors hover:bg-muted/60 disabled:cursor-default disabled:hover:bg-muted/30"
                      onClick={() => canSwitchEntities && setEntityDialogOpen(true)}
                      disabled={!canSwitchEntities}
                    >
                      <EntityLogo entity={activeEntity} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold break-words">{activeEntity.name}</p>
                          <Badge variant="secondary" className="rounded-full px-2.5 py-0.5">
                            {locale === "fr" ? "Active" : "Active"}
                          </Badge>
                        </div>
                        {displayEntityError ? (
                          <p className="mt-2 text-xs text-red-600 dark:text-red-300">{displayEntityError}</p>
                        ) : displayEntityWarning ? (
                          <p className="mt-2 text-xs text-amber-600 dark:text-amber-300">{displayEntityWarning}</p>
                        ) : null}
                      </div>
                      {canSwitchEntities ? <ChevronsUpDown className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : null}
                    </button>
                  </div>
                  <DropdownMenuSeparator />
                </>
              ) : null}
              <DropdownMenuItem onSelect={() => setSignOutDialogOpen(true)}>
                {t("common.actions.signOut", "Sign out")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Dialog open={signOutDialogOpen} onOpenChange={setSignOutDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("common.actions.signOut", "Sign out")}</DialogTitle>
            <DialogDescription>
              {t(
                "common.confirmations.signOut",
                "Are you sure you want to sign out? Your current session will end immediately.",
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="ghost" type="button" onClick={() => setSignOutDialogOpen(false)}>
              {t("common.actions.cancel", "Cancel")}
            </Button>
            <form action={signOutAction}>
              <Button type="submit" variant="primary">
                {t("common.actions.confirmSignOut", "Yes, sign out")}
              </Button>
            </form>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={entityDialogOpen} onOpenChange={setEntityDialogOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {locale === "fr" ? "Changer l'entité active" : "Change active entity"}
            </DialogTitle>
          <DialogDescription>
            {locale === "fr"
              ? "Cette action met à jour votre profil super admin et l'entité affichée dans toute l'application."
              : "This updates your super admin profile and the entity shown across the application."}
          </DialogDescription>
        </DialogHeader>

          {displayEntityError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-400/20 dark:bg-red-500/12 dark:text-red-100">
              {displayEntityError}
            </div>
          ) : displayEntityWarning ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-400/20 dark:bg-amber-500/12 dark:text-amber-100">
              {displayEntityWarning}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            {availableEntities.map((entity) => (
              <div key={entity.code}>
                <button
                  type="button"
                  onClick={() => handleEntitySwitch(entity.code)}
                  className="flex w-full items-start gap-4 rounded-2xl border border-border bg-card px-4 py-4 text-left transition-colors hover:bg-muted disabled:cursor-default disabled:bg-muted/40"
                  disabled={entity.code === activeEntityCode || isSwitchingEntity}
                >
                  <EntityLogo entity={entity} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold break-words">{entity.name}</p>
                      {entity.code === activeEntityCode ? (
                        <Badge variant="secondary" className="rounded-full px-2.5 py-0.5">
                          {locale === "fr" ? "Active" : "Active"}
                        </Badge>
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
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}
