"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Params that only make sense once (a toast to show, a form to open) and must not survive a filter change.
const transientParams = ["toast", "create"];

/**
 * URL-backed list filters that apply as soon as they change. Unrelated params (such as `view`) are kept.
 */
export function useFilterParams<Key extends string>(keys: readonly Key[]) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const hasActiveFilters = keys.some((key) => {
    const value = searchParams.get(key);
    return Boolean(value && value !== "all");
  });

  function navigate(update: (params: URLSearchParams) => void, history: "push" | "replace" = "push") {
    const next = new URLSearchParams(searchParams.toString());
    transientParams.forEach((key) => next.delete(key));
    update(next);
    const href = next.size ? `${pathname}?${next.toString()}` : pathname;
    if (href === `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ""}`) return;
    startTransition(() => {
      router[history](href, { scroll: false });
    });
  }

  /** `replace` keeps search-as-you-type from adding a history entry per keystroke. */
  function applyFilter(key: Key, value: string, options?: { history?: "push" | "replace" }) {
    navigate((params) => {
      if (value && value !== "all") {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }, options?.history);
  }

  function clearFilters() {
    navigate((params) => keys.forEach((key) => params.delete(key)));
  }

  return { applyFilter, clearFilters, hasActiveFilters, isPending };
}
