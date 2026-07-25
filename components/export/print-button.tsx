"use client";

import { useState } from "react";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

export function PrintButton() {
  const [printing, setPrinting] = useState(false);

  return (
    <Button
      type="button"
      variant="secondary"
      className="print-hidden rounded-2xl px-5"
      onClick={() => {
        setPrinting(true);
        window.setTimeout(() => {
          window.print();
          setPrinting(false);
        }, 40);
      }}
    >
      <Printer className="mr-2 size-4" />
      {printing ? "Opening print…" : "Export PDF"}
    </Button>
  );
}
