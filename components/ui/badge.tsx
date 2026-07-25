import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-[0.14em] uppercase transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[linear-gradient(135deg,#214b86,#4d81d6)] text-primary-foreground shadow-[0_10px_22px_-14px_rgba(42,94,176,0.65)]",
        secondary:
          "border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(237,244,255,0.96))] text-secondary-foreground dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(31,41,55,0.88),rgba(15,23,42,0.92))] dark:text-slate-100",
        outline: "border-border/70 bg-background/55 text-foreground backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-100",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
