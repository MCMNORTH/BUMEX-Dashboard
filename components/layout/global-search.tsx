"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  Command,
  FileText,
  FolderKanban,
  History,
  LayoutDashboard,
  Loader2,
  Search,
  TicketCheck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/layout/i18n-provider";
import { cn } from "@/lib/utils";
import type { GlobalSearchEntityType, GlobalSearchResult } from "@/types/search";

type SearchState = "idle" | "loading" | "error" | "ready";
type QuickLink = { title: string; description: string; href: string; keywords: string; icon: LucideIcon };
type SearchMenuItem = { key: string; href: string };

const RECENT_SEARCHES_KEY = "bumex-recent-searches";

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

export function GlobalSearch() {
  const { t } = useI18n();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [state, setState] = useState<SearchState>("idle");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const entityLabels: Record<GlobalSearchEntityType, string> = {
    project: t("search.entityLabels.project", "Projects"),
    ticket: t("search.entityLabels.ticket", "Tickets"),
    client: t("search.entityLabels.client", "Clients"),
    contract: t("search.entityLabels.contract", "Contracts"),
    document: t("search.entityLabels.document", "Documents"),
    invoice: t("search.entityLabels.invoice", "Invoices"),
    payment: t("search.entityLabels.payment", "Payments"),
    team_member: t("search.entityLabels.teamMember", "Team members"),
  };

  const quickLinks = useMemo<QuickLink[]>(
    () => [
      { title: t("search.quick.overview", "Overview"), description: t("search.quick.overviewDescription", "Key activity and performance indicators"), href: "/overview", keywords: "overview dashboard accueil vue generale", icon: LayoutDashboard },
      { title: t("search.quick.projects", "Projects"), description: t("search.quick.projectsDescription", "Programmes, milestones and delivery"), href: "/projects", keywords: "projects projets programme delivery jalons", icon: FolderKanban },
      { title: t("search.quick.tickets", "Tickets"), description: t("search.quick.ticketsDescription", "Tasks, incidents and requests"), href: "/tickets", keywords: "tickets taches incidents demandes support", icon: TicketCheck },
      { title: t("search.quick.clients", "Clients"), description: t("search.quick.clientsDescription", "Accounts and commercial relationships"), href: "/clients", keywords: "clients customer comptes contrats", icon: BriefcaseBusiness },
      { title: t("search.quick.calendar", "Calendar"), description: t("search.quick.calendarDescription", "Deadlines and upcoming events"), href: "/calendar", keywords: "calendar calendrier dates echeances planning", icon: CalendarDays },
      { title: t("search.quick.team", "Team"), description: t("search.quick.teamDescription", "People, roles and availability"), href: "/team", keywords: "team equipe personnes collaborateurs", icon: Users },
      { title: t("search.quick.documents", "Documents"), description: t("search.quick.documentsDescription", "Files and controlled records"), href: "/documents", keywords: "documents fichiers archives", icon: FileText },
    ],
    [t],
  );

  const normalizedQuery = normalizeText(query.trim());
  const suggestedLinks = useMemo(() => {
    if (!normalizedQuery) return quickLinks.slice(0, 5);
    return quickLinks.filter((link) => normalizeText(`${link.title} ${link.description} ${link.keywords}`).includes(normalizedQuery)).slice(0, 4);
  }, [normalizedQuery, quickLinks]);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(RECENT_SEARCHES_KEY) ?? "[]");
      if (Array.isArray(saved)) setRecentSearches(saved.filter((item): item is string => typeof item === "string").slice(0, 5));
    } catch {
      setRecentSearches([]);
    }
  }, []);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function onShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onShortcut);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onShortcut);
    };
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setState("idle");
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        setState("loading");
        const response = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Search failed");

        const payload = (await response.json()) as { results: GlobalSearchResult[] };
        setResults(payload.results);
        setState("ready");
      } catch {
        if (controller.signal.aborted) return;
        setResults([]);
        setState("error");
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [query]);

  const groupedResults = useMemo(() => {
    return results.reduce<Array<{ label: string; items: GlobalSearchResult[] }>>((groups, result) => {
      const label = entityLabels[result.entityType];
      const existing = groups.find((group) => group.label === label);
      if (existing) existing.items.push(result);
      else groups.push({ label, items: [result] });
      return groups;
    }, []);
  }, [entityLabels, results]);

  const menuItems = useMemo<SearchMenuItem[]>(() => [
    ...suggestedLinks.map((link) => ({ key: `quick-${link.href}`, href: link.href })),
    ...results.map((result) => ({ key: `result-${result.entityType}-${result.id}`, href: result.href })),
    ...(query.trim().length >= 2 ? [{ key: "all-results", href: `/search?q=${encodeURIComponent(query.trim())}` }] : []),
  ], [query, results, suggestedLinks]);

  useEffect(() => setActiveIndex(0), [query]);

  function rememberSearch(value: string) {
    const cleaned = value.trim();
    if (cleaned.length < 2) return;
    setRecentSearches((current) => {
      const next = [cleaned, ...current.filter((item) => normalizeText(item) !== normalizeText(cleaned))].slice(0, 5);
      window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
      return next;
    });
  }

  function navigate(href: string, searchTerm?: string) {
    if (searchTerm) rememberSearch(searchTerm);
    setOpen(false);
    router.push(href);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (event.key === "ArrowDown" && menuItems.length) {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % menuItems.length);
      return;
    }

    if (event.key === "ArrowUp" && menuItems.length) {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + menuItems.length) % menuItems.length);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const active = menuItems[activeIndex];
      if (active) navigate(active.href, active.key === "all-results" ? query : undefined);
      else if (query.trim().length >= 2) navigate(`/search?q=${encodeURIComponent(query.trim())}`, query);
    }
  }

  return (
    <div ref={containerRef} className="relative order-last basis-full min-w-0 lg:order-none lg:basis-auto lg:flex-1">
      <div className="group flex h-10 items-center gap-2.5 rounded-[10px] border border-input bg-card px-3 shadow-none transition-[background-color,border-color,box-shadow] duration-200 hover:border-border focus-within:border-primary focus-within:ring-3 focus-within:ring-ring/60 sm:px-4">
        <Search className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={t("search.placeholder", "Search workspace")}
          className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
          aria-label={t("search.ariaLabel", "Global search")}
          aria-expanded={open}
          aria-controls="global-search-results"
          role="combobox"
        />
        {query ? (
          <button type="button" onClick={() => { setQuery(""); inputRef.current?.focus(); }} className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label={t("search.clear", "Clear search")}>
            <X className="size-3.5" />
          </button>
        ) : null}
        <span className="hidden items-center gap-1 rounded-[7px] border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:flex">
          <Command className="size-2.5" /> K
        </span>
      </div>

      {open ? (
        <div id="global-search-results" className="absolute inset-x-0 top-[calc(100%+0.45rem)] z-50 overflow-hidden rounded-[12px] border border-border bg-card shadow-[var(--shadow-elevated)] lg:min-w-[36rem]">
          <div className="max-h-[70vh] overflow-y-auto p-2.5 sm:max-h-[30rem]">
            {state === "loading" ? <DropdownMessage icon={Loader2} label={t("search.loading", "Searching workspace...")} spinning /> : null}
            {state === "error" ? <DropdownMessage icon={AlertCircle} label={t("search.error", "Search is temporarily unavailable.")} /> : null}
            {state !== "loading" && state !== "error" ? (
              <div className="space-y-4">
                {!query.trim() && recentSearches.length ? (
                  <SearchSection title={t("search.recent", "Recent searches")} icon={History}>
                    {recentSearches.map((item) => (
                      <button key={item} type="button" onClick={() => { setQuery(item); inputRef.current?.focus(); }} className="flex w-full items-center gap-3 rounded-[9px] px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                        <History className="size-3.5" /> <span>{item}</span>
                      </button>
                    ))}
                  </SearchSection>
                ) : null}

                {suggestedLinks.length ? (
                  <SearchSection title={query.trim() ? t("search.suggestions", "Suggested destinations") : t("search.explore", "Explore workspace")}>
                    {suggestedLinks.map((link, index) => {
                      const Icon = link.icon;
                      const active = activeIndex === index;
                      return <button key={link.href} type="button" onClick={() => navigate(link.href)} className={cn("flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors", active ? "bg-accent" : "hover:bg-muted")}>
                        <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" /></span>
                        <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-foreground">{link.title}</span><span className="block truncate text-xs text-muted-foreground">{link.description}</span></span>
                        <ArrowRight className="size-3.5 text-muted-foreground" />
                      </button>;
                    })}
                  </SearchSection>
                ) : null}

                {query.trim().length >= 2 && state === "ready" && groupedResults.length === 0 ? <DropdownMessage icon={Search} label={t("search.empty", "No matching records found.")} /> : null}

                {groupedResults.map((group) => (
                  <SearchSection key={group.label} title={group.label}>
                    {group.items.map((result) => {
                      const menuIndex = menuItems.findIndex((item) => item.key === `result-${result.entityType}-${result.id}`);
                      return <Link key={`${result.entityType}-${result.id}`} href={result.href} onClick={() => setOpen(false)} className={cn("flex items-start gap-3 rounded-[10px] px-3 py-2.5 transition-colors", activeIndex === menuIndex ? "bg-accent" : "hover:bg-muted")}>
                        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-medium text-foreground">{result.title}</p>{result.status ? <Badge variant="outline" className="rounded-full text-[10px] uppercase">{result.status.replaceAll("_", " ")}</Badge> : null}</div>{result.description ? <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{result.description}</p> : null}{result.relatedLabel ? <p className="mt-1 text-xs text-muted-foreground/90">{result.relatedLabel}</p> : null}</div>
                      </Link>;
                    })}
                  </SearchSection>
                ))}

                {query.trim().length >= 2 ? <div className="border-t border-border/60 pt-2"><button type="button" onClick={() => navigate(`/search?q=${encodeURIComponent(query.trim())}`, query)} className={cn("flex w-full items-center justify-between rounded-[10px] px-3 py-3 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground", activeIndex === menuItems.length - 1 && "bg-accent text-foreground")}><span>{t("search.viewAll", "View all results")}</span><span className="text-xs uppercase tracking-[0.16em]">{t("search.action", "Search")}</span></button></div> : null}
              </div>
            ) : null}
          </div>
          <div className="border-t border-border/60 bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground"><span>{t("search.keyboardHint", "Use ↑ ↓ to navigate and Enter to open")}</span></div>
        </div>
      ) : null}
    </div>
  );
}

function SearchSection({ title, icon: Icon, children }: { title: string; icon?: LucideIcon; children: React.ReactNode }) {
  return <section className="space-y-1.5"><p className="flex items-center gap-1.5 px-2 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{Icon ? <Icon className="size-3" /> : null}{title}</p><div className="space-y-1">{children}</div></section>;
}

function DropdownMessage({ icon: Icon, label, spinning = false }: { icon: LucideIcon; label: string; spinning?: boolean }) {
  return <div className="flex min-h-28 flex-col items-center justify-center gap-3 rounded-[12px] border border-dashed border-border bg-muted/60 px-6 py-7 text-center"><Icon className={cn("size-4 text-muted-foreground", spinning && "animate-spin")} /><p className="text-sm text-muted-foreground">{label}</p></div>;
}
