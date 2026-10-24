# vanguard/ — BUMEX VANGUARD's interface, as delivered

Copied from the ERP team's `apps/web/src` (the same code as the static build `BUMEX VANGUARD.html`). Their `main.tsx`
is replaced by `components/vanguard/vanguard-app.tsx`; the page is `app/(vanguard)/vanguard/page.tsx`. The engine it
imports as `@bumex/domain` is `lib/erp/engine` (tsconfig `paths`).

Files are kept as delivered so a new delivery can be compared. Local changes, each marked `[bumex-one]` in the code:

| File | Change | Why |
|---|---|---|
| `App.tsx`, `three/Scene.tsx`, `ui/Header.tsx`, `ui/panels/Settings.tsx` | `const emblem = emblemImage.src` (and `logo`) | Next imports images as objects, Vite as URLs |
| `three/Furniture.tsx` | `import type { JSX } from 'react'` | React 19 has no global `JSX` namespace |
| `three/Scene.tsx` | `useRef<OrbitControls>(undefined)` | React 19: `useRef` takes its initial value |
| `ui/Sidebar.tsx` | a "BUMEX One" link in the rail | the legacy app, until its pages are merged into Vanguard |

`styles.css` is theirs; `vanguard.css` is generated from it by `node scripts/vanguard-css.mjs` (every rule scoped to
the `.vanguard` container, keyframes prefixed, BUMEX One's base reset undone inside it). Re-run it after a new
delivery of `styles.css`.

Libraries: React 19 / Next 16 here, so `@react-three/fiber` 9, `@react-three/drei` 10 and `@react-three/postprocessing`
3 instead of their 8 / 9 / 2 (same APIs for what Vanguard uses: Canvas, useFrame, useThree, ContactShadows,
EffectComposer, N8AO, SMAA); `three` 0.170 and `zustand` 5 as theirs; `xlsx` 0.20.3 from SheetJS (the npm 0.18.5 has
known vulnerabilities).
