"use client";

import { useState } from "react";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/layout/i18n-provider";

export function PrintButton() {
  const { locale } = useI18n();
  const isFr = locale === "fr";
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
      {printing ? (isFr ? "Ouverture de l’impression…" : "Opening print…") : (isFr ? "Exporter en PDF" : "Export PDF")}
    </Button>
  );
}
