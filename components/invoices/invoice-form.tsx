"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CalendarClock, Mail, Plus, ReceiptText, SquarePen, Wallet } from "lucide-react";

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
}: {
  mode: "create" | "edit";
  filterData: InvoiceFiltersData;
  defaults?: Partial<InvoiceFormValues> & { invoice_id?: string };
  triggerLabel?: string;
  returnPath?: string;
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
  const previewTitle = items.find((item) => item.name.trim())?.name ?? (isFr ? "Articles de facture" : "Invoice items");
  const previewDescription =
    items.filter((item) => item.name.trim()).map((item) => item.name.trim()).join(" • ") ||
    (isFr ? "Ajoutez un ou plusieurs articles avec leur prix." : "Add one or more items with their price.");

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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button className="rounded-full px-5"><Plus className="size-4" />{triggerLabel ?? t("finance.invoiceForm.actions.create", "Create invoice")}</Button>
        ) : (
          <Button variant="secondary" className="rounded-full px-5"><SquarePen className="size-4" />{triggerLabel ?? t("finance.invoiceForm.actions.edit", "Edit invoice")}</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[94vh] max-w-[min(96vw,1480px)] overflow-hidden rounded-[32px] border-slate-200 p-0">
        <div className="grid max-h-[94vh] gap-0 xl:grid-cols-[1.02fr_0.98fr]">
          <div className="space-y-6 overflow-y-auto bg-white px-6 py-6">
            <DialogHeader className="space-y-3 text-left">
              <DialogTitle className="text-2xl font-semibold tracking-tight">
                    {mode === "create"
                      ? t("finance.invoiceForm.titleCreate", "New client invoice")
                      : t("finance.invoiceForm.titleEdit", "Update invoice")}
              </DialogTitle>
              <DialogDescription>
                {t("finance.invoiceForm.description", "Build a clean billing record for incoming client revenue, keep the status visible, and attach any proof file directly.")}
              </DialogDescription>
            </DialogHeader>

            <form
              action={formAction}
              className="grid gap-4 sm:grid-cols-2"
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

              {isCreate ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("finance.invoiceForm.fields.invoiceNumber", "Invoice number")}</label>
                  <input type="hidden" name="invoice_number" value="" />
                  <div className="flex h-11 items-center rounded-xl border border-dashed border-input bg-background/45 px-4 text-sm text-muted-foreground">
                    {t("finance.invoiceForm.generatedAutomatically", "Generated automatically")}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor={`${mode}-invoice-number`}>{t("finance.invoiceForm.fields.invoiceNumber", "Invoice number")}</label>
                  <Input id={`${mode}-invoice-number`} name="invoice_number" defaultValue={defaults?.invoice_number ?? ""} required />
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor={`${mode}-status`}>{t("finance.invoiceForm.fields.status", "Status")}</label>
                <ModernSelect
                  id={`${mode}-status`}
                  name="status"
                  value={status}
                  onValueChange={(value) => setStatus(value as InvoiceStatus)}
                  options={[
                    { value: "draft", label: t("finance.status.invoice.draft", "Draft") },
                    { value: "sent", label: t("finance.status.invoice.sent", "En attente") },
                    { value: "paid", label: t("finance.status.invoice.paid", "(Paid)") },
                    { value: "partially_paid", label: t("finance.status.invoice.partially_paid", "Partially paid") },
                    { value: "overdue", label: t("finance.status.invoice.overdue", "Overdue") },
                    { value: "cancelled", label: t("finance.status.invoice.cancelled", "Cancelled") },
                    { value: "archived", label: t("finance.status.invoice.archived", "Archived") },
                  ]}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor={`${mode}-client`}>{t("finance.invoiceForm.fields.client", "Client")}</label>
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

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor={`${mode}-currency`}>{t("finance.invoiceForm.fields.currency", "Currency")}</label>
                <Input id={`${mode}-currency`} name="currency" value={currency} onChange={(event) => setCurrency(event.target.value)} required />
              </div>

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
                    ? "Si vous choisissez GTA, la TVA est remise à `0` et la facture utilisera le modèle GTA avec retenue à la source."
                    : "If you choose GTA, VAT is set to `0` and the invoice uses the GTA layout with withholding tax."}
                </p>
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
                  options={[
                    { value: "bank_transfer", label: isFr ? "Virement bancaire" : "Bank transfer" },
                    { value: "cash", label: isFr ? "Espèces" : "Cash" },
                    { value: "check", label: isFr ? "Chèque" : "Check" },
                    { value: "mobile_money", label: isFr ? "Mobile money" : "Mobile money" },
                    { value: "card", label: isFr ? "Carte" : "Card" },
                    { value: "other", label: isFr ? "Autre" : "Other" },
                  ]}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor={`${mode}-issue-date`}>{t("finance.invoiceForm.fields.issueDate", "Issue date")}</label>
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
                <label className="text-sm font-medium" htmlFor={`${mode}-due-date`}>{t("finance.invoiceForm.fields.dueDate", "Due date")}</label>
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

              <div className="space-y-3 sm:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-sm font-medium">
                    {isFr ? "Articles" : "Items"}
                  </label>
                  <Button
                    type="button"
                    variant="secondary"
                    className="rounded-full px-4"
                    onClick={() => setItems((current) => [...current, createEmptyItem()])}
                  >
                    <Plus className="size-4" />
                    {isFr ? "Ajouter un article" : "Add item"}
                  </Button>
                </div>

                <div className="grid gap-3">
                  {items.map((item, index) => (
                    <div key={`${mode}-item-${index}`} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 md:grid-cols-[1fr_180px_auto]">
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-slate-500">
                          {isFr ? "Nom de l'article" : "Item name"}
                        </label>
                        <Input
                          value={item.name}
                          onChange={(event) =>
                            setItems((current) =>
                              current.map((currentItem, currentIndex) =>
                                currentIndex === index ? { ...currentItem, name: event.target.value } : currentItem,
                              ),
                            )
                          }
                          placeholder={isFr ? "Ex: Audit annuel 2025" : "Ex: Annual audit 2025"}
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-medium text-slate-500">
                          {isFr ? "Prix" : "Price"}
                        </label>
                        <Input
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

                      <div className="flex items-end justify-end">
                        {index === 0 ? (
                          <span className="px-4 py-2 text-sm font-medium text-slate-400">
                            {isFr ? "Article principal" : "Primary item"}
                          </span>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            className="rounded-full px-4"
                            onClick={() =>
                              setItems((current) => current.filter((_, currentIndex) => currentIndex !== index))
                            }
                          >
                            {isFr ? "Supprimer" : "Remove"}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{t("finance.invoiceForm.fields.subtotal", "Subtotal")}</label>
                <div className="flex h-11 items-center rounded-xl border border-dashed border-input bg-background/45 px-4 text-sm text-slate-700">
                  {amountHt} {currency}
                </div>
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
                <p className="text-xs text-muted-foreground">{t("finance.invoiceForm.noTaxHint", "Use `0` if this invoice has no tax.")}</p>
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
                <Textarea id={`${mode}-notes`} name="notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
              </div>

              {state.error ? (
                <div className="sm:col-span-2 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 shadow-[0_8px_24px_rgba(185,28,28,0.08)]">
                  {state.error}
                </div>
              ) : null}

              <div className="sm:col-span-2 flex justify-end gap-2">
                <Button type="submit" className="rounded-2xl px-5">{mode === "create" ? t("finance.invoiceForm.actions.create", "Create invoice") : t("finance.invoiceForm.actions.save", "Save changes")}</Button>
              </div>
            </form>
          </div>

          <div className="overflow-y-auto border-l border-slate-200 bg-slate-50/80 px-6 py-6">
            <div className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[var(--shadow-soft)]">
              <div className="relative overflow-hidden bg-[linear-gradient(135deg,#081b38,#0f3c78_50%,#31aff6)] px-5 py-5 text-white">
                <div className="absolute inset-y-0 right-0 w-52 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.35),transparent_60%)]" />
                <div className="relative flex items-start justify-between gap-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-12 items-center justify-center rounded-2xl border border-white/12 bg-white/12 p-1">
                        {activeEntity ? <EntityLogo entity={activeEntity} size="sm" className="border-white/10 shadow-none" /> : null}
                      </div>
                      <div>
                        <p className="text-xs font-semibold tracking-[0.18em] text-white/68 uppercase">{t("finance.invoiceForm.preview.eyebrow", "Live preview")}</p>
                        <h3 className="text-2xl font-semibold tracking-tight">
                          {isCreate ? t("finance.invoiceForm.preview.pendingInvoice", "Pending invoice") : (defaults?.invoice_number ?? t("finance.invoiceForm.preview.invoice", "Invoice"))}
                        </h3>
                      </div>
                    </div>
                    <p className="max-w-md text-sm leading-6 text-white/76">
                      {isFr
                        ? "Aperçu BUMEX de la facture avec hiérarchie prête pour le PDF, informations client et rendu proche du modèle final."
                        : "BUMEX invoice preview with PDF-ready hierarchy, client details, and a layout close to the final template."}
                    </p>
                  </div>

                  <div className="rounded-[24px] border border-white/14 bg-white/10 px-4 py-3 backdrop-blur-sm">
                    <InvoiceStatusBadge status={status} />
                    <p className="mt-3 text-xs font-semibold tracking-[0.16em] text-white/62 uppercase">
                      {isFr ? "Total général" : "Grand total"}
                    </p>
                    <p className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-white">
                      {formatDecimal(amountTtc)} {currency}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-5 p-5">
                <div className="grid gap-3 md:grid-cols-2">
                  <PreviewInfoCard
                    icon={Building2}
                    label={isFr ? "Facturer à" : "Bill to"}
                    value={selectedClient?.name ?? (isFr ? "Sélectionner un client" : "Select a client")}
                    detail={
                      selectedClient?.contact_email ??
                      (isFr ? "L'e-mail client servira à la confirmation d'envoi." : "Client email will be used for delivery confirmation")
                    }
                  />
                  <PreviewInfoCard
                    icon={ReceiptText}
                    label={isFr ? "Articles de facturation" : "Invoice items"}
                    value={previewTitle}
                    detail={previewDescription}
                  />
                  <PreviewInfoCard
                    icon={CalendarClock}
                    label={isFr ? "Date d'émission" : "Issue date"}
                    value={issueDate || (isFr ? "Définir la date d'émission" : "Set issue date")}
                    detail={isFr ? "Reprise dans le PDF final et l'e-mail." : "Becomes part of the final PDF and email context"}
                  />
                  <PreviewInfoCard
                    icon={CalendarClock}
                    label={isFr ? "Date d'échéance" : "Due date"}
                    value={dueDate || (isFr ? "Définir la date d'échéance" : "Set due date")}
                    detail={isFr ? "Utilisée pour les relances et le suivi des retards." : "Used for collections, reminders, and overdue tracking"}
                  />
                </div>

                <div className="rounded-[26px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f8fbff)] p-5">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-4">
                    <div>
                      <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Invoice structure</p>
                      <p className="mt-2 text-lg font-semibold tracking-tight text-slate-950">{previewTitle}</p>
                    </div>
                    <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold tracking-[0.14em] text-slate-600 uppercase">
                      {currency}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3">
                    <PreviewMetric label={t("finance.invoiceForm.fields.status", "Status")} value={
                      status === "sent"
                        ? t("finance.status.invoice.sent", "Pending")
                        : status === "draft"
                          ? t("finance.status.invoice.draft", "Standby")
                          : t(`finance.status.invoice.${status}`, status.replaceAll("_", " "))
                    } />
                    <PreviewMetric label={t("finance.invoiceForm.fields.subtotal", "Subtotal")} value={`${amountHt} ${currency}`} />
                    <PreviewMetric label={t("finance.invoiceForm.preview.taxAmount", "Tax amount")} value={`${formatDecimal(taxAmount)} ${currency}`} />
                    <PreviewMetric label={t("finance.invoiceForm.preview.grandTotal", "Grand total")} value={`${formatDecimal(amountTtc)} ${currency}`} />
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                    {isFr ? "Articles" : "Items"}
                  </p>
                  <div className="mt-3 grid gap-3">
                    {items.filter((item) => item.name.trim()).length ? (
                      items.filter((item) => item.name.trim()).map((item, index) => (
                        <div key={`preview-item-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
                          <span className="font-medium text-slate-900">{item.name}</span>
                          <span className="font-semibold text-slate-700">{formatDecimal(item.price)} {currency}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {isFr ? "Aucun article ajouté pour le moment." : "No item added yet."}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <PreviewInfoCard
                    icon={Mail}
                    label={isFr ? "Envoi client" : "Client delivery"}
                    value={selectedClient?.contact_email ?? (isFr ? "Aucun e-mail client sélectionné" : "No client email selected")}
                    detail={
                      isFr
                        ? "Après validation, la facture peut être prévisualisée en PDF et envoyée à cette adresse ou à une autre adresse confirmée."
                        : "After validation, the invoice can be previewed as PDF and sent to this email or another confirmed address."
                    }
                  />
                  <PreviewInfoCard
                    icon={Wallet}
                    label={isFr ? "Logique d'encaissement" : "Collections logic"}
                    value={
                      paymentMethod === "cash"
                        ? (isFr ? "Espèces" : "Cash")
                        : paymentMethod === "check"
                          ? (isFr ? "Chèque" : "Check")
                          : paymentMethod === "mobile_money"
                            ? "Mobile money"
                            : paymentMethod === "card"
                              ? (isFr ? "Carte" : "Card")
                              : paymentMethod === "other"
                                ? (isFr ? "Autre" : "Other")
                                : (isFr ? "Virement bancaire" : "Bank transfer")
                    }
                    detail={
                      isFr
                        ? "Le système calcule automatiquement le sous-total à partir des articles, puis génère la facture finale."
                        : "The system computes the subtotal from your items, then generates the final invoice."
                    }
                  />
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Notes</p>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {notes.trim() ||
                      (isFr
                        ? "Aucune note ajoutée pour le moment. Utilisez cet espace pour le périmètre, les détails commerciaux ou les instructions de paiement à conserver sur la facture."
                        : "No notes added yet. Use this space for scope, commercial detail, or payment instructions that should appear in the record.")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{label}</p>
      <p className="mt-2 text-lg font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function PreviewInfoCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50/80">
          <Icon className="size-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{label}</p>
          <p className="mt-2 text-sm font-semibold text-slate-950">{value}</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
        </div>
      </div>
    </div>
  );
}
