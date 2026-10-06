"use client";

import { memo } from "react";
import Link from "next/link";

import type { NavigationItemConfig } from "@/types/navigation";
import { cn } from "@/lib/utils";

type NavigationItemProps = {
  item: NavigationItemConfig;
  active: boolean;
  collapsed?: boolean;
  onNavigate?: (href: string) => void;
};

function NavigationItemComponent({
  item,
  active,
  collapsed = false,
  onNavigate,
}: NavigationItemProps) {
  const Icon = item.icon;

  function handleNavigate() {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    onNavigate?.(item.href);
  }

  return (
    <Link
      href={item.href}
      prefetch={false}
      onClick={handleNavigate}
      className={cn(
        "group relative flex items-center rounded-lg text-sm transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-sidebar-indicator/60 focus-visible:outline-none",
        collapsed ? "mx-auto size-10 justify-center" : "w-full gap-3 px-3 py-2",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-foreground"
          : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground",
      )}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
    >
      {active ? (
        <span
          aria-hidden="true"
          className={cn(
            "absolute rounded-full bg-sidebar-indicator",
            collapsed ? "bottom-1 left-1/2 h-0.5 w-4 -translate-x-1/2" : "inset-y-2 left-0 w-[3px]",
          )}
        />
      ) : null}
      <Icon className={cn("shrink-0", collapsed ? "size-[1.15rem]" : "size-4")} strokeWidth={1.9} />
      {collapsed ? (
        <span className="pointer-events-none absolute left-[calc(100%+0.75rem)] top-1/2 z-[90] hidden -translate-y-1/2 whitespace-nowrap rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs font-semibold text-popover-foreground shadow-[var(--shadow-elevated)] group-hover:flex">
          {item.label}
        </span>
      ) : (
        <span className="min-w-0 flex-1 truncate leading-5">{item.label}</span>
      )}
    </Link>
  );
}

export const NavigationItem = memo(NavigationItemComponent);
