"use client";

import { useState } from "react";
import { Check, CircleStop, Pencil, Send, X } from "lucide-react";

import { updateStaffingAssignmentAction, updateStaffingAssignmentStatusAction } from "@/app/(app)/staffing/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { StaffingAssignment, StaffingStatus } from "@/types/staffing";

function StatusButton({ id, status, label, icon: Icon, tone }: { id: string; status: StaffingStatus; label: string; icon: typeof Check; tone?: string }) {
  return <form action={updateStaffingAssignmentStatusAction}><input type="hidden" name="assignment_id" value={id} /><Button name="status" value={status} type="submit" size="sm" variant="ghost" title={label} aria-label={label} className={tone}><Icon className="size-4" /><span className="sr-only">{label}</span></Button></form>;
}

export function StaffingStatusActions({ assignment, locale, weeklyCapacity }: { assignment: StaffingAssignment; locale: "fr" | "en"; weeklyCapacity: number }) {
  const fr = locale === "fr";
  const [allocation, setAllocation] = useState(Number(assignment.allocation_percent));
  const weeklyHours = Number(((weeklyCapacity * allocation) / 100).toFixed(1));
  if (assignment.status === "cancelled" || assignment.status === "completed") return null;
  return <div className="flex items-center rounded-xl border border-border/70 bg-background/70 p-0.5">
    <Dialog><DialogTrigger asChild><Button type="button" size="sm" variant="ghost" title={fr ? "Modifier" : "Edit"} aria-label={fr ? "Modifier" : "Edit"}><Pencil className="size-4" /></Button></DialogTrigger><DialogContent className="max-w-xl overflow-hidden p-0"><div className="bg-[linear-gradient(125deg,#071a37,#164987_55%,#59278a)] px-7 py-6 text-white"><DialogTitle className="text-2xl">{fr ? "Modifier l’affectation" : "Edit assignment"}</DialogTitle><DialogDescription className="mt-1 text-blue-100/75">{assignment.person?.full_name} · {assignment.project?.name}</DialogDescription></div><form action={updateStaffingAssignmentAction} className="grid gap-4 p-6 sm:grid-cols-2"><input type="hidden" name="assignment_id" value={assignment.id} /><label className="grid gap-1 text-xs font-semibold sm:col-span-2">{fr ? "Rôle dans le projet" : "Project role"}<input name="project_role" required defaultValue={assignment.project_role} className="h-11 rounded-xl border border-border bg-background px-3 text-sm font-normal" /></label><label className="grid gap-1 text-xs font-semibold">{fr ? "Date de début" : "Start date"}<input name="start_date" type="date" required defaultValue={assignment.start_date} className="h-11 rounded-xl border border-border bg-background px-3 text-sm font-normal" /></label><label className="grid gap-1 text-xs font-semibold">{fr ? "Date de fin" : "End date"}<input name="end_date" type="date" required defaultValue={assignment.end_date} className="h-11 rounded-xl border border-border bg-background px-3 text-sm font-normal" /></label><label className="grid gap-1 text-xs font-semibold sm:col-span-2">{fr ? "Taux d’affectation" : "Allocation rate"}<div className="flex h-11 items-center gap-3 rounded-xl border border-border bg-background px-3"><input name="allocation_percent" type="range" min="10" max="100" step="10" value={allocation} onChange={(event) => setAllocation(Number(event.target.value))} className="flex-1 accent-blue-600" /><strong className="w-12 text-right">{allocation}%</strong></div></label><label className="grid gap-1 text-xs font-semibold">{fr ? "Heures par semaine" : "Weekly hours"}<input name="weekly_hours" value={weeklyHours} readOnly className="h-11 rounded-xl border border-border bg-muted/45 px-3 text-sm font-semibold" /></label><div className="rounded-xl border border-blue-200 bg-blue-500/[.06] p-3 text-xs"><p className="font-semibold text-blue-700 dark:text-blue-300">{fr ? "Nouvelle capacité" : "New capacity"}</p><p className="mt-1 text-muted-foreground">{weeklyHours}h / {weeklyCapacity}h</p></div><label className="grid gap-1 text-xs font-semibold sm:col-span-2">Note<textarea name="note" defaultValue={assignment.note ?? ""} rows={3} className="rounded-xl border border-border bg-background p-3 text-sm font-normal" /></label><div className="flex justify-end sm:col-span-2"><Button type="submit"><Pencil className="size-4" />{fr ? "Enregistrer" : "Save changes"}</Button></div></form></DialogContent></Dialog>
    {assignment.status === "draft" ? <StatusButton id={assignment.id} status="requested" label={fr ? "Envoyer la demande" : "Send request"} icon={Send} /> : null}
    {assignment.status === "requested" || assignment.status === "draft" ? <StatusButton id={assignment.id} status="confirmed" label={fr ? "Confirmer l’affectation" : "Confirm assignment"} icon={Check} tone="text-emerald-700 hover:text-emerald-800" /> : null}
    {assignment.status === "confirmed" ? <StatusButton id={assignment.id} status="completed" label={fr ? "Terminer la mission" : "Complete assignment"} icon={CircleStop} tone="text-blue-700 hover:text-blue-800" /> : null}
    <StatusButton id={assignment.id} status="cancelled" label={fr ? "Annuler l’affectation" : "Cancel assignment"} icon={X} tone="text-rose-700 hover:text-rose-800" />
  </div>;
}
