"use client";

import { useRouter } from "next/navigation";

import { ModernSelect, type ModernSelectOption } from "@/components/ui/modern-select";
import { accountingHref } from "@/lib/erp/accounting/model";

// A filter that lives in the URL: choosing a value reloads the page with it (and keeps the other parameters).
export function QuerySelect({
  label,
  name,
  value,
  options,
  path,
  params,
  className,
  searchable = false,
}: {
  label: string;
  name: string;
  value: string;
  options: ModernSelectOption[];
  path: string;
  params: Record<string, string | null | undefined>;
  className?: string;
  searchable?: boolean;
}) {
  const router = useRouter();
  return (
    <label className="grid gap-1 text-xs text-muted-foreground">
      {label}
      <ModernSelect
        name={name}
        value={value}
        className={className}
        searchable={searchable}
        onValueChange={(next) => router.push(accountingHref(path, { ...params, [name]: next || null }))}
        options={options}
      />
    </label>
  );
}
