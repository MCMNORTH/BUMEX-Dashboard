"use client";

import { ModuleError } from "@/components/layout/module-error";

export default function CalendarError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ModuleError module="calendar" error={error} retry={reset} />;
}
