import { getPlanningAlerts } from "@/lib/alerts/service";
import { getCurrentLocale, getDictionary, getMessage } from "@/lib/i18n/server";
import { PlanningRiskPanel } from "@/components/alerts/planning-risk-panel";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AppRole } from "@/types/auth";
import type { PlanningAlert } from "@/types/alert";

const PLANNING_ALERT_TIMEOUT_MS = 4_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs = PLANNING_ALERT_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Planning alerts request timed out.")), timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function PlanningRiskPanelFallback() {
  return (
    <Card className="surface-highlight relative overflow-hidden border-border/70 bg-card/72 backdrop-blur-xl">
      <CardContent className="space-y-5 px-5 py-5">
        <div className="space-y-3">
          <Skeleton className="h-4 w-32 rounded-full" />
          <Skeleton className="h-7 w-72 max-w-full rounded-2xl" />
          <Skeleton className="h-4 w-[36rem] max-w-full rounded-2xl" />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-[22px]" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export async function PlanningRiskPanelServer({
  role,
  profileId,
}: {
  role: AppRole;
  profileId: string;
}) {
  const locale = await getCurrentLocale();
  const dictionary = getDictionary(locale);
  let alerts: PlanningAlert[] = [];

  try {
    alerts = await withTimeout(getPlanningAlerts(role, profileId));
  } catch {
    alerts = [];
  }

  return (
    <PlanningRiskPanel
      alerts={alerts}
      title={
        role === "shareholder"
          ? getMessage(dictionary, "overviewPage.alerts.shareholderTitle", "Strategic alerts")
          : getMessage(dictionary, "overviewPage.alerts.defaultTitle", "Operational alerts")
      }
      subtitle={
        role === "shareholder"
          ? getMessage(
              dictionary,
              "overviewPage.alerts.shareholderSubtitle",
              "High-level planning and governance risks derived from current execution data.",
            )
          : getMessage(
              dictionary,
              "overviewPage.alerts.defaultSubtitle",
              "Ticket, deadline, milestone, and workload risks derived from live planning data.",
            )
      }
      compact
    />
  );
}
