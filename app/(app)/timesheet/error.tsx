"use client";

import { ModuleError } from "@/components/layout/module-error";

export default function TimesheetError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ModuleError module="timesheet" error={error} retry={reset} />;
}
