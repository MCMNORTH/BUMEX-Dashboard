"use client";

import { useState, useTransition } from "react";
import { Check, LoaderCircle } from "lucide-react";

import { moveTicketStageAction } from "@/app/(app)/tickets/actions";
import { useI18n } from "@/components/layout/i18n-provider";
import { Button } from "@/components/ui/button";

/**
 * The reporter's sign-off: moves the ticket to its board's completed stage. The server
 * applies the board's rules and the reporter check, and explains a refusal.
 */
export function TicketSignOffButton({
  ticketId,
  stageId,
  stageName,
  size = "default",
}: {
  ticketId: string;
  stageId: string;
  stageName: string;
  size?: "default" | "sm";
}) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const label = isFr ? `Passer à « ${stageName} »` : `Move to ${stageName}`;

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        type="button"
        size={size}
        disabled={pending}
        title={label}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await moveTicketStageAction(ticketId, { stageId });

            if (result.error) {
              setError(result.error);
            }
          });
        }}
      >
        {pending ? <LoaderCircle className="animate-spin" /> : <Check />}
        {size === "sm" ? stageName : label}
      </Button>
      {error ? <span role="alert" className="max-w-64 text-right text-xs text-danger">{error}</span> : null}
    </span>
  );
}
