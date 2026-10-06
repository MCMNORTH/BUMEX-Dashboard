"use client";

import { ModuleError } from "@/components/layout/module-error";

export default function PlanningError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ModuleError module="planning" error={error} retry={reset} />;
}
