"use client";

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useI18n } from "@/components/layout/i18n-provider";
import { Button } from "@/components/ui/button";
import { navigationGroups } from "@/data/navigation";

// Sidebar destinations are top-level pages: they get no back button.
const mainPaths = new Set<string>(navigationGroups.flatMap((group) => group.items.map((item) => item.href)));

// Parents for routes whose URL parent has no page of its own.
const parentOverrides: Array<[RegExp, string]> = [
  [/^\/finance\/invoices\/[^/]+\/preview$/, "/finance/invoices"],
  [/^\/(search|shareholders)$/, "/overview"],
];

// In-app pages visited in this tab, one entry per page (its latest URL with filters), oldest first.
// Kept at module level so it survives page changes; a reload starts over.
const visits: string[] = [];

function pathOf(url: string) {
  return url.split("?")[0];
}

function recordVisit(url: string) {
  const path = pathOf(url);

  if (visits.length && pathOf(visits[visits.length - 1]) === path) {
    visits[visits.length - 1] = url;
  } else if (visits.length > 1 && pathOf(visits[visits.length - 2]) === path) {
    // Returned to the previous page (browser back or this button): drop the page we left.
    visits.pop();
    visits[visits.length - 1] = url;
  } else {
    visits.push(url);
    if (visits.length > 50) visits.shift();
  }
}

function parentPath(pathname: string) {
  const override = parentOverrides.find(([pattern]) => pattern.test(pathname));
  if (override) return override[1];
  const parent = pathname.slice(0, pathname.lastIndexOf("/"));
  return parent || "/overview";
}

// topLevel: more pages that are destinations of their own (in Vanguard's frame, those of its "Travail" menu).
export function PageBackButton({ topLevel }: { topLevel?: readonly string[] }) {
  const { locale, t } = useI18n();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [previous, setPrevious] = useState<string | null>(null);
  const query = searchParams.toString();

  useEffect(() => {
    recordVisit(query ? `${pathname}?${query}` : pathname);
    // Snapshot after recording, so the button points at the page we came from.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the module-level visit log
    setPrevious(visits.length > 1 ? visits[visits.length - 2] : null);
  }, [pathname, query]);

  if (mainPaths.has(pathname) || topLevel?.includes(pathname)) {
    return null;
  }

  const target = previous ?? parentPath(pathname);
  const targetPath = pathOf(target);
  const targetLabel = mainPaths.has(targetPath)
    ? t(`navigation.items.${targetPath.slice(1).replaceAll("/", "-")}.label`, targetPath.slice(1))
    : null;
  const backLabel = locale === "fr" ? "Retour" : "Back";

  return (
    <div className="mb-3">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2 text-muted-foreground hover:text-foreground"
        aria-label={targetLabel ? (locale === "fr" ? `Retour : ${targetLabel}` : `Back to ${targetLabel}`) : backLabel}
        onClick={() => router.push(target)}
      >
        <ArrowLeft />
        {backLabel}
        {targetLabel ? <span className="font-normal text-muted-foreground">· {targetLabel}</span> : null}
      </Button>
    </div>
  );
}
