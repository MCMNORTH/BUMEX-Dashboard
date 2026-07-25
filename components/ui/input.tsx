import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-9 w-full rounded-[9px] border border-input bg-background px-3 py-2 text-[13px] text-foreground shadow-none outline-none placeholder:text-muted-foreground/85 focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-muted/65",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
