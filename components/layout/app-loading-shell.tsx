import { Skeleton } from "@/components/ui/skeleton";

export function AppLoadingShell() {
  return (
    <div className="space-y-5">
      <section className="rounded-[30px] border border-border/70 bg-card/72 p-6 shadow-[var(--shadow-soft)] backdrop-blur-xl sm:p-7">
        <div className="space-y-4">
          <Skeleton className="h-6 w-28 rounded-full" />
          <Skeleton className="h-12 w-[30rem] max-w-full rounded-2xl" />
          <Skeleton className="h-5 w-[42rem] max-w-full rounded-2xl" />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-32 rounded-[28px]" />
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.35fr_0.9fr]">
        <Skeleton className="h-[24rem] rounded-[30px]" />
        <div className="grid gap-5">
          <Skeleton className="h-[11.5rem] rounded-[28px]" />
          <Skeleton className="h-[11.5rem] rounded-[28px]" />
        </div>
      </section>
    </div>
  );
}
