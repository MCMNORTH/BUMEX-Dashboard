"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";

type ErrorStateProps = {
  title?: string;
  description?: string;
  error?: Error & { digest?: string };
  retry?: () => void;
  label?: string;
  retryLabel?: string;
};

export function ErrorState({
  title = "This module failed to load",
  description = "The workspace could not complete this request. Try again to reload the current view.",
  error,
  retry,
  label = "Recovery mode",
  retryLabel = "Try again",
}: ErrorStateProps) {
  useEffect(() => {
    if (error) {
      console.error(error);
    }
  }, [error]);

  return (
    <div className="mx-auto max-w-4xl py-8 sm:py-12">
      <EmptyState
        title={title}
        description={description}
        label={label}
        icon={AlertTriangle}
        actions={
          retry ? (
            <Button type="button" className="rounded-full px-5" onClick={() => retry()}>
              <RotateCcw className="size-4" />
              {retryLabel}
            </Button>
          ) : null
        }
      />
    </div>
  );
}
