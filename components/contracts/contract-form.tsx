"use client";

import { useActionState } from "react";
import { Plus, SquarePen } from "lucide-react";

import {
  createContractAction,
  updateContractAction,
  type ContractActionState,
} from "@/app/(app)/contracts/actions";
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
import type { ContractFiltersData, ContractFormValues } from "@/types/contract";

const initialState: ContractActionState = {};

export function ContractForm({
  mode,
  filterData,
  defaults,
  triggerLabel,
}: {
  mode: "create" | "edit";
  filterData: ContractFiltersData;
  defaults?: Partial<ContractFormValues> & { contract_id?: string };
  triggerLabel?: string;
}) {
  const [state, formAction] = useActionState(
    mode === "create" ? createContractAction : updateContractAction,
    initialState,
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button className="rounded-full px-5">
            <Plus className="size-4" />
            {triggerLabel ?? "Create contract"}
          </Button>
        ) : (
          <Button variant="secondary" className="rounded-full px-5">
            <SquarePen className="size-4" />
            {triggerLabel ?? "Edit contract"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Create contract" : "Edit contract"}</DialogTitle>
          <DialogDescription>
            Manage contract metadata, renewal timing, linked client/project scope, and commercial context.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4 sm:grid-cols-2">
          {defaults?.contract_id ? <input type="hidden" name="contract_id" value={defaults.contract_id} /> : null}

          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-title`}>Title</label>
            <Input id={`${mode}-title`} name="title" defaultValue={defaults?.title ?? ""} required />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-number`}>Contract number</label>
            <Input id={`${mode}-number`} name="contract_number" defaultValue={defaults?.contract_number ?? ""} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-client`}>Client</label>
            <ModernSelect
              id={`${mode}-client`}
              name="client_id"
              defaultValue={defaults?.client_id ?? ""}
              placeholder="Select client"
              options={[
                { value: "", label: "Select client" },
                ...filterData.clients.map((client) => ({
                  value: client.id,
                  label: client.name,
                })),
              ]}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-project`}>Linked project</label>
            <ModernSelect
              id={`${mode}-project`}
              name="project_id"
              defaultValue={defaults?.project_id ?? ""}
              placeholder="No linked project"
              options={[
                { value: "", label: "No linked project" },
                ...filterData.projects.map((project) => ({
                  value: project.id,
                  label: project.name,
                })),
              ]}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-status`}>Status</label>
            <ModernSelect
              id={`${mode}-status`}
              name="status"
              defaultValue={defaults?.status ?? "draft"}
              options={[
                { value: "draft", label: "Draft" },
                { value: "under_review", label: "Under review" },
                { value: "signed", label: "Signed" },
                { value: "active", label: "Active" },
                { value: "expired", label: "Expired" },
                { value: "cancelled", label: "Cancelled" },
                { value: "archived", label: "Archived" },
              ]}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-type`}>Contract type</label>
            <ModernSelect
              id={`${mode}-type`}
              name="contract_type"
              defaultValue={defaults?.contract_type ?? "development"}
              options={[
                { value: "development", label: "Development" },
                { value: "maintenance", label: "Maintenance" },
                { value: "consulting", label: "Consulting" },
                { value: "support", label: "Support" },
                { value: "hosting", label: "Hosting" },
                { value: "audit", label: "Audit" },
                { value: "other", label: "Other" },
              ]}
            />
          </div>

          <div className="space-y-2"><label className="text-sm font-medium" htmlFor={`${mode}-start`}>Start date</label><Input id={`${mode}-start`} name="start_date" type="date" defaultValue={defaults?.start_date ?? ""} /></div>
          <div className="space-y-2"><label className="text-sm font-medium" htmlFor={`${mode}-end`}>End date</label><Input id={`${mode}-end`} name="end_date" type="date" defaultValue={defaults?.end_date ?? ""} /></div>
          <div className="space-y-2"><label className="text-sm font-medium" htmlFor={`${mode}-signed`}>Signed date</label><Input id={`${mode}-signed`} name="signed_date" type="date" defaultValue={defaults?.signed_date ?? ""} /></div>
          <div className="space-y-2"><label className="text-sm font-medium" htmlFor={`${mode}-renewal`}>Renewal date</label><Input id={`${mode}-renewal`} name="renewal_date" type="date" defaultValue={defaults?.renewal_date ?? ""} /></div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-amount`}>Amount</label>
            <Input id={`${mode}-amount`} name="amount" type="number" min="0" step="0.01" defaultValue={defaults?.amount ?? ""} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-currency`}>Currency</label>
            <Input id={`${mode}-currency`} name="currency" defaultValue={defaults?.currency ?? "USD"} required />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-owner`}>Responsible user</label>
            <ModernSelect
              id={`${mode}-owner`}
              name="responsible_user_id"
              defaultValue={defaults?.responsible_user_id ?? ""}
              placeholder="No owner"
              options={[
                { value: "", label: "No owner" },
                ...filterData.responsibleUsers.map((user) => ({
                  value: user.id,
                  label: user.full_name,
                })),
              ]}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-terms`}>Payment terms</label>
            <Input id={`${mode}-terms`} name="payment_terms" defaultValue={defaults?.payment_terms ?? ""} />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-notes`}>Notes</label>
            <Textarea id={`${mode}-notes`} name="notes" defaultValue={defaults?.notes ?? ""} />
          </div>

          {state.error ? (
            <div className="sm:col-span-2 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-red-200">
              {state.error}
            </div>
          ) : null}

          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button type="submit" className="rounded-2xl px-5">
              {mode === "create" ? "Create contract" : "Save changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
