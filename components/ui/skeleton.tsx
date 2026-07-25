import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl bg-gradient-to-r from-muted via-accent/60 to-muted before:absolute before:inset-0 before:-translate-x-full before:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.48),transparent)] before:animate-shimmer dark:before:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent)]",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
