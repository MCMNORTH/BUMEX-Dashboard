"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, SquarePen } from "lucide-react";

import {
  createInvoiceAction,
  updateInvoiceAction,
  type InvoiceActionState,
} from "@/app/(app)/finance/invoices/actions";
import { EntityLogo } from "@/components/entities/entity-logo";
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge";
import { useEntity } from "@/hooks/use-entity";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ModernSelect } from "@/components/ui/modern-select";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/components/layout/i18n-provider";
import { parseInvoiceMetadata, stripInvoiceMetadata } from "@/lib/finance/invoice-metadata";
import { formatEditableNumber, parseFormattedNumber } from "@/lib/formatters";
import type { InvoiceFiltersData, InvoiceFormValues, InvoiceLineItem, InvoiceStatus, PaymentMethod } from "@/types/finance";

const initialState: InvoiceActionState = {};

function formatDecimal(value: number) {
  return formatEditableNumber(value.toFixed(2));
}

function getDefaultTaxRate(defaults?: Partial<InvoiceFormValues>) {
  const amountHt = parseFormattedNumber(defaults?.amount_ht ?? "");
  const taxAmount = parseFormattedNumber(defaults?.tax_amount ?? "");

  if (!amountHt || !taxAmount) {
    return "0";
  }

  return formatEditableNumber(((taxAmount / amountHt) * 100).toFixed(2));
}

function createEmptyItem(): InvoiceLineItem {
  return {
    name: "",
    price: 0,
  };
}

function getDefaultItems(defaults?: Partial<InvoiceFormValues>) {
  const parsed = parseInvoiceMetadata(defaults?.notes);
  return parsed.items.length ? parsed.items : [createEmptyItem()];
}

function getDefaultPaymentMethod(defaults?: Partial<InvoiceFormValues>) {
  return parseInvoiceMetadata(defaults?.notes).paymentMethod;
}

function getComputedAmounts(amountHtValue: string, taxRateValue: string) {
  const amountHt = parseFormattedNumber(amountHtValue) ?? 0;
  const taxRate = parseFormattedNumber(taxRateValue) ?? 0;
  const taxAmount = amountHt * (taxRate / 100);
  const amountTtc = amountHt + taxAmount;

  return {
    taxAmount,
    amountTtc,
  };
}

export function InvoiceForm({
  mode,
  filterData,
  defaults,
  triggerLabel,
  returnPath,
  resetsApproval = false,
}: {
  mode: "create" | "edit";
  filterData: InvoiceFiltersData;
  defaults?: Partial<InvoiceFormValues> & { invoice_id?: string };
  triggerLabel?: string;
  returnPath?: string;
  resetsApproval?: boolean;
}) {
  const { locale, t } = useI18n();
  const isFr = locale === "fr";
  const router = useRouter();
  const { activeEntity } = useEntity();
  const [state, formAction] = useActionState(mode === "create" ? createInvoiceAction : updateInvoiceAction, initialState);
  const isCreate = mode === "create";
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InvoiceLineItem[]>(() => getDefaultItems(defaults));
  const [taxRate, setTaxRate] = useState(() => getDefaultTaxRate(defaults));
  const [status, setStatus] = useState<InvoiceStatus>(() => defaults?.status ?? "sent");
  const [clientId, setClientId] = useState(() => defaults?.client_id ?? "");
  const [projectId, setProjectId] = useState(() => defaults?.project_id ?? "");
  const [contractId, setContractId] = useState(() => defaults?.contract_id ?? "");
  const [currency, setCurrency] = useState(() => defaults?.currency ?? "USD");
  const [issueDate, setIssueDate] = useState(() => defaults?.issue_date ?? "");
  const [dueDate, setDueDate] = useState(() => defaults?.due_date ?? "");
  const [notes, setNotes] = useState(() => stripInvoiceMetadata(defaults?.notes));
  const [gtaMode, setGtaMode] = useState<"standard" | "gta">(() =>
    (defaults?.notes ?? "").toLowerCase().includes("[tax_regime:gta]") || (defaults?.notes ?? "").toLowerCase().includes("gta")
      ? "gta"
      : "standard",
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(() => getDefaultPaymentMethod(defaults));
  const previewWindowRef = useRef<Window | null>(null);

  const amountHtValue = items.reduce((sum, item) => sum + (Number.isFinite(item.price) ? item.price : 0), 0);
  const amountHt = formatDecimal(amountHtValue);
  const { taxAmount, amountTtc } = getComputedAmounts(amountHt, taxRate);
  const selectedClient = filterData.clients.find((client) => client.id === clientId) ?? null;

  useEffect(() => {
    if (!state?.success || !state.previewUrl || !isCreate) {
      return;
    }

    const previewHref = new URL(state.previewUrl, window.location.origin).toString();
    const openedWindow = previewWindowRef.current;
    if (openedWindow && !openedWindow.closed) {
      openedWindow.location.replace(previewHref);
    } else {
      const nextWindow = window.open(previewHref, "_blank", "noopener,noreferrer");
      if (!nextWindow) {
        router.push(state.previewUrl);
      }
    }

    previewWindowRef.current = null;
    queueMicrotask(() => setOpen(false));
    router.refresh();
  }, [isCreate, router, state]);

  useEffect(() => {
    if (!state?.error) {
      return;
    }

    const openedWindow = previewWindowRef.current;
    if (openedWindow && !openedWindow.closed) {
      openedWindow.close();
    }
    previewWindowRef.current = null;
  }, [state?.error]);

  const paymentMethodLabel = {
    bank_transfer: isFr ? "Virement bancaire" : "Bank transfer",
    cash: isFr ? "Espèces" : "Cash",
    check: isFr ? "Chèque" : "Check",
    mobile_money: "Mobile money",
    card: isFr ? "Carte" : "Card",
    other: isFr ? "Autre" : "Other",
  } satisfies Record<PaymentMethod, string>;
  const namedItems = items.filter((item) => item.name.trim());

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button><Plus className="size-4" />{triggerLabel ?? t("finance.invoiceForm.actions.create", "Create invoice")}</Button>
        ) : (
          <Button variant="secondary"><SquarePen className="size-4" />{triggerLabel ?? t("finance.invoiceForm.actions.edit", "Edit invoice")}</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[94vh] max-w-[min(96vw,1200px)] overflow-hidden p-0">
        <div className="grid max-h-[94vh] gap-0 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-5 overflow-y-auto px-6 py-6">
            <DialogHeader className="text-left">
              <DialogTitle className="text-xl">
                {mode === "create"
                  ? t("finance.invoiceForm.titleCreate", "New client invoice")
                  : t("finance.invoiceForm.titleEdit", "Update invoice")}
              </DialogTitle>
              <DialogDescription>
                {isFr
                  ? "Remplissez les quatre étapes. Les champs marqués * sont obligatoires."
                  : "Fill in the four steps. Fields marked * are required."}
              </DialogDescription>
            </DialogHeader>

            {mode === "edit" && resetsApproval ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
                <p className="font-semibold">{isFr ? "Cette facture est actuellement validée" : "This invoice is currently approved"}</p>
                <p className="mt-1">{isFr ? "L’enregistrement d’une modification retirera automatiquement la validation et rebloquera le téléchargement ainsi que l’envoi." : "Saving any change will automatically remove approval and lock download and delivery again."}</p>
              </div>
            ) : null}

            <form
              action={formAction}
              className="space-y-6"
              onSubmit={() => {
                if (!isCreate) {
                  return;
                }

                previewWindowRef.current = window.open("", "_blank");
                if (previewWindowRef.current) {
                  previewWindowRef.current.document.write(
                    `<title>${isFr ? "Préparation de la facture..." : "Preparing invoice..."}</title><body style="font-family:Arial,sans-serif;padding:24px;color:#0f172a">${isFr ? "Préparation de l'aperçu de facture..." : "Preparing invoice preview..."}</body>`,
                  );
                }
              }}
            >
              {defaults?.invoice_id ? <input type="hidden" name="invoice_id" value={defaults.invoice_id} /> : null}
              {returnPath ? <input type="hidden" name="return_path" value={returnPath} /> : null}
              <input type="hidden" name="ui_locale" value={locale} />
              <input type="hidden" name="invoice_items" value={JSON.stringify(items)} />
              <input type="hidden" name="tax_amount" value={formatDecimal(taxAmount)} />
              <input type="hidden" name="amount_ht" value={amountHt} />
              <input type="hidden" name="amount_ttc" value={formatDecimal(amountTtc)} />

              <FormSection step={1} title={isFr ? "Client et références" : "Client and references"}>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor={`${mode}-client`}>{t("finance.invoiceForm.fields.client", "Client")} <RequiredMark /></label>
                  <ModernSelect
                    id={`${mode}-client`}
                    name="client_id"
                    value={clientId}
                    onValueChange={setClientId}
                    placeholder={t("finance.invoiceForm.placeholders.selectClient", "Select client")}
                    options={[
                      { value: "", label: t("finance.invoiceForm.placeholders.selectClient", "Select client") },
                      ...filterData.clients.map((client) => ({ value: client.id, label: client.name })),
                    ]}
                  />
                </div>

                {isCreate ? (
                  <div className="space-y-2">
                    <span className="text-sm font-medium">{t("finance.invoiceForm.fields.invoiceNumber", "Invoice number")}</span>
                    <input type="hidden" name="invoice_number" value="" />
                    <div className="flex h-9 items-center rounded-lg border border-dashed border-input px-3 text-sm text-muted-foreground">
                      {t("finance.invoiceForm.generatedAutomatically", "Generated automatically")}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor={`${mode}-invoice-number`}>{t("finance.invoiceForm.fields.invoiceNumber", "Invoice number")} <RequiredMark /></label>
                    <Input id={`${mode}-invoice-number`} name="invoice_number" defaultValue={defaults?.invoice_number ?? ""} required />
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor={`${mode}-project`}>{t("finance.invoiceForm.fields.project", "Project")}</label>
                  <ModernSelect
                    id={`${mode}-project`}
                    name="project_id"
                    value={projectId}
                    onValueChange={setProjectId}
                    placeholder={t("finance.invoiceForm.placeholders.noLinkedProject", "No linked project")}
                    options={[
                      { value: "", label: t("finance.invoiceForm.placeholders.noLinkedProject", "No linked project") },
                      ...filterData.projects.map((project) => ({ value: project.id, label: project.name })),
                    ]}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor={`${mode}-contract`}>{t("finance.invoiceForm.fields.contract", "Contract")}</label>
                  <ModernSelect
                    id={`${mode}-contract`}
                    name="contract_id"
                    value={contractId}
                    onValueChange={setContractId}
                    placeholder={t("finance.invoiceForm.placeholders.noLinkedContract", "No linked contract")}
                    options={[
                      { value: "", label: t("finance.invoiceForm.placeholders.noLinkedContract", "No linked contract") },
                      ...filterData.contracts.map((contract) => ({ value: contract.id, label: contract.title })),
                    ]}
                  />
                </div>
              </FormSection>

              <FormSection
                step={2}
                title={<>{isFr ? "Articles" : "Items"} <RequiredMark /></>}
                action={(
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setItems((current) => [...current, createEmptyItem()])}
                  >
                    <Plus className="size-4" />
                    {isFr ? "Ajouter un article" : "Add item"}
                  </Button>
                )}
              >
                <div className="space-y-2 sm:col-span-2">
                  {items.map((item, index) => (
                    <div key={`${mode}-item-${index}`} className="grid gap-2 sm:grid-cols-[1fr_9rem_auto] sm:items-end">
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground" htmlFor={`${mode}-item-name-${index}`}>
                          {isFr ? "Description" : "Description"}
                        </label>
                        <Input
                          id={`${mode}-item-name-${index}`}
                          value={item.name}
                          onChange={(event) =>
                            setItems((current) =>
                              current.map((currentItem, currentIndex) =>
                                currentIndex === index ? { ...currentItem, name: event.target.value } : currentItem,
                              ),
                            )
                          }
                          placeholder={isFr ? "Ex : Audit annuel 2025" : "e.g. Annual audit 2025"}
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground" htmlFor={`${mode}-item-price-${index}`}>
                          {isFr ? `Prix (${currency})` : `Price (${currency})`}
                        </label>
                        <Input
                          id={`${mode}-item-price-${index}`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={Number.isFinite(item.price) ? item.price : 0}
                          onChange={(event) =>
                            setItems((current) =>
                              current.map((currentItem, currentIndex) =>
                                currentIndex === index ? { ...currentItem, price: Number(event.target.value) } : currentItem,
                              ),
                            )
                          }
                        />
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        className="text-muted-foreground"
                        disabled={items.length === 1}
                        onClick={() =>
                          setItems((current) => current.filter((_, currentIndex) => currentIndex !== index))
                        }
                      >
                        {isFr ? "Retirer" : "Remove"}
                      </Button>
                    </div>
                  ))}
                </div>
              </FormSection>

              <FormSection step={3} title={isFr ? "Taxes et total" : "Tax and total"}>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor={`${mode}-gta-mode`}>
                    {isFr ? "Régime GTA" : "GTA regime"}
                  </label>
                  <ModernSelect
                    id={`${mode}-gta-mode`}
                    name="gta_mode"
                    value={gtaMode}
                    onValueChange={(value) => {
                      const nextValue = value as "standard" | "gta";
                      setGtaMode(nextValue);
                      if (nextValue === "gta") {
                        setTaxRate("0");
                      }
                    }}
                    options={[
                      { value: "standard", label: isFr ? "Non" : "No" },
                      { value: "gta", label: isFr ? "Oui" : "Yes" },
                    ]}
                  />
                  <p className="text-xs text-muted-foreground">
                    {isFr
                      ? "Avec GTA, la TVA passe à 0 et la facture utilise le modèle GTA avec retenue à la source."
                      : "With GTA, VAT is set to 0 and the invoice uses the GTA layout with withholding tax."}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor={`${mode}-tax-rate`}>{t("finance.invoiceForm.fields.taxRate", "Tax rate %")}</label>
                  <Input
                    id={`${mode}-tax-rate`}
                    name="tax_rate"
                    type="text"
                    inputMode="decimal"
                    value={taxRate}
                    disabled={gtaMode === "gta"}
                    onChange={(event) => setTaxRate(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">{t("finance.invoiceForm.noTaxHint", "Use 0 if this invoice has no tax.")}</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor={`${mode}-currency`}>{t("finance.invoiceForm.fields.currency", "Currency")} <RequiredMark /></label>
                  <Input id={`${mode}-currency`} name="currency" value={currency} onChange={(event) => setCurrency(event.target.value)} required />
                </div>

                <dl className="space-y-1 rounded-lg bg-muted/60 px-3 py-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{t("finance.invoiceForm.fields.subtotal", "Subtotal")}</dt>
                    <dd className="tabular-nums">{amountHt} {currency}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{t("finance.invoiceForm.preview.taxAmount", "Tax amount")}</dt>
                    <dd className="tabular-nums">{formatDecimal(taxAmount)} {currency}</dd>
                  </div>
                  <div className="flex justify-between gap-3 font-semibold">
                    <dt>{t("finance.invoiceForm.preview.grandTotal", "Grand total")}</dt>
                    <dd className="tabular-nums">{formatDecimal(amountTtc)} {currency}</dd>
                  </div>
                </dl>
              </FormSection>

              <FormSection step={4} title={isFr ? "Dates, paiement et pièces" : "Dates, payment and files"}>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor={`${mode}-issue-date`}>{t("finance.invoiceForm.fields.issueDate", "Issue date")} <RequiredMark /></label>
                  <Input
                    id={`${mode}-issue-date`}
                    name="issue_date"
                    type="date"
                    value={issueDate}
                    onChange={(event) => {
                      const nextIssueDate = event.target.value;
                      setIssueDate(nextIssueDate);
                      if (dueDate && nextIssueDate && dueDate < nextIssueDate) {
                        setDueDate(nextIssueDate);
                      }
                    }}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor={`${mode}-due-date`}>{t("finance.invoiceForm.fields.dueDate", "Due date")} <RequiredMark /></label>
                  <Input
                    id={`${mode}-due-date`}
                    name="due_date"
                    type="date"
                    min={issueDate || undefined}
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor={`${mode}-payment-method`}>
                    {isFr ? "Mode de paiement" : "Payment method"}
                  </label>
                  <ModernSelect
                    id={`${mode}-payment-method`}
                    name="payment_method"
                    value={paymentMethod}
                    onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}
                    options={(Object.keys(paymentMethodLabel) as PaymentMethod[]).map((method) => ({
                      value: method,
                      label: paymentMethodLabel[method],
                    }))}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor={`${mode}-status`}>{t("finance.invoiceForm.fields.status", "Status")} <RequiredMark /></label>
                  <ModernSelect
                    id={`${mode}-status`}
                    name="status"
                    value={status}
                    onValueChange={(value) => setStatus(value as InvoiceStatus)}
                    options={[
                      { value: "draft", label: t("finance.status.invoice.draft", "Draft") },
                      { value: "sent", label: t("finance.status.invoice.sent", "Pending") },
                      { value: "paid", label: t("finance.status.invoice.paid", "Paid") },
                      { value: "partially_paid", label: t("finance.status.invoice.partially_paid", "Partially paid") },
                      { value: "overdue", label: t("finance.status.invoice.overdue", "Overdue") },
                      { value: "cancelled", label: t("finance.status.invoice.cancelled", "Cancelled") },
                      { value: "archived", label: t("finance.status.invoice.archived", "Archived") },
                    ]}
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <label className="text-sm font-medium" htmlFor={`${mode}-supporting-file`}>{t("finance.invoiceForm.fields.supportingFile", "Invoice file or proof")}</label>
                  <Input id={`${mode}-supporting-file`} name="supporting_file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" />
                  <p className="text-xs text-muted-foreground">
                    {t("finance.invoiceForm.supportingFileHint", "Attach the finalized invoice PDF, signed client copy, or any supporting file.")}
                  </p>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <label className="text-sm font-medium" htmlFor={`${mode}-notes`}>{t("finance.invoiceForm.fields.notes", "Notes")}</label>
                  <Textarea id={`${mode}-notes`} name="notes" rows={3} className="min-h-20" value={notes} onChange={(event) => setNotes(event.target.value)} />
                </div>
              </FormSection>

              {state.error ? (
                <div role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
                  {state.error}
                </div>
              ) : null}

              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button type="submit">{mode === "create" ? t("finance.invoiceForm.actions.create", "Create invoice") : t("finance.invoiceForm.actions.save", "Save changes")}</Button>
              </div>
            </form>
          </div>

          <aside className="hidden overflow-y-auto border-l border-border bg-muted/40 px-5 py-6 lg:block">
            <div className="space-y-4 rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                {activeEntity ? <EntityLogo entity={activeEntity} size="sm" /> : null}
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{t("finance.invoiceForm.preview.eyebrow", "Live preview")}</p>
                  <p className="truncate text-base font-semibold">
                    {isCreate ? t("finance.invoiceForm.preview.pendingInvoice", "Pending invoice") : (defaults?.invoice_number ?? t("finance.invoiceForm.preview.invoice", "Invoice"))}
                  </p>
                </div>
              </div>

              <InvoiceStatusBadge status={status} />

              <div className="space-y-0.5 text-sm">
                <p className="text-xs text-muted-foreground">{isFr ? "Facturer à" : "Bill to"}</p>
                <p className="font-medium">{selectedClient?.name ?? (isFr ? "Aucun client choisi" : "No client selected")}</p>
                {selectedClient?.contact_email ? <p className="text-xs text-muted-foreground">{selectedClient.contact_email}</p> : null}
              </div>

              <ul className="space-y-1.5 border-y border-border py-3 text-sm">
                {namedItems.length ? (
                  namedItems.map((item, index) => (
                    <li key={`preview-item-${index}`} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">{item.name}</span>
                      <span className="shrink-0 tabular-nums">{formatDecimal(item.price)}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-muted-foreground">{isFr ? "Aucun article pour le moment." : "No item yet."}</li>
                )}
              </ul>

              <dl className="space-y-1 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{t("finance.invoiceForm.fields.subtotal", "Subtotal")}</dt>
                  <dd className="tabular-nums">{amountHt}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{t("finance.invoiceForm.preview.taxAmount", "Tax amount")}</dt>
                  <dd className="tabular-nums">{formatDecimal(taxAmount)}</dd>
                </div>
                <div className="flex justify-between gap-3 text-base font-semibold">
                  <dt>{t("finance.invoiceForm.preview.grandTotal", "Grand total")}</dt>
                  <dd className="tabular-nums">{formatDecimal(amountTtc)} {currency}</dd>
                </div>
              </dl>

              <dl className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">{isFr ? "Émise le" : "Issued"}</dt>
                  <dd>{issueDate || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{isFr ? "Échéance" : "Due"}</dt>
                  <dd>{dueDate || "—"}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-muted-foreground">{isFr ? "Paiement" : "Payment"}</dt>
                  <dd>{paymentMethodLabel[paymentMethod]}</dd>
                </div>
              </dl>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RequiredMark() {
  return <span aria-hidden="true" className="text-danger">*</span>;
}

function FormSection({
  step,
  title,
  action,
  children,
}: {
  step: number;
  title: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="relative">
      <legend className="mb-3 flex min-h-7 items-center gap-2 text-sm font-semibold">
        <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{step}</span>
        {title}
      </legend>
      {action ? <div className="absolute top-0 right-0">{action}</div> : null}
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}
