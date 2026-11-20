import { cn } from "@/lib/utils";

// A shape of what is loading, under Fluent's shimmer (app/globals.css .skeleton); the place that loads says so to screen
// readers (role="status"), the shapes are only seen.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="skeleton" aria-hidden="true" className={cn("skeleton rounded-sm", className)} {...props} />;
}

export { Skeleton };
