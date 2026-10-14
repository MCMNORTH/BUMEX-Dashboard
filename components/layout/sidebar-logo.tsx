"use client";

import Image from "next/image";

import type { LogoAppearance } from "@/lib/settings/appearance";
import { cn } from "@/lib/utils";
import type { BumexEntity } from "@/types/entity";

/**
 * The entity logo at the top of the sidebar. The tile behind it and its color filter
 * come from the sidebar theme tokens (`.sidebar-logo` in globals.css), so a dark logo
 * gets a light tile on a dark sidebar and stays visible on every theme.
 */
export function SidebarLogo({
  entity,
  appearance,
  className,
}: {
  entity: BumexEntity;
  appearance: LogoAppearance;
  className?: string;
}) {
  return (
    <span
      data-logo-appearance={appearance}
      className={cn(
        "sidebar-logo relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-transparent p-0.5",
        className,
      )}
      style={{ "--logo-brand": entity.primaryColor } as React.CSSProperties}
    >
      {entity.logoPath ? (
        <Image
          src={entity.logoPath}
          alt={entity.name}
          width={96}
          height={96}
          className="h-full w-full scale-[1.18] object-contain"
        />
      ) : (
        <span data-logo-text className="text-center text-[0.8rem] font-semibold tracking-[-0.04em]">
          {entity.shortLabel}
        </span>
      )}
    </span>
  );
}

// Paints the logo in one color and makes its light parts transparent: the white
// background and the white bird turn see-through, the navy artwork becomes solid.
// The 1.6 gain keeps mid-tones (the steel blue lettering) from looking washed out.
function monochromeMatrix([red, green, blue]: [number, number, number]) {
  const gain = 1.6;
  return [
    `0 0 0 0 ${red}`,
    `0 0 0 0 ${green}`,
    `0 0 0 0 ${blue}`,
    `${-gain * 0.2126} ${-gain * 0.7152} ${-gain * 0.0722} ${gain} 0`,
  ].join(" ");
}

/** Rendered once by the app shell; `.sidebar-logo` refers to these filters by id. */
export function SidebarLogoFilters() {
  return (
    <svg aria-hidden="true" focusable="false" width="0" height="0" className="pointer-events-none absolute">
      <filter id="bumex-logo-mono-white" colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values={monochromeMatrix([1, 1, 1])} />
      </filter>
      {/* #1c2b40, the app's foreground color. */}
      <filter id="bumex-logo-mono-dark" colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values={monochromeMatrix([0.11, 0.169, 0.251])} />
      </filter>
    </svg>
  );
}
