"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type ModernSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export function ModernSelect({
  id,
  name,
  value: controlledValue,
  defaultValue = "",
  options,
  placeholder = "Select option",
  className,
  disabled,
  onValueChange,
}: {
  id?: string;
  name: string;
  value?: string;
  defaultValue?: string;
  options: ModernSelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  onValueChange?: (value: string) => void;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const value = controlledValue ?? internalValue;
  const selected = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );

  return (
    <DropdownMenu onOpenChange={setOpen}>
      <input type="hidden" id={id} name={name} value={value} />
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            "group flex h-11 w-full items-center justify-between gap-3 rounded-[18px] border border-border/70 bg-background/85 px-4 text-left text-sm text-foreground shadow-[var(--shadow-inner)] outline-none transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-200/80 hover:bg-background hover:shadow-[0_16px_34px_-22px_rgba(52,95,160,0.28)] focus-visible:ring-4 focus-visible:ring-ring/55 data-[state=open]:border-sky-300/80 data-[state=open]:bg-background data-[state=open]:shadow-[0_18px_38px_-20px_rgba(37,99,235,0.18)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-slate-950/50 dark:hover:border-sky-300/22 dark:hover:bg-slate-950/72 dark:data-[state=open]:border-sky-400/30 dark:data-[state=open]:bg-slate-950/78 dark:data-[state=open]:shadow-none",
            className,
          )}
        >
          <span className={cn("min-w-0 truncate", !selected && "text-muted-foreground")}>
            {selected?.label ?? placeholder}
          </span>
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-100/90 text-slate-500 transition-colors group-hover:bg-sky-50 group-hover:text-sky-600 dark:bg-slate-800/90 dark:text-slate-300 dark:group-hover:bg-sky-500/12 dark:group-hover:text-sky-200">
            <ChevronDown className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")} />
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-80 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto rounded-[24px] border border-border/70 bg-background/96 p-2 shadow-[0_26px_52px_-18px_rgba(15,23,42,0.18)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/94 dark:shadow-[0_24px_64px_-24px_rgba(2,6,23,0.72)]"
      >
        {options.map((option) => (
          <DropdownMenuItem
            key={`${name}-${option.value || "empty"}`}
            disabled={option.disabled}
            onSelect={() => {
              if (controlledValue === undefined) {
                setInternalValue(option.value);
              }
              onValueChange?.(option.value);
            }}
            className={cn(
              "min-h-11 rounded-[14px] px-3.5 py-2.5 text-[0.95rem]",
              value === option.value
                ? "bg-linear-to-r from-sky-50 to-indigo-50 text-slate-950 shadow-[inset_0_0_0_1px_rgba(125,211,252,0.55)] dark:from-sky-500/14 dark:to-indigo-500/14 dark:text-white"
                : "text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white",
            )}
          >
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            {value === option.value ? (
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/90 text-sky-600 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.18)] dark:bg-slate-900/90 dark:text-sky-300">
                <Check className="size-3.5" />
              </span>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
