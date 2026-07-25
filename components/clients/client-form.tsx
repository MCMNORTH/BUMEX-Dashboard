"use client";

import { useActionState } from "react";
import { Plus, SquarePen } from "lucide-react";

import {
  createClientAction,
  updateClientAction,
  type ClientActionState,
} from "@/app/(app)/clients/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  const [state, formAction] = useActionState(
    mode === "create" ? createClientAction : updateClientAction,
    initialState,
  );
  const values = state.values ?? defaults;

  return (
    <Dialog>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button className="rounded-full px-5">
            <Plus className="size-4" />
            {triggerLabel ?? "Create client"}
          </Button>
        ) : (
          <Button variant="secondary" className="rounded-full px-5">
            <SquarePen className="size-4" />
            {triggerLabel ?? "Edit client"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Create client" : "Edit client"}</DialogTitle>
          <DialogDescription>
            Maintain a structured client record with legal, operational, and account ownership context.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4 sm:grid-cols-2">
          {defaults?.client_id ? <input type="hidden" name="client_id" value={defaults.client_id} /> : null}

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-name`}>Display name</label>
            <Input id={`${mode}-name`} name="name" defaultValue={values?.name ?? ""} required />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-legal-name`}>Legal name</label>
            <Input id={`${mode}-legal-name`} name="legal_name" defaultValue={values?.legal_name ?? ""} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-type`}>Client type</label>
            <ModernSelect
              id={`${mode}-type`}
              name="type"
              defaultValue={values?.type ?? "company"}
              options={[
                { value: "company", label: "Company" },
                { value: "public_institution", label: "Public institution" },
                { value: "ngo", label: "NGO" },
                { value: "individual", label: "Individual" },
                { value: "other", label: "Other" },
              ]}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-status`}>Status</label>
            <ModernSelect
              id={`${mode}-status`}
              name="status"
              defaultValue={values?.status ?? "prospect"}
              options={[
                { value: "prospect", label: "Prospect" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
                { value: "suspended", label: "Suspended" },
                { value: "archived", label: "Archived" },
              ]}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-industry`}>Industry</label>
            <Input id={`${mode}-industry`} name="industry" defaultValue={values?.industry ?? ""} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-manager`}>Account manager</label>
            <ModernSelect
              id={`${mode}-manager`}
              name="account_manager_id"
              defaultValue={values?.account_manager_id ?? ""}
              placeholder="No manager"
              options={[
                { value: "", label: "No manager" },
                ...filterData.accountManagers.map((manager) => ({
                  value: manager.id,
                  label: manager.full_name,
                })),
              ]}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-email`}>Contact email</label>
            <Input id={`${mode}-email`} name="contact_email" type="email" defaultValue={values?.contact_email ?? ""} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-phone`}>Contact phone</label>
            <Input id={`${mode}-phone`} name="contact_phone" defaultValue={values?.contact_phone ?? ""} />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-address`}>Address</label>
            <Input id={`${mode}-address`} name="address" defaultValue={values?.address ?? ""} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-country`}>Country</label>
            <Input id={`${mode}-country`} name="country" defaultValue={values?.country ?? ""} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-city`}>City</label>
            <Input id={`${mode}-city`} name="city" defaultValue={values?.city ?? ""} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-website`}>Website</label>
            <Input id={`${mode}-website`} name="website" type="url" defaultValue={values?.website ?? ""} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-tax-id`}>Tax ID</label>
            <Input id={`${mode}-tax-id`} name="tax_id" defaultValue={values?.tax_id ?? ""} />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-notes`}>Notes</label>
            <Textarea
              id={`${mode}-notes`}
              name="notes"
              defaultValue={values?.notes ?? ""}
              placeholder="Relationship notes, delivery context, or internal account observations"
            />
          </div>

          {state.error ? (
            <div className="sm:col-span-2 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-red-200">
              {state.error}
            </div>
          ) : null}

          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button type="submit" className="rounded-2xl px-5">
              {mode === "create" ? "Create client" : "Save changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
