import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // Fluent's input (2026-11-19): a hairline, an accessible bottom edge, the brand colour under the field typed in
        "flex h-8 w-full rounded-sm border border-input border-b-[#616161] bg-card px-2.5 py-1.5 text-[16px] text-foreground sm:text-sm shadow-none outline-none placeholder:text-muted-foreground focus-visible:border-b-primary focus-visible:shadow-[inset_0_-1px_0_var(--primary)] disabled:cursor-not-allowed disabled:opacity-50 dark:border-b-[#adadad] dark:focus-visible:border-b-primary",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
