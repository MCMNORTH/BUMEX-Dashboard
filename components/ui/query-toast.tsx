"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, TriangleAlert, X } from "lucide-react";

type ToastTone = "success" | "error";

type ToastMessages = Record<
  string,
  {
    title: string;
    description: string;
    tone: ToastTone;
  }
>;

type QueryToastProps = {
  messages: ToastMessages;
};

export function QueryToast({ messages }: QueryToastProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = searchParams.get("toast");
  const [dismissedToast, setDismissedToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast || !messages[toast]) {
      return;
    }

    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(searchParams.toString());
      next.delete("toast");
      setDismissedToast(toast);
      router.replace(next.size ? `${pathname}?${next.toString()}` : pathname, { scroll: false });
    }, 3600);

    return () => window.clearTimeout(timer);
  }, [messages, pathname, router, searchParams, toast]);

  if (!toast || !messages[toast] || dismissedToast === toast) {
    return null;
  }

  const message = messages[toast];
  const Icon = message.tone === "success" ? CheckCircle2 : TriangleAlert;

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[140] max-w-md sm:right-5 sm:bottom-5">
      <div className="pointer-events-auto relative overflow-hidden rounded-[26px] border border-border/70 bg-popover/95 p-4 shadow-[var(--shadow-elevated)] backdrop-blur-xl animate-toast-in">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/20" />
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl ${
              message.tone === "success"
                ? "bg-emerald-500/14 text-emerald-600 dark:text-emerald-300"
                : "bg-rose-500/14 text-rose-600 dark:text-rose-300"
            }`}
          >
            <Icon className="size-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-semibold tracking-[-0.02em] text-foreground">{message.title}</p>
            <p className="text-sm leading-6 text-muted-foreground">{message.description}</p>
          </div>
          <button
            type="button"
            className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={() => setDismissedToast(toast)}
            aria-label="Dismiss toast"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
