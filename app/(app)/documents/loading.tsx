import { Skeleton } from "@/components/ui/skeleton";

export default function DocumentsLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Skeleton className="h-5 w-36 rounded-full" />
        <Skeleton className="h-14 w-full max-w-3xl rounded-[28px]" />
        <Skeleton className="h-6 w-full max-w-2xl rounded-full" />
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-36 rounded-[28px]" />
        ))}
      </div>

      <Skeleton className="h-28 rounded-[28px]" />

      <div className="grid gap-4 xl:grid-cols-2">
        <Skeleton className="h-96 rounded-[28px]" />
        <Skeleton className="h-96 rounded-[28px]" />
      </div>
    </div>
  );
}
