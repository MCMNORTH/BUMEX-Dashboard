"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { CheckCircle2, TriangleAlert, X } from "lucide-react";

import type { ActionResult } from "@/lib/erp/accounting/model";

type Notice = { tone: "success" | "error"; text: string; at: number };

// Runs a server action and shows its sentence in a toast (same look as the app's QueryToast).
export function useAccountingAction() {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<Notice | null>(null);

  const run = useCallback(<T,>(action: () => Promise<ActionResult<T>>, onSuccess?: (result: ActionResult<T> & { ok: true }) => void) => {
    startTransition(async () => {
      const result = await action();
      setNotice({ tone: result.ok ? "success" : "error", text: result.ok ? result.message : result.error, at: Date.now() });
      if (result.ok) onSuccess?.(result);
    });
  }, []);

  const dismiss = useCallback(() => setNotice(null), []);

  return { pending, notice, dismiss, run };
}

export function ActionNotice({ notice, onDismiss }: { notice: Notice | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(onDismiss, notice.tone === "error" ? 9000 : 4000);
    return () => window.clearTimeout(timer);
  }, [notice, onDismiss]);

  if (!notice) return null;
  const Icon = notice.tone === "success" ? CheckCircle2 : TriangleAlert;
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[140] max-w-md sm:right-5 sm:bottom-5">
      <div
        role={notice.tone === "error" ? "alert" : "status"}
        className="pointer-events-auto relative overflow-hidden rounded-xl border border-border bg-popover p-4 shadow-[var(--shadow-elevated)] animate-toast-in"
      >
        <div className="flex items-start gap-3">
          <Icon className={`mt-0.5 size-5 shrink-0 ${notice.tone === "success" ? "text-success" : "text-danger"}`} />
          <p className="min-w-0 flex-1 text-sm text-foreground">{notice.text}</p>
          <button type="button" className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" onClick={onDismiss} aria-label="Dismiss">
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
