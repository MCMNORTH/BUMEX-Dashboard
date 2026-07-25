"use client";

import type { ChangeEvent } from "react";
import { useActionState, useMemo, useState } from "react";
import { Building2, FileSpreadsheet, Plus, Upload } from "lucide-react";

import {
  createBankStatementAction,
  type BankStatementActionState,
} from "@/app/(app)/finance/actions";
import { useI18n } from "@/components/layout/i18n-provider";
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
import { Textarea } from "@/components/ui/textarea";
import { formatFinanceCurrency } from "@/lib/finance/helpers";

const initialState: BankStatementActionState = {};

function parseStatementLineDate(value: string) {
  const trimmed = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const slashMatch = trimmed.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return `${year}-${month}-${day}`;
  }

  return null;
}

function parseAmount(value: string) {
  const cleaned = value.replace(/[A-Za-z]/g, "").replace(/\s/g, "").replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePreviewLines(rawContent: string) {
  const rows = rawContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return rows.flatMap((row) => {
    const columns = row.split(/\t|;|\|/).map((part) => part.trim());
    if (columns.length < 3) {
      return [];
    }

    const lineDate = parseStatementLineDate(columns[0]);
    if (!lineDate) {
      return [];
    }

    const description = columns[1];
    let reference: string | null = null;
    let credit = 0;
    let debit = 0;

    if (columns.length >= 5) {
      reference = columns[2] || null;
      credit = parseAmount(columns[3]) ?? 0;
      debit = parseAmount(columns[4]) ?? 0;
    } else if (columns.length === 4) {
      reference = columns[2] || null;
      const amount = parseAmount(columns[3]) ?? 0;
      if (amount >= 0) {
        credit = amount;
      } else {
        debit = Math.abs(amount);
      }
    } else {
      const amount = parseAmount(columns[2]) ?? 0;
      if (amount >= 0) {
        credit = amount;
      } else {
        debit = Math.abs(amount);
      }
    }

    if (!description || (credit === 0 && debit === 0)) {
      return [];
    }

    return [
      {
        line_date: lineDate,
        description,
        reference,
        amount: credit - debit,
      },
    ];
  });
}

export function BankStatementForm() {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const [state, formAction, pending] = useActionState(createBankStatementAction, initialState);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [currency, setCurrency] = useState("USD");

  const previewLines = useMemo(() => parsePreviewLines(fileContent), [fileContent]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      setSelectedFileName("");
      setFileContent("");
      return;
    }

    setSelectedFileName(file.name);
    setFileContent(await file.text());
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="rounded-full px-5">
          <Plus className="size-4" />
          {isFr ? "Importer un relevé" : "Import statement"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[94vh] max-w-[min(96vw,1380px)] overflow-y-auto rounded-[32px] border-slate-200 p-0">
        <div className="grid gap-0 xl:grid-cols-[0.92fr_1.08fr]">
          <div className="space-y-5 bg-[linear-gradient(160deg,#0b1530,#12386d_55%,#2a8ad6)] px-6 py-6 text-white">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold tracking-[0.16em] uppercase">
              <FileSpreadsheet className="size-3.5" />
              {isFr ? "Banques" : "Banks"}
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.04em]">
                {isFr
                  ? "Upload du relevé, lecture automatique, affichage des lignes."
                  : "Upload the statement, parse it automatically, and display each line."}
              </h2>
              <p className="mt-3 text-sm leading-7 text-white/78">
                {isFr
                  ? "Vous choisissez le fichier du relevé. Le système lit son contenu, affiche les transactions détectées et prépare le rapprochement avant l'import."
                  : "Choose the statement file. The system reads its content, displays detected transactions, and prepares reconciliation before import."}
              </p>
            </div>

            <div className="rounded-[28px] border border-white/12 bg-white/10 p-5 backdrop-blur-sm">
              <p className="text-xs font-semibold tracking-[0.16em] text-white/70 uppercase">
                {isFr ? "Formats pris en charge" : "Supported formats"}
              </p>
              <p className="mt-3 text-sm text-white/80">
                {isFr
                  ? "`.txt` et `.csv` avec colonnes `date | libellé | référence | crédit | débit`"
                  : "`.txt` and `.csv` with columns `date | label | reference | credit | debit`"}
              </p>
            </div>

            <div className="rounded-[28px] border border-white/12 bg-slate-950/25 p-5">
              <p className="text-xs font-semibold tracking-[0.16em] text-white/70 uppercase">
                {isFr ? "Fichier sélectionné" : "Selected file"}
              </p>
              <p className="mt-3 text-sm text-white/82">
                {selectedFileName || (isFr ? "Aucun fichier pour le moment" : "No file selected yet")}
              </p>
            </div>
          </div>

          <div className="bg-white px-6 py-6">
            <DialogHeader className="space-y-3 text-left">
              <DialogTitle className="text-2xl font-semibold tracking-tight">
                {isFr ? "Importer un relevé bancaire" : "Import a bank statement"}
              </DialogTitle>
              <DialogDescription>
                {isFr
                  ? "Le relevé s'importe depuis un fichier. Les lignes reconnues s'affichent immédiatement dans l'aperçu ci-dessous."
                  : "The statement is imported from a file. Recognized lines appear immediately in the preview below."}
              </DialogDescription>
            </DialogHeader>

            <form action={formAction} className="mt-6 grid gap-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-sm font-medium" htmlFor="bank-statement-file">
                    {isFr ? "Fichier du relevé" : "Statement file"}
                  </label>
                  <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50/70 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex size-11 items-center justify-center rounded-2xl border border-slate-200 bg-white">
                        <Upload className="size-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-950">
                          {selectedFileName || (isFr ? "Choisir un relevé bancaire" : "Choose a bank statement")}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {isFr ? "Formats `.txt` ou `.csv`" : "Formats `.txt` or `.csv`"}
                        </p>
                      </div>
                    </div>
                    <Input
                      id="bank-statement-file"
                      name="statement_file"
                      type="file"
                      accept=".txt,.csv,text/plain,text/csv"
                      className="mt-4"
                      onChange={handleFileChange}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="bank-account-label">
                    {isFr ? "Compte" : "Account"}
                  </label>
                  <div className="relative">
                    <Building2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="bank-account-label"
                      name="account_label"
                      className="pl-9"
                      placeholder={isFr ? "Compte principal BUMEX IT" : "Main BUMEX IT account"}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="bank-statement-label">
                    {isFr ? "Libellé du relevé" : "Statement label"}
                  </label>
                  <Input
                    id="bank-statement-label"
                    name="statement_label"
                    placeholder={selectedFileName || (isFr ? "Relevé juin 2026" : "Statement June 2026")}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="bank-statement-date">
                    {isFr ? "Date du relevé" : "Statement date"}
                  </label>
                  <Input id="bank-statement-date" name="statement_date" type="date" required />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="bank-currency">
                    {isFr ? "Devise" : "Currency"}
                  </label>
                  <Input id="bank-currency" name="currency" value={currency} onChange={(event) => setCurrency(event.target.value)} required />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="bank-notes">
                  {isFr ? "Notes" : "Notes"}
                </label>
                <Textarea
                  id="bank-notes"
                  name="notes"
                  placeholder={isFr ? "Commentaires internes, période, source..." : "Internal comments, period, source..."}
                />
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f8fbff)] p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold tracking-[0.16em] text-slate-500 uppercase">
                      {isFr ? "Aperçu des transactions" : "Transaction preview"}
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      {previewLines.length
                        ? isFr
                          ? `${previewLines.length} ligne(s) reconnue(s)`
                          : `${previewLines.length} recognized line(s)`
                        : isFr
                          ? "Aucune ligne lue pour le moment"
                          : "No lines parsed yet"}
                    </p>
                  </div>
                </div>

                {previewLines.length ? (
                  <div className="mt-4 grid gap-3">
                    {previewLines.slice(0, 8).map((line, index) => (
                      <div key={`${line.line_date}-${line.description}-${index}`} className="rounded-[22px] border border-slate-200 bg-white p-4">
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-950">{line.description}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {line.line_date}
                              {line.reference ? ` • ${line.reference}` : ""}
                            </p>
                          </div>
                          <p className={`text-sm font-semibold ${line.amount >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                            {formatFinanceCurrency(line.amount, currency)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-[22px] border border-dashed border-slate-300 bg-slate-50/80 p-5 text-sm text-slate-500">
                    {isFr
                      ? "Sélectionnez un fichier lisible pour voir chaque transaction avant l'import."
                      : "Select a readable file to preview each transaction before import."}
                  </div>
                )}
              </div>

              {state.error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {state.error}
                </div>
              ) : null}

              {state.success ? (
                <div className="rounded-2xl border border-emerald-300/50 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {state.success}
                </div>
              ) : null}

              <div className="flex justify-end">
                <Button type="submit" className="rounded-2xl px-5" disabled={pending}>
                  {pending
                    ? isFr
                      ? "Import en cours..."
                      : "Importing..."
                    : isFr
                      ? "Importer et rapprocher"
                      : "Import and reconcile"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
