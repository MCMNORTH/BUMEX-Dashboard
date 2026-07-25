import { Skeleton } from "@/components/ui/skeleton";

export default function FinancePaymentsLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Skeleton className="h-6 w-32 rounded-full" />
        <Skeleton className="h-16 w-full max-w-4xl" />
        <Skeleton className="h-8 w-full max-w-2xl" />
      </div>
      <div className="grid gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-36 rounded-[28px]" />
        ))}
      </div>
      <Skeleton className="h-28 rounded-[28px]" />
      <div className="grid gap-4 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-44 rounded-[28px]" />
        ))}
      </div>
      <Skeleton className="h-[420px] rounded-[28px]" />
    </div>
  );
}
