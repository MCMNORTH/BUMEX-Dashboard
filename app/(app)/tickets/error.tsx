"use client";

import { ModuleError } from "@/components/layout/module-error";

export default function TicketsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ModuleError module="tickets" error={error} retry={reset} />;
}
