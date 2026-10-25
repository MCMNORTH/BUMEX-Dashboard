import type { Metadata } from "next";

import { requireErpAccess } from "@/lib/erp/server";

export const metadata: Metadata = {
  title: "BUMEX VANGUARD",
  description: "BUMEX VANGUARD — ERP multi-entités du groupe BUMEX, exploré comme un immeuble de bureaux en 3D.",
};

// The building itself: Vanguard's frame (app/(app)/layout.tsx) shows it when no other page is open.
export default async function VanguardPage() {
  await requireErpAccess();
  return null;
}
