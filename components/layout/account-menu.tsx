"use client";

import { useState } from "react";
import { Bell, Clock, Languages, LogOut, Settings, ShieldCheck, Sun, UserRound } from "lucide-react";

import { signOutAction } from "@/app/login/actions";
import { useNotifications } from "@/hooks/use-notifications";
import { useUser } from "@/hooks/use-user";
import { siteConfig } from "@/lib/site";
import type { Room } from "@/vanguard/i18n";
import { useStore } from "@/vanguard/store";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

// The signed-in person's menu in Vanguard's header: who they are, their own panels (my day, time, notifications,
// account), settings and permissions, the language, sign out. The floor is chosen from the rail (vanguard/ui/Sidebar.tsx).
export function AccountMenu() {
  const [signOutDialogOpen, setSignOutDialogOpen] = useState(false);
  const { profile } = useUser();
  const { unreadCount } = useNotifications(6);
  const loaded = useStore((s) => s.loadedAt > 0);
  const session = useStore((s) => s.state.session);
  const entity = useStore((s) => s.state.entities.find((e) => e.id === s.ui.entityId));
  const { lang, room } = useStore((s) => s.ui);
  const t = useStore((s) => s.t);
  const openRoom = useStore((s) => s.openRoom);
  const setLang = useStore((s) => s.setLang);
  const fr = lang !== "en";
  const say = (french: string, english: string) => (fr ? french : english);
  const name = profile?.full_name ?? session?.actorName ?? siteConfig.user.name;
  const initials =
    name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || siteConfig.user.initials;
  const go = (target: Room, tab: string | null = null) => openRoom(room === target && !tab ? null : target, tab);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-9 shrink-0 gap-2 border border-border bg-card px-1.5 pr-2.5" aria-label={say("Mon profil", "My profile")}>
            <Avatar className="size-7">
              {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} alt={name} /> : null}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <span className="hidden max-w-[9rem] text-left leading-tight lg:block">
              <span className="block truncate text-xs font-medium">{name}</span>
              {loaded ? <span className="block truncate text-[11px] text-muted-foreground">{t(session.role)}</span> : null}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="z-[130] w-72">
          <DropdownMenuLabel className="flex items-center gap-3 py-2">
            <Avatar className="size-10">
              {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} alt={name} /> : null}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium">{name}</p>
              {profile?.email ? <p className="truncate text-xs font-normal text-muted-foreground">{profile.email}</p> : null}
              {loaded ? (
                <p className="truncate text-xs font-normal text-muted-foreground">
                  {t(session.role)}{entity ? ` · ${entity.name}` : ""}
                </p>
              ) : null}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem disabled={!loaded} onSelect={() => go("myday")}>
              <Sun className="size-4 text-muted-foreground" /> {say("Ma journée", "My day")}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!loaded} onSelect={() => go("time")}>
              <Clock className="size-4 text-muted-foreground" /> {say("Mon temps", "My time")}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!loaded} onSelect={() => go("inbox")}>
              <Bell className="size-4 text-muted-foreground" /> {say("Notifications", "Notifications")}
              {unreadCount ? <DropdownMenuShortcut className="rounded-full bg-primary px-1.5 text-[10px] font-semibold tracking-normal text-primary-foreground">{unreadCount > 99 ? "99+" : unreadCount}</DropdownMenuShortcut> : null}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!loaded} onSelect={() => go("settings", "account")}>
              <UserRound className="size-4 text-muted-foreground" /> {say("Mon compte", "My account")}
              <DropdownMenuShortcut className="normal-case tracking-normal">{say("profil, mot de passe", "profile, password")}</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem disabled={!loaded} onSelect={() => go("settings", "general")}>
              <Settings className="size-4 text-muted-foreground" /> {say("Paramètres", "Settings")}
            </DropdownMenuItem>
            {loaded && session.managesAccess ? (
              <DropdownMenuItem onSelect={() => go("settings", "access")}>
                <ShieldCheck className="size-4 text-muted-foreground" /> {say("Permissions", "Permissions")}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={(event) => { event.preventDefault(); setLang(fr ? "en" : "fr"); }}>
              <Languages className="size-4 text-muted-foreground" /> {say("Langue", "Language")}
              <DropdownMenuShortcut className="normal-case tracking-normal">{fr ? "Français → English" : "English → Français"}</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setSignOutDialogOpen(true)}>
            <LogOut className="size-4 text-muted-foreground" /> {say("Se déconnecter", "Sign out")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={signOutDialogOpen} onOpenChange={setSignOutDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{say("Se déconnecter", "Sign out")}</DialogTitle>
            <DialogDescription>
              {say("Voulez-vous vraiment vous déconnecter ? Votre session prendra fin immédiatement.", "Are you sure you want to sign out? Your session will end immediately.")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="ghost" type="button" onClick={() => setSignOutDialogOpen(false)}>
              {say("Annuler", "Cancel")}
            </Button>
            <form action={signOutAction}>
              <Button type="submit" variant="primary">
                {say("Oui, me déconnecter", "Yes, sign out")}
              </Button>
            </form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
