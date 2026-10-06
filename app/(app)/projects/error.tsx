"use client";

import { ModuleError } from "@/components/layout/module-error";

export default function ProjectsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ModuleError module="projects" error={error} retry={reset} />;
}
