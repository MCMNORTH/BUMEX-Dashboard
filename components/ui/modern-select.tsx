"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

import { useI18n } from "@/components/layout/i18n-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { matchesSearchTerms, searchTerms } from "@/lib/search/text";
import { cn } from "@/lib/utils";

export type ModernSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
  /** Heading the option is listed under. Headings show only when the options span two or more groups. */
  group?: string;
  /** Short tag shown after the label, e.g. another entity's name. */
  badge?: string;
  /** Extra text the search box matches besides the label (email, job title...). */
  keywords?: Array<string | null | undefined>;
};

// Long lists get a search box even when the caller doesn't ask for one.
const AUTO_SEARCH_MIN_OPTIONS = 9;

function isTypingKey(event: React.KeyboardEvent) {
  return event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey;
}

export function ModernSelect({
  id,
  name,
  value: controlledValue,
  defaultValue = "",
  options,
  placeholder = "Select option",
  className,
  disabled,
  required,
  searchable,
  searchPlaceholder,
  onValueChange,
  "aria-label": ariaLabel,
}: {
  id?: string;
  name: string;
  value?: string;
  defaultValue?: string;
  options: ModernSelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Blocks form submission while empty, like a native required select. */
  required?: boolean;
  /** Shows a search box above the options. Defaults to on for long lists. */
  searchable?: boolean;
  searchPlaceholder?: string;
  onValueChange?: (value: string) => void;
  "aria-label"?: string;
}) {
  const { t } = useI18n();
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const contentRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const value = controlledValue ?? internalValue;
  const showSearch = searchable ?? options.length >= AUTO_SEARCH_MIN_OPTIONS;
  const selected = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );
  const visibleOptions = useMemo(() => {
    const terms = searchTerms(query);
    return terms.length
      ? options.filter((option) => matchesSearchTerms(terms, [option.label, ...(option.keywords ?? [])]))
      : options;
  }, [options, query]);
  const showGroups = useMemo(
    () => new Set(options.flatMap((option) => (option.group ? [option.group] : []))).size > 1,
    [options],
  );

  function choose(option: ModernSelectOption) {
    if (controlledValue === undefined) {
      setInternalValue(option.value);
    }
    onValueChange?.(option.value);
  }

  function focusItem(position: "first" | "last") {
    const items = contentRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([data-disabled])');
    if (!items?.length) return;
    items[position === "first" ? 0 : items.length - 1].focus();
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      focusItem(event.key === "ArrowDown" ? "first" : "last");
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const firstMatch = visibleOptions.find((option) => !option.disabled);
      if (firstMatch) {
        choose(firstMatch);
        setOpen(false);
        setQuery("");
      }
      return;
    }

    // Keep typing (and Tab) inside the box instead of letting the menu's typeahead move focus.
    if (event.key !== "Escape") {
      event.stopPropagation();
    }
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setQuery("");
      }}
    >
      {required ? (
        // A visually hidden text input, because hidden inputs skip `required` validation.
        <input
          id={id}
          name={name}
          value={value}
          required
          // Not readOnly: read-only inputs are skipped by `required` validation too.
          onChange={() => undefined}
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
        />
      ) : (
        <input type="hidden" id={id} name={name} value={value} />
      )}
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          aria-label={ariaLabel}
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
        ref={contentRef}
        align="start"
        // The menu is portaled, but React still bubbles its keys to the trigger's parents.
        onKeyDown={(event) => event.stopPropagation()}
        className={cn(
          "max-h-80 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-[var(--shadow-elevated)]",
          showSearch && "min-w-56 pt-0",
        )}
      >
        {showSearch ? (
          <div className="sticky top-0 z-10 -mx-1 mb-1 border-b border-border/70 bg-popover px-2 py-2">
            <div className="flex h-8 items-center gap-2 rounded-md border border-input bg-background px-2.5 focus-within:border-primary">
              <Search className="size-3.5 shrink-0 text-muted-foreground" />
              <input
                ref={searchRef}
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={searchPlaceholder ?? t("common.select.searchPlaceholder", "Search...")}
                aria-label={searchPlaceholder ?? t("common.select.searchPlaceholder", "Search...")}
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>
        ) : null}
        {visibleOptions.map((option, index) => (
          <Fragment key={`${name}-${option.value || "empty"}`}>
            {showGroups && option.group && option.group !== visibleOptions[index - 1]?.group ? (
              <DropdownMenuLabel className="px-3 pt-2.5 pb-1 text-xs font-semibold text-muted-foreground">
                {option.group}
              </DropdownMenuLabel>
            ) : null}
            <DropdownMenuItem
              disabled={option.disabled}
              onSelect={() => choose(option)}
              // While searching, hovering must not pull focus out of the search box.
              onPointerMove={showSearch ? (event) => event.preventDefault() : undefined}
              onPointerLeave={showSearch ? (event) => event.preventDefault() : undefined}
              onKeyDown={
                showSearch
                  ? (event) => {
                      if (isTypingKey(event)) {
                        event.stopPropagation();
                        searchRef.current?.focus();
                      } else if (event.key === "ArrowUp" && index === 0) {
                        event.preventDefault();
                        searchRef.current?.focus();
                      }
                    }
                  : undefined
              }
              className={cn(
                "min-h-9 rounded-lg px-3 py-2 text-sm",
                value === option.value
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-foreground",
              )}
            >
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {option.badge ? (
                <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] leading-none text-muted-foreground">
                  {option.badge}
                </span>
              ) : null}
              {value === option.value ? (
                <span className="flex shrink-0 items-center justify-center text-primary">
                  <Check className="size-3.5" />
                </span>
              ) : null}
            </DropdownMenuItem>
          </Fragment>
        ))}
        {showSearch && !visibleOptions.length ? (
          <p className="px-3 py-4 text-center text-sm text-muted-foreground">
            {t("common.select.noResults", "No matches")}
          </p>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
