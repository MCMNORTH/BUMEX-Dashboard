"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Search } from "lucide-react";

import { useI18n } from "@/components/layout/i18n-provider";
import { EmptyState } from "@/components/layout/empty-state";
import { SectionCard } from "@/components/layout/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { GlobalSearchEntityType, GlobalSearchResult } from "@/types/search";

const categoryConfig = {
  all: {
    label: "All",
    matches: () => true,
  },
  projects: {
    label: "Projects",
    matches: (entityType: GlobalSearchEntityType) => entityType === "project",
  },
  tickets: {
    label: "Tickets",
    matches: (entityType: GlobalSearchEntityType) => entityType === "ticket",
  },
  clients: {
    label: "Clients",
    matches: (entityType: GlobalSearchEntityType) => entityType === "client",
  },
  contracts: {
    label: "Contracts",
    matches: (entityType: GlobalSearchEntityType) => entityType === "contract",
  },
  documents: {
    label: "Documents",
    matches: (entityType: GlobalSearchEntityType) => entityType === "document",
  },
  finance: {
    label: "Finance",
    matches: (entityType: GlobalSearchEntityType) => entityType === "invoice" || entityType === "payment",
  },
  team: {
    label: "Team",
    matches: (entityType: GlobalSearchEntityType) => entityType === "team_member",
  },
} as const;

const entityLabels: Record<GlobalSearchEntityType, string> = {
  project: "Project",
  ticket: "Ticket",
  client: "Client",
  contract: "Contract",
  document: "Document",
  invoice: "Invoice",
  payment: "Payment",
  team_member: "Team member",
};

type CategoryKey = keyof typeof categoryConfig;

export function SearchResultsPage({
  initialQuery,
  results,
}: {
  initialQuery: string;
  results: GlobalSearchResult[];
}) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const router = useRouter();
  const [category, setCategory] = useState<CategoryKey>("all");
  const [draftQuery, setDraftQuery] = useState(initialQuery);

  const visibleResults = useMemo(() => {
    return results.filter((result) => categoryConfig[category].matches(result.entityType));
  }, [category, results]);

  const groupedResults = useMemo(() => {
    return visibleResults.reduce<Array<{ label: string; items: GlobalSearchResult[] }>>((groups, result) => {
      const label =
        result.entityType === "invoice" || result.entityType === "payment"
          ? "Finance"
          : result.entityType === "team_member"
            ? "Team"
            : `${entityLabels[result.entityType]}s`;

      const existing = groups.find((group) => group.label === label);
      if (existing) {
        existing.items.push(result);
        return groups;
      }

      groups.push({ label, items: [result] });
      return groups;
    }, []);
  }, [visibleResults]);

  const counts = useMemo(() => {
    return (Object.keys(categoryConfig) as CategoryKey[]).reduce<Record<CategoryKey, number>>((acc, key) => {
      acc[key] = key === "all" ? results.length : results.filter((result) => categoryConfig[key].matches(result.entityType)).length;
      return acc;
    }, {} as Record<CategoryKey, number>);
  }, [results]);

  return (
    <div className="space-y-6">
      <SectionCard
        eyebrow={isFr ? "Contrôles de recherche" : "Search controls"}
        title={isFr ? "Recherchez dans votre espace visible" : "Search across your visible workspace"}
        description={isFr ? "Naviguez entre projets, travail delivery, clients, documents, finance et équipes depuis une seule surface de recherche." : "Jump between projects, delivery work, clients, documents, finance summaries, and people from one controlled search surface."}
        contentClassName="space-y-4 px-5 py-5"
      >
        <form
          action="/search"
          className="flex flex-col gap-3 lg:flex-row lg:items-center"
          onSubmit={(event) => {
            event.preventDefault();
            const nextQuery = draftQuery.trim();
            router.push(nextQuery ? `/search?q=${encodeURIComponent(nextQuery)}` : "/search");
          }}
        >
          <div className="field-shell flex h-12 flex-1 items-center gap-3 px-4">
            <Search className="size-4 text-muted-foreground" />
            <input
              name="q"
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              placeholder={isFr ? "Rechercher dans l'espace de travail" : "Search across the workspace"}
              className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              aria-label={isFr ? "Requête de recherche" : "Search query"}
            />
          </div>
          <Button type="submit" className="h-12 rounded-2xl px-5">
            {isFr ? "Rechercher" : "Search"}
          </Button>
        </form>

        <div className="flex flex-wrap gap-2">
          {(Object.keys(categoryConfig) as CategoryKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setCategory(key)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium tracking-wide transition-colors ${
                category === key
                  ? "border-primary/40 bg-primary/12 text-foreground shadow-[var(--shadow-inner)]"
                  : "border-border/70 bg-background/35 text-muted-foreground hover:bg-background/55 hover:text-foreground"
              }`}
            >
              <span>{categoryConfig[key].label}</span>
              <span className="text-[11px] opacity-80">{counts[key]}</span>
            </button>
          ))}
        </div>
      </SectionCard>

      {!initialQuery ? (
        <SearchStateEmpty
          title={isFr ? "Commencez par une recherche" : "Start with a query"}
          description={isFr ? "Recherchez projets, tickets, clients, contrats, documents, finance et membres d'équipe depuis un seul endroit." : "Search projects, tickets, clients, contracts, documents, finance records, and team members from one place."}
          locale={locale}
        />
      ) : visibleResults.length === 0 ? (
        <SearchStateEmpty
          title={isFr ? "Aucun résultat trouvé" : "No results found"}
          description={isFr ? "Essayez un autre mot-clé ou revenez à Tout pour élargir le périmètre actuel." : "Try another keyword or switch back to All to widen the current result scope."}
          locale={locale}
        />
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {isFr
                ? `${visibleResults.length} résultat${visibleResults.length === 1 ? "" : "s"} dans ${categoryConfig[category].label.toLowerCase()}`
                : `${visibleResults.length} result${visibleResults.length === 1 ? "" : "s"} in ${categoryConfig[category].label.toLowerCase()}`}
            </p>
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              {results.length} {isFr ? "au total" : "total"}
            </Badge>
          </div>

          <div className="space-y-5">
            {groupedResults.map((group) => (
              <div key={group.label} className="space-y-3">
                <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{group.label}</p>
                <div className="grid gap-3 lg:grid-cols-2">
                  {group.items.map((result) => (
                    <Link
                      key={`${result.entityType}-${result.id}`}
                      href={result.href}
                      className="group surface-highlight relative overflow-hidden rounded-[24px] border border-border/70 bg-card/72 p-5 shadow-[var(--shadow-soft)] transition-[transform,background-color,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:bg-white/[0.03]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-base font-semibold text-foreground">{result.title}</h3>
                            <Badge variant="outline" className="rounded-full">
                              {entityLabels[result.entityType]}
                            </Badge>
                            {result.status ? (
                              <Badge variant="secondary" className="rounded-full">
                                {result.status.replaceAll("_", " ")}
                              </Badge>
                            ) : null}
                          </div>
                          {result.description ? (
                            <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{result.description}</p>
                          ) : null}
                          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            {result.relatedLabel ? <span>{result.relatedLabel}</span> : null}
                            {result.updatedAt ? <span>{isFr ? "Mis à jour" : "Updated"} {formatDate(result.updatedAt, locale)}</span> : null}
                          </div>
                        </div>
                        <ArrowRight className="mt-1 size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SearchStateEmpty({
  title,
  description,
  locale,
}: {
  title: string;
  description: string;
  locale: "en" | "fr";
}) {
  return <EmptyState title={title} description={description} label={locale === "fr" ? "Rechercher" : "Search workspace"} icon={Search} />;
}

function formatDate(value: string, locale: "en" | "fr") {
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
