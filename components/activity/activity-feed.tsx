import Link from "next/link";
import type { ReactNode } from "react";
import {
  Activity,
  BanknoteArrowUp,
  CalendarClock,
  FileCog,
  FileText,
  FolderKanban,
  Landmark,
  MessageSquareText,
  PanelsTopLeft,
  ReceiptText,
  UserRound,
  UsersRound,
} from "lucide-react";

import {
  formatActivityMetadataSummary,
  getActivityEntityUrl,
  getActivityKindLabel,
  getActivityLabel,
  groupActivitiesByDate,
} from "@/lib/activity/presentation";
import { formatDate } from "@/lib/projects/helpers";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActivityLogRecord } from "@/types/activity";

const kindClasses = {
  create: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100",
  update: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100",
  delete: "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-100",
  archive: "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-100",
  view: "border-slate-500/25 bg-slate-500/10 text-slate-700 dark:border-slate-400/20 dark:bg-slate-400/10 dark:text-slate-100",
  pin: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100",
  status_change: "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-100",
  assignment_change: "border-cyan-500/25 bg-cyan-500/10 text-cyan-700 dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-100",
  priority_change: "border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-700 dark:border-fuchsia-400/20 dark:bg-fuchsia-400/10 dark:text-fuchsia-100",
  due_date_change: "border-orange-500/25 bg-orange-500/10 text-orange-700 dark:border-orange-400/20 dark:bg-orange-400/10 dark:text-orange-100",
  completion_change: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100",
} as const;

const iconNodes = {
  profile: <ActivityIconNode entityType="profile" />,
  user: <ActivityIconNode entityType="user" />,
  team: <ActivityIconNode entityType="team" />,
  finance: <ActivityIconNode entityType="finance" />,
  shareholder: <ActivityIconNode entityType="shareholder" />,
  client: <ActivityIconNode entityType="client" />,
  project: <ActivityIconNode entityType="project" />,
  milestone: <ActivityIconNode entityType="milestone" />,
  task: <ActivityIconNode entityType="task" />,
  ticket: <ActivityIconNode entityType="ticket" />,
  contract: <ActivityIconNode entityType="contract" />,
  invoice: <ActivityIconNode entityType="invoice" />,
  receipt: <ActivityIconNode entityType="receipt" />,
  document: <ActivityIconNode entityType="document" />,
  payment: <ActivityIconNode entityType="payment" />,
  transfer: <ActivityIconNode entityType="transfer" />,
  settings: <ActivityIconNode entityType="settings" />,
  report: <ActivityIconNode entityType="report" />,
  comment: <ActivityIconNode entityType="comment" />,
  note: <ActivityIconNode entityType="note" />,
} satisfies Record<ActivityLogRecord["entity_type"], ReactNode>;

function ActivityIconNode({ entityType }: { entityType: ActivityLogRecord["entity_type"] }) {
  switch (entityType) {
    case "project":
      return <FolderKanban className="size-4 text-primary" />;
    case "milestone":
      return <CalendarClock className="size-4 text-primary" />;
    case "task":
    case "ticket":
      return <PanelsTopLeft className="size-4 text-primary" />;
    case "profile":
    case "user":
      return <UserRound className="size-4 text-primary" />;
    case "client":
    case "team":
      return <UsersRound className="size-4 text-primary" />;
    case "contract":
    case "invoice":
    case "receipt":
      return <ReceiptText className="size-4 text-primary" />;
    case "payment":
    case "transfer":
    case "finance":
      return <BanknoteArrowUp className="size-4 text-primary" />;
    case "document":
    case "report":
      return <FileText className="size-4 text-primary" />;
    case "settings":
      return <FileCog className="size-4 text-primary" />;
    case "comment":
    case "note":
      return <MessageSquareText className="size-4 text-primary" />;
    case "shareholder":
      return <Landmark className="size-4 text-primary" />;
    default:
      return <Activity className="size-4 text-primary" />;
  }
}

function ActivityRow({
  activity,
  onSelect,
}: {
  activity: ActivityLogRecord;
  onSelect?: (activity: ActivityLogRecord) => void;
}) {
  const entityUrl = getActivityEntityUrl(activity);
  const metadataDescription = formatActivityMetadataSummary(activity);
  const kind = activity.metadata.kind;
  const kindClass = kind ? kindClasses[kind] : "border-border/70 bg-background/45 text-muted-foreground";

  const content = (
    <div className="rounded-[22px] border border-border/65 bg-background/38 p-4 transition-transform hover:-translate-y-0.5">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-border/65 bg-background/45">
          {iconNodes[activity.entity_type]}
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="rounded-full border-border/70 bg-background/45">
                  {getActivityLabel(activity.entity_type)}
                </Badge>
                <Badge variant="outline" className={`rounded-full ${kindClass}`}>
                  {getActivityKindLabel(activity)}
                </Badge>
              </div>
              <p className="text-sm font-medium">{activity.action}</p>
            </div>
            <p className="text-xs text-muted-foreground">{formatDate(activity.created_at)}</p>
          </div>

          <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-[minmax(0,1fr)_auto]">
            <p>By {activity.user?.full_name ?? "System"}</p>
            <p>{activity.entity_id}</p>
          </div>

          {metadataDescription ? (
            <p className="text-sm leading-6 text-muted-foreground">{metadataDescription}</p>
          ) : null}

          {entityUrl ? (
            <div className="pt-1">
              <Link
                href={entityUrl}
                className="text-xs font-medium text-primary hover:underline"
              >
                Open related entity
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  if (onSelect) {
    return (
      <button type="button" onClick={() => onSelect(activity)} className="block w-full text-left">
        {content}
      </button>
    );
  }

  if (!entityUrl) {
    return content;
  }

  return (
    <Link href={entityUrl} className="block">
      {content}
    </Link>
  );
}

export function ActivityFeed({
  activities,
  title = "Activity feed",
  description = "Recent platform activity and operational history.",
  embedded = false,
  emptyMessage = "No activity has been recorded yet.",
  onSelect,
}: {
  activities: ActivityLogRecord[];
  title?: string;
  description?: string;
  embedded?: boolean;
  emptyMessage?: string;
  onSelect?: (activity: ActivityLogRecord) => void;
}) {
  const grouped = groupActivitiesByDate(activities);

  const content = (
    <>
      {!embedded ? (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        </CardHeader>
      ) : (
        <div className="space-y-2 pb-4">
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      )}
      <CardContent className={embedded ? "space-y-5 px-0 pb-0" : "space-y-5"}>
        {activities.length ? (
          Object.entries(grouped).map(([group, items]) =>
            items.length ? (
              <div key={group} className="space-y-3">
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className="rounded-full px-3 py-1">
                    {group}
                  </Badge>
                  <div className="h-px flex-1 bg-border/60" />
                </div>
                <div className="space-y-3">
                  {items.map((activity) => (
                    <ActivityRow key={activity.id} activity={activity} onSelect={onSelect} />
                  ))}
                </div>
              </div>
            ) : null,
          )
        ) : (
          <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        )}
      </CardContent>
    </>
  );

  if (embedded) {
    return content;
  }

  return (
    <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
      {content}
    </Card>
  );
}
