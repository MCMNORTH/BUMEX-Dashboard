# Data caching and refresh

How Vanguard keeps what it read from the server, when it reads again, and what was measured (November 2026).

## The two kinds of data

**The store's state** (`vanguard/store.ts`) holds the books, the floors, the missions and the tickets. It is read whole once, when the app opens. After that it is kept current by `sync()` (`lib/erp/vanguard/run.ts` `syncVanguard`), which sends the marks the store last saw (`{ audit, seq }`: the audit log's last row, the counter for people and mission members) and gets back one of three answers:

| Answer | When | What comes back |
|---|---|---|
| `same` | nothing moved | the marks |
| `work` | only tickets (`task`) and time lines (`time_entry`) moved | the changed tickets, every mission (their stage follows their tickets), the history's new rows. The browser merges them in (`lib/erp/vanguard/work-merge.ts`) |
| `full` | anything else moved (an entry, an invoice, a mission, a person…) | the whole state, as before |

`sync()` runs every 30 seconds while the page is visible, and after each of the person's own changes (`reload()` from `vanguard/one/Tasks.tsx`). Each answer lists the tables that moved. Rows on floors the person cannot see don't count. A floor's ticket counter (`erp.entity.ticket_seq`) is not part of the state, so it doesn't count either.

**A page's own reads** (My work, a ticket, a mission, the calendar…) go through `useCached(key, fetcher, policy)` (`vanguard/one/cache.ts`):

- **First visit:** read, then kept. **Later visits:** shown immediately. Several components asking for the same key share one request.
- **Read again** only when:
  - a table the page depends on moved (`on`, as reported by `sync()`);
  - the person's own change names it (`invalidate([...])`, for data the audit log does not see);
  - its `fresh` time ran out (it is then shown, and read again in the background);
  - ↻ is pressed.
- **Kept per person and mode only:** the cache lives in memory, is emptied when the signed-in person or the test mode changes, and sign-out reloads the page.

## Page by page (`vanguard/one/policies.ts`)

| Page | Key | Fresh | Read again when | Background |
|---|---|---|---|---|
| Overview | `overview, floor` | 5 min | tickets, time, missions, people, books | — |
| Tasks: board and list | store `tasks` + `board, floor` | — / 30 min | sync; board saved | — |
| A ticket | `ticket, id` | 30 s | tickets, time, board, its sub-tasks, comments, attachments | every 1 min while open |
| My work | `mywork` | 1 min | tickets, time, people, sub-tasks, comments, notifications | — |
| My day | `myday` | 1 min | tickets, time, people, sub-tasks, notifications, timesheets | — |
| Missions: list | store `engagements` | — | sync | — |
| A mission | `project, id` | 2 min | tickets, time, missions, people, documents, roadmap, clients | — |
| Mission form | `mission-options, floor`, `mission-details, id` | 10 / 2 min | people, missions, clients | — |
| Roadmap (shared with mission pages) | `roadmap` | 2 min | missions, tickets, milestones | — |
| Calendar | `calendar` | 2 min | tickets, missions, milestones, contracts, clients | — |
| Team, a person | `people`, `person, id` | 5 / 2 min | people, tickets, time (missions for a person) | — |
| Time: my week | `time, mine, week, test` | 5 min | time, timesheets, tickets | — |
| Time: team review | `time, team, week` | 1 min | time, timesheets, people | every 2 min |
| Time: year | `time, year, year` | 5 min | time, timesheets, people | — |
| Activity reports | `report-options`, `report-range, type` | 30 min | people, missions, clients | the report itself runs when "Générer" is pressed |
| Clients, a client | `clients, floor`, `client, id` | 5 / 2 min | customers, clients, books (contracts, tickets, missions, documents for a client) | — |
| Contracts, a contract | `contracts`, `contract, id` | 2 min | contracts, clients | — |
| Documents | `documents` | 2 min | documents | — |
| Notifications | `inbox, …filters` | 30 s | the bell's check finding new ones | the bell's 30 s check |
| Settings: account, access, mail, statuses and rules, history, archive | `account`, `permissions`, `mail`, `board-editor, floor`, `history`, `finance-archive` | 30 min / 5 min / 1 min / 30 min / 1 min / 5 min | their own saves (mail: every minute while open, the e-mails arrive) | mail: every 1 min |
| Finance rooms | store state | — | sync; the person's own changes come back with the state | — |

Moves are instant. A card dragged on a board, a stage picked in a list and a ticket moved to another day in the week view show at once (`moveOnScreen`, `patchTask`). They go back, with a message, if the server refuses or cannot be reached.

## Measured on the local copy (`npm run smoke -- --keep`), admin user, BUMEX Audit floor

Server calls were counted in the browser and SQL statements in PostgreSQL's log (`log_statement = all`). The walk was Tasks → Missions → Tasks → My work → Overview → Tasks → My day → Time → Tasks → ticket AUD-1 → My work → AUD-1 → Overview → Missions, with 1.8 s on each page.

| | Before | After |
|---|---|---|
| Walk: server calls | 11 (9 for pages, 2 background checks) | 7 (5 for pages, 2 background checks) |
| Walk: repeat visits that read again | 3 | 0 |
| Walk: SQL statements / transactions | 438 / 78 | 256 / 46 |
| A ticket's priority changed: calls | 3 (save 10 KB, ticket 6 KB, whole state 37 KB) | 3 (save 85 B, sync 3.6 KB, ticket 6 KB) |
| … SQL statements / transactions | 228 / 35 | 178 / 32 |
| A stage picked: calls | save + whole state | save 85 B + sync 3.6 KB |
| First load | 178 statements | 178 statements (unchanged: the first read is needed) |

The local database is small. On production, the whole state (every journal entry, plus a check of every ledger chain) is much larger than here, so avoiding it after each ticket change saves more there.

The saves are smaller because 55 `revalidatePath()` calls were removed from the server actions. They pointed at the retired BUMEX One pages, and each one made Next.js re-render the current page into the action's answer.

## Not done, worth doing next

- **Sign-in checks:** each server action still checks the person's sign-in and access in transactions of its own: about 5 of the 7 transactions an action opens. React's `cache()` does not share them inside server actions. A per-request memo would roughly halve the database work of every call.
- **Two background checks:** the bell's 30-second check and the store's sync are two calls. One combined call would halve the background traffic.
- **Journal entries:** the whole state carries every journal entry, because the finance engine runs in the browser. Paging them would need the engine to work on part of the books.
