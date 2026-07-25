"use client";

import { getActivityMetadataSummary } from "@/lib/activity/presentation";
import { canViewActivityMetadata, sanitizeActivityMetadata } from "@/lib/activity/security";
import type { ActivityLogRecord } from "@/types/activity";
import type { AppRole } from "@/types/auth";

export function ActivityMetadataView({
  activity,
  role,
  currentUserId,
}: {
  activity: ActivityLogRecord;
  role: AppRole;
  currentUserId: string;
}) {
  const summary = getActivityMetadataSummary(activity);
  const metadataVisible = canViewActivityMetadata(
    {
      role,
      currentUserId,
    },
    activity,
  );
  const metadata = metadataVisible ? sanitizeActivityMetadata(activity.metadata, role) : {};
  const visibleEntries = Object.entries(metadata).filter(([, value]) => value !== undefined && value !== null);

  return (
    <div className="space-y-4">
      {summary ? (
        <div className="rounded-2xl border border-border/65 bg-background/35 p-4">
          <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">Summary</p>
          <p className="mt-3 text-sm leading-6 text-foreground/90">{summary}</p>
        </div>
      ) : null}

      <div className="rounded-2xl border border-border/65 bg-background/35 p-4">
        <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">Metadata</p>
        {!metadataVisible || activity.metadata_hidden ? (
          <p className="mt-4 text-sm text-muted-foreground">Details hidden due to your permission level.</p>
        ) : visibleEntries.length ? (
          <div className="mt-4 space-y-3">
            {visibleEntries.map(([key, value]) => (
              <div key={key} className="grid gap-1 sm:grid-cols-[140px_minmax(0,1fr)]">
                <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">{key.replaceAll("_", " ")}</p>
                <p className="text-sm leading-6 text-foreground/90">{String(value)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">No additional metadata is visible for this activity.</p>
        )}
      </div>
    </div>
  );
}
