"use client";

import { useRef, useState } from "react";

import { ArrowRight } from "lucide-react";

import { assignEntityAction } from "@/app/select-entity/actions";
import { EntityLogo } from "@/components/entities/entity-logo";
import { useI18n } from "@/components/layout/i18n-provider";
import { bumexEntities } from "@/lib/entities/config";
import { cn } from "@/lib/utils";
import type { BumexEntityCode } from "@/types/entity";

export function EntitySelectionShell({ error = "" }: { error?: string }) {
  const [selectedCode, setSelectedCode] = useState<BumexEntityCode | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const { locale } = useI18n();

  const handleSelect = (entityCode: BumexEntityCode) => {
    setSelectedCode(entityCode);
    window.setTimeout(() => {
      formRef.current?.requestSubmit();
    }, 720);
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-muted/50 px-4 py-5 sm:px-6 lg:px-8">
      <div className="absolute inset-0 bg-slate-950/18 dark:bg-slate-950/38" />

      {selectedCode ? (
        <div className="pointer-events-none fixed left-6 top-6 z-50 animate-[entityFly_720ms_cubic-bezier(0.18,0.89,0.32,1.28)_forwards]">
          <EntityLogo entity={bumexEntities.find((entity) => entity.code === selectedCode)!} size="lg" />
        </div>
      ) : null}

      <div className="relative flex min-h-screen items-center justify-center">
        <div className="w-full max-w-3xl rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-elevated)] sm:p-6">
          <div className="max-w-md">
              <h1 className="text-2xl font-semibold tracking-tight">
                {locale === "fr" ? "Choisissez votre entité active." : "Choose your active entity."}
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {locale === "fr"
                  ? "Choisissez une entité."
                  : "Choose one entity."}
              </p>
          </div>

          {error ? (
            <div className="mt-6 rounded-[24px] border border-danger/25 bg-danger/10 px-5 py-4 text-sm text-danger dark:border-danger/20 dark:bg-danger/12">
              {error}
            </div>
          ) : null}

          <form ref={formRef} action={assignEntityAction}>
            <input type="hidden" name="entity_code" value={selectedCode ?? ""} />

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {bumexEntities.map((entity, index) => {
                const disabled = !entity.available || selectedCode !== null;
                const selected = selectedCode === entity.code;

                return (
                  <button
                    key={entity.code}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      if (entity.available) {
                        handleSelect(entity.code);
                      }
                    }}
                    className={cn(
                      "group relative overflow-hidden rounded-xl border border-border bg-card p-4 text-left shadow-[var(--shadow-soft)] transition-colors",
                      "hover:border-primary/40",
                      selected && "scale-[0.96] opacity-0",
                      disabled && !selectedCode && !entity.available && "cursor-not-allowed opacity-70 hover:translate-y-0",
                    )}
                    style={{ animationDelay: `${index * 90}ms` }}
                  >
                    <div className="relative flex min-h-24 items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <EntityLogo entity={entity} size="lg" />
                        <h2 className="min-w-0 text-lg font-semibold text-foreground sm:text-xl">
                          {entity.name}
                        </h2>
                      </div>
                      <div
                        className={cn(
                          "flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-foreground transition-colors",
                          entity.available && "group-hover:translate-x-1 group-hover:bg-slate-950 group-hover:text-white dark:group-hover:bg-primary/16 dark:group-hover:text-primary",
                        )}
                      >
                        <ArrowRight className="size-4" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
