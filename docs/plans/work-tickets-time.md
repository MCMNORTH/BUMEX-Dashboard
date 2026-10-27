# Plan: tickets like Jira, "My work" that shows everything, the timesheet as BUMEX One had it

Status: **plan, awaiting confirmation** (2026-10-27). Nothing below is built yet.
Working tree before starting: the header/profile-menu change (8 files, not committed) is still pending; commit it
first, on its own, when the user approves.

## 0. Decisions

From the user (2026-10-27):

- Estimates stay **in hours**. The day-based idea and the Monday-meeting process are dropped.
- The **timesheet stays**, but its screen must be rebuilt the way BUMEX One had it, which was better.
- **Load = hours vs weekly capacity, weighted by priority**, over the person's tasks.
- A task **without an estimate** is allowed and **counts 0**, but it is flagged.
- Tickets get **keys per floor**, for example `AUD-142`.
- In the sidebar, the work entries go **together**: My day, My work, Tasks, Time and Archives. The sidebar is also
  **compacted**.
- The ticket page, comments, history, board and cards follow the **Jira screenshots**.

Defaults chosen here (the user can change any of them before execution):

| Topic | Default |
|---|---|
| Priority weights | urgent ×1.5, high ×1.25, medium ×1, low ×0.75 |
| Which tasks count this week | open tasks due by Sunday, or overdue, or in progress without a due date |
| Hours counted per task | remaining = estimate − time logged on the ticket (never below 0) |
| Tasks not counted | stages in "review", "done" or "archived" (they wait for the reporter, not the assignee) |
| Load levels (% of capacity) | under 50 % light · 50–85 % balanced · 85–110 % high · over 110 % overloaded |
| Extra flag | "under pressure" when there are 2 or more overdue tasks |
| Ticket prefixes | HOLD, SA, AUD, ADV, MAU, AVO, IT, MAR, TEST (the floor codes of `lib/erp/vanguard/floors.ts`) |
| Moving a ticket to another floor | it gets that floor's next number; the old key stays in its history |
| "Mon travail" | its own room and sidebar entry, out of My day's tabs |

## 1. Sidebar: regrouped and compact

Files: `vanguard/ui/Sidebar.tsx` and `vanguard/styles.css`, then regenerate `vanguard/vanguard.css` with
`node scripts/vanguard-css.mjs`. Never edit `vanguard.css` by hand.

**Groups, from top to bottom:**
1. Overview, then Floors (the floor picker).
2. **Travail:** Ma journée, Mon travail (new), Tâches, Temps, Archives.
3. **Modules:** Accounting … Tax, then Reports.
4. At the bottom: Settings and expand/collapse.

The `.mini` text block (floor, name, role) goes; the profile menu already shows it. When the rail is expanded, each
group shows a small uppercase heading ("TRAVAIL", "MODULES").

**Compact sizes:**

| Element | Now | New |
|---|---|---|
| Item height | 40 px | 32 px |
| Icon | 21 px | 18 px |
| Group padding | 4 / 10 px | 2 / 8 px |
| Separator margin | 6 / 10 px | 4 / 6 px |
| Collapsed rail width | 60 px | 52 px |
| Badge | — | 14 px |

The rail scrolls on its own (`overflow-y: auto`, thin or hidden scrollbar) if it ever overflows. The target is that
the whole rail fits at 1440×800 with no scroll.

**New room "mywork":**
- Add it to `Room` (`vanguard/i18n.ts`), `MODULE_ONLY` and `RoomLink`, the way "myday" is.
- `/vanguard?room=mywork` opens it.
- My day keeps "Aujourd'hui" only; its "Mon travail" tab redirects to the new room.
- The profile menu (`components/layout/account-menu.tsx`) gets a "Mon travail" item.
- Note the change in `vanguard/VENDOR.md`.

## 2. Data: migration `db/erp/migrations/0012_tickets.sql`

The migration is additive. Its security-definer helpers are owned by `work_reader`, as in 0008/0011, and the ownership
loop and revokes at its end are repeated. Every new rule respects the test floor (`work.hidden(...)`).

1. **Ticket keys.**
   - `erp.entity.ticket_prefix` (text, unique, filled from the codes above) and `erp.entity.ticket_seq` (int, default 0).
   - `erp.task.number` (int), backfilled with `row_number() over (partition by entity_id order by created_at, id)`.
     Each `ticket_seq` is then set to its floor's max.
   - Unique index on `(entity_id, number)`.
   - A `before insert or update of entity_id` trigger, `erp.task_number()`, takes the next number. It is a
     security-definer `update … returning`, which locks the row.
   - The key is `prefix || '-' || number`. `work.task_key(uuid)` returns it.
2. **Labels.** `erp.task.labels text[] not null default '{}'`.
   - At most 10 labels, each 1–40 characters, trimmed.
   - GIN index.
3. **Time on a ticket.**
   - `erp.time_entry.task_id uuid references erp.task(id) on delete set null`, with an index.
   - A guard: the ticket must belong to the entry's mission, and a test-floor ticket can only take test time.
   - `work.task_logged_minutes(uuid)`, security definer, returns the total that everyone reading the ticket sees, as in
     Jira.
4. **Linked tickets.** A new table `work.task_link`:
   - columns: `id`, `from_task`, `to_task`, `kind` (`relates`, `blocks`, `duplicates` or `action_item`),
     `created_by`, `created_at`;
   - `unique(from_task, to_task, kind)` and `check(from_task <> to_task)`;
   - row-level security: read when the person can read `from_task`; add or remove when they can edit it;
   - a guard: no link between a test and a real ticket.
   - On screen, a link shows from both sides: "bloque / est bloqué par", "a pour action / est l'action de".
5. **History trigger** `work.task_history()`, `after update` on `erp.task`.
   - It writes one `work.activity` row per changed field, with metadata `{kind, field, from, to}`, the actor
     `erp.actor_id()` and the floor's code.
   - Fields: title, description (`notes`, logged without its text), assignee, reporter, priority, type, estimate, due
     date, labels and mission.
   - The stage and status are left to the application's `logStageChange`, which knows the stage names and the reason.
   - `after insert/delete` triggers on `work.task_link` and on `work.subtask` (insert, done/undone, delete) log too.
   - The per-field `logActivity` calls in `lib/tickets/service.ts` `updateTicket` are then **removed** (no
     duplicates). The planning action's due-date change (`app/(app)/planning/actions.ts`), which logs nothing today, is
     covered too.
6. **Attachments by the people working on a ticket.** `work.can_manage_document('task', …)` also lets the ticket's
   assignee and reporter add and remove attachments. Today only the mission's managers can.

**Tests** in `db/erp/test/work.test.mjs`:
- the backfill gives unique numbers in creation order;
- a new ticket takes the next number;
- a move to another floor renumbers it;
- every tracked field writes one history row, and stage changes write none from the trigger;
- links: rules, the test/real guard, the inverse reading;
- the logged-minutes total, and the time-entry guard (mission mismatch, test floor);
- the assignee may attach a document; another employee may not.

## 3. Load (one computation, used everywhere)

New `lib/work/load.ts`, pure, with unit tests in `lib/work/test/load.test.ts`.

```
loadOf(tasks, { capacityHours, today }) → {
  weekHours,        // weighted remaining hours counted this week
  rawWeekHours,     // the same, unweighted
  openHours,        // remaining hours of every open task (any date)
  percent, level,   // weekHours ÷ capacityHours; light | balanced | high | overloaded
  byPriority,       // weighted hours per priority (for the stacked bar)
  count, overdue, unestimated, pressure
}
```

A task's remaining hours are `max(0, estimate − logged)`. The rules are those of §0.

**Server side:** `getTeamWorkload` (`lib/team/service.ts`) uses it instead of its current mix of "6 h per task" and
estimates. `TeamWorkloadRecord` gains `load`, and `utilization_percentage`, `workload_level` and `workload_risk` are
derived from it, so the People list, the Person page and My day's team table follow.

Every ticket read (`TICKET_SQL` in `lib/tickets/service.ts`, `listTickets` in `lib/erp/vanguard/tickets.ts`) gains:
- `number` and `key`;
- `labels`;
- `logged_minutes` (from `work.task_logged_minutes`);
- `estimated_hours`, which Vanguard's `TaskTicket` carries too.

The ticket's manual "Temps réel (h)" field disappears from the forms; the time spent comes from the logged time. The
`actual_hours` column stays, unused, so the change remains additive.

## 4. The ticket page, like Jira (`vanguard/one/Ticket.tsx`, rewritten)

Layout: two columns, the main one on the left and a details panel on the right (about 340 px). On a phone they stack.

**Header.**
- Breadcrumb: Floor › mission code › **KEY**.
- The title, editable in place.
- A "+" menu: sub-task, link, attachment.
- A "…" menu: copy the key or the link, move to another mission, archive, delete.

**Main column, in this order:**
1. **Description.**
   - Light Markdown, rendered by a small in-house renderer `vanguard/one/markdown.tsx`: headings, lists, check boxes,
     bold, italic, code and links. It builds React elements, never raw HTML.
   - Clicking the text edits it in place; "Enregistrer / Annuler" save or drop the edit.
2. **Pièces jointes.**
   - The ticket's documents (`work.document`, `related_type 'task'`): name, date added and size, newest first, with a
     "…" menu per file (download, delete).
   - "+" uploads through the existing document action, filtered "Tout / Images / Documents".
3. **Sous-tâches.** The current checklist, restyled: rows with check, title, owner avatar and due date; a progress bar.
4. **Tickets associés.** Grouped by relation ("bloque", "est bloqué par", "concerne", "a pour action"…). Each row shows
   type icon, key, title, status lozenge, assignee avatar and priority icon. "+" opens a picker that searches tickets
   by key or title.
5. **Activité**, with tabs **Tout / Commentaires / Historique / Journal du travail** and a sort toggle (newest
   first by default).
   - Each entry: avatar, **name** + verb ("a modifié l'état", "a mis à jour l'Estimation"), a relative time ("il y a
     4 mois", full date on hover), then the change as `from → to` lozenges for states, or plain values.
   - "Tout" interleaves comments, history and worklog entries, with a small type tag, as in the screenshot.
   - **Commentaires.**
     - The composer has the person's avatar and "Ajouter un commentaire…", and expands on focus.
     - Typing `@` opens a person suggestion list; the inserted mention uses the existing `@Full Name` format, so
       notifications are unchanged.
     - The "interne" toggle stays.
     - Edit and delete show as links under the person's own comments.
   - **Historique.** It reads `work.activity` through a new `lib/activity/ticket-history.ts`, which turns each row into
     a sentence and values: stage names, people's names, priorities with their icons, hours as "4 h → 6 h", dates and
     labels.
   - **Journal du travail.** The time entries linked to the ticket: who, day, duration, note. "Enregistrer du temps"
     opens the entry dialog of §7, already on this ticket.

**Details panel (right):**
- **Status button**: a lozenge coloured by category (grey to do, blue in progress, purple review, red blocked, green
  done) with a "▾".
  - Its menu lists the stages the board allows (`evaluateTransition`).
  - When the board requires a reason, a field asks for it.
  - The reporter's **Valider** button stays next to it when the ticket waits for sign-off.
- A **"Détails"** card, every field editable in place where the person has the right (rules unchanged: employees
  update their own tickets; only managers change assignee, reporter or mission):
  - Assigné: avatar, name and "M'assigner"; the picker shows each person's load (§8).
  - Rapporteur.
  - Priorité: icon and label.
  - Estimation: hours, quick choices 1 h / 2 h / 4 h / 8 h / 16 h or any value.
  - Temps passé and Restant, with a bar.
  - Échéance: red when late.
  - Type, Étiquettes (chips with suggestions from the floor), Mission (link), Client.
- The "next action" banner of today is kept as a compact line on top of the panel.
- Footer: "Création il y a …" and "Mis à jour il y a …".

**Server.**
- `ticketViewAction` returns: key, labels, logged minutes, links, attachments, worklog, a richer history, and each
  person's load for the pickers.
- New field-level action `updateTicketFieldAction(id, field, value)` in `app/(app)/tickets/actions.ts`. It reuses
  `updateTicket`'s checks and notifications, so a single field changes without resending the whole form.
- Link actions: `addTicketLinkAction` and `removeTicketLinkAction`.
- The old "Modifier" form goes.

## 5. Board and list (`vanguard/one/Board.tsx`, `vanguard/one/Tasks.tsx`)

**Tasks room tabs:** **Tableau** (default), **Liste**, Échues, Terminées. The current "open / mine / overdue / done /
all" tabs become filters.

**Toolbar, shared by the board and the list:**
- Search: title, key, label.
- People: avatar stack, click to filter, "+N".
- **Filtrer** popover: priority, type, label, due (late / this week / none), "Mes tickets".
- **Effacer les filtres**.
- **Grouper**: none / assignee / priority / mission.
- The filters are remembered per floor in localStorage.

**Board scope:**
- One mission, which uses its own workflow, as today.
- Or **"Toutes les missions de l'étage"**, which uses the categories: To do, In progress, Review, Blocked, Done.

**Columns:**
- Header: name, count and the column's estimate hours ("Pending 2 · 6 h").
- A column can be collapsed.
- Quick add "+" at the bottom of every column except the completed one: a title, Enter creates the ticket in that
  stage, reported by me and unassigned.

**Cards:**
- Title, clamped to 3 lines.
- Labels as chips.
- Mission chip when all missions are shown.
- Type icon and **key**.
- Estimate badge "4 h", with the remaining time when time has been logged.
- Due badge, red when late.
- Priority icon and assignee avatar.
- Sub-task progress "2/5".

Drag and drop stays native (no `useSortable`: measured too slow, see memory). Clicking a card opens the ticket page.
"Retour" brings back the board as it was (filters and scroll).

**List:** a table with key, type, title, status lozenge, priority, assignee, estimate, logged time, due date and
labels. Columns sort; the list groups like the board.

**Engine side:** `TaskTicket` (`lib/erp/vanguard/tickets.ts`) carries `key`, `labels`, `estimated_hours` and
`logged_minutes` for the board, the list and the Week view.

## 6. "Mon travail": everything I have to do (`vanguard/one/MyWork.tsx`, now a room)

Data comes from `myWorkAction` (`lib/erp/vanguard/myday-actions.ts`), extended. It covers every floor, not only the
current one.

1. **Header.**
   - My load this week: a bar stacked by priority, weighted hours / capacity, the level, and flags (late, to
     estimate).
   - My time logged this week / capacity, with the timesheet status and "Saisir mon temps".
2. **À faire.**
   - Every open ticket assigned to me.
   - Order: blocked, then overdue, then priority, then due date.
   - Columns: key, type, title, mission, status lozenge (changes the stage, with the board's rules), priority,
     remaining / estimate, due date.
   - Per row: "Enregistrer du temps" and open.
   - A list / board toggle keeps today's kanban as the second view.
3. **À valider.** Tickets I reported that wait for my sign-off, each with a **Valider** button.
4. **Mes sous-tâches** in other people's tickets, which I can tick.
5. **Mentions et commentaires.** Unread notifications that mention me or comment on my tickets, with a link to the
   comment.
6. **Signalés par moi.** Open tickets I reported, assigned to others: who, stage, due date.
7. **For managers:** on the missions I lead, the tickets that are unassigned, unestimated or late.

Every section has a count and an empty state, and the whole page reloads with the state (`loadedAt`).

## 7. The timesheet, rebuilt as BUMEX One had it (`vanguard/one/Time.tsx`)

The reference is the old screens, kept in git:
- `git show 0f1cc2d^:components/timesheet/timesheet-view.tsx`
- `git show 0f1cc2d^:components/timesheet/admin-timesheet-overview.tsx`

They are rebuilt in Vanguard's styles with the same layout and wording. The server actions stay
(`app/(app)/timesheet/actions.ts`, `lib/erp/vanguard/time-actions.ts`).

**"Ma feuille", from top to bottom:**
- **Hero.**
  - "Mon rythme · cette semaine" and the title "Feuille de temps".
  - A progress ring with the % of capacity, and the total "x h sur 40 h de capacité".
  - The status pill: Envoyée, Validée or À corriger.
  - **Ajouter une mission**.
- **Week bar.**
  - Previous / next arrows, the week's title ("27 oct. – 2 nov. 2026"), "Cette semaine", and a date field "Aller à
    la semaine du".
  - **Envoyer / Renvoyer la semaine** and **Reprendre la semaine précédente** (only on an empty week).
- The returned-week banner with the reviewer's note.
- **Three cards:** Temps déclaré, Missions actives, Jours renseignés.
- **Suivi de ma feuille:** the approval steps as cards.
- **Rythme de la semaine:** one bar per day.
- **Missions favorites:** chips that start an entry in one click.
- **The grid.**
  - Rows: mission / task, with a colour stripe and the ticket key when the line is a ticket.
  - Cells: one per day, large; "+" when empty, the duration when filled, "n saisies" when there are several.
  - Then Total and Jours columns, and a "Total par jour" footer.
  - Empty state: "Votre semaine est prête".
- **The entry dialog.**
  - Project.
  - Mission / task, with suggestions from **my open tickets on that project**. Picking a ticket sets `task_id`, so the
    time counts on the ticket (§2.3).
  - Day, hours and minutes, note, and the favourite star.
  - The day's existing entries, each one editable or deletable.
- **Dialogs** to copy the previous week and to confirm sending, as in BUMEX One.

**"Mon équipe" / "Toute l'entreprise":**
- Cards: Profils, Actifs, À valider, Déclaré.
- Search; entity filter; status filter (À valider, Validées, À corriger, Brouillons, Incomplètes).
- Sort: priorité de contrôle, A–Z, temps décroissant or croissant.
- **Exporter** (CSV).
- A table per person: role, entity, status, total against capacity, approve / return.

The test floor keeps its banner and its rules: no sending, no team tab. The `log:` deep link from a ticket opens the
dialog on that ticket.

## 8. Load wherever someone is picked or reviewed

- **Assignee pickers** (ticket page, quick create, board quick add, sub-task owner): each option shows "Mariem Sow ·
  24 h / 40 h", coloured by level. This uses `Select`'s option hint; if `Select` has no hint slot yet, add one there,
  in one place.
- **People list and Person page:** a weighted load bar, the open hours, the count, late tasks and tasks to estimate.
  These replace the "Occupation" figure.
- **My day:** the team table shows the same bar (weighted hours / capacity) and the level.
- **Missions › Semaine** (`vanguard/one/Week.tsx`): the per-person load becomes hours against capacity, not a count.
- **Mission page:** "Estimé x h · Saisi y h · Budget z h".

## 9. Checks

- **Unit tests:**
  - `lib/work/load.ts`: weights, the week rule, remaining time, levels, no estimate;
  - the key format;
  - the Markdown renderer: no HTML gets through;
  - the history sentences.
- **Database tests:** the list in §2.
- **Smoke** (`scripts/smoke/checks.mjs`):
  - the rail has its groups and fits at 1440×800 without scrolling; "Mon travail" opens;
  - a ticket page shows its key, details, the activity tabs and attachments;
  - an estimate edited in place adds a history row;
  - a link added shows on both tickets;
  - time logged from a ticket shows in the worklog, in "Temps passé" and in the timesheet grid;
  - the board's search, avatar filter and "toutes les missions" work;
  - My work lists a ticket, a sign-off and a sub-task;
  - the Time room shows its hero, grid and dialogs, and the team tab exports.
- Then `npx tsc --noEmit`, ESLint, `npm run test:erp` and `npm run smoke`, plus screenshots of each screen at desktop
  and phone width.

## 10. Order of work, commits, deploy

Each step ends green (tsc, lint, tests). Each commit is asked for first (AskUserQuestion), as `elhavedh`, own hunks
only.

| # | Step | Commit |
|---|---|---|
| 0 | Commit the pending header/profile-menu change on its own | 1 |
| 1 | Migration 0012 + database tests | 2 |
| 2 | Load library + team workload + ticket reads (keys, labels, logged time) | 3 |
| 3 | Sidebar regroup and compaction + the "mywork" room shell | 4 |
| 4 | Ticket page | 5 |
| 5 | Board and list | 6 |
| 6 | My work | 7 |
| 7 | Timesheet rebuild + time on tickets | 8 |
| 8 | Load in pickers, People, Person, My day, Week, Mission | 9 |
| 9 | Docs: `db/erp/README.md`, `vanguard/VENDOR.md`; full smoke and screenshots | with 9 |

**Deploy:** run migration **0012 on `bumex_erp` first** (proxy plus `npm run erp:migrate`, as for 0009–0011). Then
push and deploy from a clean `git archive`. Give the user the full commands; they run push and deploy.

## Out of scope (say so if any of it is wanted)

- Jira's sprints, epics as a separate type, story points and components. Here the mission plays the epic's role.
- The "Développement" panel (branches, commits). Only the GitHub issue link stays.
- Images pasted into the description or comments; attachments cover files.
- Real-time co-editing; the page reloads after each change, as today.
