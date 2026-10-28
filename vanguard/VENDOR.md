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
  (`tables.ts`, read and written the same way); people and staff counts come from the people (`work.person`);
- one person, one role: Vanguard's (`erp.user_access`). A newcomer gets staff on their entity on their first visit
  (`lib/erp/roles.ts`; everyone else got theirs from their BUMEX One role when the data was copied); Settings ›
  Permissions changes it (`vanguard/one/Permissions.tsx`), for the administrators who are role modifiers only, with
  modules per entity and invitations; the engine's account commands are not replayed; an access that was removed is
  not given again;
- every 30 seconds (and on coming back to the page) the screen asks for the database's version (last audit row, plus
  the work's counter for people and mission members) and reads the state again when someone else changed it;
- the browser receives the rows of the person's modules and what those rooms read of the others
  (`lib/erp/vanguard/visible.ts`; pay only with the HR module; reports and consolidation see every module but pay),
  while the server replays on everything the person's entities hold (row-level security is by entity). Figures
  computed from rows not sent (floor signals, badges, report cards) count nothing.

Tasks are the tickets of the missions (`erp.task`, migration 0008; `lib/erp/vanguard/tickets.ts`): read into the engine's
tasks (bottom bar, floor signals, mission cards), created and moved in the Tasks room with the ticket actions (BUMEX
One's rules, workflows and notifications), on a list or on each mission's board; each ticket's page (comments,
sub-tasks, history) is in the Tasks room (`vanguard/one/Ticket.tsx`). The engine's own task changes are refused.

Clients have two sides: the relationship side is the group's client (`work.client`); the accounting side is the
customer account of each entity that bills it (`erp.customer.client_id`). The database keeps them in step: a customer
saved in Vanguard gets its client (same name, else a new one) and passes on its name, e-mail and tax id; a client edited
updates its customers'. The Clients room lists the clients and opens an account for one on the floor.

Missions are the ERP's engagements, every kind of project (`erp.engagement`, migration 0008): created and edited in the
Missions room (`vanguard/one/Missions.tsx`, `lib/erp/vanguard/mission-actions.ts`, `lib/projects/service.ts`), on the
floor they are created on; their board is the Tasks room's "Tableau" tab (`work.board`, `vanguard/one/Board.tsx`); their
page (team, notes, comments, history, the board's rules) is `vanguard/one/Mission.tsx`. The engine reads their progress
(→ the five stages), hours and members' initials from the database (`work.mission_*`), the same for everyone who sees
them; a mission's client becomes the ERP customer of its entity once the entity has its chart.

## Local changes

Each is marked `[bumex-one]` in the code, so a new delivery can be compared. `vanguard/one/` is ours: BUMEX One's
features rebuilt in Vanguard (linted, unlike the delivered files).

| File | Change | Why |
|---|---|---|
| `App.tsx`, `three/Scene.tsx`, `ui/Header.tsx`, `ui/panels/Settings.tsx` | `const emblem = emblemImage.src` (and `logo`) | Next imports images as objects, Vite as URLs |
| `three/Furniture.tsx` | `import type { JSX } from 'react'` | React 19 has no global `JSX` namespace |
| `three/Scene.tsx` | `useRef<OrbitControls>(undefined)` | React 19: `useRef` takes its initial value |
| `ui/Sidebar.tsx`, `ui/Rooms.tsx`, `i18n.ts`, `store.ts` | a "Temps" room in the rail (`vanguard/one/Time.tsx`: BUMEX One's timesheet, mine and the team's review) and an "inbox" room for the notifications (`vanguard/one/Inbox.tsx`, opened from the bell); the rail no longer carries BUMEX One's menu: every one of its pages is a room or a tab now | BUMEX One's pages rebuilt in Vanguard (choice of 2026-10-25) |
| `ui/panels/Other.tsx` | "Nouvelle mission", the mission form and the mission card on the Missions board (`vanguard/one/Missions.tsx`) | missions are BUMEX One's projects, managed here |
| `ui/panels/Clients.tsx` | the Relations list (BUMEX One's clients) under the customer accounts (`vanguard/one/Clients.tsx`) | one client, two sides |
| `ui/Sidebar.tsx`, `ui/Rooms.tsx`, `i18n.ts`, `store.ts` | a "My day" room (`vanguard/one/MyDay.tsx`): BUMEX One's overview for the person, opened from the rail over the building | the building is the home, "My day" its panel |
| `ui/panels/Reports.tsx` | a second part, BUMEX One's activity reports (`vanguard/one/ActivityReports.tsx`), opened directly with the tab `activity` | one Reports room, both kinds |
| `ui/panels/Other.tsx` | a "Semaine" tab in the Missions room: the floor's tickets day by day, late, undated, each person's load, drag to reschedule (`vanguard/one/Week.tsx`) | BUMEX One's Planning page moved here |
| `ui/panels/Hr.tsx` | a "Personnes" tab: BUMEX One's team with Vanguard roles, load and HR record (`vanguard/one/People.tsx`); without the HR module it is the room's only tab, and the room opens to everyone who sees the floor (`canOpenRoom` in `lib/erp/vanguard/domain.ts`) | BUMEX One's Team page moved here |
| `ui/panels/Settings.tsx` | the History tab is `vanguard/one/History.tsx`: the audit log and BUMEX One's activity log in one timeline | BUMEX One's Activity page moved here |
| `ui/Header.tsx` | the search also lists BUMEX One's records (`vanguard/one/search.ts`); room at the right for the bell and the account menu | one search for everything; BUMEX One's controls in Vanguard's header |
| `ui/Rooms.tsx` | the Tasks room is `vanguard/one/Tasks.tsx` (BUMEX One's tickets) instead of `ui/panels/Tasks.tsx` | the tasks are BUMEX One's tickets |
| `ui/CommandBar.tsx` | a task with no due date shows "—" | tickets may have no due date |
| `store.ts` | state from the server (`hydrate`), `apply()` recorded and sent, no browser storage of the state, no demo sign-in or reset (reset reloads) | real data |
| `ui/panels/Settings.tsx`, `i18n.ts` | no demo sign-in; "reload the data" instead of "reset the demo"; the data note | real data |
| `lib/erp/engine/core.ts` | `nextId` takes its ids from `withIdSource` when one is set | the browser makes UUIDs, the server replays them |
| `lib/erp/engine/core.ts`, `types.ts` | `Session.entityModules` (a person's rooms where an entity's differ) read by `canOpenRoom`, and by `canUseModule` as "on one entity"; `Session.managesAccess` | modules per entity, the role modifiers (0009) |
| every screen with a dropdown (`ui/panels/*`, `ui/Header.tsx`, `one/*`) | every `<select>` is `ui/Select.tsx`'s `<Select>` (same props, `<option>` children, `e.target.value`), every `<datalist>` its `<Suggest>`; long lists carry `recent="…"`; the search is `ui/select-search.ts`, the look `vanguard/select.css` (styles.css untouched). `ui/test/no-native-select.test.ts` fails if a browser dropdown comes back (a new delivery: replace them the same way) | modern dropdowns with a smart search, everywhere (asked on 2026-10-27) |
| `lib/erp/engine/types.ts`, `signals.ts` | `Entity.isTest`; `groupFigures` leaves the test floor out | the test floor, BUMEX Testing (0011) |
| `three/plan.ts`, `three/Scene.tsx`, `ui/Sidebar.tsx`, `ui/Hud.tsx` | the test floor is a basement (`floorIndex` −1, `floorY` below the plaza), drawn alone when one goes down there, not part of the tower; numbered −1 | the test floor (0011) |
| `ui/Rooms.tsx` | a banner on every room of the test floor; "sous-sol · test" in the flat view's list | the test floor (0011) |
| `store.ts`, `ui/Header.tsx`, `lib/erp/engine/types.ts` | the building in 3D only with `Session.view3d` (`ui.scene3d`, read by `hydrate`): without it the app opens flat, with no Building/Flat switch and no "Flat" in the breadcrumb; with it, on the building as before | the 3D building is an option of the permissions page, off by default (0010, asked on 2026-10-27) |
| `ui/panels/Accounting.tsx` | an entity with no chart yet opens on its chart, the entry form waits for it | real entities start without a chart (the demo had all eight set up) |
| `ui/Rooms.tsx` | the flat view opens the first room the person may open (missions otherwise) | it opened Accounting for everyone |
| `ui/panels/Other.tsx` | "Calendrier" and "Jalons" tabs (`vanguard/one/Calendar.tsx`, `vanguard/one/Milestones.tsx`); a mission's page (`mission:<project>` tab, `vanguard/one/Mission.tsx`, with its board's rules, `vanguard/one/Workflow.tsx`) | BUMEX One's Calendar, Roadmap and project pages |
| `ui/panels/Clients.tsx` | a "Contrats" tab (`vanguard/one/Contracts.tsx`); a client's page (`client:<id>`, `vanguard/one/ClientPage.tsx`) and a contract's (`contract:<id>`) | BUMEX One's Contracts and client pages |
| `ui/panels/Archives.tsx`, `ui/Rooms.tsx` | two parts: the boxes, as delivered, and BUMEX One's documents (`vanguard/one/Documents.tsx`) | BUMEX One's Documents page |
| `ui/panels/Reports.tsx` | a third part, "Archives financières" (`vanguard/one/FinanceArchive.tsx`): BUMEX One's finance records, read-only | the books are the ERP's |
| `ui/panels/Hr.tsx` | a person's page on the People tab (`person:<id>`, `vanguard/one/Person.tsx`) | BUMEX One's team member page |
| `ui/panels/Settings.tsx` | a "Mon compte" tab (`vanguard/one/Account.tsx`: profile, preferences, password); the accounts tab is the Permissions tab (`vanguard/one/Permissions.tsx`: everyone, with or without access, their role, entities and modules per entity, invitations), for the role modifiers only; the demo sign-in, account form and status buttons are gone | BUMEX One's account pages and Users page, merged; access managed by the role modifiers |
| `ui/Rooms.tsx` | My day passes its tab on (its "Mon travail" tab is BUMEX One's My Work, `vanguard/one/MyWork.tsx`) | My Work merged into My day |
| `ui/Rooms.tsx` | the flat view has no entity list beside the page: the floor is chosen from the rail | the list repeated the rail's floors |
| `ui/Header.tsx` | no user chip: the person's menu (`components/layout/account-menu.tsx`) carries their panels, settings, permissions, language and sign out | two profile buttons side by side |
| `ui/Sidebar.tsx`, `styles.css`, `ui/Rooms.tsx`, `i18n.ts`, `store.ts` | the rail groups the person's work (My day, "Mon travail", Tasks, Time, Archives) apart from the modules (Reports with them), is compact (32 px items, 52 px wide) and names its groups when open; "Mon travail" is a room of its own (`vanguard/one/MyWork.tsx`), out of My day's tabs | asked on 2026-10-27 |
| `ui/Select.tsx` | an option may carry a hint on the right (`data-hint`, coloured by `data-tone`): a person's load in the pickers | the load where people are picked (2026-10-27) |
| `ui/Header.tsx` | the search finds a ticket by its key too (AUD-142), shown before its title | the tickets' keys (0012) |

`styles.css` is theirs; `vanguard.css` is generated from it by `node scripts/vanguard-css.mjs` (every rule scoped to
the `.vanguard` container, keyframes prefixed, BUMEX One's base reset undone inside it). Re-run it after a new
delivery of `styles.css`.

## The app

BUMEX Vanguard is the app (`app/(app)/layout.tsx` → `components/vanguard/vanguard-shell.tsx`, the page `/vanguard`).
BUMEX One was retired on 2026-10-25: every one of its pages was rebuilt as a room, a tab or a record's page here
(`vanguard/one/`), its old addresses lead to them (`next.config.ts`, e.g. `/tickets/<id>` → the Tasks room on that
ticket), and only its server code stays (its actions under `app/(app)/*/actions.ts`, its services in `lib/`), which the
rooms call. `/vanguard?room=…&tab=…` opens a room; a tab may name a record (`ticket:<id>`, `mission:<project>`,
`client:<id>`, `contract:<id>`, `person:<id>`). Two of BUMEX One's controls sit in Vanguard's header (the
notifications' bell, the account menu, `.bumex-page`, which Vanguard's stylesheet leaves out). The palette, surfaces
and type of the whole app are Vanguard's (`app/globals.css`). Someone without Vanguard access (removed by an
administrator) sees a "no access" page (`components/vanguard/no-access.tsx`).

Libraries: React 19 / Next 16 here, so `@react-three/fiber` 9, `@react-three/drei` 10 and `@react-three/postprocessing`
3 instead of their 8 / 9 / 2 (same APIs for what Vanguard uses: Canvas, useFrame, useThree, ContactShadows,
EffectComposer, N8AO, SMAA); `three` 0.170 and `zustand` 5 as theirs; `xlsx` 0.20.3 from SheetJS (the npm 0.18.5 has
known vulnerabilities).
