import type { MetadataRoute } from "next";

// The app on a phone's or a tablet's home screen (docs/plans/mobile-tablet.md, step 11): it opens on Vanguard, in a
// window of its own. No service worker: the app needs the server anyway. Without the browser's buttons, the way back
// is the app's own (vanguard/one/back.ts). Icons made from public/bumex-official-logo-transparent.png.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BUMEX Vanguard",
    short_name: "BUMEX",
    description: "BUMEX Vanguard — l'ERP et le travail du groupe BUMEX.",
    start_url: "/vanguard",
    scope: "/",
    display: "standalone",
    background_color: "#131d33",
    theme_color: "#131d33",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
