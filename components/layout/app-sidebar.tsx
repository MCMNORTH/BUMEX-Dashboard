"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BriefcaseBusiness, Blocks, ChevronsUpDown, Landmark, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import { usePathname } from "next/navigation";

import { useEntitySwitch } from "@/components/entities/entity-switch-dialog";
import { useErpAccess } from "@/components/erp/erp-access-provider";
import { useI18n } from "@/components/layout/i18n-provider";
import { useSidebarAppearance } from "@/components/layout/sidebar-appearance-provider";
import { SidebarLogo } from "@/components/layout/sidebar-logo";
import { navigationGroups } from "@/data/navigation";
import { useEntity } from "@/hooks/use-entity";
import { filterNavigationGroupsByRole } from "@/lib/auth/permissions";
import { getBumexEntity } from "@/lib/entities/config";
import type { LogoAppearance } from "@/lib/settings/appearance";
import { siteConfig } from "@/lib/site";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import { NavigationItem } from "@/components/layout/navigation-item";

type SectionKey = "workspace" | "business" | "erp" | "system";

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
  erp: {
    title: "ERP",
    shortLabel: "ERP",
    icon: Landmark,
    description: "Accounting, treasury, payroll and tax.",
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
  logoAppearance,
  onToggleCollapsed,
  onNavigate,
}: {
  collapsed: boolean;
  logoAppearance: LogoAppearance;
  onToggleCollapsed: () => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { role } = usePermissions();
  const erpAccess = useErpAccess();
  const { t } = useI18n();
  const { activeEntity, activeEntityCode } = useEntity();
  const { canSwitchEntities, openEntitySwitcher } = useEntitySwitch();
  const fallbackEntity = getBumexEntity("bumex_it");
  const [pendingNavigation, setPendingNavigation] = useState<{ href: string; from: string } | null>(null);
  const [entityPulse, setEntityPulse] = useState(false);
  const visibleGroups = useMemo(
    () =>
      (role ? filterNavigationGroupsByRole(navigationGroups, role) : navigationGroups).filter(
        // The ERP tab follows the ERP access, not the BUMEX One role.
        (group) => group.title !== "ERP" || erpAccess !== null,
      ),
    [role, erpAccess],
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

  const isActive = (href: string) =>
    matchesNavigationPath(pathname, href) || (pendingNavigation?.href === href && pendingNavigation.from === pathname);
  const groupItems = currentGroup
    ? currentGroup.items.filter((item) => !managementItems.some((shortcut) => shortcut.href === item.href))
    : [];

  return (
    <div className="flex h-full flex-col overflow-x-hidden">
      {/* Same height as the page header (57px) so both bottom borders line up. */}
      <div
        className={cn(
          "flex h-[57px] shrink-0 items-center justify-between gap-2 border-b border-sidebar-border px-3",
          collapsed && "justify-center px-0",
        )}
      >
        <button
          type="button"
          onClick={openEntitySwitcher}
          disabled={!canSwitchEntities}
          title={canSwitchEntities ? t("navigation.switchEntity", "Switch entity") : undefined}
          aria-label={canSwitchEntities ? t("navigation.switchEntity", "Switch entity") : undefined}
          className={cn(
            "flex min-w-0 items-center gap-2.5 rounded-lg p-1 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring disabled:cursor-default",
            canSwitchEntities && "hover:bg-sidebar-hover",
            entityPulse && "bg-sidebar-hover",
          )}
        >
          {activeEntity || fallbackEntity ? (
            <SidebarLogo entity={(activeEntity ?? fallbackEntity)!} appearance={logoAppearance} />
          ) : null}
          {!collapsed ? (
            <div className="min-w-0">
              <p className="text-xs font-medium tracking-wide text-sidebar-muted">{siteConfig.company}</p>
              <p className="truncate text-sm leading-tight font-semibold text-sidebar-foreground">
                {activeEntity?.name ?? siteConfig.name}
              </p>
            </div>
          ) : null}
          {canSwitchEntities && !collapsed ? (
            <ChevronsUpDown className="size-4 shrink-0 text-sidebar-icon" />
          ) : null}
        </button>
        {!collapsed ? (
          <button
            type="button"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-sidebar-icon transition-colors outline-none hover:bg-sidebar-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            onClick={onToggleCollapsed}
            aria-label={t("navigation.collapse", "Collapse sidebar")}
          >
            <PanelLeftClose className="size-4" />
          </button>
        ) : null}
      </div>

      {collapsed ? (
        <div className="flex justify-center border-b border-sidebar-border py-2">
          <button
            type="button"
            className="grid size-10 place-items-center rounded-lg text-sidebar-icon transition-colors outline-none hover:bg-sidebar-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            onClick={onToggleCollapsed}
            aria-label={t("navigation.expand", "Expand sidebar")}
          >
            <PanelLeftOpen className="size-[1.15rem]" />
          </button>
        </div>
      ) : null}

      <div ref={scrollRef} className="sidebar-scrollbar min-h-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-3">
        <div
          className={cn(
            "grid gap-1 rounded-lg border border-sidebar-border bg-sidebar-track p-1",
            collapsed ? "grid-cols-1" : sectionEntries.length > 3 ? "grid-cols-4" : "grid-cols-3",
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
                  "flex min-w-0 items-center justify-center rounded-md px-1 py-1.5 transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                  selected
                    ? "bg-sidebar-tab text-sidebar-active-foreground shadow-[inset_0_0_0_1px_var(--sidebar-border)]"
                    : "text-sidebar-muted hover:text-sidebar-foreground",
                )}
                aria-pressed={selected}
                title={sectionTitle}
              >
                {collapsed ? (
                  <Icon className="size-4 shrink-0" strokeWidth={1.9} />
                ) : (
                  <span className="truncate text-xs leading-none font-medium">{sectionTitle}</span>
                )}
              </button>
            );
          })}
        </div>

        {managementItems.length > 0 ? (
          <nav aria-label={t("navigation.management", "Management")} className="space-y-1 border-b border-sidebar-border pb-4">
            {!collapsed ? (
              <p className="px-3 pb-1 text-xs font-medium tracking-wide text-sidebar-muted uppercase">
                {t("navigation.management", "Management")}
              </p>
            ) : null}
            {managementItems.map((item) => (
              <NavigationItem
                key={item.href}
                item={{ ...item, label: t(`navigation.items.${item.href.slice(1)}.label`, item.label) }}
                active={isActive(item.href)}
                collapsed={collapsed}
                onNavigate={handleNavigate}
              />
            ))}
          </nav>
        ) : null}

        {currentGroup ? (
          <nav aria-label={t(`navigation.groups.${activeSection}`, currentGroup.title)} className="space-y-1">
            {!collapsed ? (
              <p className="px-3 pb-1 text-xs font-medium tracking-wide text-sidebar-muted uppercase">
                {t(`navigation.groups.${activeSection}`, currentGroup.title)}
              </p>
            ) : null}
            {groupItems.map((item) => {
              const itemKey = item.href.replace("/", "");
              return (
                <NavigationItem
                  key={item.href}
                  item={{
                    ...item,
                    label: t(`navigation.items.${itemKey}.label`, item.label),
                    description: t(`navigation.items.${itemKey}.description`, item.description),
                  }}
                  active={isActive(item.href)}
                  collapsed={collapsed}
                  onNavigate={handleNavigate}
                />
              );
            })}
          </nav>
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
  const { appearance } = useSidebarAppearance();

  return (
    <>
      <aside
        data-sidebar-theme={appearance.sidebarTheme}
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden h-screen overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:block",
          collapsed ? "w-20" : "w-72",
        )}
      >
        <SidebarContent
          collapsed={collapsed}
          logoAppearance={appearance.logoAppearance}
          onToggleCollapsed={onToggleCollapsed}
        />
      </aside>

      <div
        className={cn(
          "fixed inset-0 z-50 bg-slate-950/48 transition-opacity duration-200 lg:hidden",
          mobileOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onCloseMobile}
      />
      <aside
        data-sidebar-theme={appearance.sidebarTheme}
        className={cn(
          "fixed inset-y-0 left-0 z-50 h-screen w-[min(92vw,22rem)] overflow-x-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-[var(--shadow-elevated)] transition-transform duration-200 lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-[110%]",
        )}
      >
        <SidebarContent
          collapsed={false}
          logoAppearance={appearance.logoAppearance}
          onToggleCollapsed={onCloseMobile}
          onNavigate={onCloseMobile}
        />
      </aside>
    </>
  );
}
