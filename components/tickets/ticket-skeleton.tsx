import { Skeleton } from "@/components/ui/skeleton";

export function TicketsPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Skeleton className="h-6 w-28 rounded-full" />
        <Skeleton className="h-14 w-[38rem] max-w-full rounded-xl" />
        <Skeleton className="h-5 w-[42rem] max-w-full rounded-xl" />
      </div>
      <div className="grid gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-44 rounded-xl" />
      <Skeleton className="h-[34rem] rounded-xl" />
    </div>
  );
}

export function TicketDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-64 rounded-xl" />
      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Skeleton className="h-[26rem] rounded-xl" />
        <Skeleton className="h-[26rem] rounded-xl" />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}
