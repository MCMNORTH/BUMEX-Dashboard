import { Skeleton } from "@/components/ui/skeleton";

export function ProjectsPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Skeleton className="h-6 w-28 rounded-full" />
        <Skeleton className="h-14 w-[34rem] max-w-full rounded-2xl" />
        <Skeleton className="h-5 w-[40rem] max-w-full rounded-2xl" />
      </div>
      <Skeleton className="h-24 rounded-[28px]" />
      <div className="grid gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-72 rounded-[28px]" />
        ))}
      </div>
    </div>
  );
}

export function ProjectDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-52 rounded-[30px]" />
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Skeleton className="h-[22rem] rounded-[28px]" />
        <Skeleton className="h-[22rem] rounded-[28px]" />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Skeleton className="h-64 rounded-[28px]" />
        <Skeleton className="h-64 rounded-[28px]" />
        <Skeleton className="h-64 rounded-[28px]" />
      </div>
    </div>
  );
}
