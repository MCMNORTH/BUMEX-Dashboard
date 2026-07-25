import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function RoadmapSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="border-border/70 bg-card/72 backdrop-blur-xl">
            <CardContent className="space-y-4 px-5 py-5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-10 w-18" />
              <Skeleton className="h-4 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
        <CardContent className="space-y-5 px-5 py-5">
          <Skeleton className="h-12 w-full rounded-3xl" />
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-32 w-full rounded-[28px]" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

