import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { getInvoicePresentation } from "@/lib/finance/invoice-view";
import type { Locale } from "@/lib/i18n/config";
import type { InvoiceRecord } from "@/types/finance";

function hexToRgb(hex: string) {
  const clean = hex.replace("#", "");
  return rgb(
    Number.parseInt(clean.slice(0, 2), 16) / 255,
    Number.parseInt(clean.slice(2, 4), 16) / 255,
    Number.parseInt(clean.slice(4, 6), 16) / 255,
  );
}

async function loadLogoBytes(logoPath: string) {
  const normalizedLogoPath = logoPath.startsWith("/") ? logoPath.slice(1) : logoPath;
  const resolvedLogoPath = path.join(process.cwd(), "public", normalizedLogoPath);
  const fallbackLogoPath = path.join(process.cwd(), "public", "bumex-official-logo-transparent.png");

  return readFile(normalizedLogoPath ? resolvedLogoPath : fallbackLogoPath);
}

export async function generateInvoicePdf(invoice: InvoiceRecord, locale: Locale = "en") {
  const presentation = getInvoicePresentation(invoice, locale);
  const labels = {
    invoiceDate: locale === "fr" ? "Date de facture" : "Invoice date",
    dueDate: locale === "fr" ? "Date d'échéance" : "Due date",
    paymentMethod: locale === "fr" ? "Mode de paiement" : "Payment method",
    paymentTerms: locale === "fr" ? "Conditions de paiement" : "Payment terms",
    contactAddress: locale === "fr" ? "Contact / Adresse" : "Contact / Address",
    to: locale === "fr" ? "À" : "To",
    amountIn:
      locale === "fr"
        ? `Montant en ${presentation.currency === "EUR" ? "euros" : presentation.currency}`
        : `Amount in ${presentation.currency === "EUR" ? "Euros" : presentation.currency}`,
    description: "DESCRIPTION",
    qty: locale === "fr" ? "QTÉ" : "QTY",
    unitPrice: locale === "fr" ? "P.U." : "U.P.",
    vat: "VAT",
    wht: "WHT",
    total: "TOTAL",
    totalNet: locale === "fr" ? "Total net" : "Total net",
    totalTax: locale === "fr" ? "Total taxe" : "Total tax",
    totalInclTax: locale === "fr" ? "Total TTC" : "Total (inc. tax)",
    totalWht: "Total WHT",
    totalDue: locale === "fr" ? "TOTAL DÛ" : "TOTAL DUE",
    paymentInformation:
      locale === "fr" ? "INFORMATIONS DE PAIEMENT" : "PAYMENT INFORMATION",
  };

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612.283, 790.866]);
  const width = page.getWidth();
  const height = page.getHeight();
  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(await loadLogoBytes(presentation.brand.logoPath));

  const navy = hexToRgb("#1a2f49");
  const text = hexToRgb("#394f69");
  const light = hexToRgb("#f2f4f7");
  const border = hexToRgb("#d2dbe7");
  const headerFill = hexToRgb("#c9d9ea");
  const totalBlue = hexToRgb("#376796");

  const headerColumns = presentation.isGta
    ? [
        { x: 36, label: labels.description, align: "left" as const },
        { x: 348, label: labels.qty, align: "center" as const },
        { x: 414, label: labels.unitPrice, align: "right" as const },
        { x: 470, label: labels.vat, align: "right" as const },
        { x: 514, label: labels.wht, align: "right" as const },
        { x: 574, label: labels.total, align: "right" as const },
      ]
    : [
        { x: 36, label: labels.description, align: "left" as const },
        { x: 358, label: labels.qty, align: "center" as const },
        { x: 438, label: labels.unitPrice, align: "right" as const },
        { x: 500, label: labels.vat, align: "right" as const },
        { x: 574, label: labels.total, align: "right" as const },
      ];

  page.drawImage(logo, { x: 26, y: height - 118, width: 88, height: 88 });

  let y = height - 44;
  page.drawText(presentation.brand.companyName, {
    x: 108,
    y,
    size: 22,
    font: fontBold,
    color: navy,
  });
  y -= 20;
  for (const line of presentation.brand.addressLine.split("\n")) {
    page.drawText(line, { x: 108, y, size: 11.5, font: fontRegular, color: text });
    y -= 16;
  }
  y -= 10;
  page.drawText(`Phone: ${presentation.brand.phone}`, {
    x: 108,
    y,
    size: 11.5,
    font: fontRegular,
    color: text,
  });
  y -= 15;
  page.drawText(`Email: ${presentation.brand.email}`, {
    x: 108,
    y,
    size: 11.5,
    font: fontRegular,
    color: text,
  });
  y -= 15;
  page.drawText(`Web: ${presentation.brand.website}`, {
    x: 108,
    y,
    size: 11.5,
    font: fontRegular,
    color: text,
  });

  const rightX = 455;
  page.drawText(`${presentation.invoiceLabel} (${presentation.invoiceNumber})`, {
    x: rightX,
    y: height - 38,
    size: 21,
    font: fontBold,
    color: navy,
  });

  const rightRows = [
    [labels.invoiceDate, presentation.invoiceDateLabel],
    [labels.dueDate, presentation.dueDateLabel],
    [labels.paymentMethod, presentation.paymentMethodLabel],
    [labels.paymentTerms, presentation.paymentTermsLabel],
    [labels.contactAddress, presentation.contactAddressLine],
  ];

  let rightY = height - 72;
  rightRows.forEach(([label, value]) => {
    page.drawText(`${label}:`, {
      x: rightX,
      y: rightY,
      size: 10.5,
      font: fontRegular,
      color: text,
    });
    page.drawText(value, {
      x: rightX + 93,
      y: rightY,
      size: 10.5,
      font: fontBold,
      color: text,
      maxWidth: 120,
    });
    rightY -= 15;
  });

  page.drawRectangle({ x: 0, y: height - 132, width, height: 5, color: navy });

  page.drawText(labels.to, {
    x: 335,
    y: height - 152,
    size: 11,
    font: fontBold,
    color: rgb(0.4, 0.4, 0.4),
  });
  page.drawRectangle({
    x: 332,
    y: height - 255,
    width: 252,
    height: 98,
    color: light,
    borderColor: border,
    borderWidth: 1,
  });
  page.drawText(presentation.clientName, {
    x: 346,
    y: height - 178,
    size: 15,
    font: fontBold,
    color: text,
  });
  page.drawText(presentation.clientAddress, {
    x: 346,
    y: height - 200,
    size: 10.5,
    font: fontRegular,
    color: text,
    maxWidth: 220,
  });
  page.drawText(`${labels.contactAddress}: ${presentation.contactAddressLine}`, {
    x: 346,
    y: height - 222,
    size: 10.5,
    font: fontRegular,
    color: text,
    maxWidth: 220,
  });
  page.drawText(`Email: ${presentation.clientEmail}`, {
    x: 346,
    y: height - 244,
    size: 10.5,
    font: fontRegular,
    color: text,
    maxWidth: 220,
  });

  page.drawText(labels.amountIn, {
    x: width - 92,
    y: height - 272,
    size: 10.5,
    font: fontRegular,
    color: rgb(0.45, 0.45, 0.45),
  });

  const tableTop = height - 300;
  page.drawRectangle({ x: 26, y: tableTop, width: 558, height: 22, color: headerFill });

  headerColumns.forEach((column) => {
    const textWidth = fontBold.widthOfTextAtSize(column.label, 10);
    const x =
      column.align === "left"
        ? column.x
        : column.align === "center"
          ? column.x - textWidth / 2
          : column.x - textWidth;

    page.drawText(column.label, {
      x,
      y: tableTop + 7,
      size: 10,
      font: fontBold,
      color: navy,
    });
  });

  let rowTop = tableTop - 32;
  for (const line of presentation.lineItems) {
    page.drawText(line.name, {
      x: 36,
      y: rowTop,
      size: 10.5,
      font: fontRegular,
      color: text,
      maxWidth: 280,
    });

    if (presentation.isGta) {
      page.drawText(line.quantityLabel, {
        x: 345,
        y: rowTop,
        size: 10.5,
        font: fontRegular,
        color: text,
      });
      page.drawText(line.unitPriceLabel, {
        x: 372,
        y: rowTop,
        size: 10.5,
        font: fontRegular,
        color: text,
      });
      page.drawText(line.vatRateLabel, {
        x: 450,
        y: rowTop,
        size: 10.5,
        font: fontRegular,
        color: text,
      });
      if (line.whtRateLabel) {
        page.drawText(line.whtRateLabel, {
          x: 485,
          y: rowTop,
          size: 10.5,
          font: fontRegular,
          color: text,
        });
      }
      page.drawText(line.totalLabel, {
        x: 520,
        y: rowTop,
        size: 10.5,
        font: fontRegular,
        color: text,
      });
    } else {
      page.drawText(line.quantityLabel, {
        x: 355,
        y: rowTop,
        size: 10.5,
        font: fontRegular,
        color: text,
      });
      page.drawText(line.unitPriceLabel, {
        x: 395,
        y: rowTop,
        size: 10.5,
        font: fontRegular,
        color: text,
      });
      page.drawText(line.vatRateLabel, {
        x: 485,
        y: rowTop,
        size: 10.5,
        font: fontRegular,
        color: text,
      });
      page.drawText(line.totalLabel, {
        x: 520,
        y: rowTop,
        size: 10.5,
        font: fontRegular,
        color: text,
      });
    }

    page.drawLine({
      start: { x: 26, y: rowTop - 14 },
      end: { x: 584, y: rowTop - 14 },
      thickness: 1,
      color: border,
    });

    rowTop -= 24;
  }

  page.drawText(presentation.amountInWords, {
    x: 30,
    y: rowTop - 10,
    size: 10.5,
    font: fontRegular,
    color: text,
    maxWidth: 550,
  });

  let infoY = rowTop - 66;
  const drawInfoBox = (textValue: string, boxHeight: number) => {
    page.drawRectangle({
      x: 26,
      y: infoY - boxHeight + 10,
      width: 270,
      height: boxHeight,
      color: light,
      borderColor: border,
      borderWidth: 1,
    });
    page.drawText(textValue, {
      x: 36,
      y: infoY,
      size: 10,
      font: fontRegular,
      color: text,
      maxWidth: 244,
      lineHeight: 13,
    });
    infoY -= boxHeight + 10;
  };

  if (presentation.regimeNote) {
    drawInfoBox(presentation.regimeNote, 54);
  }
  if (presentation.vatNote) {
    drawInfoBox(presentation.vatNote, 26);
  }

  page.drawRectangle({
    x: 26,
    y: infoY - 64,
    width: 270,
    height: 64,
    color: light,
    borderColor: border,
    borderWidth: 1,
  });
  page.drawText(labels.paymentInformation, {
    x: 40,
    y: infoY - 12,
    size: 13,
    font: fontBold,
    color: navy,
  });
  page.drawText(`BANK: ${presentation.brand.bankName}`, {
    x: 40,
    y: infoY - 28,
    size: 10,
    font: fontRegular,
    color: text,
  });
  page.drawText(`ACCOUNT OWNER NAME: ${presentation.brand.accountOwner}`, {
    x: 40,
    y: infoY - 42,
    size: 10,
    font: fontRegular,
    color: text,
  });
  page.drawText(`IBAN: ${presentation.brand.iban}`, {
    x: 40,
    y: infoY - 56,
    size: 10,
    font: fontRegular,
    color: text,
  });
  page.drawText(`BIC/SWIFT: ${presentation.brand.bic}`, {
    x: 40,
    y: infoY - 70,
    size: 10,
    font: fontRegular,
    color: text,
  });

  const totalsX = 324;
  const rowHeight = 20;
  const totalRows: Array<[string, string]> = [
    [labels.totalNet, presentation.amountHtLabel],
    [labels.totalTax, presentation.taxAmountLabel],
    [labels.totalInclTax, presentation.amountTtcLabel],
  ];

  if (presentation.totalWhtLabel) {
    totalRows.push([labels.totalWht, presentation.totalWhtLabel]);
  }

  let totalsY = rowTop - 50;
  totalRows.forEach(([label, value]) => {
    page.drawRectangle({
      x: totalsX,
      y: totalsY,
      width: 260,
      height: rowHeight,
      borderColor: border,
      borderWidth: 1,
    });
    page.drawLine({
      start: { x: 486, y: totalsY },
      end: { x: 486, y: totalsY + rowHeight },
      thickness: 1,
      color: border,
    });
    page.drawText(label, {
      x: totalsX + 8,
      y: totalsY + 5,
      size: 10.5,
      font: fontBold,
      color: text,
    });
    page.drawText(value, {
      x: 504,
      y: totalsY + 5,
      size: 10.5,
      font: fontBold,
      color: text,
    });
    totalsY -= rowHeight;
  });

  page.drawRectangle({ x: totalsX, y: totalsY, width: 260, height: rowHeight, color: totalBlue });
  page.drawLine({
    start: { x: 486, y: totalsY },
    end: { x: 486, y: totalsY + rowHeight },
    thickness: 1,
    color: rgb(1, 1, 1),
  });
  page.drawText(labels.totalDue, {
    x: totalsX + 8,
    y: totalsY + 5,
    size: 11,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  page.drawText(presentation.totalDueLabel, {
    x: 504,
    y: totalsY + 5,
    size: 11,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  page.drawText(presentation.brand.companyName, {
    x: 458,
    y: 170,
    size: 14,
    font: fontBold,
    color: text,
  });
  page.drawRectangle({
    x: 440,
    y: 90,
    width: 110,
    height: 60,
    borderColor: border,
    borderWidth: 1,
    opacity: 0.3,
  });

  page.drawRectangle({ x: 0, y: 48, width, height: 4, color: navy });
  page.drawText(presentation.brand.footerLabel, {
    x: 80,
    y: 34,
    size: 8.5,
    font: fontBold,
    color: text,
    maxWidth: 450,
    lineHeight: 10,
  });
  page.drawText(
    `${presentation.brand.phone} - ${presentation.brand.website} - ${presentation.brand.email}`,
    {
      x: 108,
      y: 20,
      size: 8.5,
      font: fontBold,
      color: text,
    },
  );
  page.drawText(presentation.brand.capitalLabel, {
    x: 250,
    y: 8,
    size: 8.5,
    font: fontRegular,
    color: text,
  });
  page.drawText(`NIF: ${presentation.brand.taxId}`, {
    x: 282,
    y: -4,
    size: 8.5,
    font: fontRegular,
    color: text,
  });
  page.drawText("1 / 1", { x: 553, y: 4, size: 9, font: fontRegular, color: text });

  return pdf.save();
}
