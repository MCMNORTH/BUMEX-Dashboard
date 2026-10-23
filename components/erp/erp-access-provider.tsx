"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { ErpAccess } from "@/types/erp";

// The signed-in person's ERP access, resolved by the (app) layout. null = no ERP section.
const ErpAccessContext = createContext<ErpAccess | null>(null);

export function ErpAccessProvider({ access, children }: { access: ErpAccess | null; children: ReactNode }) {
  return <ErpAccessContext.Provider value={access}>{children}</ErpAccessContext.Provider>;
}

export function useErpAccess() {
  return useContext(ErpAccessContext);
}
