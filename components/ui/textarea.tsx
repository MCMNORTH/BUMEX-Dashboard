import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-28 w-full rounded-xl border border-input bg-background/78 px-4 py-3 text-sm text-foreground shadow-[var(--shadow-inner)] outline-none placeholder:text-muted-foreground/80 focus-visible:border-primary/40 focus-visible:bg-background/96 focus-visible:ring-4 focus-visible:ring-ring/55 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-background/72 dark:focus-visible:bg-background/86",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
