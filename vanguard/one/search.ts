import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GlobalSearchEntityType, GlobalSearchResult } from '@/types/search';
import { useSay } from './say';

// One search for everything: Vanguard's header search (ui/Header.tsx) also lists BUMEX One's records, from BUMEX
// One's search (/api/search, the person's rights). Missions and tasks are left out: Vanguard finds them itself.

type Hit = { label: string; sub: string; go: () => void };

const TYPES: Partial<Record<GlobalSearchEntityType, [string, string]>> = {
  client: ['Client', 'Client'],
  contract: ['Contrat', 'Contract'],
  document: ['Document', 'Document'],
  invoice: ['Facture (archive)', 'Invoice (archive)'],
  payment: ['Règlement (archive)', 'Payment (archive)'],
  team_member: ['Personne', 'Person'],
};

export function useBumexOneSearch(q: string): Hit[] {
  const router = useRouter();
  const say = useSay();
  const query = q.trim();
  const [found, setFound] = useState<{ query: string; results: GlobalSearchResult[] }>({ query: '', results: [] });

  useEffect(() => {
    if (query.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((body: { results?: GlobalSearchResult[] }) => setFound({ query, results: body.results ?? [] }))
        .catch(() => undefined);
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  if (query.length < 2 || found.query !== query) return [];
  return found.results
    .filter((r) => TYPES[r.entityType])
    .slice(0, 8)
    .map((r) => {
      const [fr, en] = TYPES[r.entityType]!;
      return { label: r.title, sub: `${say(fr, en)}${r.relatedLabel ? ` · ${r.relatedLabel}` : ''}`, go: () => router.push(r.href) };
    });
}
