import { CalendarClock } from "lucide-react";

import { ClientTimelineItemView } from "@/components/clients/client-timeline-item";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/projects/helpers";
import type { ClientTimelineItem } from "@/types/client";

function groupByDate(items: ClientTimelineItem[]) {
  const groups = new Map<string, ClientTimelineItem[]>();

  for (const item of items) {
    const key = item.date.slice(0, 10);
    const current = groups.get(key) ?? [];
    current.push(item);
    groups.set(key, current);
  }

  return [...groups.entries()];
}

export function ClientTimeline({
  items,
  description,
  isFr = false,
}: {
  items: ClientTimelineItem[];
  description: string;
  isFr?: boolean;
}) {
  const groups = groupByDate(items);

  return (
    <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CalendarClock className="size-4 text-primary" />
          <CardTitle>{isFr ? "Historique du client" : "Client timeline"}</CardTitle>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {groups.length ? (
          groups.map(([date, group]) => (
            <div key={date} className="space-y-3">
              <div className="sticky top-20 z-10 inline-flex rounded-full border border-border/65 bg-background/75 px-3 py-1 text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase backdrop-blur-xl">
                {formatDate(date)}
              </div>
              <div className="space-y-3">
                {group.map((item) => (
                  <ClientTimelineItemView key={item.id} item={item} isFr={isFr} />
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
            {isFr ? "Aucun événement ne correspond au filtre sélectionné." : "No client timeline events match the current filter."}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
