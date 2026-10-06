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
            "group flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-left text-sm text-foreground outline-none hover:border-primary/40 focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/60 data-[state=open]:border-primary disabled:cursor-not-allowed disabled:opacity-50 dark:bg-muted/65",
            className,
          )}
        >
          <span className={cn("min-w-0 truncate", !selected && "text-muted-foreground")}>
            {selected?.label ?? placeholder}
          </span>
          <span className="flex shrink-0 items-center justify-center text-muted-foreground group-hover:text-foreground">
            <ChevronDown className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")} />
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-80 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-[var(--shadow-elevated)]"
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
              "min-h-9 rounded-lg px-3 py-2 text-sm",
              value === option.value
                ? "bg-accent font-medium text-accent-foreground"
                : "text-foreground",
            )}
          >
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            {value === option.value ? (
              <span className="flex shrink-0 items-center justify-center text-primary">
                <Check className="size-3.5" />
              </span>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
