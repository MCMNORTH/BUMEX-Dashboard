"use client";

import { useEffect, useRef } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const SEARCH_DELAY_MS = 300;

/**
 * A list-filter search box that applies while typing (after a short pause), or at once on Enter.
 * It stays uncontrolled so a slow server round-trip never overwrites what is being typed.
 */
export function FilterSearchInput({
  value,
  onSearch,
  placeholder,
  ariaLabel,
  className,
  inputClassName,
}: {
  value: string;
  onSearch: (value: string) => void;
  placeholder: string;
  ariaLabel?: string;
  className?: string;
  inputClassName?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const appliedRef = useRef(value);
  const onSearchRef = useRef(onSearch);

  useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);

  // Follow outside changes (Clear filters, back/forward) unless the person is typing here.
  useEffect(() => {
    appliedRef.current = value;
    const input = inputRef.current;
    if (input && document.activeElement !== input && input.value.trim() !== value) {
      input.value = value;
    }
  }, [value]);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  function apply(raw: string) {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    const next = raw.trim();
    if (next === appliedRef.current) return;
    appliedRef.current = next;
    onSearchRef.current(next);
  }

  return (
    <div role="search" className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        type="search"
        name="search"
        defaultValue={value}
        aria-label={ariaLabel ?? placeholder}
        placeholder={placeholder}
        autoComplete="off"
        className={cn("pl-9", inputClassName)}
        onChange={(event) => {
          const raw = event.target.value;
          if (timerRef.current) window.clearTimeout(timerRef.current);
          timerRef.current = window.setTimeout(() => apply(raw), SEARCH_DELAY_MS);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            apply(event.currentTarget.value);
          }
        }}
      />
    </div>
  );
}
