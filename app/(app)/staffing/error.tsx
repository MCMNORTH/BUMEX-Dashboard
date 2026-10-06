"use client";

import { ModuleError } from "@/components/layout/module-error";

export default function StaffingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ModuleError module="staffing" error={error} retry={reset} />;
}
