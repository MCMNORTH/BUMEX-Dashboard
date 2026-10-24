"use client";

import dynamic from "next/dynamic";

// Vanguard reads the browser (WebGL, storage, the URL) as it loads: it only ever renders in the browser.
const VanguardApp = dynamic(() => import("@/components/vanguard/vanguard-app"), {
  ssr: false,
  loading: () => <div style={{ position: "fixed", inset: 0, background: "#131d33" }} />,
});

export function VanguardLoader() {
  return <VanguardApp />;
}
