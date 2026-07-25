"use client";

import { useActionState, useState } from "react";
import { Mail, SendHorizontal } from "lucide-react";

import {
  sendInvoiceEmailAction,
  type SendInvoiceActionState,
} from "@/app/(app)/finance/invoices/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const initialState: SendInvoiceActionState = {};

export function SendInvoiceEmailForm({
  defaultEmail,
  invoiceId,
  invoiceNumber,
  returnPath,
}: {
  defaultEmail: string;
  invoiceId: string;
  invoiceNumber: string;
  returnPath: string;
}) {
  const [state, formAction] = useActionState(sendInvoiceEmailAction, initialState);
  const [recipientEmail, setRecipientEmail] = useState(defaultEmail);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" className="rounded-2xl px-5">
          <SendHorizontal className="size-4" />
          Send to client
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send {invoiceNumber}</DialogTitle>
          <DialogDescription>
            Confirm the client email before sending. You can keep the suggested email or replace it with another address.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="invoice_id" value={invoiceId} />
          <input type="hidden" name="return_path" value={returnPath} />

          <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
            <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Suggested recipient</p>
            <p className="mt-2 text-sm font-medium">{defaultEmail || "No client email on file"}</p>
          </div>

          <div className="space-y-2">
            <label htmlFor={`send-email-${invoiceId}`} className="text-sm font-medium">
              Recipient email
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id={`send-email-${invoiceId}`}
                name="recipient_email"
                type="email"
                required
                value={recipientEmail}
                onChange={(event) => setRecipientEmail(event.target.value)}
                className="pl-11"
                placeholder="client@example.com"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Change this field if you want to send the invoice to another address instead of the client email on file.
            </p>
          </div>

          {state.error ? (
            <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-red-200">
              {state.error}
            </div>
          ) : null}

          <div className="flex justify-end">
            <Button type="submit" className="rounded-2xl px-5">
              <SendHorizontal className="size-4" />
              Send invoice
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
