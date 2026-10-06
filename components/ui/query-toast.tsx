"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, TriangleAlert, X } from "lucide-react";

import { useI18n } from "@/components/layout/i18n-provider";

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
  const { t } = useI18n();
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

  // The dictionary holds both languages; the component's own text is the English fallback.
  const message = {
    ...messages[toast],
    title: t(`toasts.${toast}.title`, messages[toast].title),
    description: t(`toasts.${toast}.description`, messages[toast].description),
  };
  const Icon = message.tone === "success" ? CheckCircle2 : TriangleAlert;

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[140] max-w-md sm:right-5 sm:bottom-5">
      <div
        role={message.tone === "error" ? "alert" : "status"}
        className="pointer-events-auto relative overflow-hidden rounded-xl border border-border bg-popover p-4 shadow-[var(--shadow-elevated)] animate-toast-in"
      >
        <div className="flex items-start gap-3">
          <Icon
            className={`mt-0.5 size-5 shrink-0 ${
              message.tone === "success" ? "text-emerald-600 dark:text-emerald-300" : "text-danger"
            }`}
          />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-sm font-semibold text-foreground">{message.title}</p>
            <p className="text-sm text-muted-foreground">{message.description}</p>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => setDismissedToast(toast)}
            aria-label={t("toasts.dismiss", "Dismiss")}
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
