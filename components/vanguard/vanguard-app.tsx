"use client";

import { useEffect } from "react";

import "@/vanguard/vanguard.css";
import { App } from "@/vanguard/App";
import { useStore } from "@/vanguard/store";

// BUMEX VANGUARD as the ERP team delivered it (vanguard/), mounted in its own container. Replaces their main.tsx.
export default function VanguardApp() {
  useEffect(() => {
    // The store is reachable from the console and the smoke test, as in the prototype (window.__vanguard.getState()).
    (window as unknown as { __vanguard: typeof useStore }).__vanguard = useStore;
  }, []);

  return (
    <div className="vanguard">
      <App />
    </div>
  );
}
