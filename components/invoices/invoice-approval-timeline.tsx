import { CheckCircle2, FilePlus2, RotateCcw, Send } from "lucide-react";

import type { InvoiceRecord } from "@/types/finance";

type TimelineEvent = {
  key: string;
  date: string;
  title: string;
  detail: string;
  tone: "slate" | "amber" | "rose" | "emerald";
  icon: typeof FilePlus2;
};

export function InvoiceApprovalTimeline({ invoice, locale }: { invoice: InvoiceRecord; locale: "fr" | "en" }) {
  const isFr = locale === "fr";
  const requests = invoice.recentActivity
    .filter((activity) => activity.action === "Invoice changes requested")
    .map((activity): TimelineEvent => ({
      key: activity.id,
      date: activity.created_at,
      title: isFr ? "Corrections demandées" : "Changes requested",
      detail: `${activity.metadata.summary ?? (isFr ? "Motif non renseigné" : "No reason provided")} · ${activity.user?.full_name ?? (isFr ? "Administrateur" : "Administrator")}`,
      tone: "rose",
      icon: RotateCcw,
    }));
  const approvalEvents = invoice.recentActivity
    .filter((activity) => activity.action === "Invoice approved")
    .map((activity): TimelineEvent => ({
      key: activity.id,
      date: activity.created_at,
      title: isFr ? "Facture validée" : "Invoice approved",
      detail: activity.user?.full_name ?? (isFr ? "Administrateur" : "Administrator"),
      tone: "emerald",
      icon: CheckCircle2,
    }));
  const revocationEvents = invoice.recentActivity
    .filter((activity) => activity.action === "Invoice approval revoked")
    .map((activity): TimelineEvent => ({
      key: activity.id,
      date: activity.created_at,
      title: isFr ? "Validation retirée" : "Approval revoked",
      detail: `${activity.metadata.summary ?? (isFr ? "Motif non renseigné" : "No reason provided")} · ${activity.user?.full_name ?? (isFr ? "Administrateur" : "Administrator")}`,
      tone: "rose",
      icon: RotateCcw,
    }));
  const lastRequest = [...requests].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())[0];
  const wasResubmitted = lastRequest && new Date(invoice.updated_at).getTime() > new Date(lastRequest.date).getTime();
  const events: TimelineEvent[] = [
    {
      key: "created",
      date: invoice.created_at,
      title: isFr ? "Facture créée" : "Invoice created",
      detail: invoice.createdBy?.full_name ?? (isFr ? "Créateur inconnu" : "Unknown creator"),
      tone: "slate",
      icon: FilePlus2,
    },
    ...requests,
    ...approvalEvents,
    ...revocationEvents,
  ];

  if (wasResubmitted) {
    events.push({
      key: "resubmitted",
      date: invoice.updated_at,
      title: isFr ? "Facture corrigée et resoumise" : "Invoice corrected and resubmitted",
      detail: isFr ? "La facture est revenue dans la file de validation." : "The invoice returned to the approval queue.",
      tone: "amber",
      icon: Send,
    });
  }

  if (invoice.approval_status === "approved" && invoice.approved_at && !approvalEvents.length) {
    events.push({
      key: "approved",
      date: invoice.approved_at,
      title: isFr ? "Facture validée" : "Invoice approved",
      detail: invoice.approvedBy?.full_name ?? (isFr ? "Administrateur" : "Administrator"),
      tone: "emerald",
      icon: CheckCircle2,
    });
  }

  events.sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());

  return (
    <section className="rounded-[26px] border border-border/70 bg-card/75 p-5 shadow-[var(--shadow-soft)]">
      <div>
        <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">{isFr ? "Traçabilité" : "Audit trail"}</p>
        <h2 className="mt-1 text-lg font-semibold">{isFr ? "Parcours de validation" : "Approval journey"}</h2>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {events.map((event) => {
          const Icon = event.icon;
          return (
            <div key={event.key} className={`rounded-2xl border p-4 ${toneClasses[event.tone]}`}>
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/75 shadow-sm dark:bg-black/15"><Icon className="size-4" /></div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{event.title}</p>
                  <p className="mt-1 text-xs leading-5 opacity-80">{event.detail}</p>
                  <p className="mt-2 text-[11px] font-medium opacity-65">{formatTimelineDate(event.date, locale)}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const toneClasses = {
  slate: "border-slate-200 bg-slate-50 text-slate-800 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100",
  amber: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-100",
  rose: "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-100",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-100",
};

function formatTimelineDate(value: string, locale: "fr" | "en") {
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
