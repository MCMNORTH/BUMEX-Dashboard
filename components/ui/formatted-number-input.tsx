"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function formatNumericText(value: string) {
  const normalized = value
    .replace(/\u202f/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[^\d,.\-]/g, "")
    .replace(/\./g, ",");

  const negative = normalized.startsWith("-");
  const unsigned = normalized.replace(/-/g, "");
  const [rawInteger = "", ...decimalParts] = unsigned.split(",");
  const integerDigits = rawInteger.replace(/\D/g, "");
  const decimals = decimalParts.join("").replace(/\D/g, "").slice(0, 2);

  const formattedInteger = integerDigits
    ? new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(integerDigits))
    : "";

  const decimalSeparator = normalized.includes(",") ? "," : "";

  return `${negative ? "-" : ""}${formattedInteger}${decimalSeparator}${decimals}`;
}

export function FormattedNumberInput({
  id,
  name,
  defaultValue,
  placeholder,
  required,
  className,
}: {
  id?: string;
  name: string;
  defaultValue?: string | number | null;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  const [value, setValue] = useState(
    defaultValue === null || defaultValue === undefined || defaultValue === ""
      ? ""
      : formatNumericText(String(defaultValue)),
  );

  return (
    <Input
      id={id}
      name={name}
      type="text"
      inputMode="decimal"
      value={value}
      placeholder={placeholder}
      required={required}
      className={cn("tabular-nums", className)}
      onChange={(event) => setValue(formatNumericText(event.target.value))}
    />
  );
}
