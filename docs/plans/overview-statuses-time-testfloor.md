# Plan: the floor's overview, dynamic statuses, friendly time logging, a sealed test floor

Status: **built** (2026-10-28), in one commit on top of 64ab05a (the user's instruction); not deployed. Decisions: test
mode shows only test data; no timer; board models and copy: yes. Deploy needs migrations 0009–0013 first.

Built as planned, with these choices made on the way:
- **Test mode** restricts the session's entities too (the test floor alone, or the real floors alone), so the books and
  every rule read by entity follow, not only `work.hidden`. A person's own time lines follow the mode as well.
- **Time:** a cleared cell removes its line, so 0013 also lets a person delete their own line of a week that is not
  sent (`erp.time_entry_delete_guard`). A locked week now answers "locked" instead of "unavailable".
- **New ticket:** it may start in any active stage that is not a completed one (completing stays the reporter's
  sign-off).
- **Overview figures** open the Tasks list already filtered (`quickFilters` in `vanguard/one/work-filters.ts`); the
  filter gained "Sans estimation" and "État".

Asked on 2026-10-28:
1. **Overview in flat mode:** an overview of the current floor, within what the person may see. It shows overdue
   tasks, the people and how many tasks each has, and the other key figures. Clicking a person opens their page:
   this week's hours, current tasks with their status, and what comes next (the backlog assigned to them).
2. **Dynamic statuses:** tickets have their board's own statuses, as in BUMEX One. Bring them to Vanguard everywhere.
3. **Time logging that is extremely easy:** today's flow is too complicated.
4. **BUMEX Testing must never show anywhere else.** Test data appears in My day today.

## 1. The floor's overview (flat mode)

**Today:** in flat mode, "Vue d'ensemble" just falls back to a module room (accounting, or the missions). There is no
overview at all.

**Room.** A new room, `overview`:
- Add it to `Room`, `MODULE_ONLY` and `RoomLink` (`/vanguard?room=overview`).
- In flat mode it is the landing room, and what "Vue d'ensemble" in the rail opens.
- In 3D the tower stays the overview; the room is still reachable from the rail.
- Everyone may open it. Each part shows only what the person's rights let them read: row-level security on tickets,
  missions and time; `canOpenRoom` for the money.

**Server.** `floorOverviewAction(entityId)`, new in `lib/erp/vanguard/overview-actions.ts`, read in the person's
session:
- **Tickets on the floor's missions:** counts and lists.
  - Counts: open, overdue, blocked, unassigned, unestimated, due this week, done in the last 7 days.
  - Each ticket carries its key, stage name and colour (§2), priority, assignee, due date and hours.
- **Missions:** active ones; the late or at-risk ones (deadline passed or near, overdue tickets); deadlines in the
  next 14 days.
- **Team:**
  - Who: the floor's people (`work.person.entity_code` = the floor), plus people from other floors who have tickets
    here, tagged "autre étage".
  - Per person: open tickets by state (in progress / to do / review / blocked), late tickets, the load
    (`lib/work/load.ts`), this week's hours logged against capacity, and their timesheet's status this week.
  - Hours and timesheet status show only where the database lets the viewer read them (the person, their entity's
    managers, administrators); otherwise "—".
- **Activity:** the floor's last 12 ticket and mission changes.

**Money (client side).** Treasury, overdue receivables and drafts come from the state's `floorSignals`. They show
only if the person may open those rooms, and clicking a figure opens the room.

**Screen.** New `vanguard/one/Overview.tsx`, in the style of the earlier work:
- A row of figures, each clickable: it opens the Tasks room already filtered (`late`, `blocked`, unassigned…).
- **Équipe:** a table with avatar, name, role, in progress / to do / late, load bar, "12 h / 40 h this week" and the
  week's status. Sorted by load; clicking a row opens the person.
- **En retard:** the overdue tickets (key, stage lozenge, assignee, days late).
- **Missions à surveiller** and **Échéances · 14 jours**.
- The money figures, when allowed; then **Activité récente**.
- A phone layout: one column.

**Person page.** Opened as `overview` tab `person:<id>`, so it does not need the HR module. The People tab keeps
opening the same component.

`Person.tsx` and `personViewAction` gain:
- **Cette semaine:**
  - hours per day (seven small bars), total against capacity, and the timesheet's status;
  - the missions and tickets the time went to;
  - shown when the viewer may read them, otherwise "réservé".
- **En cours:** in-progress, review and blocked tickets, with their stage lozenge, priority, hours left and due date.
- **À venir:** the backlog assigned to them (to do / backlog), most pressing first. Same order as My work.
- **Charge:** the load bar.
- What stays: profile, missions, delivery figures and history.

## 2. Dynamic statuses (each board's own stages, everywhere)

BUMEX One showed a ticket's **stage name** (in its category's colour) wherever a status appeared, and moved tickets
**through their board's stages**. Vanguard has the workflow editor (`vanguard/one/Workflow.tsx`) and the stage
control on the ticket page. Everywhere else it still uses five fixed categories.

**The places to fix:**

| Screen | File | Today |
|---|---|---|
| Task list | `Tasks.tsx` | category label |
| "All missions" board | `Board.tsx` | category columns |
| My work, status select | `MyWork.tsx` | fixed categories |
| My work, kanban | `MyWork.tsx` | fixed categories |
| Linked tickets | `Ticket.tsx` | category |
| Overview and person page (new) | — | — |

**Changes:**

1. **Reads.** Vanguard's ticket reads (`listTickets` in `lib/erp/vanguard/tickets.ts`, `myWorkAction`, the overview)
   resolve each ticket's stage on its board, server side (`getConfiguredWorkflows`, built-in stages otherwise). They
   carry `stage_name`, `stage_category` and `stage_completed`.
2. **One lozenge.** `StageLozenge` (work-ui) shows the stage name in its category colour, everywhere a status shows.
3. **One stage picker.** `StageSelect` lists the ticket's own board's stages.
   - Moves the board forbids for this person (`evaluateTransition`) are greyed, with the reason.
   - A move that needs a reason asks for it inline.
   - Workflows come from a small cache: `useBoardWorkflows(projectIds)` → `boardWorkflowsAction(ids)`.
   - Used in My work, the list (a status cell you can change in place) and the overview.
4. **"All missions" board.** The columns are the **statuses of the boards in view**, merged by name ("To merge",
   "Code review"…), ordered by category and then position, as Jira shows a project's statuses.
   - A card sits in its stage's column.
   - Dropping it on a column moves it to the stage of that name on **its own** board. If its board has no such
     stage, the move is refused with a clear message.
   - A stage archived while cards are still in it gets a dashed column, so no card is hidden.
   - My work's board view uses the same columns.
5. **Filter.** The toolbar's "Filtrer" gains **État**: the stage names in view.
6. **New ticket.** The form gets an "Étape" field with its board's stages, the default stage pre-selected (as
   BUMEX One's form had). Quick add in a column already lands in that column.
7. **Board editor, easier to reach and to start.**
   - A "Statuts et règles" button in the board toolbar when one mission is shown, and on the mission page.
   - In the editor: start from a **model** — *Standard* (À faire, En cours, En revue, Terminé), *Développement*
     (To Do, Ready to implement, Pending, In progress, Code review, Ready for test, Test, To merge, Done), *Audit*
     (Planification, Terrain, Revue, Rapport, Terminé) — or **copy another mission's board**.
   - The existing checks still apply when saving (`saveBoardWorkflowAction`).

## 3. Time logging, made simple

**Today:** to log time you open a dialog, pick a project, then type a mission label, set hours and minutes, and save.
From a ticket you are sent to another room.

**Target:** one line, or one click.

1. **"Saisie rapide"**, at the top of Ma feuille (`vanguard/one/QuickLog.tsx`, reusable). It reads as one sentence:
   **J'ai travaillé [durée] sur [quoi] [quand]** → Enregistrer, and Enter saves.
   - *Quoi:* one search box.
     - It lists my open tickets first (key and title), then my favourites, then the missions and labels I used
       recently.
     - Picking a ticket fills its mission and links the line to the ticket.
     - Free text works too; it then asks for the mission, defaulting to the last one used.
   - *Durée:* one field and chips (15 min, 30 min, 1 h, 2 h, 4 h).
     - The field reads "1h30", "1,5", "90", "90m", "1:30" and "45min".
     - Parsed by `lib/timesheet/duration.ts`, with tests.
   - *Quand:* Aujourd'hui · Hier · a date, limited to the week's open days.
   - An optional note, folded by default.
2. **The grid is typed into.**
   - Clicking a cell turns it into a field: type `2` or `1h30`, then Enter or Tab saves, and the arrows move between
     cells.
   - A cell holding several entries opens a small popover listing them.
   - The last row is "+ Ajouter une ligne": the same search as Saisie rapide, then you type the days.
   - Saves are optimistic. A refusal (locked week, more than 24 h in a day) puts the cell back and says why.
3. **Logging from anywhere.** The same Saisie rapide opens as a popover, already on the ticket:
   - the ticket page's "Enregistrer du temps";
   - the clock on each My work row;
   - the board card's menu.

   No more jump to the Time room.
4. **Calmer screen.**
   - The hero gets smaller. Saisie rapide sits right under it.
   - The rhythm and approval steps fold into one "Ma semaine" strip.
   - The week's send button carries a plain line: "Vous avez saisi 32 h sur 40 h · Envoyer la semaine".
   - On a phone, the grid becomes a list of days with their entries and a "+".

## 4. The test floor, sealed (database, so nothing can leak)

**Today:** `work.hidden(is_test)` hides test records only from people who do not have the floor. A tester (you) sees
them mixed into everything: My day, My work, the search, notifications, the team's load.

**Rule:** test data shows **only while you are on the test floor**. While you are there, the cross-floor screens (My
day, My work, notifications, search, team load) show **only** test data, under a "Mode test" banner. You are in the
test environment, and nothing real mixes in either.

**How it works:**
- **Migration `0013_test_mode.sql`:**
  - `erp.open_session(user, test_mode)`, a new overload: test mode is turned on only if the person has `test_floor`.
    The one-argument form is unchanged: test mode off.
  - `work.in_test()` reads the session's mode.
  - `work.hidden(p_test)` becomes "`p_test` differs from the session's mode" (the system session sees everything).
    Every rule built on it (0011) follows: in normal mode, test records are hidden from **everyone**, testers
    included; in test mode, real work records are hidden.
  - The books (by entity) are not concerned: the test floor's accounting stays on its floor.
- **Server:** `withErpSession` passes the mode from a cookie, `bumex-floor-mode=test`. The cookie is only a request:
  the database grants test mode only to people who have the floor.
- **Vanguard:**
  - Entering or leaving the test floor sets or clears the cookie and reloads the state.
  - A short "Passage à l'étage de test…" overlay shows meanwhile, so the screens never show the wrong data.
  - On load, test mode opens on the test floor. A test floor remembered while in normal mode falls back to the home
    floor.
- **Client-side cross-floor views:** some read the whole state (the header search over customers, invoices and
  accounts; the reports; the week view). They leave out the test entity unless you are on it.
- **Already right:** no e-mails for test records (0011); the group figures leave the floor out (`groupFigures`).

**Tests:**
- **Database:** a tester in normal mode sees no test ticket, mission, client, comment, notification or time line; in
  test mode, only test ones; someone without the floor gets no test mode even with the cookie.
- **Smoke:** a tester's My day, My work, search, notifications and People contain no test ticket in normal mode, and
  only test ones on the test floor.

## 5. Checks, then one commit

- **Unit tests:**
  - the duration parser;
  - merging stage columns across boards, and mapping a drop onto a card's own board;
  - the overview's counts;
  - the test-mode rule (where pure).
- **Database tests:** 0013, as above.
- **Smoke:**
  - the flat overview: figures, team table, clicking a person opens their page with week hours, current tasks and
    next tasks;
  - stage names shown and changed from My work and the list;
  - the "all missions" board shows the stage columns;
  - Saisie rapide logs on a ticket in one go;
  - typing in a grid cell saves;
  - the test-floor isolation.
- `npx tsc --noEmit`, ESLint, `npm run test:erp`, `npm run smoke`, plus screenshots at desktop and phone width.
- **Docs:** `db/erp/README.md` (0013), `vanguard/VENDOR.md` (rail, header, search).
- **Then one commit** on `firebase-migration` as `elhavedh`, own files only, and the full commands.
  - Deploy needs migrations **0009–0013** first, then a clean `git archive` of that commit.
  - The user runs push and deploy.

## Out of scope

- Permissions themselves are unchanged: the overview shows what each person's rights already allow.
- The 3D tower's overview is not redesigned.
- No start/stop timer (the user's choice, 2026-10-28).
