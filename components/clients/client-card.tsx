import Link from "next/link";
import { ArrowRight, Building2, FolderKanban, UserRound } from "lucide-react";

import { ClientStatusBadge } from "@/components/clients/client-status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/projects/helpers";
import type { ClientRecord } from "@/types/client";

export function ClientCard({ client }: { client: ClientRecord }) {
  return (
    <Link href={`/clients/${client.id}`} className="block">
      <Card className="surface-highlight group overflow-hidden rounded-[30px] border-border/70 bg-white/96 shadow-[0_24px_64px_-46px_rgba(37,99,235,0.24)] transition-all duration-300 hover:-translate-y-1 hover:border-sky-200/80 hover:shadow-[0_30px_72px_-48px_rgba(37,99,235,0.3)] dark:bg-[#161b26] dark:shadow-none dark:hover:border-sky-400/20">
        <CardContent className="space-y-5 px-5 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <ClientStatusBadge status={client.status} />
                <Badge variant="secondary" className="rounded-full px-3 py-1">
                  {client.type.replaceAll("_", " ")}
                </Badge>
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-semibold tracking-[-0.05em] text-slate-950 transition-colors group-hover:text-primary dark:text-white dark:group-hover:text-sky-200">
                  {client.name}
                </h3>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  {client.legal_name || client.industry || "Structured client record for delivery and relationship oversight."}
                </p>
              </div>
            </div>
            <div className="flex size-14 shrink-0 items-center justify-center rounded-[22px] border border-white/70 bg-white/84 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.42)] dark:border-white/10 dark:bg-white/5 dark:shadow-none">
              <Building2 className="size-5 text-primary dark:text-sky-200" />
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,0.72fr))]">
            <div className="rounded-[26px] border border-white/70 bg-white/84 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-white/8 dark:bg-white/4 dark:shadow-none">
              <p className="text-[11px] font-semibold tracking-[0.22em] text-muted-foreground uppercase">Relationship lead</p>
              <p className="mt-3 text-base font-semibold tracking-[-0.03em] text-slate-950 dark:text-white">
                {client.accountManager?.full_name ?? "Unassigned"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">Primary owner for coordination and follow-up.</p>
            </div>
            <InsightPill label="Projects" value={`${client.activeProjectsCount} active`} tone="sky" />
            <InsightPill label="Contract value" value="Placeholder" tone="indigo" />
            <InsightPill label="Last activity" value={formatDate(client.lastActivityAt)} tone="slate" />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border/60 pt-1 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <FolderKanban className="size-4" />
                {client.linkedProjects.length} linked projects
              </span>
              <span className="flex items-center gap-2">
                <UserRound className="size-4" />
                {client.contact_email ?? "No contact email"}
              </span>
            </div>

            <div className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 transition-colors group-hover:text-[#244b86] dark:text-slate-200 dark:group-hover:text-sky-300">
              View detail
              <span className="flex size-8 items-center justify-center rounded-full border border-border/70 bg-white/75 dark:border-white/10 dark:bg-white/5">
                <ArrowRight className="size-4" />
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function InsightPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "sky" | "indigo" | "slate";
}) {
  const toneClass =
    tone === "sky"
      ? "border-sky-100/80 bg-sky-50/70 dark:border-sky-400/15 dark:bg-sky-400/8"
      : tone === "indigo"
        ? "border-indigo-100/80 bg-indigo-50/70 dark:border-indigo-400/15 dark:bg-indigo-400/8"
        : "border-slate-200/80 bg-slate-100/76 dark:border-white/8 dark:bg-white/3";

  return (
    <div className={`rounded-[24px] border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:shadow-none ${toneClass}`}>
      <p className="text-[11px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">{label}</p>
      <p className="mt-3 text-base font-semibold tracking-[-0.03em] text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}
