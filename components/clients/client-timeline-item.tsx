import Link from "next/link";
import { Building2, FileStack, FolderKanban, PanelsTopLeft, ReceiptText, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/projects/helpers";
import type { ClientTimelineItem } from "@/types/client";

function TimelineIcon({ type }: { type: ClientTimelineItem["type"] }) {
  if (type === "projects") {
    return <FolderKanban className="size-4 text-primary" />;
  }

  if (type === "tickets") {
    return <PanelsTopLeft className="size-4 text-primary" />;
  }

  if (type === "contracts") {
    return <ReceiptText className="size-4 text-primary" />;
  }

  if (type === "documents") {
    return <FileStack className="size-4 text-primary" />;
  }

  return <Building2 className="size-4 text-primary" />;
}

export function ClientTimelineItemView({ item }: { item: ClientTimelineItem }) {
  return (
    <details className="group rounded-[24px] border border-border/65 bg-background/38 p-4">
      <summary className="flex cursor-pointer list-none items-start gap-3">
        <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl border border-border/65 bg-background/45">
          <TimelineIcon type={item.type} />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">{item.title}</p>
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              {item.type}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{item.actorName}</span>
            <span>/</span>
            <span>{formatDate(item.date)}</span>
            {item.metadataLabel ? (
              <>
                <span>/</span>
                <span className="capitalize">{item.metadataLabel}</span>
              </>
            ) : null}
          </div>
        </div>
      </summary>

      <div className="mt-4 space-y-3 border-t border-border/55 pt-4 pl-[3.25rem]">
        <p className="text-sm leading-6 text-muted-foreground">
          {item.expandableDetails ?? item.description ?? "Relationship activity recorded for this client."}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {item.href ? (
            <Link
              href={item.href}
              className="inline-flex items-center gap-2 rounded-full border border-border/65 bg-background/50 px-3 py-1.5 text-xs font-medium text-foreground/90 transition-colors hover:bg-accent"
            >
              <Sparkles className="size-3.5 text-primary" />
              Open related record
            </Link>
          ) : null}
        </div>
      </div>
    </details>
  );
}
