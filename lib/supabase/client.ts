"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseEnv, hasSupabaseEnv } from "@/lib/supabase/config";

let browserClient: SupabaseClient | null = null;

export function createClient() {
  if (!hasSupabaseEnv()) {
    return null;
  }

  if (!browserClient) {
    const { url, publishableKey } = getSupabaseEnv();

    browserClient = createBrowserClient(url, publishableKey);
  }

  return browserClient;
}
