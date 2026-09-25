"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BriefcaseBusiness, Blocks, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import { usePathname } from "next/navigation";

import { EntityLogo } from "@/components/entities/entity-logo";
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
    tabClassName: string;
    panelClassName: string;
    accentClassName: string;
  }
> = {
  workspace: {
    title: "Workspace",
    shortLabel: "Work",
    icon: Blocks,
    description: "Delivery, planning, execution, and team operations.",
    tabClassName:
      "border-[#0c66e4]/18 bg-[linear-gradient(135deg,rgba(12,102,228,0.14),rgba(51,132,255,0.04))] text-[#0c66e4] shadow-[0_10px_24px_rgba(12,102,228,0.16)] dark:border-[#579dff]/26 dark:bg-[linear-gradient(135deg,rgba(87,157,255,0.2),rgba(87,157,255,0.08))] dark:text-[#9fc5ff]",
    panelClassName:
      "border-[#0c66e4]/12 bg-[radial-gradient(circle_at_top_left,rgba(12,102,228,0.08),transparent_56%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,250,255,0.98))] dark:border-[#579dff]/20 dark:bg-[radial-gradient(circle_at_top_left,rgba(87,157,255,0.14),transparent_54%),linear-gradient(180deg,rgba(29,33,43,0.98),rgba(29,33,43,0.98))]",
    accentClassName: "bg-[#0c66e4]",
  },
  business: {
    title: "Business",
    shortLabel: "Biz",
    icon: BriefcaseBusiness,
    description: "Clients, contracts, documents, finance, and governance.",
    tabClassName:
      "border-[#c25100]/18 bg-[linear-gradient(135deg,rgba(194,81,0,0.13),rgba(255,183,77,0.05))] text-[#a54800] shadow-[0_10px_24px_rgba(194,81,0,0.14)] dark:border-[#ffb689]/24 dark:bg-[linear-gradient(135deg,rgba(255,182,137,0.16),rgba(255,182,137,0.06))] dark:text-[#ffb689]",
    panelClassName:
      "border-[#c25100]/12 bg-[radial-gradient(circle_at_top_left,rgba(194,81,0,0.08),transparent_56%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,250,246,0.98))] dark:border-[#ffb689]/16 dark:bg-[radial-gradient(circle_at_top_left,rgba(255,182,137,0.12),transparent_54%),linear-gradient(180deg,rgba(29,33,43,0.98),rgba(29,33,43,0.98))]",
    accentClassName: "bg-[#c25100]",
  },
  system: {
    title: "System",
    shortLabel: "Sys",
    icon: Settings,
    description: "Configuration, notifications, and platform controls.",
    tabClassName:
      "border-[#7f56d9]/18 bg-[linear-gradient(135deg,rgba(127,86,217,0.12),rgba(185,128,255,0.05))] text-[#6941c6] shadow-[0_10px_24px_rgba(127,86,217,0.14)] dark:border-[#d0bcff]/20 dark:bg-[linear-gradient(135deg,rgba(208,188,255,0.16),rgba(208,188,255,0.06))] dark:text-[#d0bcff]",
    panelClassName:
      "border-[#7f56d9]/12 bg-[radial-gradient(circle_at_top_left,rgba(127,86,217,0.08),transparent_56%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(251,248,255,0.98))] dark:border-[#d0bcff]/16 dark:bg-[radial-gradient(circle_at_top_left,rgba(208,188,255,0.12),transparent_54%),linear-gradient(180deg,rgba(29,33,43,0.98),rgba(29,33,43,0.98))]",
    accentClassName: "bg-[#7f56d9]",
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
  const currentSection = sectionConfig[activeSection];
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
        <div
          className={cn(
            "flex min-w-0 items-center gap-2.5 rounded-2xl transition-all duration-500",
            entityPulse && "scale-[1.02] bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.14),transparent_70%)] shadow-[0_14px_34px_rgba(59,130,246,0.14)]",
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
            <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              {siteConfig.company}
            </p>
            <p
              className={cn(
                "max-w-[10rem] text-[0.95rem] leading-[1.15] font-semibold tracking-[-0.02em] text-foreground sm:max-w-none",
                entityPulse && "animate-pulse",
              )}
            >
              {activeEntity?.name ?? siteConfig.name}
            </p>
          </div>
        </div>
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
            "grid gap-1.5 rounded-[15px] border border-border/80 bg-card/90 p-1.5 shadow-[var(--shadow-soft)]",
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
                  "group flex min-w-0 items-center justify-center gap-1 rounded-[10px] border border-transparent px-1 py-1.5 text-left transition-[border-color,background-color,box-shadow,transform,color] duration-200",
                  selected
                    ? section.tabClassName
                    : "bg-transparent text-muted-foreground hover:border-border hover:bg-muted/85 hover:text-foreground",
                  collapsed && "px-0",
                )}
                aria-pressed={selected}
                title={sectionTitle}
              >
                <Icon className="size-3.5 shrink-0" strokeWidth={1.9} />
                <span className={cn("text-[9px] leading-none font-semibold text-current", collapsed && "hidden")}>
                  {collapsed ? section.shortLabel : sectionTitle}
                </span>
              </button>
            );
          })}
        </div>

        {managementItems.length > 0 ? (
          <nav aria-label={t("navigation.management", "Management")} className="shrink-0 border-b border-border pb-3">
            <div className={cn("rounded-[15px] border border-primary/15 bg-accent/50 p-2", collapsed && "border-0 bg-transparent p-0")}>
              {!collapsed ? (
                <p className="px-2.5 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
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
              "rounded-[15px] border p-2.5 shadow-[var(--shadow-soft)]",
              currentSection.panelClassName,
              collapsed && "border-transparent bg-transparent p-0 shadow-none",
            )}
          >
            <div className={cn("mb-2.5 flex items-start gap-2.5", collapsed && "justify-center")}>
              <div className={cn("mt-0.5 h-8 w-1.5 rounded-full", currentSection.accentClassName, collapsed && "hidden")} />
              <div className={cn("min-w-0", collapsed && "hidden")}>
                <div className="min-w-0">
                  <p className="max-w-full text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase break-words">
                    {t(`navigation.groups.${currentGroup.title.toLowerCase()}`, currentGroup.title)}
                  </p>
                </div>
                <p className="mt-1 text-[13px] leading-5 font-medium tracking-[-0.02em] text-foreground">
                  {t(`navigation.groupDescriptions.${activeSection}`, currentSection.description)}
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
                    theme={activeSection}
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
          "fixed inset-0 z-50 bg-slate-950/48 transition-opacity duration-200 md:hidden",
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
