"use client";

import Image from "next/image";

import { cn } from "@/lib/utils";
import type { BumexEntity } from "@/types/entity";

export function EntityLogo({
  entity,
  size = "md",
  forceWhiteBackground = true,
  className,
}: {
  entity: BumexEntity;
  size?: "sm" | "md" | "lg" | "xl";
  forceWhiteBackground?: boolean;
  className?: string;
}) {
  const boxClassName =
    size === "sm"
      ? "size-10 rounded-xl p-1"
      : size === "lg"
        ? "size-20 rounded-[22px] p-1.5"
      : size === "xl"
          ? "size-28 rounded-[28px] p-2"
          : "size-14 rounded-2xl p-1.25";

  if (!entity.logoPath) {
    return (
      <div
        className={cn(
          "relative flex items-center justify-center border border-slate-200/80 shadow-[0_14px_35px_rgba(15,23,42,0.08)] dark:border-white/10 dark:shadow-none",
          forceWhiteBackground ? "bg-white dark:bg-white" : "bg-slate-100 dark:bg-slate-900/80",
          boxClassName,
          className,
        )}
      >
        <div
          className="absolute inset-0 opacity-100"
          style={{
            borderRadius: "inherit",
            background: `radial-gradient(circle at top, ${entity.secondaryColor}30, transparent 62%), linear-gradient(180deg, white, #f8fbff)`,
          }}
        />
        <span
          className="relative text-center font-semibold tracking-[-0.04em]"
          style={{
            color: entity.primaryColor,
            fontSize: size === "xl" ? "1.35rem" : size === "lg" ? "1rem" : "0.8rem",
          }}
        >
          {entity.shortLabel}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden border border-slate-200/80 shadow-[0_14px_35px_rgba(15,23,42,0.08)] dark:border-white/10 dark:shadow-none",
        forceWhiteBackground ? "bg-white dark:bg-white" : "bg-slate-100 dark:bg-slate-900/80",
        boxClassName,
        className,
      )}
    >
      <Image
        src={entity.logoPath}
        alt={entity.name}
        width={220}
        height={220}
        className="h-full w-full scale-[1.18] object-contain"
      />
    </div>
  );
}
