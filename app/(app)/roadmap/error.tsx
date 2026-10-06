"use client";

import { ModuleError } from "@/components/layout/module-error";

export default function RoadmapError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ModuleError module="roadmap" error={error} retry={reset} />;
}
