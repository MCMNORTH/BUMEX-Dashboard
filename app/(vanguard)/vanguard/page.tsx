import type { Metadata } from "next";

import { VanguardLoader } from "@/components/vanguard/vanguard-loader";
import { requireErpAccess } from "@/lib/erp/server";

export const metadata: Metadata = {
  title: "BUMEX VANGUARD",
  description: "BUMEX VANGUARD — ERP multi-entités du groupe BUMEX, exploré comme un immeuble de bureaux en 3D.",
};

// Full screen, outside the BUMEX One shell, for the people the ERP is open to. Step 3: the prototype's own demo data,
// kept in this browser; step 4 connects it to the ERP database.
export default async function VanguardPage() {
  await requireErpAccess();
  return <VanguardLoader />;
}
