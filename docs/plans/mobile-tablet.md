# Plan: BUMEX Vanguard on phones and tablets

Status: **planned** (2026-10-30), not started. Pure front end: no migration, no server change. Each step is one commit
on `firebase-migration` and can be deployed on its own. Written to be executed step by step in a later session.
Line numbers are as of `a5bf1c1`; search for the code if they have moved.

Until now the app was built for PCs only ("we only work on PC now", 2026-10-29). This plan makes it work on phones
and tablets **without changing anything on a PC screen**.

## 0. Decisions

Defaults chosen here (the user can change any of them before execution):

| Topic | Default |
|---|---|
| Sizes | **Phone** ≤ 640 px wide, designed for 360–430 px in portrait. **Tablet** 641–1024 px (iPad portrait 768–834, landscape 1024–1194). **PC** > 1024 px: unchanged. Landscape phones: usable, not designed. |
| Touch | Detected with `(hover: none) and (pointer: coarse)`, independently of the width (an iPad Pro in landscape is 1366 px wide and has no mouse). The board's drag/no-drag switch uses `(any-pointer: coarse)` so touch laptops get the tap way too. |
| PC screens | Must not change. Every new rule sits inside a phone, tablet or touch media query. Checked with pixel diffs (step 12). |
| 3D building | **Phones and tablets: never** (Flat only), decided by the user on 2026-10-30: a screen up to 1024 px wide or a touch screen never loads the building. |
| Phone navigation | The rail is hidden. A **bottom bar**: Ma journée · Mon travail · Tâches · Temps · Plus. "Plus" opens a sheet with everything else: floors, modules, Reports, Archives, Overview, Inbox, Settings, language, fiscal year. |
| Phone home | **Ma journée** (PC keeps the floor's Overview). |
| Tablet navigation | The rail stays collapsed (52 px). When expanded it **floats over** the page instead of pushing it. |
| Back button | The phone's Back gesture, Android Back and the browser's Back **go back one screen** inside the app (today they leave it). Applied on **every size**, PC included, because leaving the app on Back is a bug there too. |
| Tier A: designed for the phone | My day, My work, Tasks (list, board, ticket page with comments), Time (my week), Inbox, Missions (list, mission page, calendar, week), Clients (relations list, client page), People, person page, Account. |
| Tier B: readable, simple edits | Overview, Reports, History, Documents, Contracts, finance archive, activity reports, every ERP panel's lists and detail views. Done mostly through the generic rules of step 5. |
| Tier C: PC editors | They scroll sideways inside their card on a phone and show a "plus confortable sur ordinateur" note (step 8). The list is in step 8. |
| Time on a phone | **One day at a time** (day chips, that day's lines, quick +15 m/+30 m/+1 h, a sticky week total). Managers' team review: cards. |
| Permissions on a phone | Tier C for now: the page must not break, but the matrix stays a PC tool. A phone redesign (list → editor, one card per entity) is listed as optional. |
| Tables | Everywhere: they **scroll sideways inside their card**, never the whole page. Tier A lists get a real phone layout (block rows or fewer columns). |
| Browser `prompt()` / `confirm()` | Kept (24 calls). They work on phones; replacing them is a later polish. |
| Install on the home screen | Yes (step 11): a web app manifest + icons, start at `/vanguard`. It also prepares the Windows app idea discussed on 2026-10-29. |
| Not doing | CSS container queries (the viewport rules are enough once the phone has no rail), an offline mode, a native app, rewriting the rich text editor. |

## Rules for whoever executes this

- **Never edit `vanguard/vanguard.css`**. It is generated from `vanguard/styles.css` by `node scripts/vanguard-css.mjs`.
  Don't edit `styles.css` for this work either.
- **All new CSS goes in a new file, `vanguard/responsive.css`**, imported **last** in
  `components/vanguard/vanguard-shell.tsx`, after `work.css`.
  - Every selector starts with `.vanguard `.
  - To override a rule of `styles.css`, copy its selector and put `.vanguard ` in front. The compiled
    `:not(:where(…))` adds no specificity and this file loads later, so the same selector wins.
  - Inline `style={{ … }}` can only be beaten with `!important`. Use it only for those cases, and say so in a comment.
  - Existing media queries in `work.css` stay where they are. Don't move or delete them, but you may change the ones
    this plan names.
- Every rule in `responsive.css` is inside `@media (max-width: 1024px)`, `@media (max-width: 640px)`,
  `@media (min-width: 641px) and (max-width: 1024px)` or `@media (hover: none) and (pointer: coarse)`. Nothing outside
  a media query.
- In React, read the screen with the hook from step 1 (`vanguard/one/screen.ts`), never `window.innerWidth`. Prefer
  CSS. Use the hook only when the markup itself must differ (bottom bar, one-day Time view, agenda instead of a grid…).
- Text: `say(fr, en)` (`vanguard/one/say.ts`) in our screens, `t()` keys (`vanguard/i18n.ts`) in the delivered UI.
- Keep and reuse the phone/touch code that exists:
  - `useMedia` in `vanguard/one/work-ui.tsx:132`;
  - the board's stage picker on touch (`Board.tsx:135, 235, 251`);
  - My work's block rows (`work.css:894–921`);
  - Time's day list (`work.css:456`);
  - Select's phone sheet (`vanguard/select.css:32`);
  - the ≤ 640/760/1100 rules in `work.css` for the ticket page, board, Missions, calendar and My work.
- Other Claude sessions may be editing the repo. Commit only your own hunks, never `git add -A`.
- After each step: `npx tsc --noEmit`, `npm run lint`, `npm run smoke`, plus the screens check once step 12a exists.
  The user pushes and deploys.

---

## 1. Foundations (nothing visible changes)

1. **Viewport.** In `app/layout.tsx`, add:
   `export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#131d33" };`
   with `import type { Metadata, Viewport } from "next"`. `viewportFit: "cover"` lets us pad for the notch with
   `env(safe-area-inset-*)`.
2. **Screen hook.** Create `vanguard/one/screen.ts` on top of `useMedia`:
   ```ts
   export const PHONE = '(max-width: 640px)';
   export const TABLET = '(min-width: 641px) and (max-width: 1024px)';
   export const TOUCH = '(hover: none) and (pointer: coarse)';
   export const isPhone = () => typeof window !== 'undefined' && window.matchMedia(PHONE).matches;
   export function useScreen() { return { phone: useMedia(PHONE), tablet: useMedia(TABLET), touch: useMedia(TOUCH) }; }
   ```
   Replace `phone()` in `vanguard/ui/Select.tsx:80` and `phoneNow()` in `vanguard/one/MyWork.tsx:35` with `isPhone`.
3. **`vanguard/responsive.css`.** Create it with a header comment that states the rules above, and import it last in
   `components/vanguard/vanguard-shell.tsx`.
4. **Tabs component.** In `vanguard/ui/common.tsx:25`, replace `style={{ display: 'flex', flexWrap: 'wrap' }}` with
   `className="tabs"`, and add `.vanguard .tabs { display: flex; flex-wrap: wrap; }` to `work.css`. The PC looks the
   same; step 5 can then target `.tabs`.

**Done when:** tsc, lint and smoke pass, and the PC screenshots are identical (step 12a).

## 2. Phones: Flat only

- In `vanguard/store.ts` (`hydrate`, about line 267), set `webgl: scene3d && webgl && !isPhone()`. Show the "no WebGL"
  toast only when not on a phone. The Canvas is then never mounted on a phone: no 3D download, no battery drain.
- The header's Tower/Flat switch is hidden on phones (step 3 hides the header's right part anyway).
- Hide 3D-only controls when `ui.view === 'flat'`:
  - Archives "Mode étagère" and "Voir sur l'étagère" (`panels/Archives.tsx:42–46, 120`);
  - on phones, the 3D quality toggles in Settings (`panels/Settings.tsx:75–77`).

## 3. Phone shell: header, bottom bar, "Plus" sheet

Files: `vanguard/ui/Header.tsx`, `vanguard/ui/Sidebar.tsx`, new `vanguard/one/PhoneNav.tsx`, `vanguard/App.tsx`,
`vanguard/ui/Rooms.tsx`, `vanguard/responsive.css`, `app/globals.css` (`.bumex-tools`).

1. **Share the rail's logic.** In `Sidebar.tsx`, move what builds the items into an exported hook `useNavItems()`:
   overview, floors, `work`, `modules`, `reports`, settings, badges, `allowed()` and the `open(item)` function. Move
   the flyout's floor list into an exported `FloorList` component. `Sidebar` uses both unchanged, so the PC is
   identical.
2. **Hide the rail on phones:** `.vanguard .rail { display: none; }`.
3. **Header on phones** (52 px + `env(safe-area-inset-top)`):
   - **Left:** a **Back arrow** when the current screen is a detail page (step 4), otherwise the emblem.
   - **Title:** the current room or page, in a new `<span className="h-title">` shown only on phones. Use the same
     label as the crumbs' last item.
   - **Search:** a magnifier button opens the existing search as a full-screen layer (input on top, results as big
     rows, a Cancel button). Do this with a class on `.header` (`search-open`), not a second search implementation.
   - **Right:** the bell and the account menu (`.bumex-tools`, unchanged; `right: 8px` on phones in `globals.css`).
   - **Hidden on phones:** crumbs, fiscal year, Tower/Flat and language. They move to "Plus".
   - **Rooms' own title bar (`.sheet-head`):**
     - hide its `h1` on phones, because the header shows the title;
     - make the tab strip one scrolling line: `.sheet-head [role=tablist]` gets `flex: 1 1 0; min-width: 0;
       flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none;`;
     - keep `.hright` at the end of the line with `flex: none`;
     - drop `.sheet > .sheet-head`'s `padding-right: 190px`.
4. **Bottom bar.** `PhoneNav` is rendered by `App.tsx` when `useScreen().phone`:
   - fixed at the bottom, 56 px + `env(safe-area-inset-bottom)`;
   - 5 buttons with an icon and a short label: Ma journée (`myday`), Mon travail (`mywork`), Tâches (`tasks`, badge =
     overdue, as in the rail), Temps (`time`), Plus;
   - the current room is highlighted;
   - on phones, `.main` gets a `padding-bottom` of the same height, and `.toast` moves above the bar.
5. **"Plus" sheet.** `PhoneMore`, in the same file, is a sheet from the bottom. It looks like Select's phone sheet
   (`.vsel-sheet`), has a max-height of 90dvh and scrolls. Sections:
   - **Étage:** `FloorList`. Choosing a floor keeps the room, as the rail does.
   - **Travail:** Overview, Inbox, Archives.
   - **Modules:** Accounting … Tax, then Reports. Use the same `allowed()` and badges; locked items say
     "accès non autorisé".
   - **Paramètres.**
   - **Préférences:** language FR/EN (the same `setLang`) and fiscal year (the same `Select` as the header).

   It closes on any choice and on a tap on the backdrop.
6. **Phone home.** In `FlatLayout` (`vanguard/ui/Rooms.tsx`), use
   `const room = ui.room ?? (phone ? 'myday' : 'overview')`. The emblem goes to `myday` on phones.

## 4. Back goes back one screen (every size)

Today nothing writes to the browser history (only `RoomLink` cleans the address), so Back leaves the app.

- **Hook.** Create `useRoomHistory()` in `vanguard/one/history.ts` and mount it once in `vanguard/App.tsx`.
- **What counts as a screen:** `entityId` + `room` + the tab **when it is a detail page**. A detail tab contains `:`:
  `ticket:…`, `mission:…`, `client:…`, `contract:…`, `person:…`, `board:…`. Switching between plain tabs is not a new
  screen.
- **On a screen change** that doesn't come from Back: `history.pushState({ vg: { entityId, room, tab } }, '')`.
  When only a plain tab changes: `history.replaceState` with the new tab, so Back returns to the tab you were on.
- **On `popstate`:**
  - if `event.state?.vg` exists, restore it: `setUi({ entityId, room, tab })` in Flat; in 3D use
    `goFloor`/`openRoom` as the rail does;
  - without it (the first entry), go to the home room;
  - set a flag so the restore itself doesn't push.
- Don't push while the test mode switches (`ui.switching`).
- The phone header's Back arrow (step 3) calls `history.back()`. It shows on detail pages and whenever there is an app
  entry to go back to.
- **Check:** Next 16 keeps its own data in history entries, and pushing with the same URL must not reload. Open
  Tâches → a ticket → `history.back()`. It must still be the same page load (a `window.__probe` set before survives),
  with room = tasks and tab = the list. If Next reloads instead, fall back to putting the screen in the address
  (`/vanguard?room=…&tab=…`, read by `RoomLink`) and tell the user.

## 5. Generic rules (every screen at once)

Most of `responsive.css`. Each item is small, but together they fix most of Tier B.

1. **Inputs at 16 px on touch**, so iOS doesn't zoom on focus. Under `(hover: none) and (pointer: coarse)`:
   `.vanguard .in, .vanguard input, .vanguard select, .vanguard textarea, .vanguard .rt-area, .vanguard .ts-cellin { font-size: 16px; }`.
   Use px: `rem` is 14 px in this app.
2. **Tap targets on touch:**
   - `.btn` min-height 40 px, `.btn.sm` 36 px, `.tab` 44 px, `.in` 40 px;
   - `.pill`, `.seg-mini` buttons, `.wk-chip` and stage pickers 36 px;
   - checkboxes and radios 20 × 20 px;
   - small "×" buttons get a 32 px hit area (padding, same look): ticket labels (`Ticket.tsx:575`), member chips
     (`Missions.tsx:166`), and journal and invoice lines.
3. **Grid spans.** Inline `gridColumn: 'span N'` inside `.grid2/3/4` make the form ragged once the grid has one
   column (≤ 900 px). There are 22 places: Assets, Bank, Hr, ERP Tasks, Suppliers, ActivityReports, Conversation,
   one/Tasks and Time. Add:
   `@media (max-width: 900px) { .vanguard :is(.grid2, .grid3, .grid4) > * { grid-column: 1 / -1 !important; } }`
   (`!important` because the spans are inline). On phones, `.grid4` (KPI tiles) becomes 2 columns instead of 1:
   `repeat(2, minmax(0, 1fr))`. The forms already get 1 column from the rule above.
4. **Tables in a plain card overflow the page.** On ≤ 1024 px, add
   `.vanguard .card:has(> table), .vanguard .card:has(> div > table) { overflow-x: auto; }`. Then check the places the
   audit found:
   - Accounting import report (`Accounting.tsx:520–528`);
   - Assets preview (`Assets.tsx:150`);
   - Bank import preview (`Bank.tsx:200`);
   - InvoiceDoc (`Clients.tsx:74`);
   - Hr payroll lines and ITS brackets (`Hr.tsx:260, 344`);
   - Suppliers entry lines and payments (`Suppliers.tsx:108, 114`);
   - Permissions "role standards" (`Permissions.tsx:140`): wrap it in `<div style={{ overflowX: 'auto' }}>`.
5. **Column classes for phones.** Add two classes: `.opt` hides a column at ≤ 640 px, and `.opt-md` hides it at
   ≤ 1024 px. Put them on the `th` and `td` of the secondary columns of Tier A/B lists (sections 6–7 say which). Sorting
   by a hidden column stays possible through the list's own sort control where one exists.
6. **Inline fixed widths on controls** (`width: 300/260/220/190/180/170/150/140/120`, about 25 places). Add
   `.vanguard .in, .vanguard .vsel { max-width: 100%; }`. At ≤ 640 px, controls inside `.toolbar` and the toolbars
   listed in section 7 take `flex: 1 1 140px; width: auto !important;`.
7. **Strips that don't wrap.** On phones, these become one line that scrolls sideways (`overflow-x: auto; flex-wrap:
   nowrap; scrollbar-width: none`):
   - `.tabs`;
   - hand-made tablists: Contracts (`Contracts.tsx:194`), Penthouse (`Other.tsx:112–113`);
   - segment controls: `.seg` in FinanceArchive (`FinanceArchive.tsx:35`), TicketActivity's 4 tabs
     (`TicketActivity.tsx:186–188`), the ticket's Attachments header (`Ticket.tsx:243`).

   When a strip is first shown, scroll the active tab into view (`scrollIntoView({ inline: 'nearest' })` in `Tabs`).
8. **Headers that never wrap.** At ≤ 640 px:
   - `.tk-sec-h` (`work.css:65`) gets `flex-wrap: wrap`;
   - the Clients relations header (`one/Clients.tsx:52`, inline flex, about 950 px wide): give it a class and
     `flex-wrap: wrap`;
   - Archives queue rows (`Archives.tsx:66–71`): wrap, and drop the forced `height: 27`;
   - Inbox rows (`Inbox.tsx:69`): the two buttons go under the text.
9. **Menus and popovers become bottom sheets on phones**, like Select. The look comes from a shared class
   `.vanguard .phone-sheet` (fixed, bottom 0, full width, top radius, `max-height: 80dvh`, overflow auto,
   safe-area padding) plus a backdrop:
   - the filter popover `.wk-pop` (`work.css:186`; today it runs off the right edge);
   - the ticket's Add and ••• menus (`Ticket.tsx:149, 161`). They close on `onMouseLeave` today: add a close on an
     outside tap (a backdrop) for every size;
   - `.tk-mentions` and `.tk-found` stay anchored, but get `max-width: calc(100vw - 24px)`.
10. **Dialogs become sheets on phones.** Applies to `.modal` (styles.css), `.ts-modal` / `.ql-modal` (work.css:358,
    443) and the InvoiceDoc overlay (`Clients.tsx:66–90`, make it `position: fixed; inset: 0`):
    - full width, aligned to the bottom, `max-height: 92dvh`, overflow auto;
    - the action row sticky at the bottom;
    - `100vh` → `100dvh` (`work.css:359`);
    - on touch, no `autoFocus` on open (QuickLog), so the keyboard doesn't cover the dialog.
11. **Information that only exists in a `title` tooltip** (about 100 `title=` in the screens; a phone never shows
    them). Two tools:
    - **visible text on touch** for data: names next to avatars, dates, hours. The sections below list them;
    - a tiny shared `InfoTip` component (an ⓘ button that toggles a small bubble) for explanations: why a button is
      disabled, what a field means.

    Don't convert all 100: only those listed in sections 6–8.
12. **Hover-only and keyboard-only.** On touch:
    - hide keyboard hints (`kbd`, `.hint`, the `Ctrl/⌘ Entrée` texts in labels: wrap them in `<span className="kbd-hint">`
      and hide that);
    - show what only appears on hover (the ticket's edit affordance: a small pencil, `Ticket.tsx:178, 212`);
    - every Esc-only close gets a visible Cancel (QuickAdd, `Board.tsx:351–356`; sub-task rename,
      `Ticket.tsx:295`, which also saves on blur).
13. **List on top, detail below.** There are 35 `.side` columns. On a phone, the detail or form that a row tap fills
    lands below a long list, so the tap seems to do nothing. Create a hook `useRevealOnPhone(ref, key)`: on phones,
    when `key` changes (the selected row), it scrolls the side card into view. Use it where a row fills `.side`:
    - Accounting chart (`Accounting.tsx`);
    - Archives detail (`Archives.tsx:97`);
    - Assets categories;
    - Bank account form (`Bank.tsx:80`);
    - Clients customers (`Clients.tsx:405`);
    - Hr employees;
    - Planning editor (`Planning.tsx:69`);
    - ERP Tasks detail (`Tasks.tsx:86`);
    - Suppliers invoice and supplier forms (`Suppliers.tsx:87`);
    - Tax codes.

    Where the side form *is* the tab's main action, it comes **first** on phones (`order: -1` with a class): Clients
    payments (`Clients.tsx:289`), Suppliers payments (`Suppliers.tsx:222`).
14. **Contact details.** Emails become `mailto:` and phone numbers `tel:` (ClientPage `:186–187`, Clients list,
    People). Add `type="tel" autoComplete="tel"` (Account `:78`), `autoComplete="name"`, and
    `inputMode="decimal"` on amounts (Contracts `:70`).
15. **Scrolling.** Add `overscroll-behavior: contain` on `.sheet-body` and `.page-main`.

## 6. Tier A screens: designed for the phone

| Screen | What to do | Size |
|---|---|---|
| **My day** (`MyDay.tsx`) | KPIs 2 × 2 (comes from 5.3). Tables: mark `.opt` on all but title + mission and due. The sign-off button cell (`:102`) wraps under the title on phones. Workload bar column (`:153`): hide the bar, keep the %. | S |
| **My work** (`MyWork.tsx`) | Mostly done (≤ 640 block rows exist). Lower-block buttons get 5.2. Show the tooltip-only facts at `:365–366, 399, 491` as text. | S |
| **Tasks: list** (`Tasks.tsx`, `TicketList.tsx`) | On phones, the default view is the **list** (`Tasks.tsx:61`, as My work does). The list uses My work's block rows at ≤ 640 (generalize `.mw .wk-list` rules from `work.css:894–921` to `.wk-list`). A sort `Select` above it replaces the header clicks. On tablets, hide labels and priority text (`.opt-md`). | M |
| **Tasks: board** (`Board.tsx`) | Keep the snap scroll (≤ 640). Above the columns on phones, add a sticky row of **stage chips with counts**: a tap scrolls to that column, and an IntersectionObserver highlights the current one. Columns `flex: 0 0 calc(100vw - 56px)` so the next one peeks in. Snap scrolling on tablets too (`(max-width: 1024px)`). Switch the touch flag to `(any-pointer: coarse)`. Show the tooltip-only facts on cards as text (due date, time left; `:247, 259, 260, 263`). Hide column folding on phones. QuickAdd gets a Cancel button. | M |
| **Tasks: new ticket** (`Tasks.tsx:186–208`) | Spans come from 5.3. Keyboard hints get `kbd-hint`. The dialog is a sheet (5.10). | S |
| **Ticket page** (`Ticket.tsx`, `TicketActivity.tsx`) | **Phones:** one column, with the main content **first**: change `work.css:161`'s `order: -1` to apply only from 641 to 1100 px; on phones the side goes last. Render a compact **status bar** at the top of the main column (stage picker + sign-off button), only on phones. Then title, next-action banner, description, sub-tasks, links, attachments, activity. The side's **Details** become a `<details>` section, closed by default, right after the status bar. **Sub-tasks** (`:292–305`): on phones the title takes a full line, with assignee/date/buttons on a second line. **Files:** `.tk-file` gets `overflow-wrap: anywhere` (`:252`). **Drop zone** (`:261`): it says "drop a file here" but has no drop handler; on touch, say "Touchez pour ajouter un fichier" (and add a real drop handler for PC if it's quick). **Mentions** list (`work.css:113`): `max-width` from 5.9. **Tablets 901–1024 px:** two columns again, with a 300 px side (`grid-template-columns: minmax(0, 1fr) 300px`). | M |
| **Rich text** (`RichText.tsx`) | Robust on phones without a rewrite: (1) keep the last selection range inside the editor (a `selectionchange` listener) and restore it before running a toolbar command, instead of relying on `onMouseDown` + `preventDefault` (`:109–111`); (2) checklist continuation through `beforeinput` with `inputType === 'insertParagraph'` as well as `keydown` Enter (`:153–156`), for Android keyboards; (3) toolbar `position: sticky; top: 0` inside the editor; (4) `max-height: 50dvh` on phones (`work.css:784`). Link stays `prompt()`. | M |
| **Time: my week** (`Time.tsx`) | **Phones: one day at a time.** Turn today's `.ts-daylist` (`:310–328`) into: a row of **day chips** (Mon–Sun with hours, today selected; reuse `.ts-strip-days` / `.seg-mini`); under it, that day's lines, **including lines with no time yet** (recently moved tickets, the grid's rows). Each line has chips **+15 m / +30 m / +1 h** (reuse RecentPanel's handler) and opens EntryEditor on tap. "Ajouter" opens QuickLog as a sheet for that day. A **sticky footer** shows the week total / capacity and the existing submit-week button. Strip hours and completion (`:231, 233`) shown as text. QuickLog's duration field: `inputMode="text"` (`:134`), because "1h30" needs letters. EntryEditor spans: 5.3. | L |
| **Time: tablets** | The 980 px grid (`work.css:333`) fits about 720 px: first column 180 px, cells min 44 px, the Total column folded into the footer, under `(max-width: 1024px)`. On touch, a tap on a cell opens a small popover with the chips and a field, instead of keyboard editing (iOS may not open the keyboard for an input that mounts with `autoFocus`). | M |
| **Time: team review** (managers) | `.ts-team` (12 columns, `:697`): on phones, one card per person (name, total / capacity, status, the actions), the actions wrapping. Filter Selects (`:663–676`, 190/170/190 px): 5.6. | M |
| **Inbox** (`Inbox.tsx`) | Buttons under the text (5.8). | S |
| **Missions: list** (`MissionList.tsx`, `Missions.tsx`) | Cards are already one per row at ≤ 760. **Hide the List view** on phones (an 860 px table, `work.css:559`) and keep cards. Show the tooltip-only facts on cards (`:219, 227–229`). Member chip × (5.2). The progress explanation becomes an `InfoTip` (`Missions.tsx:151`). | S |
| **Mission page** (`Mission.tsx`) | Same order as the ticket page: main first on phones (`:179`), Details/Alerts after it. Tickets header wraps (5.8, `:203–214`). Team avatars show names on touch (`:289`). | S |
| **Calendar** (`Calendar.tsx`) | Already has a dot month on phones. After a tap on a day, scroll the day panel into view (`useRevealOnPhone`). Pill details as text in the day panel (`:126`). | S |
| **Week** (`Week.tsx`) | **Phones: an agenda**: Mon … Sun, then "Sans échéance", stacked, with a strip of day chips to jump. **On touch (phones and tablets):** each card gets a "Déplacer…" button that opens a sheet with day chips and a date field, and calls the existing `updateTaskDueDateAction`. Fix the PC drag too: `onDragStart` must call `e.dataTransfer.setData('text/plain', id)` (`:90`), or Firefox never starts the drag. Hide the drag hint on touch (`:142`). Toolbar widths (`:110, 113`): 5.6. KPIs 2 × 2. | M |
| **Clients relations** (`one/Clients.tsx`) | Header wrap (5.8). Table: keep name + status, manager; the rest `.opt`. The row buttons (`:77–79`) wrap. | S |
| **Client page** (`ClientPage.tsx`) | 8 tabs: the scrolling strip from 5.7. KPIs 2 × 2. `mailto:`/`tel:` (5.14). History Select width (`:249`): 5.6. | S |
| **People / person** (`People.tsx`, `Person.tsx`) | People table: keep name, availability, load; the rest `.opt`. Floor Select (`:55`): 5.6. Workload label as text (`People.tsx:86`), "left/estimate" as text (`Person.tsx:38`). | S |
| **Account** (`Account.tsx`) | Autocomplete and `tel` (5.14). Photo upload already works with the iOS photo picker. | S |
| **Header menus** (BUMEX One's bell and account menu) | Bell dropdown (`components/notifications/notification-dropdown.tsx:23, 40`): cap its height with `max-h-[min(28rem,var(--radix-dropdown-menu-content-available-height))]` so it fits a landscape phone. Account menu: fine. | S |

## 7. Tier B screens: readable, simple edits

The generic rules of step 5 do most of the work. Specific items:

| Screen | What to do | Size |
|---|---|---|
| **Overview** (`Overview.tsx`) | `.ov-team` has `min-width: 760px` (`work.css:488`), so it scrolls even at 768. On ≤ 1024 px remove the min-width and mark doing/todo/late `.opt`. Keep person, load and hours. Assignee names on touch (`:173`). The "restricted" explanation becomes an `InfoTip` (`:247`). | M |
| **History** (`History.tsx`) | On phones, two-line rows: when · who, then action + detail (block rows like My work). | S |
| **Documents** (`Documents.tsx`) | The 4 action buttons in a no-wrap cell (`:124–128`): on touch, a single "⋯" button that opens a phone sheet with Download / Edit / Archive / Delete. Keep title, type and date; the rest `.opt`. | M |
| **Contracts** (`Contracts.tsx`) | Scrolling tablist (5.7). Keep title, client, status/renewal. | S |
| **Finance archive** (`FinanceArchive.tsx`) | Scrolling `.seg` (5.7). Keep number + client, TTC + status. | S |
| **Activity reports** | Spans (5.3). Nothing else. | — |
| **Reports** (`panels/Reports.tsx`) | Already fine (a grid of cards). | — |
| **ERP lists** (Accounting, Bank, Clients, Suppliers, Assets, Hr, Tax, Archives, ERP Tasks, Missions billing, Penthouse) | They already scroll inside `.card.flush`. Mark `.opt` on the secondary columns of the main lists only: **invoices** (Clients `:110`, 14 columns → keep N°/client, open amount, status); **supplier invoices** (Suppliers `:64` → supplier/ref, net, status); **bank accounts** (Bank `:57` → name, balance, reconciliation chip); **employees** (Hr `:76` → name, job, net); **assets** (Assets `:65` → designation, VNC, status); **ERP tasks** (Tasks `:55` → title, due). Row action cells with several `.btn.sm` (Clients `:121–125`, Bank `:144–150`) wrap on phones instead of staying `nowrap`. | M |
| **Accounting closing** (`Accounting.tsx:408`) | Inline `repeat(6, …)` never collapses: give it a class with `repeat(auto-fill, minmax(140px, 1fr))` at ≤ 1024 px. | S |
| **Bank forecast chart** (`Bank.tsx:215–238`) | Its labels shrink to about 5 px on a phone. Put the SVG in a scroll box with `min-width: 640px`. | S |
| **Settings deletions** (`Settings.tsx:121–125`) | The action cell (`flexWrap: 'nowrap'`, a 120 px input, 2 buttons) wraps on phones. | S |
| **Planning** (`Planning.tsx`) | The name column (220 px, `:45`) becomes **sticky** and 120 px on phones (initials + short name). Bars at least 22 px tall with the mission name inside (`:87`). Name and dates move from `title` to the editor. The "+" gets 5.2. The editor uses `useRevealOnPhone`. | M |
| **Milestones** (`Milestones.tsx`) | On phones, show the **milestone list only**, hiding the timeline (`work.css:677–678`, ≥ 820 px wide with a 300 px label column). On tablets, the label column becomes sticky and 180 px. Non-managers can tap a milestone to see its details instead of nothing (`:90`). | M |

## 8. Tier C: PC editors on a phone

On a phone these stay as they are, inside a sideways-scrolling box, with a one-line note at the top: **"Cet écran est
plus confortable sur un ordinateur ou une tablette en paysage."** It comes from a shared `<WideNote />`, shown only on
phones. The action button (Post, Save) must stay reachable: a sticky action row at the bottom where it would otherwise
be off-screen.

- **Accounting entry editor** (`Accounting.tsx:158–235`, about 950 px). Its keyboard-only actions also get visible
  buttons for every size: **F2 "Équilibrer"** and **Ctrl+D "Dupliquer la ligne"** (`:150–155`).
- **New invoice editor** (`Clients.tsx:193–250`, about 840 px).
- **Bank reconciliation** (`Bank.tsx:140–168`).
- **Loan rows and schedule editors** (`Bank.tsx:417–463`). The loan pay cell (`:316`) also wraps.
- **Tax rules matrix** (`Tax.tsx:198–206`, 42 selects).
- **Workflow editor** (`Workflow.tsx`, the stage table and the N × N transition grid).
- **Permissions** (`Permissions.tsx`): the roles table gets its wrapper (5.4) and the 22 px filter buttons get 5.2.
  On tablets the two panes wrap, which is fine. Show the option checkboxes' tooltips (`:250–258`) as helper text.

**Optional later (L each):** phone versions of the entry editor and the invoice editor (one card per line, a sticky
total + Post bar). A Permissions redesign: the list fills the screen, a tap opens the person's editor with Back; one
card per entity with a "sees this entity" switch, 2 columns of full-name module switches, "Tout / Rien / Standard du
rôle" buttons, and a visible "≠ standard" tag.

## 9. Tablets

- **Rail floats when expanded** (641–1024 px): `.vanguard .rail.open { position: absolute; top: 0; bottom: 0; left: 0;
  box-shadow: var(--shadow); }`, plus a backdrop (`.rail-back`, rendered by `Sidebar` when open on a tablet) that
  closes it. The collapsed rail keeps its 52 px.
- **Room sheet over the 3D** (`.sheet`): already 100 % wide at ≤ 900 px. At ≤ 900 px, `.sheet-tools` (Flat / Close)
  join the head's flow instead of `padding-right: 190px`.
- **3D on touch** (only for people with the 3D option):
  - one finger turns, two fingers zoom/pan (OrbitControls' default; it sets `touch-action: none` on the canvas);
  - a tap on a room shows its popover with "Ouvrir". Check that a first tap doesn't open *and* close it;
  - on touch screens, start with ambient occlusion off (`quality.ao = false` in `loadPrefs()`'s defaults when `TOUCH`
    matches). The existing auto-downgrade (`Scene.tsx:197–213`) does the rest.
- **HUD and command bar:** `.hud` panels and the command bar already have rules at ≤ 1100 / ≤ 900 px. Check them at
  820 × 1180 and 1180 × 820 and fix only what overlaps.
- Tablet items in the screen sections: ticket page two columns (6), Time grid fitted (6), board snap (6), list `.opt-md`
  (6), Overview team (7), Milestones (7).
- **Landscape tablets** (1025–1194 px) get the PC layout plus the touch rules (5.1, 5.2, 5.11, 5.12).

## 10. Pages outside the app (sign-in, invite, forgot, entity choice, no access)

None of them breaks sideways. Fixes:

- **Inputs zoom on iOS:** the `Input` class is `text-sm` = 12.25 px here (`components/ui/input.tsx:11`). Use
  `text-[16px] sm:text-sm`.
- **Login** (`app/login/page.tsx`): on phones the marketing title and 3 feature cards come first, so the form starts
  about 700 px down. Below `lg`, put the form first (`order-first lg:order-none`) and hide the feature cards. Check
  that the language switcher (`absolute top-4`, `:28`) doesn't overlap the title. Use `autoComplete="username"` on the
  email field, which password managers handle better.
- **All four pages:** `min-h-screen` → `min-h-dvh`. In select-entity, the inner `min-h-screen` inside a padded `main`
  (`entity-selection-shell` `:27, 36`) makes it always scroll about 40 px. Remove the inner one.
- **No access** (`components/vanguard/no-access.tsx`): `break-words` for long e-mails.

## 11. Install on the home screen

- `app/manifest.ts` (Next metadata route):
  - `name: "BUMEX Vanguard"`, `short_name: "BUMEX"`, `start_url: "/vanguard"`, `display: "standalone"`;
  - `background_color` and `theme_color` `#131d33`;
  - icons 192 and 512, plus a 512 `maskable` one with padding.
- Make the icons from `public/bumex-official-logo.png` with `sips` (macOS) into `public/icons/`, plus
  `app/apple-icon.png` at 180 × 180 for iPhones.
- An installed app has no browser buttons, so the Back arrow of steps 3–4 is the only way back. **Step 4 must be done
  first.**
- No service worker and no offline mode: the app needs the server anyway.

## 12. Checking it

**a. Screenshot tool and the PC "before" pictures (do this first, before step 1)**

- **Viewport.** In `scripts/smoke/lib.mjs` `browser()`, add `viewport(width, height, { mobile, touch })`:
  - `Emulation.setDeviceMetricsOverride({ width, height, deviceScaleFactor: mobile ? 3 : 1, mobile })`;
  - `Emulation.setTouchEmulationEnabled({ enabled: touch, maxTouchPoints: touch ? 5 : 0 })`;
  - then check `matchMedia('(hover: none)').matches`. If Chrome doesn't flip it, also send
    `Emulation.setEmulatedMedia({ features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] })`.
- **Screenshot.** Add `screenshot(file)` with `Page.captureScreenshot`.
- **Screens script.** Create `scripts/smoke/screens.mjs`, run with `npm run smoke -- --screens` after the normal
  checks, on the same seeded app. It opens every room through `/vanguard?room=…&tab=…`, plus one of each detail page
  (ticket, mission, client, contract, person), and saves `<tmp>/bumex-smoke/screens/<size>/<room>.png`.
- **Before pictures.** Before step 1, run it at **PC 1440 × 900** only, on the current commit, and keep the PNGs
  (`screens/before/`).
- **After each step,** diff the PC screenshots with `pngjs` (the method used for the Vanguard parity check). Any
  difference is a regression unless the step meant it.

**b. Phone and tablet checks (after step 5)**

- **Sizes:** **phone 390 × 844**, **small phone 360 × 740**, **tablet 820 × 1180**, **tablet landscape 1180 × 820**.
  Phones and tablets with touch on.
- **For each room and detail page:**
  1. no JS error;
  2. the room's scroll container doesn't scroll sideways (`scrollWidth - clientWidth <= 1` on `.page-main` /
     `.sheet-body`). Tables scroll inside their card, not the page;
  3. no visible element sticks out of the screen unless it is inside a sideways-scrolling parent;
  4. phone: the bottom bar is there and the rail is not; tablet: the rail is there;
  5. touch: no visible button under 32 px tall in the header, the bottom bar and the Tier A rooms.
- The screenshots are for a human look: send the user a few (phone My day, a ticket, Time, the "Plus" sheet).
- **Back:** the history check of step 4, automated.

**c. By hand**

Chrome DevTools device mode while building. After a deploy, the user tries it on their own phone and an iPad. Claude
doesn't drive a browser on the live app.

## Order and size

| # | Step | Size |
|---|---|---|
| 1 | 12a: screenshot tool + PC "before" pictures | M |
| 2 | 1: foundations | S |
| 3 | 2: phones Flat only | S |
| 4 | 3: phone shell (header, bottom bar, Plus) | L |
| 5 | 4: Back button | M |
| 6 | 5: generic rules | L |
| 7 | 12b: phone/tablet checks in the smoke test | M |
| 8 | 6: Tier A screens (one commit per row of the table, or per two small rows) | L × 2 |
| 9 | 7: Tier B screens | M–L |
| 10 | 8: Tier C notes and buttons | S–M |
| 11 | 9: tablets | M |
| 12 | 10: pages outside the app | S |
| 13 | 11: home-screen install | S |

S ≈ under 2 h, M ≈ half a day, L ≈ a day or more. **Roughly 10–12 working days in all.** Steps 1–6 already make the
phone usable everywhere (Tier B quality). After step 7 (12b), every later step is checked automatically.

Deploy whenever a group of steps is done (suggested: after step 6, after step 8, at the end). No database step.
