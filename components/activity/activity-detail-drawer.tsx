"use client";

import Link from "next/link";

import { ActivityMetadataView } from "@/components/activity/activity-metadata-view";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getActivityEntityUrl, getActivityKindLabel, getActivityLabel } from "@/lib/activity/presentation";
import { formatDate } from "@/lib/projects/helpers";
import type { ActivityLogRecord } from "@/types/activity";
import type { AppRole } from "@/types/auth";

export function ActivityDetailDrawer({
  activity,
  open,
  onOpenChange,
  role,
  currentUserId,
}: {
  activity: ActivityLogRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: AppRole;
  currentUserId: string;
}) {
  const entityUrl = activity ? getActivityEntityUrl(activity) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="left-auto right-4 top-4 h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-2xl translate-x-0 translate-y-0 overflow-y-auto rounded-[28px] p-0">
        {activity ? (
          <div className="space-y-6 p-6">
            <DialogHeader className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="rounded-full">{getActivityLabel(activity.entity_type)}</Badge>
                <Badge variant="secondary" className="rounded-full">{getActivityKindLabel(activity)}</Badge>
              </div>
              <DialogTitle>{activity.action}</DialogTitle>
              <DialogDescription>
                {activity.user?.full_name ?? "System"} / {formatDate(activity.created_at)}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-2">
              <DrawerField label="User" value={activity.user?.full_name ?? "System"} />
              <DrawerField label="Entity type" value={activity.entity_type} />
              <DrawerField label="Entity id" value={activity.entity_id} />
              <DrawerField label="Created at" value={formatDate(activity.created_at)} />
            </div>

            {entityUrl ? (
              <div className="rounded-2xl border border-border/65 bg-background/35 p-4">
                <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">Related entity</p>
                <Link href={entityUrl} className="mt-3 inline-flex text-sm font-medium text-primary hover:underline">
                  Open related record
                </Link>
              </div>
            ) : null}

            <ActivityMetadataView activity={activity} role={role} currentUserId={currentUserId} />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DrawerField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/65 bg-background/35 p-4">
      <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
      <p className="mt-3 text-sm leading-6 text-foreground/90">{value}</p>
    </div>
  );
}
