"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type ConfirmActionFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  fields: Record<string, string>;
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
};

export function ConfirmActionForm({
  action,
  fields,
  trigger,
  title,
  description,
  confirmLabel = "Confirm",
}: ConfirmActionFormProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form action={action}>
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <DialogFooter className="mt-5">
            <DialogClose asChild>
              <Button type="button" variant="ghost" className="rounded-full px-5">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" className="rounded-full bg-rose-600 px-5 text-white hover:bg-rose-700">
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
