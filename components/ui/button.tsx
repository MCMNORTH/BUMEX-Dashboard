import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] text-[13px] font-medium transition-[color,background-color,border-color,box-shadow,opacity] duration-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-3.5 shrink-0 outline-none focus-visible:ring-3 focus-visible:ring-ring/60",
  {
    variants: {
      variant: {
        primary:
          "border border-primary bg-primary text-primary-foreground shadow-none hover:bg-[#0055cc] dark:hover:bg-[#6ba9ff]",
        secondary:
          "border border-border bg-card text-secondary-foreground shadow-none hover:bg-muted dark:bg-secondary dark:hover:bg-muted",
        ghost:
          "bg-transparent text-foreground hover:bg-muted hover:text-foreground dark:hover:bg-accent/88",
      },
      size: {
        default: "h-9 px-3.5 py-2",
        sm: "h-7 rounded-[7px] px-2.5",
        lg: "h-10 rounded-[9px] px-5",
        icon: "size-9 rounded-[9px]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
