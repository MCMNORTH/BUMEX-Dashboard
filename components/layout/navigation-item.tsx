"use client";

import { memo } from "react";
import Link from "next/link";
import { cva } from "class-variance-authority";

import type { NavigationItemConfig } from "@/types/navigation";
import { cn } from "@/lib/utils";

const navigationItemVariants = cva(
  "group relative flex w-full items-center gap-2.5 overflow-hidden rounded-lg border px-2.5 py-2 text-sm transition-[color,background-color,border-color,box-shadow] duration-200",
  {
    variants: {
      active: {
        true:
          "border-primary/18 bg-accent text-primary shadow-none dark:border-primary/28 dark:bg-accent dark:text-primary",
        false:
          "border-transparent bg-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground dark:hover:bg-muted",
      },
      collapsed: {
        true: "h-11 items-center justify-center gap-0 border-transparent bg-transparent px-0 py-0 shadow-none",
        false: "",
      },
    },
    defaultVariants: {
      active: false,
      collapsed: false,
    },
  },
);

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
  const themeClasses = {
    active: "border-primary/20 bg-accent text-accent-foreground",
    icon: "text-primary",
    rail: "bg-primary",
  };

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
        navigationItemVariants({ active: false, collapsed }),
        active && themeClasses.active,
        collapsed
          && cn(
            "mx-auto w-11 rounded-lg hover:border-transparent hover:bg-muted",
            active && "border-transparent bg-accent",
          ),
      )}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
    >
      <span
        className={cn(
          "relative z-[1] flex size-7 shrink-0 items-center justify-center rounded-md border transition-[color,background-color,transform] duration-200",
          collapsed && "mx-auto size-9 self-center rounded-lg border-transparent bg-transparent shadow-none",
          active
            ? cn("border-current/10 bg-card dark:bg-card", themeClasses.icon)
            : "border-transparent bg-transparent text-foreground group-hover:border-border group-hover:bg-card dark:group-hover:bg-card",
          collapsed &&
            (active
              ? "border-transparent bg-transparent shadow-none"
              : "border-transparent bg-transparent text-slate-500 shadow-none group-hover:border-transparent group-hover:bg-transparent group-hover:text-slate-900 dark:text-slate-300 dark:group-hover:text-white"),
        )}
        >
        <Icon
          className={cn(
            "size-4",
            collapsed && cn("size-[1.1rem] transition-transform duration-200 group-hover:scale-[1.08]", active && "scale-[1.03]"),
          )}
          strokeWidth={collapsed ? 1.9 : 1.85}
        />
      </span>
      <span
        className={cn(
          "relative z-[1] min-w-0 flex-1 transition-opacity duration-200",
          collapsed && "pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0",
        )}
      >
        <span className="block text-sm leading-5 font-medium break-words">{item.label}</span>
      </span>
      {active ? (
        <>
          <span
          className={cn(
              "absolute inset-y-1.5 left-0 w-1 rounded-r-full",
              themeClasses.rail,
              collapsed && "left-1/2 top-auto bottom-1.5 h-0.5 w-5 -translate-x-1/2 rounded-full",
            )}
          />
        </>
      ) : null}
      {collapsed ? (
        <span className="pointer-events-none absolute left-[calc(100%+0.75rem)] top-1/2 z-[90] hidden -translate-y-1/2 whitespace-nowrap rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-foreground shadow-[var(--shadow-elevated)] group-hover:flex">
          {item.label}
        </span>
      ) : null}
    </Link>
  );
}

export const NavigationItem = memo(NavigationItemComponent);
