"use client";

import { Button } from "@/components/ui/button";

export default function RoadmapError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-[28px] border border-danger/30 bg-danger/10 p-6">
      <h2 className="text-lg font-semibold tracking-[-0.03em]">Roadmap unavailable</h2>
      <p className="mt-2 text-sm leading-6 text-red-100/85">
        {error.message || "The roadmap data could not be loaded."}
      </p>
      <Button className="mt-4 rounded-full px-5" onClick={reset}>
        Retry
      </Button>
    </div>
  );
}

