# BUMEX Vanguard

The internal ERP and work platform for the BUMEX group. Vanguard combines accounting, clients, missions, tickets, time tracking, people, documents, and reporting, with access controlled by role, entity, and module. The interface is available in French and English.

This repository is the current Next.js application. BUMEX One's former pages were rebuilt inside Vanguard; their old URLs redirect to rooms or records under `/vanguard`. The npm package retains its historical name, `bumex-it-dashboard`.

## Features

- **Daily work:** personal overview, My Work, mission boards and lists, tickets with keys, subtasks, comments, attachments, history, and time logs.
- **E-mails to tickets:** each person can connect their Outlook inbox; Claude turns new e-mails that ask for work into tickets assigned to them, with their attachments, and replies in the same thread into comments.
- **Missions and teams:** clients, contracts, milestones, calendars, planning, workload, and weekly timesheets with manager review.
- **ERP:** accounting, sales, purchases, banking, loans, fixed assets, tax, payroll, reports, and physical archives. Earlier BUMEX One finance records remain available as a read-only archive.
- **Administration:** invitations, password recovery, roles, entity and module permissions, notifications, and audit history.
- **Navigation:** flat pages by default; an optional 3D office building represents entities as floors and modules as rooms. Phones and tablets use the flat interface, with responsive navigation and home-screen installation support.
- **Interface:** Fluent 2 (as in Microsoft 365 and Dynamics 365) with the BUMEX navy as the brand colour, 2 px corners and compact controls, in light and dark themes; each person picks light, dark, or their system's theme (Settings, the account menu, or the title bar).
- **Test floor:** a separately granted testing entity. Entering it switches the database session into test mode; real and test records stay apart, and test activity does not send email.

## Stack and architecture

| Layer | Implementation |
| --- | --- |
| Application | Next.js 16 App Router, React 19, TypeScript |
| Interface | Tailwind CSS 4, Vanguard CSS, Zustand, Radix UI, dnd-kit |
| Optional 3D view | Three.js, React Three Fiber, Drei, postprocessing |
| Authentication | Firebase Auth, verified server-side through an HTTP-only session cookie |
| Business data | PostgreSQL, using the `erp` and `work` schemas |
| File storage | Firebase Storage; document metadata lives in PostgreSQL |
| Email | Resend, Microsoft Graph, or SMTP through Nodemailer; inboxes read through Microsoft Graph (delegated `Mail.Read`) |
| AI | Claude through the Anthropic API (`@anthropic-ai/sdk`), for e-mails to tickets |
| Documents and exports | pdf-lib, SheetJS, CSV exports |
| Hosting configuration | Firebase App Hosting and Google Cloud SQL |
| Tests | Vitest, PGlite database tests, isolated browser smoke tests |

The browser's Zustand store loads the signed-in person's state from the server. ERP edits record domain-engine commands; server actions replay them against current database state, persist the changes, and return the authoritative result. Work features such as tickets and timesheets use their own server actions and services. The interface checks for changes every 30 seconds while visible and when returning to the page. Browser storage holds display preferences, not business data.

Database access goes through `lib/erp/db.ts`. Each transaction switches to `erp_app` and opens a session for its actor, so PostgreSQL row-level security and database guards apply. Module permissions also constrain the state sent to the browser and commands replayed on the server. Access management is reserved for administrators with the `manages_access` flag.

Supabase is no longer the application's backend. Firestore is also no longer read for business data; its former database remains part of the migration history. See [the database guide](db/erp/README.md) and [the Vanguard integration notes](vanguard/VENDOR.md) for details.

## Repository map

| Path | Purpose |
| --- | --- |
| `app/` | Routes, authentication pages, server actions, and API handlers |
| `components/vanguard/` | Next.js shell, client loading, and Vanguard initialization |
| `vanguard/one/` | Integrated work screens: missions, tickets, time, people, clients, permissions, and more |
| `vanguard/ui/`, `vanguard/three/` | ERP panels, shared controls, and the optional 3D building |
| `vanguard/store.ts` | Client state, navigation, queued ERP changes, and refresh logic |
| `lib/erp/engine/` | TypeScript domain engine for accounting and ERP modules |
| `lib/erp/vanguard/` | State loading, command recording/replay, persistence, and room-specific actions |
| `lib/work/`, other `lib/*/service.ts` files | Shared PostgreSQL helpers and work-feature services |
| `lib/firebase/` | Firebase Auth and Storage integration |
| `lib/mail/` | E-mails to tickets: Outlook sign-in and inbox reads (Graph), the free rules, Claude's step, the cron's pipeline |
| `db/erp/migrations/` | Ordered PostgreSQL migrations, currently `0001`–`0017` |
| `db/erp/test/`, `lib/**/test/`, `vanguard/**/test/` | Database guarantees, domain, integration, and UI-helper tests |
| `scripts/smoke/` | Isolated end-to-end checks and desktop/tablet/phone screenshots |
| `messages/`, `lib/i18n/`, `vanguard/i18n.ts` | French and English translations |
| `docs/plans/` | Feature plans and design decisions; check current code for subsequent changes |
| `supabase/` | Historical SQL from the former backend; not the current migration path |

The sibling `bumex-erp` workspace and `BUMEX VANGUARD.html`, when present, are the earlier standalone prototype. This application contains its adapted engine and interface and does not need that workspace to run.

## Local setup

Run commands from this repository's root (`BUMEX-Dashboard`). Use a recent Node.js 22+ release, npm, and PostgreSQL; PostgreSQL 17 is the documented local setup. Firebase Auth and Storage must also be configured. For an isolated seeded environment, use the smoke workflow below.

1. Install dependencies and create local configuration:

   ```bash
   npm ci
   cp .env.example .env.local
   ```

   On PowerShell, use `Copy-Item .env.example .env.local` for the copy step.

2. Fill in the Firebase credentials, database URL, and administrator email described below. Set `APP_URL`, `NEXT_PUBLIC_APP_URL`, and `NEXT_PUBLIC_SITE_URL` to `http://localhost:3000` so generated links point to the local app.

3. Start PostgreSQL and create the database. For a Homebrew PostgreSQL 17 installation:

   ```bash
   brew services start postgresql@17
   createdb bumex_erp
   ```

   Set `ERP_DATABASE_URL` in `.env.local` to your connection string, for example `postgres://localhost:5432/bumex_erp`. Run migrations with a database account allowed to create roles and schemas:

   ```bash
   npm run erp:migrate
   npm run dev
   ```

4. Open `http://localhost:3000`. Sign-in accepts `@bumex.mr` and `@bumex.ma` accounts. For a fresh environment, provision the initial Firebase email/password account with its email verified and set `BUMEX_SUPER_ADMIN_EMAIL` to that address. After sign-in and entity selection, the application provisions its initial administrator access.

5. Bootstrap permission management separately on a fresh database: a database administrator must grant `manages_access = true` to the intended administrator's `erp.user_access` row. The super-admin environment variable does not grant this flag. [Migration 0009](db/erp/migrations/0009_permissions.sql) only seeds it for a specific existing person, so it does not create a role modifier on an empty installation. Once granted, Settings → Permissions can manage access and invite subsequent users.

Self-signup is disabled in the example and hosting configuration. PostgreSQL is required for the unified application: leaving both database connection options unset produces a database-unavailable screen rather than a standalone demo.

## Configuration

Use [.env.example](.env.example) as the starting template. Its `FIREBASE_DATABASE_ID` setting is historical, and its comment about hiding the ERP when no database is configured predates the unified application.

| Variables | Purpose |
| --- | --- |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_API_KEY` | Required server-side Firebase configuration; escaped `\n` in the private key is supported |
| `FIREBASE_STORAGE_BUCKET` | Document bucket; defaults to `<project-id>.firebasestorage.app` |
| `ERP_DATABASE_URL` | Direct PostgreSQL connection, used locally or through the Cloud SQL proxy; required by the migration script |
| `ERP_CLOUDSQL_INSTANCE`, `ERP_DATABASE_USER`, `ERP_DATABASE_PASSWORD`, `ERP_DATABASE_NAME` | Alternative runtime connection through Google's Cloud SQL connector; `ERP_DATABASE_URL` takes precedence |
| `APP_URL` | Base URL for generated links; `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_SITE_URL` are fallbacks |
| `BUMEX_SUPER_ADMIN_EMAIL` | Initial super-administrator identity; set explicitly for each environment |
| `NEXT_PUBLIC_ENABLE_SELF_SIGNUP`, `ENABLE_SELF_SIGNUP` | Signup UI and server controls; both are `0` in the supplied configuration |
| `ENABLE_ENTITY_SCOPING` | Compatibility flag for BUMEX One entity navigation; PostgreSQL access rules still apply |
| `ENABLE_LOCAL_PREVIEW_AUTH` | Development-only preview authentication; keep `0` for normal use; it does not replace the database |
| `CRON_SECRET` | Bearer secret protecting `/api/cron/notifications` and `/api/cron/mail` |
| `MAIL_INTAKE_ENABLED`, `OUTLOOK_TENANT_ID`, `OUTLOOK_CLIENT_ID`, `OUTLOOK_CLIENT_SECRET`, `MAIL_TOKEN_KEY`, `ANTHROPIC_API_KEY`, `MAIL_AI_MODEL` | E-mails to tickets (below); `MAIL_TOKEN_KEY` is 32 random bytes in base64; `MAIL_AI_MODEL` defaults to `claude-haiku-5-5` |
| `BUMEX_BILLING_*` | Company, contact, tax, bank, and footer metadata for the legacy invoice PDF service; fields are listed in `.env.example` |

### Email and scheduled notifications

Application email uses the first configured provider in this order:

1. **Resend:** `RESEND_API_KEY` and `NOTIFICATION_EMAIL_FROM`, using a verified sender domain.
2. **Microsoft Graph:** `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, and `NOTIFICATION_EMAIL_SENDER_EMAIL`.
3. **SMTP:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and sender configuration (`NOTIFICATION_EMAIL_FROM` for application mail; `SMTP_FROM` for direct SMTP callers).

The notification outbox and timesheet reminder logic live in PostgreSQL. A scheduler calls `GET /api/cron/notifications` with `Authorization: Bearer <CRON_SECRET>` to queue eligible reminders and dispatch pending emails. The retained `vercel.json` defines a daily 09:00 UTC schedule for Vercel. The Firebase App Hosting configuration does not define a scheduler; configure one separately for that deployment.

### E-mails to tickets

Each person connects their own Outlook inbox from Settings → My account. Vanguard then reads only the Inbox, only mail received after connecting, and never sends, moves or deletes anything. Every 2 minutes a scheduler calls `GET /api/cron/mail` with `Authorization: Bearer <CRON_SECRET>`. Each run:

1. Fetches each connected inbox's new e-mails through Microsoft Graph delta queries.
2. Skips, without AI, auto-replies, newsletters, bounces, invitations, e-mails sent only to a group and the app's own notifications.
3. Adds a reply in a ticket's thread to that ticket as a comment.
4. Sends every other e-mail to Claude, which decides whether it asks for work. A task becomes a ticket assigned to, and reported by, the person who received it, on one of their missions. When none fits, it goes to their floor's "Demandes par e-mail" mission, created on first use; an administrator gives that mission a lead and team so they can move its tickets. Attachments up to 10 MB are copied to the ticket.

Skipped e-mails keep only their sender, subject and reason, for 30 days, and the person can still turn one into a ticket from the card. Refresh tokens are sealed with `MAIL_TOKEN_KEY` in a table only the server session reads.

Setup, once:

1. In Entra ID (tenant `d5ae50ce-ba72-40bf-90a4-844c2c57aa0a`, shared by bumex.mr and bumex.ma), register a single-tenant Web app.
   - Redirect URIs: `https://one.bumex.mr/api/mail/microsoft/callback`, plus `http://localhost:3000/api/mail/microsoft/callback` for development.
   - Delegated permissions `offline_access`, `User.Read` and `Mail.Read`, with admin consent granted for the tenant.
   - A client secret.
2. Create the secrets listed in `apphosting.yaml` (`cron-secret`, `outlook-client-id`, `outlook-client-secret`, `mail-token-key`, `anthropic-api-key`) **before** the next deployment; a missing one makes the rollout fail.
3. Create the Cloud Scheduler jobs, for example:

   ```bash
   gcloud scheduler jobs create http vanguard-mail-sync --project bumex-one --location europe-west1 \
     --schedule "*/2 * * * *" --http-method GET --uri https://one.bumex.mr/api/cron/mail \
     --headers "Authorization=Bearer <CRON_SECRET>" --attempt-deadline 120s
   gcloud scheduler jobs create http vanguard-notifications --project bumex-one --location europe-west1 \
     --schedule "0 9 * * *" --time-zone UTC --http-method GET --uri https://one.bumex.mr/api/cron/notifications \
     --headers "Authorization=Bearer <CRON_SECRET>"
   ```

The variables' names are `OUTLOOK_*` rather than `MICROSOFT_*` because setting the latter switches the app's own outgoing mail to Graph.

## Commands and verification

| Command | Purpose |
| --- | --- |
| `npm run dev` / `npm run dev:turbo` | Start development with Turbopack |
| `npm run dev:webpack` | Start development with Webpack |
| `npm run build` | Build the production application |
| `npm run start` | Serve the production build |
| `npx tsc --noEmit` | Check TypeScript types |
| `npm run lint` | Run ESLint |
| `npm run test:erp` | Run Vitest and all three PGlite database suites; no external database required |
| `npm run erp:migrate` | Apply pending SQL migrations in filename order |
| `npm run erp:migrate -- --status` | List migration status |
| `npm run smoke` | Build and check the application in an isolated environment |

Before a pull request, run type checking, lint, tests, and the production build. Before deployment, run the smoke suite as well.

The smoke runner requires PostgreSQL 16+ tools (`initdb`, `pg_ctl`), the Firebase CLI and its emulator prerequisites, Google Chrome, and `rsync`. It starts a throwaway database, Firebase Auth/Storage emulators, and a local SMTP inbox; seeds users and business data; and exercises authentication, permissions, server actions, routes, and rooms in Chrome. It builds a copy of tracked working files and new non-ignored files, excluding `.env` files. Ignored source files are not included.

```bash
npm run smoke -- --screens    # Include desktop, tablet, and phone screenshots
npm run smoke -- --no-build   # Reuse the previous smoke build when source is unchanged
npm run smoke -- --keep       # Leave the isolated environment running for inspection
npm run smoke -- --stop       # Stop the retained smoke environment
```

## Deployment

The checked-in production configuration targets Firebase project `bumex-one`, App Hosting backend `bumex-dashboard` in `europe-west4`, and application URL `https://one.bumex.mr`. [apphosting.yaml](apphosting.yaml) defines runtime settings and Cloud Secret Manager references. PostgreSQL is hosted on Cloud SQL instance `bumex-one:europe-west4:bumex-erp-vanguard`, database `bumex_erp`, with the application connecting as `bumex_app`.

Apply new migrations **before** deploying code that depends on them. The migration script uses `ERP_DATABASE_URL` with an administrative database account; the runtime can use the Cloud SQL connector. The runtime service account needs Cloud SQL Client access, and the database login needs permission to switch to `erp_app` without inheriting its rights. Proxy commands and database-role setup are documented in [db/erp/README.md](db/erp/README.md#production).

Ensure the referenced secrets, application URLs, email provider, and notification scheduler are configured in the target environment. `vercel.json` and the `supabase/` directory remain from the earlier deployment and backend; neither configures the current Firebase/PostgreSQL deployment.

## Development conventions

- Keep credentials and `.env.local` out of Git; document configuration names in `.env.example`.
- Preserve database session context and permission checks when adding services or actions; use the shared database helpers.
- Read [vanguard/VENDOR.md](vanguard/VENDOR.md) before modifying the imported ERP interface or engine. Integration changes are marked `[bumex-one]`; `vanguard/one/` holds the rebuilt work features.
- Use Vanguard's `Select` and `Suggest` controls instead of native `<select>` and `<datalist>` elements. Lint and tests enforce this convention.
- Ask a question with `vanguard/one/ask.tsx` (`confirmAsk`, `textAsk`, `fieldsAsk`: Fluent's dialog, red for a destructive answer) instead of the browser's `confirm()`, `prompt()` or `alert()`. A test enforces this convention.
- Draw a dialog over the page with `useModal` (`vanguard/one/modal.ts`): Escape closes it and not the room behind, Tab stays inside, and the focus returns where it was. Page-level key listeners check `modalOpen()` first.
- Write every visible text in both languages: `say('français', 'English')` from `useSay()` (`vanguard/one/say.ts`) in a component, `sayNow()` in an event handler or helper, or a `t()` key of `vanguard/i18n.ts`. The finance engine's refusals are French; `vanguard/one/engine-messages.ts` gives their English (a test fails when a new one has none). Text written into records (entry labels, deletion requests) and export or import file headers stay as they are.
- Show a stored code or English sentence through `vanguard/one/labels.ts` (`valueLabel` for statuses, roles and types; `activityText` and `activityDetail` for the activity log; `cap` for a date that stands alone) and a notification through `lib/notifications/localize.ts`, never as stored. A test fails when the code writes an activity sentence or a notification without its French.
- Show a loading place as a skeleton of what is coming (`vanguard/one/skeleton.tsx`: `Loading` with `SkLines`, `SkTable`, `SkList`, `SkForm`, `SkBoard`, `SkKpis`, `SkGrid` or `SkPage`; `components/ui/skeleton.tsx` outside Vanguard), not a "Chargement…" text. A horizontally scrolling board takes `useDragScroll` (`vanguard/one/drag-scroll.ts`) so the mouse can slide it.
- Regenerate `vanguard/vanguard.css` with `node scripts/vanguard-css.mjs` after editing the source `vanguard/styles.css`. Work-screen and responsive additions live in `vanguard/work.css` and `vanguard/responsive.css`.
- Style with the tokens in `vanguard/styles.css` (light values in `:root`, dark ones in `:root[data-theme="dark"]`) rather than literal colours, so both themes work; keep the 2 px corners (`var(--r)`) and sentence-case labels. Icons come from `vanguard/ui/fluent-icons.ts` (Fluent System Icons, MIT) through `Icon`.
- Update both French and English text, and verify affected layouts at desktop, tablet, and phone widths.
- Treat `docs/plans/` as design history rather than a guaranteed description of current behavior. For example, workload now counts estimated hours across all open assigned tickets, irrespective of due date; the older weighted-week calculation has been replaced.
