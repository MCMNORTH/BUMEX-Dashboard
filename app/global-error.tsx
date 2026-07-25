"use client";

import { ErrorState } from "@/components/layout/error-state";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <div className="mx-auto flex min-h-screen max-w-6xl items-center px-4 py-8 sm:px-6">
          <ErrorState
            error={error}
            retry={unstable_retry}
            title="The dashboard shell hit an unexpected issue"
            description="The application could not render the current workspace shell. Retry to restore the session."
            label="Global recovery"
          />
        </div>
      </body>
    </html>
  );
}
