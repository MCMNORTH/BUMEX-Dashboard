"use client";

import { useEffect } from "react";

import { registerPage, type PageLiveMode } from "@/lib/live/page-refresh";
import type { LiveVersions } from "@/lib/live/live-client";

export function PageRefreshRegistration({
  renderedAt,
  tables,
  versions,
  live,
}: {
  renderedAt: number;
  tables: readonly string[];
  versions: LiveVersions;
  live: PageLiveMode;
}) {
  useEffect(() => registerPage({ renderedAt, tables, versions, live }), [renderedAt, tables, versions, live]);

  return null;
}
