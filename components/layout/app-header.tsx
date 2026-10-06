"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronsUpDown,
  Menu,
} from "lucide-react";

import { signOutAction } from "@/app/login/actions";
import { EntityLogo } from "@/components/entities/entity-logo";
import { useEntitySwitch } from "@/components/entities/entity-switch-dialog";
import { useI18n } from "@/components/layout/i18n-provider";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { GlobalSearch } from "@/components/layout/global-search";
import { useEntity } from "@/hooks/use-entity";
import { roleLabels } from "@/lib/auth/permissions";
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
  const [signOutDialogOpen, setSignOutDialogOpen] = useState(false);
  const { profile } = useUser();
  const { locale, t } = useI18n();
  const { activeEntity } = useEntity();
  const {
    canSwitchEntities,
    openEntitySwitcher,
    entityError: displayEntityError,
    entityWarning: displayEntityWarning,
  } = useEntitySwitch();
  const initials =
    profile?.full_name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || siteConfig.user.initials;

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
                  <span className="block truncate text-sm font-medium">
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
                    <p className="px-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                      {locale === "fr" ? "Entité active" : "Active entity"}
                    </p>
                    <button
                      type="button"
                      className="mt-2 flex w-full items-start gap-3 rounded-xl border border-border bg-muted/30 px-3 py-3 text-left transition-colors hover:bg-muted/60 disabled:cursor-default disabled:hover:bg-muted/30"
                      onClick={openEntitySwitcher}
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
    </header>
  );
}
