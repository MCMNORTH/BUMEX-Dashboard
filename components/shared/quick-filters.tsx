import Link from "next/link";

import { formatNumber } from "@/lib/formatters";
import { cn } from "@/lib/utils";

export type QuickFilterItem = {
  key: string;
  label: string;
  count: number;
  href: string;
  active: boolean;
  /** "danger" only colors the chip when its count is above zero, so color always means "something needs action". */
  tone?: "default" | "danger";
};

export function QuickFilters({ label, items }: { label: string; items: QuickFilterItem[] }) {
  return (
    <nav aria-label={label} className="-mx-1 overflow-x-auto px-1 pb-1">
      <ul className="flex min-w-max items-center gap-1.5">
        {items.map((item) => {
          const alert = item.tone === "danger" && item.count > 0;

          return (
            <li key={item.key}>
              <Link
                href={item.href}
                scroll={false}
                aria-current={item.active ? "true" : undefined}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none",
                  item.active
                    ? "border-primary bg-primary text-primary-foreground"
                    : alert
                      ? "border-danger/25 bg-card text-danger hover:bg-danger/5"
                      : "border-border bg-card text-foreground hover:bg-muted",
                )}
              >
                {item.label}
                <span
                  className={cn(
                    "min-w-6 rounded-md px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums",
                    item.active
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : alert
                        ? "bg-danger/10 text-danger"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {formatNumber(item.count)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
