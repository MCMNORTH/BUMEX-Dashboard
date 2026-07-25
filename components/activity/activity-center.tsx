"use client";

import { useMemo, useState } from "react";

import { ActivityDetailDrawer } from "@/components/activity/activity-detail-drawer";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { ActivityFilters } from "@/components/activity/activity-filters";
import { ActivitySearch } from "@/components/activity/activity-search";
import { SectionCard } from "@/components/layout/section-card";
import { filterActivityLogs, searchActivityLogs } from "@/lib/activity/presentation";
import type { ActivityLogRecord } from "@/types/activity";
import type { AppRole } from "@/types/auth";

export function ActivityCenter({
  activities,
  role,
  currentUserId,
  title,
  description,
  emptyMessage,
}: {
  activities: ActivityLogRecord[];
  role: AppRole;
  currentUserId: string;
  title: string;
  description: string;
  emptyMessage: string;
}) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({
    entityType: "all",
    actionType: "all",
    userId: "all",
    dateRange: "all",
    scope: "all",
  });
  const [selectedActivity, setSelectedActivity] = useState<ActivityLogRecord | null>(null);

  const entityTypes = useMemo(
    () => Array.from(new Set(activities.map((activity) => activity.entity_type))).sort(),
    [activities],
  );
  const actionTypes = useMemo(
    () => Array.from(new Set(activities.map((activity) => activity.metadata.kind ?? "event"))).sort(),
    [activities],
  );
  const users = useMemo(
    () =>
      Array.from(
        new Map(
          activities
            .filter((activity) => activity.user?.id)
            .map((activity) => [activity.user!.id, { id: activity.user!.id, full_name: activity.user!.full_name }]),
        ).values(),
      ).sort((left, right) => left.full_name.localeCompare(right.full_name)),
    [activities],
  );

  const visibleActivities = useMemo(() => {
    const filtered = filterActivityLogs(activities, filters);
    return searchActivityLogs(filtered, search);
  }, [activities, filters, search]);

  return (
    <div className="space-y-4">
      <SectionCard
        eyebrow="Controls"
        title="Activity filters"
        description="Refine the audit trail by entity, action, actor, and recency without losing your current timeline context."
        contentClassName="space-y-4 px-5 py-5"
      >
          <ActivitySearch value={search} onChange={setSearch} />
          <ActivityFilters
            value={filters}
            onChange={setFilters}
            entityTypes={entityTypes}
            actionTypes={actionTypes}
            users={users}
          />
      </SectionCard>

      <ActivityFeed
        activities={visibleActivities}
        title={title}
        description={description}
        emptyMessage={emptyMessage}
        onSelect={setSelectedActivity}
      />

      <ActivityDetailDrawer
        activity={selectedActivity}
        open={Boolean(selectedActivity)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedActivity(null);
          }
        }}
        role={role}
        currentUserId={currentUserId}
      />
    </div>
  );
}
