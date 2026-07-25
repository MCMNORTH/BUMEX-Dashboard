"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Command, Loader2, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GlobalSearchEntityType, GlobalSearchResult } from "@/types/search";

const entityLabels: Record<GlobalSearchEntityType, string> = {
  project: "Projects",
  ticket: "Tickets",
  client: "Clients",
  contract: "Contracts",
  document: "Documents",
  invoice: "Invoices",
  payment: "Payments",
  team_member: "Team members",
};

type SearchState = "idle" | "loading" | "error" | "ready";

export function GlobalSearch() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [state, setState] = useState<SearchState>("idle");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        setState("loading");
        const response = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Search failed");
        }

        const payload = (await response.json()) as { results: GlobalSearchResult[] };
        setResults(payload.results);
        setState("ready");
        setOpen(true);
        setActiveIndex(0);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setResults([]);
        setState(error instanceof Error ? "error" : "error");
        setOpen(true);
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [query]);

  const groupedResults = useMemo(() => {
    return results.reduce<Array<{ label: string; items: GlobalSearchResult[] }>>((groups, result) => {
      const label = entityLabels[result.entityType];
      const existing = groups.find((group) => group.label === label);

      if (existing) {
        existing.items.push(result);
        return groups;
      }

      groups.push({ label, items: [result] });
      return groups;
    }, []);
  }, [results]);

  const flatResults = useMemo(() => groupedResults.flatMap((group) => group.items), [groupedResults]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && query.trim().length >= 2 && (!open || flatResults.length === 0)) {
      event.preventDefault();
      setOpen(false);
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
      return;
    }

    if (!open || flatResults.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % flatResults.length);
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + flatResults.length) % flatResults.length);
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const target = flatResults[activeIndex];
      if (target) {
        setOpen(false);
        router.push(target.href);
      }
    }

    if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="order-last basis-full min-w-0 lg:order-none lg:basis-auto lg:flex-1">
      <div className="group flex h-9 items-center gap-2.5 rounded-[9px] border border-input bg-card px-3 shadow-none transition-[background-color,border-color,box-shadow] duration-200 hover:border-border focus-within:border-primary focus-within:ring-3 focus-within:ring-ring/60 sm:px-3.5">
        <Search className="size-3.5 text-muted-foreground transition-colors group-hover:text-foreground" />
        <input
          value={query}
          onChange={(event) => {
            const nextValue = event.target.value;
            setQuery(nextValue);

            if (nextValue.trim().length >= 2) {
              setOpen(true);
            } else {
              setResults([]);
              setState("idle");
              setActiveIndex(0);
              setOpen(false);
            }
          }}
          onFocus={() => {
            if (query.trim().length >= 2) {
              setOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search workspace"
          className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
          aria-label="Global search"
        />
        <span className="hidden items-center gap-1 rounded-[7px] border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:flex">
          <Command className="size-2.5" />
          K
        </span>
      </div>

      {open ? (
        <div className="absolute inset-x-0 top-[calc(100%+0.45rem)] z-50 overflow-hidden rounded-[11px] border border-border bg-card shadow-[var(--shadow-elevated)] lg:min-w-[32rem]">
          <div className="max-h-[70vh] overflow-y-auto p-2.5 sm:max-h-[26rem]">
            {state === "loading" ? (
              <DropdownMessage icon={Loader2} label="Searching workspace..." spinning />
            ) : state === "error" ? (
              <DropdownMessage icon={AlertCircle} label="Search is temporarily unavailable." />
            ) : groupedResults.length === 0 ? (
              <DropdownMessage
                icon={Search}
                label={query.trim().length < 2 ? "Type at least 2 characters to search." : "No matching records found."}
              />
            ) : (
              <div className="space-y-4">
                {groupedResults.map((group) => (
                  <div key={group.label} className="space-y-2">
                    <p className="px-2 text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                      {group.label}
                    </p>
                    <div className="space-y-1">
                      {group.items.map((result) => {
                        const resultIndex = flatResults.findIndex((item) => item.id === result.id && item.entityType === result.entityType);
                        const active = resultIndex === activeIndex;

                        return (
                          <Link
                            key={`${result.entityType}-${result.id}`}
                            href={result.href}
                            onClick={() => setOpen(false)}
                            className={cn(
                              "flex items-start gap-3 rounded-[10px] px-3 py-3 transition-colors",
                              active ? "bg-accent" : "hover:bg-muted",
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-sm font-medium text-foreground">{result.title}</p>
                                {result.status ? (
                                  <Badge variant="outline" className="rounded-full text-[10px] uppercase">
                                    {result.status.replaceAll("_", " ")}
                                  </Badge>
                                ) : null}
                              </div>
                              {result.description ? (
                                <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{result.description}</p>
                              ) : null}
                              {result.relatedLabel ? (
                                <p className="mt-1 text-xs text-muted-foreground/90">{result.relatedLabel}</p>
                              ) : null}
                            </div>
                            <Badge variant="secondary" className="rounded-full text-[10px] uppercase">
                              {group.label.slice(0, -1)}
                            </Badge>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <div className="border-t border-border/60 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
                    }}
                    className="flex w-full items-center justify-between rounded-[10px] px-3 py-3 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <span>View all results</span>
                    <span className="text-xs uppercase tracking-[0.16em]">Search</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DropdownMessage({
  icon: Icon,
  label,
  spinning = false,
}: {
  icon: typeof Search;
  label: string;
  spinning?: boolean;
}) {
  return (
    <div className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-[12px] border border-dashed border-border bg-muted/60 px-6 py-8 text-center">
      <Icon className={cn("size-4 text-muted-foreground", spinning && "animate-spin")} />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
