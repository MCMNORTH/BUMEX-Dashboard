# vanguard/ — BUMEX VANGUARD's interface, as delivered

Copied from the ERP team's `apps/web/src` (the same code as the static build `BUMEX VANGUARD.html`). Their `main.tsx`
is replaced by `components/vanguard/vanguard-app.tsx`; the page is `app/(app)/vanguard/page.tsx`. The engine is
`lib/erp/engine`, also as delivered; the screens import it as `@bumex/domain`, which is `lib/erp/vanguard/domain.ts`
(tsconfig `paths`): the engine, with each change it makes recorded for the server.

## Real data

`store.ts` is the adapter the ERP team planned to replace ("production replaces that adapter with the API over
PostgreSQL; the engine and the UI do not change"). Here:

- the page reads the state from PostgreSQL for the signed-in person (`lib/erp/vanguard/load.ts`, in their ERP session:
  row-level security, their role, entities and modules) and the store starts on it (`hydrate`);
- every `apply()` runs as before on the screen, and the engine calls it made are recorded (`record.ts`, with the ids
  they made); the server replays them with the same engine on the state it reads itself (`replay.ts`), writes the
  difference (`save.ts`, where the schema's guards check every row again) and answers with the database's state;
- entry numbers, hashes, chains and the history are the database's own; the integrity check is `erp.verify_chain`;
  document numbers (invoices, receipts, assets, archive boxes) follow the engine's counters, kept in the database;
- every room is connected: accounting in `save.ts`, the other modules through one description per table
  (`tables.ts`, read and written the same way); people and staff counts come from BUMEX One's profiles;
- one person, one role: Vanguard's (`erp.user_access`). Everyone gets one on their first visit, from their BUMEX One
  role (`lib/erp/roles.ts`); BUMEX One's role then follows it. Vanguard's Settings › accounts and BUMEX One's Settings ›
  Users (Vanguard role column) both change it; an access an administrator removed is not given again;
- every 30 seconds (and on coming back to the page) the screen asks for the database's version (last audit row) and
  reads the state again when someone else changed it;
- the browser receives the rows of the person's modules and what those rooms read of the others
  (`lib/erp/vanguard/visible.ts`; pay only with the HR module; reports and consolidation see every module but pay),
  while the server replays on everything the person's entities hold (row-level security is by entity). Figures
  computed from rows not sent (floor signals, badges, report cards) count nothing.

Tasks are BUMEX One's tickets of the missions (`lib/erp/vanguard/tickets.ts`): read into the engine's tasks (bottom bar,
floor signals, mission cards), created and moved in the Tasks room with BUMEX One's ticket actions (its rules, workflows
and notifications), on a list or on each mission's board; comments and sub-tasks on the ticket's page. The engine's own task changes are refused.

Clients have two sides (`lib/erp/vanguard/clients.ts`): the relationship side is BUMEX One's client, one for the group;
the accounting side is the customer account of each entity that bills it, linked by `bumex_client_id`. A customer saved in
Vanguard gets or updates its client (same name, else a new one); a client edited in BUMEX One updates its customers'
name, e-mail and tax id. The Clients room lists the clients and opens an account for one on the floor.

Missions are BUMEX One's projects (every kind): created and edited in Vanguard's Missions room (`vanguard/one/Missions.tsx`,
`lib/erp/vanguard/mission-actions.ts`, saved with BUMEX One's project code and on the floor they are created on); their
board is the Tasks room's "Tableau" tab (its BUMEX One workflow, `vanguard/one/Board.tsx`); notes, comments and milestones are still on BUMEX One's project page. Client projects are mirrored in `erp.engagement` (`lib/erp/vanguard/missions.ts`) so that
invoices, planning lines and archive boxes can point to them: name, status, dates, fee, progress (→ the five stages),
timesheet hours, members' initials; the client becomes the ERP customer of the same name, or a new one once the entity
has its chart. The mirror runs when Vanguard loads and with the 30-second check, only when BUMEX One's tables moved.

## Local changes

Each is marked `[bumex-one]` in the code, so a new delivery can be compared. `vanguard/one/` is ours: BUMEX One's
features rebuilt in Vanguard (linted, unlike the delivered files).

| File | Change | Why |
|---|---|---|
| `App.tsx`, `three/Scene.tsx`, `ui/Header.tsx`, `ui/panels/Settings.tsx` | `const emblem = emblemImage.src` (and `logo`) | Next imports images as objects, Vite as URLs |
| `three/Furniture.tsx` | `import type { JSX } from 'react'` | React 19 has no global `JSX` namespace |
| `three/Scene.tsx` | `useRef<OrbitControls>(undefined)` | React 19: `useRef` takes its initial value |
| `ui/Sidebar.tsx` | a "Travail" entry in the rail listing BUMEX One's pages that have no room yet (`components/vanguard/work-menu.tsx`); while one of them is open, that entry is the current one | those pages, until they move into Vanguard |
| `ui/Header.tsx` | room at the right for BUMEX One's controls (refresh, notifications, account); Escape and F left to an open BUMEX One page | Vanguard is the frame of every page |
| `three/Scene.tsx` | `frameloop` stops while a BUMEX One page covers the building | no drawing behind a page |
| `ui/panels/Other.tsx` | "Nouvelle mission", the mission form and the mission card on the Missions board (`vanguard/one/Missions.tsx`) | missions are BUMEX One's projects, managed here |
| `ui/panels/Clients.tsx` | the Relations list (BUMEX One's clients) under the customer accounts (`vanguard/one/Clients.tsx`) | one client, two sides |
| `ui/Sidebar.tsx`, `ui/Rooms.tsx`, `i18n.ts`, `store.ts` | a "My day" room (`vanguard/one/MyDay.tsx`): BUMEX One's overview for the person, opened from the rail over the building | the building is the home, "My day" its panel |
| `ui/panels/Reports.tsx` | a second part, BUMEX One's activity reports (`vanguard/one/ActivityReports.tsx`), opened directly with the tab `activity` | one Reports room, both kinds |
| `ui/panels/Other.tsx` | a "Semaine" tab in the Missions room: the floor's tickets day by day, late, undated, each person's load, drag to reschedule (`vanguard/one/Week.tsx`) | BUMEX One's Planning page moved here |
| `ui/panels/Hr.tsx` | a "Personnes" tab: BUMEX One's team with Vanguard roles, load and HR record (`vanguard/one/People.tsx`); without the HR module it is the room's only tab, and the room opens to everyone who sees the floor (`canOpenRoom` in `lib/erp/vanguard/domain.ts`) | BUMEX One's Team page moved here |
| `ui/panels/Settings.tsx` | the History tab is `vanguard/one/History.tsx`: the audit log and BUMEX One's activity log in one timeline | BUMEX One's Activity page moved here |
| `ui/Header.tsx` | the search also lists BUMEX One's records (`vanguard/one/search.ts`) | one search for everything |
| `ui/Rooms.tsx` | the Tasks room is `vanguard/one/Tasks.tsx` (BUMEX One's tickets) instead of `ui/panels/Tasks.tsx` | the tasks are BUMEX One's tickets |
| `ui/CommandBar.tsx` | a task with no due date shows "—" | tickets may have no due date |
| `store.ts` | state from the server (`hydrate`), `apply()` recorded and sent, no browser storage of the state, no demo sign-in or reset (reset reloads) | real data |
| `ui/panels/Settings.tsx`, `i18n.ts` | no demo sign-in; "reload the data" instead of "reset the demo"; the data note; the accounts panel opens the ERP to a BUMEX One person (no invitation link) | real data, BUMEX One's accounts |
| `lib/erp/engine/core.ts` | `nextId` takes its ids from `withIdSource` when one is set | the browser makes UUIDs, the server replays them |
| `ui/panels/Accounting.tsx` | an entity with no chart yet opens on its chart, the entry form waits for it | real entities start without a chart (the demo had all eight set up) |
| `ui/Rooms.tsx` | the flat view opens the first room the person may open (missions otherwise) | it opened Accounting for everyone |

`styles.css` is theirs; `vanguard.css` is generated from it by `node scripts/vanguard-css.mjs` (every rule scoped to
the `.vanguard` container, keyframes prefixed, BUMEX One's base reset undone inside it). Re-run it after a new
delivery of `styles.css`.

## The frame

Vanguard is the app's frame for everyone with ERP access (`app/(app)/layout.tsx` → `components/vanguard/vanguard-shell.tsx`):
its header, rail and building stay mounted from page to page; `/vanguard` is the building, and each BUMEX One page
opens in the area right of the rail (`.bumex-page`), which Vanguard's stylesheet leaves out. Those pages take Vanguard's
design (`html.vanguard-app` in `app/globals.css`: its palette, surfaces and type; light only, no theme to choose).
Choosing a room, a floor or the overview goes back to the building; `/vanguard?room=…&tab=…` opens a room. BUMEX One's
pages that moved into rooms (overview, projects, tickets, clients, staffing, planning, team, activity, reports, roles)
send people with ERP access there (`lib/erp/vanguard/retired.ts`). People without ERP access keep BUMEX One's shell.

Libraries: React 19 / Next 16 here, so `@react-three/fiber` 9, `@react-three/drei` 10 and `@react-three/postprocessing`
3 instead of their 8 / 9 / 2 (same APIs for what Vanguard uses: Canvas, useFrame, useThree, ContactShadows,
EffectComposer, N8AO, SMAA); `three` 0.170 and `zustand` 5 as theirs; `xlsx` 0.20.3 from SheetJS (the npm 0.18.5 has
known vulnerabilities).
