import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/layout/section-card";
import { SearchResultsPage } from "@/components/search/search-results-page";
import { requireAuthenticatedUser } from "@/lib/auth/server";
import { globalSearch } from "@/lib/search/service";
import type { GlobalSearchResult } from "@/types/search";

function getString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await requireAuthenticatedUser();
  const params = (await searchParams) ?? {};
  const query = getString(params.q)?.trim() ?? "";

  let results: GlobalSearchResult[] = [];
  let loadError: string | null = null;

  if (query.length >= 2) {
    try {
      results = await globalSearch(
        query,
        {
          id: auth.profile.id,
          role: auth.role,
        },
        { perEntityLimit: 8 },
      );
    } catch (error) {
      loadError = error instanceof Error ? error.message : "Unable to load search results.";
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Search"
        title={
          query
            ? `Deep workspace results for "${query}".`
            : "A cross-workspace search surface for projects, tickets, clients, documents, finance, and team data."
        }
        subtitle={
          query
            ? "Results stay scoped to your role and visible records, then grouped into business-friendly categories for faster navigation."
            : "Use a query to search across the operational workspace without leaving the shell."
        }
        badge={
          <Badge variant="outline" className="w-fit rounded-full px-3 py-1">
            {results.length} results
          </Badge>
        }
      />

      {loadError ? (
        <SectionCard
          title="Unable to load search results"
          description="Search is available, but the current query could not be resolved."
          contentClassName="px-6 py-6"
        >
          <div className="text-sm leading-6 text-muted-foreground">{loadError}</div>
        </SectionCard>
      ) : (
        <SearchResultsPage initialQuery={query} results={results} />
      )}
    </div>
  );
}
