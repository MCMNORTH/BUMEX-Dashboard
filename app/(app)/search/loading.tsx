import { Card, CardContent } from "@/components/ui/card";

export default function SearchLoading() {
  return (
    <div className="space-y-6">
      <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
        <CardContent className="space-y-4 px-5 py-5">
          <div className="h-12 animate-pulse rounded-2xl bg-white/[0.05]" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 7 }).map((_, index) => (
              <div key={index} className="h-8 w-24 animate-pulse rounded-full bg-white/[0.05]" />
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index} className="border-border/70 bg-card/72 backdrop-blur-xl">
            <CardContent className="space-y-3 px-5 py-5">
              <div className="h-5 w-2/3 animate-pulse rounded bg-white/[0.05]" />
              <div className="h-4 w-full animate-pulse rounded bg-white/[0.05]" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-white/[0.05]" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
