"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useI18n } from "@/components/layout/i18n-provider";
import { settingsSections } from "@/components/settings/settings-sections";
import { navigationGroups } from "@/data/navigation";
import { useVanguardFrame } from "@/components/vanguard/frame";
import { usePermissions } from "@/hooks/use-permissions";
import type { NavigationItemConfig } from "@/types/navigation";

// "Travail": the pages of BUMEX One that have no room in Vanguard yet, in one entry of Vanguard's rail. The others
// (overview, projects, tickets, clients, planning, team, activity…) moved into Vanguard's rooms and redirect there
// (lib/erp/vanguard/retired.ts). A page leaves this menu when it moves too.
const GROUPS: { title: [string, string]; hrefs: string[] }[] = [
  { title: ["Travail", "Work"], hrefs: ["/my-work", "/timesheet", "/calendar", "/roadmap", "/notifications"] },
  { title: ["Affaires", "Business"], hrefs: ["/contracts", "/documents", "/finance"] },
];
const ACCOUNT = ["profile", "preferences", "security", "users"];
// destinations of their own: no back button on them (vanguard-shell.tsx)
export const workMenuPaths = [...GROUPS.flatMap((group) => group.hrefs), ...ACCOUNT.map((key) => `/settings/${key}`)];

type Entry = { href: string; label: string; icon: NavigationItemConfig["icon"] };

export function WorkMenu({ icon }: { icon: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { role } = usePermissions();
  const { t, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const pageOpen = useVanguardFrame((s) => s.pageOpen);
  const say = (fr: string, en: string) => (locale === "fr" ? fr : en);

  const groups = useMemo(() => {
    if (!role) return [];
    const items = new Map(navigationGroups.flatMap((group) => group.items).map((item) => [item.href as string, item]));
    const work = GROUPS.map(({ title, hrefs }) => ({
      title,
      entries: hrefs.flatMap((href): Entry[] => {
        const item = items.get(href);
        if (!item || !item.allowedRoles.includes(role)) return [];
        const label = t(`navigation.items.${href.slice(1)}.label`, item.label);
        return [{ href, label: href === "/finance" ? `${label} · ${locale === "fr" ? "archives" : "archive"}` : label, icon: item.icon }];
      }),
    }));
    const account = settingsSections
      .filter((section) => ACCOUNT.includes(section.key) && (role === "admin" || !section.adminOnly))
      .map((section): Entry => ({ href: section.href, label: section.title[locale], icon: section.icon }));
    return [...work, { title: ["Mon compte", "My account"] as [string, string], entries: account }].filter((group) => group.entries.length);
  }, [role, t, locale]);

  useEffect(() => {
    if (!open) return;
    // Escape closes this menu first, before Vanguard's own Escape (close the room, back to the tower)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  const label = say("Travail", "Work");
  return (
    <>
      <button className={`sb-item ${open || pageOpen ? "on" : ""}`} onClick={() => setOpen(!open)} aria-label={label} aria-haspopup="menu" aria-expanded={open}>
        {icon}
        <span className="lbl">{label}</span>
        <span className="tip">{say("Travail · feuilles de temps, calendrier, contrats…", "Work · timesheets, calendar, contracts…")}</span>
      </button>
      {open ? (
        <>
          <div className="flyout-back" onClick={() => setOpen(false)} />
          {/* opaque, unlike Vanguard's floor menu: it is taller and covers the floor list */}
          <div className="flyout" role="menu" aria-label={label} style={{ top: "auto", bottom: 10, maxHeight: "calc(100vh - 120px)", overflowY: "auto", background: "rgba(19, 28, 50, .97)" }}>
            {groups.map((group) => (
              <div key={group.title[1]}>
                <h2>{say(...group.title)}</h2>
                {group.entries.map((entry) => {
                  const Icon = entry.icon;
                  return (
                    <button
                      key={entry.href}
                      role="menuitem"
                      className={pathname === entry.href || pathname.startsWith(`${entry.href}/`) ? "cur" : undefined}
                      onClick={() => {
                        setOpen(false);
                        router.push(entry.href);
                      }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Icon size={16} />
                        {entry.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}
