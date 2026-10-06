"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BriefcaseBusiness, Blocks, ChevronsUpDown, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import { usePathname } from "next/navigation";

import { EntityLogo } from "@/components/entities/entity-logo";
import { useEntitySwitch } from "@/components/entities/entity-switch-dialog";
import { useI18n } from "@/components/layout/i18n-provider";
import { navigationGroups } from "@/data/navigation";
import { useEntity } from "@/hooks/use-entity";
import { filterNavigationGroupsByRole } from "@/lib/auth/permissions";
import { getBumexEntity } from "@/lib/entities/config";
import { siteConfig } from "@/lib/site";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import { NavigationItem } from "@/components/layout/navigation-item";

type SectionKey = "workspace" | "business" | "system";

const sectionConfig: Record<
  SectionKey,
  {
    title: string;
    shortLabel: string;
    icon: typeof Blocks;
    description: string;
  }
> = {
  workspace: {
    title: "Workspace",
    shortLabel: "Work",
    icon: Blocks,
    description: "Delivery, planning, execution, and team operations.",
  },
  business: {
    title: "Business",
    shortLabel: "Biz",
    icon: BriefcaseBusiness,
    description: "Clients, contracts, documents, finance, and governance.",
  },
  system: {
    title: "System",
    shortLabel: "Sys",
    icon: Settings,
    description: "Configuration, notifications, and platform controls.",
  },
};

type AppSidebarProps = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
};

function matchesNavigationPath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarContent({
  collapsed,
  onToggleCollapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { role } = usePermissions();
  const { t } = useI18n();
  const { activeEntity, activeEntityCode } = useEntity();
  const { canSwitchEntities, openEntitySwitcher } = useEntitySwitch();
  const fallbackEntity = getBumexEntity("bumex_it");
  const [pendingNavigation, setPendingNavigation] = useState<{ href: string; from: string } | null>(null);
  const [entityPulse, setEntityPulse] = useState(false);
  const visibleGroups = useMemo(
    () => (role ? filterNavigationGroupsByRole(navigationGroups, role) : navigationGroups),
    [role],
  );
  const managementItems = role === "admin" || role === "manager"
    ? ["/staffing", "/planning", "/timesheet"].flatMap((href) =>
        visibleGroups.flatMap((group) => group.items.filter((item) => item.href === href)),
      )
    : [];
  const sectionEntries = useMemo(
    () =>
      visibleGroups
        .map((group) => {
          const key = group.title.toLowerCase() as SectionKey;
          return sectionConfig[key] ? { key, group } : null;
        })
        .filter((value): value is { key: SectionKey; group: (typeof visibleGroups)[number] } => Boolean(value)),
    [visibleGroups],
  );
  const detectedSection = useMemo(() => {
    const match = sectionEntries.find(({ group }) =>
      group.items.some((item) => matchesNavigationPath(pathname, item.href)),
    );
    return match?.key ?? sectionEntries[0]?.key ?? "workspace";
  }, [pathname, sectionEntries]);
  const [selectedSection, setSelectedSection] = useState<{ key: SectionKey; pathname: string } | null>(null);
  const activeSection =
    selectedSection && selectedSection.pathname === pathname && sectionEntries.some(({ key }) => key === selectedSection.key)
      ? selectedSection.key
      : detectedSection;
  const currentGroup = sectionEntries.find(({ key }) => key === activeSection)?.group ?? visibleGroups[0];

  const handleNavigate = useCallback(
    (href: string) => {
      setPendingNavigation({ href, from: pathname });
      onNavigate?.();
    },
    [onNavigate, pathname],
  );

  useLayoutEffect(() => {
    if (!scrollRef.current) {
      return;
    }

    scrollRef.current.scrollTop = 0;
    const frame = window.requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => {
    if (!activeEntityCode) {
      return;
    }

    const startTimer = window.setTimeout(() => setEntityPulse(true), 0);
    const stopTimer = window.setTimeout(() => setEntityPulse(false), 700);

    return () => {
      window.clearTimeout(startTimer);
      window.clearTimeout(stopTimer);
    };
  }, [activeEntityCode]);

  return (
    <div className="flex h-full flex-col overflow-x-hidden">
      <div
        className={cn(
          "flex items-center justify-between gap-2.5 border-b border-border px-3 py-3",
          collapsed && "flex-col justify-center gap-3 px-0",
        )}
      >
        <button
          type="button"
          onClick={openEntitySwitcher}
          disabled={!canSwitchEntities}
          title={canSwitchEntities ? t("navigation.switchEntity", "Switch entity") : undefined}
          aria-label={canSwitchEntities ? t("navigation.switchEntity", "Switch entity") : undefined}
          className={cn(
            "flex min-w-0 items-center gap-2.5 rounded-lg p-1 text-left transition-all duration-500 disabled:cursor-default",
            canSwitchEntities && "hover:bg-muted",
            entityPulse && "scale-[1.02] bg-accent",
            collapsed && "flex-col gap-3",
          )}
        >
          {activeEntity || fallbackEntity ? (
            <EntityLogo
              entity={(activeEntity ?? fallbackEntity)!}
              size="md"
              className={cn(
                "shrink-0 transition-transform duration-500",
                entityPulse && "translate-y-[-1px] scale-105",
              )}
            />
          ) : null}
          <div
            className={cn(
              "min-w-0 transition-all duration-500",
              entityPulse && "translate-x-1",
              collapsed && "pointer-events-none h-0 w-0 -translate-y-2 opacity-0",
            )}
          >
            <p className="text-xs font-medium text-muted-foreground">
              {siteConfig.company}
            </p>
            <p
              className={cn(
                "max-w-[10rem] text-sm leading-tight font-semibold text-foreground sm:max-w-none",
                entityPulse && "animate-pulse",
              )}
            >
              {activeEntity?.name ?? siteConfig.name}
            </p>
          </div>
          {canSwitchEntities && !collapsed ? (
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          ) : null}
        </button>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "border border-border bg-card shadow-none hover:bg-muted dark:bg-secondary dark:hover:bg-muted",
            collapsed && "hidden",
          )}
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </Button>
      </div>

      {collapsed ? (
        <div className="flex justify-center border-b border-border px-0 py-2.5">
          <Button
            variant="ghost"
            size="icon"
            className="border border-border bg-card shadow-none hover:bg-muted dark:bg-secondary dark:hover:bg-muted"
            onClick={onToggleCollapsed}
            aria-label="Expand sidebar"
          >
            <PanelLeftOpen className="size-4.5" />
          </Button>
        </div>
      ) : null}

      <div ref={scrollRef} className="sidebar-scrollbar min-h-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto overscroll-contain px-2.5 py-3">
        <div
          className={cn(
            "grid gap-1 rounded-xl border border-border bg-card p-1",
            collapsed ? "grid-cols-1" : "grid-cols-3",
          )}
        >
          {sectionEntries.map(({ key }) => {
            const section = sectionConfig[key];
            const Icon = section.icon;
            const selected = key === activeSection;
            const sectionTitle = t(`navigation.groups.${key}`, section.title);

            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedSection({ key, pathname })}
                className={cn(
                  "group flex min-w-0 items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-left transition-colors duration-200",
                  selected
                    ? "bg-accent text-accent-foreground"
                    : "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
                  collapsed && "px-0",
                )}
                aria-pressed={selected}
                title={sectionTitle}
              >
                {collapsed ? (
                  <Icon className="size-4 shrink-0" strokeWidth={1.9} />
                ) : (
                  <span className="truncate text-xs leading-none font-medium text-current">{sectionTitle}</span>
                )}
              </button>
            );
          })}
        </div>

        {managementItems.length > 0 ? (
          <nav aria-label={t("navigation.management", "Management")} className="shrink-0 border-b border-border pb-3">
            <div className={cn("rounded-xl border border-border bg-card p-2", collapsed && "border-0 bg-transparent p-0")}>
              {!collapsed ? (
                <p className="px-2.5 pb-2 pt-1 text-xs font-medium text-muted-foreground">
                  {t("navigation.management", "Management")}
                </p>
              ) : null}
              <div className="space-y-1">
                {managementItems.map((item) => (
                  <NavigationItem
                    key={item.href}
                    item={{ ...item, label: t(`navigation.items.${item.href.slice(1)}.label`, item.label) }}
                    active={matchesNavigationPath(pathname, item.href)
                      || (pendingNavigation?.href === item.href && pendingNavigation.from === pathname)}
                    collapsed={collapsed}
                    onNavigate={handleNavigate}
                  />
                ))}
              </div>
            </div>
          </nav>
        ) : null}

        {currentGroup ? (
          <div
            className={cn(
              "rounded-xl border border-border bg-card p-2.5",
              collapsed && "border-transparent bg-transparent p-0 shadow-none",
            )}
          >
            <div className={cn("mb-2.5 flex items-start gap-2.5 px-1", collapsed && "justify-center")}>
              <div className={cn("min-w-0", collapsed && "hidden")}>
                <div className="min-w-0">
                  <p className="max-w-full text-xs font-semibold text-foreground break-words">
                    {t(`navigation.groups.${currentGroup.title.toLowerCase()}`, currentGroup.title)}
                  </p>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t(`navigation.groupDescriptions.${activeSection}`, sectionConfig[activeSection].description)}
                </p>
              </div>
            </div>

            <div className={cn("space-y-1", collapsed && "space-y-2")}>
              {currentGroup.items.filter((item) => !managementItems.some((shortcut) => shortcut.href === item.href)).map((item) => {
                const itemKey = item.href.replace("/", "");
                return (
                  <NavigationItem
                    key={item.href}
                    item={{
                      ...item,
                      label: t(`navigation.items.${itemKey}.label`, item.label),
                      description: t(`navigation.items.${itemKey}.description`, item.description),
                    }}
                    active={
                      matchesNavigationPath(pathname, item.href)
                      || (pendingNavigation?.href === item.href && pendingNavigation.from === pathname)
                    }
                    collapsed={collapsed}
                    onNavigate={handleNavigate}
                  />
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function AppSidebar({
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onCloseMobile,
}: AppSidebarProps) {
  return (
    <>
      <aside
        className={cn(
          "surface-aurora fixed inset-y-0 left-0 z-30 hidden h-screen overflow-hidden border-r border-border bg-muted/55 shadow-none dark:bg-card lg:block",
          collapsed ? "w-20" : "w-72",
        )}
      >
        <SidebarContent collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} />
      </aside>

      <div
        className={cn(
          "fixed inset-0 z-50 bg-slate-950/48 transition-opacity duration-200 lg:hidden",
          mobileOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onCloseMobile}
      />
      <aside
        className={cn(
          "surface-aurora fixed inset-y-0 left-0 z-50 h-screen w-[min(92vw,22rem)] overflow-x-hidden border-r border-border bg-muted shadow-[var(--shadow-elevated)] transition-transform duration-200 dark:bg-card lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-[110%]",
        )}
      >
        <SidebarContent
          collapsed={false}
          onToggleCollapsed={onCloseMobile}
          onNavigate={onCloseMobile}
        />
      </aside>
    </>
  );
}
