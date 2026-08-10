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
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.16),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(245,158,11,0.12),transparent_30%),linear-gradient(180deg,#eef5ff_0%,#f8fbff_42%,#f2f6fb_100%)] px-4 py-5 dark:bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(245,158,11,0.12),transparent_28%),linear-gradient(180deg,#0f172a_0%,#111827_50%,#0b1120_100%)] sm:px-6 lg:px-8">
      <div className="absolute inset-0 bg-slate-950/18 dark:bg-slate-950/38" />

      {selectedCode ? (
        <div className="pointer-events-none fixed left-6 top-6 z-50 animate-[entityFly_720ms_cubic-bezier(0.18,0.89,0.32,1.28)_forwards]">
          <EntityLogo entity={bumexEntities.find((entity) => entity.code === selectedCode)!} size="lg" />
        </div>
      ) : null}

      <div className="relative flex min-h-screen items-center justify-center">
        <div className="w-full max-w-3xl rounded-[28px] border border-white/75 bg-white/95 p-5 shadow-[0_42px_120px_rgba(15,23,42,0.22)] backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/72 dark:shadow-[0_30px_90px_rgba(0,0,0,0.45)] sm:p-6">
          <div className="max-w-md">
              <h1 className="text-2xl font-semibold tracking-[-0.06em] text-slate-950 dark:text-slate-50 sm:text-3xl">
                {locale === "fr" ? "Choisissez votre entité active." : "Choose your active entity."}
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-300">
                {locale === "fr"
                  ? "Choisissez une entité."
                  : "Choose one entity."}
              </p>
          </div>

          {error ? (
            <div className="mt-6 rounded-[24px] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 dark:border-red-400/20 dark:bg-red-500/12 dark:text-red-100">
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
                      "group relative overflow-hidden rounded-[20px] border border-slate-200 bg-white p-4 text-left shadow-[0_12px_28px_rgba(15,23,42,0.06)] transition-all duration-300 dark:border-white/10 dark:bg-slate-900/75 dark:shadow-none",
                      "hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-[0_18px_38px_rgba(15,23,42,0.1)] dark:hover:border-sky-400/25 dark:hover:bg-slate-900",
                      selected && "scale-[0.96] opacity-0",
                      disabled && !selectedCode && !entity.available && "cursor-not-allowed opacity-70 hover:translate-y-0",
                    )}
                    style={{ animationDelay: `${index * 90}ms` }}
                  >
                    <div
                      className="pointer-events-none absolute inset-0 opacity-90 transition-opacity duration-500 group-hover:opacity-100"
                      style={{
                        background: `radial-gradient(circle at top left, ${entity.secondaryColor}20, transparent 34%), radial-gradient(circle at bottom right, ${entity.primaryColor}10, transparent 40%)`,
                      }}
                    />
                    <div className="relative flex min-h-24 items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <EntityLogo entity={entity} size="lg" />
                        <h2 className="min-w-0 text-lg font-semibold tracking-[-0.05em] text-slate-950 dark:text-slate-50 sm:text-xl">
                          {entity.name}
                        </h2>
                      </div>
                      <div
                        className={cn(
                          "flex size-10 shrink-0 items-center justify-center rounded-2xl border border-white/80 bg-white/90 text-slate-800 shadow-[0_16px_32px_rgba(15,23,42,0.08)] transition-all duration-300 dark:border-white/10 dark:bg-slate-950/90 dark:text-slate-200 dark:shadow-none",
                          entity.available && "group-hover:translate-x-1 group-hover:bg-slate-950 group-hover:text-white dark:group-hover:bg-sky-500/16 dark:group-hover:text-sky-100",
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
