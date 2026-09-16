"use client";

import { useActionState, useState } from "react";
import { Plus, SquarePen } from "lucide-react";

import { createClientAction, updateClientAction, type ClientActionState } from "@/app/(app)/clients/actions";
import { useI18n } from "@/components/layout/i18n-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ModernSelect } from "@/components/ui/modern-select";
import { Textarea } from "@/components/ui/textarea";
import type { ClientFiltersData, ClientFormValues } from "@/types/client";

const initialState: ClientActionState = {};

export function ClientForm({
  mode,
  filterData,
  defaults,
  triggerLabel,
}: {
  mode: "create" | "edit";
  filterData: ClientFiltersData;
  defaults?: Partial<ClientFormValues> & { client_id?: string };
  triggerLabel?: string;
}) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const [state, formAction] = useActionState(mode === "create" ? createClientAction : updateClientAction, initialState);
  const values = state.values ?? defaults;
  const [status, setStatus] = useState<string>(values?.status ?? "prospect");
  const isOpportunity = status === "prospect";

  return (
    <Dialog>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button className="rounded-full px-5"><Plus className="size-4" />{triggerLabel ?? (isFr ? "Ajouter une relation externe" : "Add external relationship")}</Button>
        ) : (
          <Button variant="secondary" className="rounded-full px-5"><SquarePen className="size-4" />{triggerLabel ?? (isFr ? "Modifier" : "Edit")}</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? (isFr ? "Ajouter une relation externe" : "Add external relationship") : (isFr ? "Modifier la relation externe" : "Edit external relationship")}</DialogTitle>
          <DialogDescription>
            {isOpportunity
              ? (isFr ? "Renseignez les informations utiles au suivi commercial." : "Enter the details needed for sales follow-up.")
              : (isFr ? "Renseignez les informations utiles au suivi de la relation client." : "Enter the details needed for client relationship management.")}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4 sm:grid-cols-2">
          {defaults?.client_id ? <input type="hidden" name="client_id" value={defaults.client_id} /> : null}
          <input type="hidden" name="legal_name" value={values?.legal_name ?? ""} />
          <input type="hidden" name="type" value={values?.type ?? "company"} />
          <input type="hidden" name="industry" value={values?.industry ?? ""} />
          <input type="hidden" name="address" value={values?.address ?? ""} />
          <input type="hidden" name="country" value={values?.country ?? ""} />
          <input type="hidden" name="city" value={values?.city ?? ""} />
          <input type="hidden" name="website" value={values?.website ?? ""} />
          <input type="hidden" name="tax_id" value={values?.tax_id ?? ""} />

          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-name`}>{isFr ? "Client, partenaire ou organisation" : "Client, partner, or organization"}</label>
            <Input id={`${mode}-name`} name="name" defaultValue={values?.name ?? ""} placeholder={isFr ? "Ex. Société ABC" : "E.g. ABC Company"} required />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-status`}>{isFr ? "Situation" : "Status"}</label>
            <ModernSelect
              id={`${mode}-status`}
              name="status"
              value={status}
              onValueChange={setStatus}
              options={[
                { value: "prospect", label: isFr ? "Contact à suivre" : "Contact to follow up" },
                { value: "active", label: isFr ? "Client sous contrat" : "Client under contract" },
              ]}
            />
          </div>

          {isOpportunity ? (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor={`${mode}-prospect-stage`}>{isFr ? "Étape commerciale" : "Sales stage"}</label>
                <ModernSelect id={`${mode}-prospect-stage`} name="prospect_stage" defaultValue={values?.prospect_stage ?? "initial_contact"} options={[
                  { value: "initial_contact", label: isFr ? "Premier contact" : "Initial contact" },
                  { value: "qualification", label: isFr ? "À qualifier" : "Qualification" },
                  { value: "negotiation", label: isFr ? "En négociation" : "Negotiation" },
                  { value: "proposal_sent", label: isFr ? "Proposition envoyée" : "Proposal sent" },
                  { value: "pending_signature", label: isFr ? "À signer" : "Pending signature" },
                ]} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor={`${mode}-follow-up`}>{isFr ? "Prochaine relance" : "Next follow-up"}</label>
                <Input id={`${mode}-follow-up`} name="next_follow_up_at" type="date" defaultValue={values?.next_follow_up_at ?? ""} />
              </div>
            </>
          ) : (
            <>
              <input type="hidden" name="prospect_stage" value="" />
              <input type="hidden" name="next_follow_up_at" value="" />
              <div className="sm:col-span-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-muted-foreground">
                {isFr
                  ? "Ce client est dans le cycle de prestation. Les contrats et projets se créent ensuite dans leurs espaces respectifs."
                  : "This client is in the delivery cycle. Contracts and projects are then created in their respective areas."}
              </div>
            </>
          )}

          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-manager`}>{isOpportunity ? (isFr ? "Responsable du suivi commercial" : "Sales follow-up owner") : (isFr ? "Responsable de compte" : "Account manager")}</label>
            <ModernSelect
              id={`${mode}-manager`}
              name="account_manager_id"
              defaultValue={values?.account_manager_id ?? ""}
              placeholder={isFr ? "Choisir une personne" : "Choose a person"}
              options={[
                { value: "", label: isFr ? "À attribuer plus tard" : "Assign later" },
                ...filterData.accountManagers.map((manager) => ({ value: manager.id, label: manager.full_name })),
              ]}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-email`}>{isFr ? "E-mail (facultatif)" : "Email (optional)"}</label>
            <Input id={`${mode}-email`} name="contact_email" type="email" defaultValue={values?.contact_email ?? ""} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-phone`}>{isFr ? "Téléphone (facultatif)" : "Phone (optional)"}</label>
            <Input id={`${mode}-phone`} name="contact_phone" defaultValue={values?.contact_phone ?? ""} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-notes`}>{isOpportunity ? (isFr ? "Note ou prochaine action (facultatif)" : "Note or next action (optional)") : (isFr ? "Notes de la relation (facultatif)" : "Relationship notes (optional)")}</label>
            <Textarea id={`${mode}-notes`} name="notes" defaultValue={values?.notes ?? ""} placeholder={isOpportunity ? (isFr ? "Ex. Relancer après l’envoi de la proposition" : "E.g. Follow up after the proposal is sent") : (isFr ? "Ex. Préférences de communication ou contexte de la relation" : "E.g. Communication preferences or relationship context")} />
          </div>

          {state.error ? <div className="sm:col-span-2 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-red-200">{state.error}</div> : null}
          <div className="sm:col-span-2 flex justify-end"><Button type="submit" className="rounded-2xl px-5">{mode === "create" ? (isFr ? "Enregistrer" : "Save") : (isFr ? "Enregistrer les modifications" : "Save changes")}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
