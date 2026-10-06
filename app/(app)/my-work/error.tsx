"use client";

import { ModuleError } from "@/components/layout/module-error";

export default function MyWorkError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ModuleError module="myWork" error={error} retry={reset} />;
}
