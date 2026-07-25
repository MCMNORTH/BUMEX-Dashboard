"use client";

import { useActionState } from "react";
import { CloudUpload, SquarePen } from "lucide-react";

import {
  createDocumentAction,
  updateDocumentAction,
  type DocumentActionState,
} from "@/app/(app)/documents/actions";
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
import type { DocumentFiltersData, DocumentFormValues } from "@/types/document";

const initialState: DocumentActionState = {};

export function DocumentUploadForm({
  mode,
  filterData,
  defaults,
  triggerLabel,
}: {
  mode: "create" | "edit";
  filterData: DocumentFiltersData;
  defaults?: Partial<DocumentFormValues> & { document_id?: string };
  triggerLabel?: string;
}) {
  const [state, formAction] = useActionState(
    mode === "create" ? createDocumentAction : updateDocumentAction,
    initialState,
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button className="rounded-full px-5">
            <CloudUpload className="size-4" />
            {triggerLabel ?? "Upload document"}
          </Button>
        ) : (
          <Button variant="secondary" className="rounded-full px-5">
            <SquarePen className="size-4" />
            {triggerLabel ?? "Edit metadata"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Upload document" : "Edit document"}</DialogTitle>
          <DialogDescription>
            Register controlled records with visibility, linked business scope, and archive-ready metadata.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4 sm:grid-cols-2">
          {defaults?.document_id ? (
            <input type="hidden" name="document_id" value={defaults.document_id} />
          ) : null}

          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-title`}>
              Title
            </label>
            <Input id={`${mode}-title`} name="title" defaultValue={defaults?.title ?? ""} required />
          </div>

          {mode === "create" ? (
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium" htmlFor={`${mode}-file`}>
                File
              </label>
              <Input id={`${mode}-file`} name="file" type="file" required />
              <p className="text-xs text-muted-foreground">
                Files are limited to 10 MB and stored in the protected documents bucket.
              </p>
            </div>
          ) : null}

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-document-type`}>
              Document type
            </label>
            <ModernSelect
              id={`${mode}-document-type`}
              name="document_type"
              defaultValue={defaults?.document_type ?? "report"}
              options={[
                { value: "contract", label: "Contract" },
                { value: "invoice", label: "Invoice" },
                { value: "receipt", label: "Receipt" },
                { value: "bank_transfer", label: "Bank transfer" },
                { value: "proposal", label: "Proposal" },
                { value: "report", label: "Report" },
                { value: "meeting_note", label: "Meeting note" },
                { value: "technical_document", label: "Technical document" },
                { value: "legal_document", label: "Legal document" },
                { value: "other", label: "Other" },
              ]}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-visibility`}>
              Visibility
            </label>
            <ModernSelect
              id={`${mode}-visibility`}
              name="visibility"
              defaultValue={defaults?.visibility ?? "internal"}
              options={[
                { value: "internal", label: "Internal" },
                { value: "management", label: "Management" },
                { value: "shareholders", label: "Shareholders" },
                { value: "restricted", label: "Restricted" },
              ]}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-related-type`}>
              Linked to
            </label>
            <ModernSelect
              id={`${mode}-related-type`}
              name="related_type"
              defaultValue={defaults?.related_type ?? "archive"}
              options={[
                { value: "archive", label: "General archive" },
                { value: "client", label: "Client" },
                { value: "project", label: "Project" },
                { value: "contract", label: "Contract" },
                { value: "invoice", label: "Invoice" },
                { value: "task", label: "Ticket" },
                { value: "payment", label: "Payment" },
                { value: "transfer", label: "Transfer" },
              ]}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-related-id`}>
              Linked record
            </label>
            <ModernSelect
              id={`${mode}-related-id`}
              name="related_id"
              defaultValue={defaults?.related_id ?? ""}
              placeholder="Archive / none"
              options={[
                { value: "", label: "Archive / none" },
                ...(defaults?.related_type === "payment" && defaults?.related_id
                  ? [{ value: defaults.related_id, label: `Payment: ${defaults.related_id}` }]
                  : []),
                ...(defaults?.related_type === "transfer" && defaults?.related_id
                  ? [{ value: defaults.related_id, label: `Transfer: ${defaults.related_id}` }]
                  : []),
                ...filterData.clients.map((client) => ({
                  value: client.id,
                  label: `Client: ${client.name}`,
                })),
                ...filterData.projects.map((project) => ({
                  value: project.id,
                  label: `Project: ${project.name}`,
                })),
                ...filterData.contracts.map((contract) => ({
                  value: contract.id,
                  label: `Contract: ${contract.title}`,
                })),
                ...filterData.invoices.map((invoice) => ({
                  value: invoice.id,
                  label: `Invoice: ${invoice.invoice_number}`,
                })),
                ...filterData.tickets.map((ticket) => ({
                  value: ticket.id,
                  label: `Ticket: ${ticket.title}`,
                })),
                ...filterData.payments.map((payment) => ({
                  value: payment.id,
                  label: `Payment: ${payment.reference?.trim() || `${payment.currency} ${payment.amount}`}`,
                })),
                ...filterData.transfers.map((transfer) => ({
                  value: transfer.id,
                  label: `Transfer: ${transfer.transfer_reference}`,
                })),
              ]}
            />
            <p className="text-xs text-muted-foreground">
              Match the linked record with the selected relation. Archive documents can stay unlinked.
            </p>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium" htmlFor={`${mode}-description`}>
              Description
            </label>
            <Textarea id={`${mode}-description`} name="description" defaultValue={defaults?.description ?? ""} />
          </div>

          {state.error ? (
            <div className="sm:col-span-2 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-red-200">
              {state.error}
            </div>
          ) : null}

          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" className="rounded-2xl px-5">
              {mode === "create" ? "Upload document" : "Save metadata"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
