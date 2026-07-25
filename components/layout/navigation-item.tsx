"use client";

import { memo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cva } from "class-variance-authority";

import type { NavigationItemConfig } from "@/types/navigation";
import { cn } from "@/lib/utils";

const navigationItemVariants = cva(
  "group relative flex w-full items-center gap-2.5 overflow-hidden rounded-[9px] border px-2.5 py-2 text-[13px] transition-[color,background-color,border-color,box-shadow] duration-200",
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
  theme?: "workspace" | "business" | "system";
};

function NavigationItemComponent({
  item,
  active,
  collapsed = false,
  onNavigate,
  theme = "workspace",
}: NavigationItemProps) {
  const Icon = item.icon;
  const router = useRouter();
  const themeClasses = {
    workspace: {
      active: "border-[#0c66e4]/18 bg-[#e9f2ff] text-[#0c66e4] dark:border-[#579dff]/30 dark:bg-[#1c2b41] dark:text-[#9fc5ff]",
      icon: "text-[#0c66e4] dark:text-[#9fc5ff]",
      rail: "bg-[#0c66e4]",
      description: "text-[#0c66e4]/75 dark:text-[#9fc5ff]/80",
    },
    business: {
      active: "border-[#c25100]/18 bg-[#fff3eb] text-[#a54800] dark:border-[#f59e6b]/30 dark:bg-[#3c2617] dark:text-[#ffb689]",
      icon: "text-[#a54800] dark:text-[#ffb689]",
      rail: "bg-[#c25100]",
      description: "text-[#a54800]/75 dark:text-[#ffb689]/80",
    },
    system: {
      active: "border-[#7f56d9]/18 bg-[#f4efff] text-[#6941c6] dark:border-[#a78bfa]/30 dark:bg-[#2f234a] dark:text-[#d0bcff]",
      icon: "text-[#6941c6] dark:text-[#d0bcff]",
      rail: "bg-[#7f56d9]",
      description: "text-[#6941c6]/75 dark:text-[#d0bcff]/80",
    },
  }[theme];

  function prefetchRoute() {
    router.prefetch(item.href);
  }

  function handleNavigate() {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    onNavigate?.(item.href);
  }

  return (
    <Link
      href={item.href}
      prefetch
      onClick={handleNavigate}
      onMouseEnter={prefetchRoute}
      onFocus={prefetchRoute}
      onTouchStart={prefetchRoute}
      className={cn(
        navigationItemVariants({ active: false, collapsed }),
        active && themeClasses.active,
        collapsed
          && cn(
            "mx-auto w-11 rounded-[16px] hover:border-transparent hover:bg-white/72 hover:shadow-[0_12px_24px_rgba(15,23,42,0.08)] dark:hover:bg-white/6",
            active
              && "border-transparent bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(240,247,255,0.96))] shadow-[0_18px_32px_rgba(12,102,228,0.12)] dark:bg-[linear-gradient(180deg,rgba(32,39,52,0.98),rgba(26,32,44,0.98))]",
          ),
      )}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
    >
      <span
        className={cn(
          "relative z-[1] flex size-7 shrink-0 items-center justify-center rounded-[7px] border transition-[color,background-color,transform] duration-200",
          collapsed && "mx-auto size-9 self-center rounded-[12px] border-transparent bg-transparent shadow-none",
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
        <span className="block text-[12.5px] leading-4.5 font-medium tracking-[-0.01em] break-words">{item.label}</span>
        <span
          className={cn(
            "mt-0.5 block text-[10px] leading-4 break-words",
            active ? themeClasses.description : "text-muted-foreground",
          )}
        >
          {item.description}
        </span>
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
        <span className="pointer-events-none absolute left-[calc(100%+0.75rem)] top-1/2 z-[90] hidden -translate-y-1/2 whitespace-nowrap rounded-[9px] border border-border bg-card px-2.5 py-1.5 text-[11px] font-semibold tracking-[-0.01em] text-foreground shadow-[var(--shadow-elevated)] group-hover:flex">
          {item.label}
        </span>
      ) : null}
    </Link>
  );
}

export const NavigationItem = memo(NavigationItemComponent);
