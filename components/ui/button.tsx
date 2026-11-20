import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Fluent's buttons (2026-11-19): semibold, 2 px corners, the brand colour for the main one, a 2 px focus ring
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-sm text-sm font-semibold transition-[color,background-color,border-color,box-shadow,opacity] duration-100 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-3.5 shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-1 focus-visible:ring-offset-background",
  {
    variants: {
      variant: {
        primary:
          "border border-primary bg-primary text-primary-foreground shadow-none hover:bg-primary/90",
        secondary:
          "border border-input bg-card text-secondary-foreground shadow-none hover:bg-muted dark:hover:bg-muted",
        ghost:
          "bg-transparent text-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10",
      },
      size: {
        default: "h-8 px-3 py-1.5",
        sm: "h-7 px-2.5",
        lg: "h-10 px-5",
        icon: "size-9",
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
