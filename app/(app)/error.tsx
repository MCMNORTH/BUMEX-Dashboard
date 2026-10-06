"use client";

import { ModuleError } from "@/components/layout/module-error";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return <ModuleError module="section" error={error} retry={unstable_retry} />;
}
