"use client";

import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function MyWorkError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
      <CardContent className="flex flex-col items-center gap-4 px-6 py-16 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl border border-rose-300/20 bg-rose-500/10 text-rose-200">
          <TriangleAlert className="size-6" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-[-0.04em]">My Work failed to load</h2>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">
            {error.message || "An unexpected error interrupted the personal work view."}
          </p>
        </div>
        <Button onClick={reset} className="rounded-full px-5">
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}
