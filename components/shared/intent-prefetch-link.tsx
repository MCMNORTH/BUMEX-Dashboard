"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type IntentPrefetchLinkProps = Omit<ComponentProps<typeof Link>, "href" | "prefetch"> & { href: string };

/**
 * A link that prefetches its page when the user points at, focuses or touches
 * it, instead of as soon as it scrolls into view. For long lists of links
 * (board cards, table rows), where viewport prefetching sends a request per row.
 */
export function IntentPrefetchLink({ href, onMouseEnter, onFocus, onTouchStart, ...props }: IntentPrefetchLinkProps) {
  const router = useRouter();

  return (
    <Link
      href={href}
      prefetch={false}
      onMouseEnter={(event) => {
        router.prefetch(href);
        onMouseEnter?.(event);
      }}
      onFocus={(event) => {
        router.prefetch(href);
        onFocus?.(event);
      }}
      onTouchStart={(event) => {
        router.prefetch(href);
        onTouchStart?.(event);
      }}
      {...props}
    />
  );
}
