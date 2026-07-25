import { Skeleton } from "@/components/ui/skeleton";

export default function FinanceTransfersLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Skeleton className="h-6 w-32 rounded-full" />
        <Skeleton className="h-16 w-full max-w-4xl" />
        <Skeleton className="h-8 w-full max-w-2xl" />
      </div>
      <div className="grid gap-4 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-36 rounded-[28px]" />
        ))}
      </div>
      <Skeleton className="h-28 rounded-[28px]" />
      <Skeleton className="h-[420px] rounded-[28px]" />
    </div>
  );
}
