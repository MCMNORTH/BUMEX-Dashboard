# BUMEX Vanguard

The internal ERP and work platform for the BUMEX group. Vanguard combines accounting, clients, missions, tickets, time tracking, people, documents, and reporting, with access controlled by role, entity, and module. The interface is available in French and English.

This repository is the current Next.js application. BUMEX One's former pages were rebuilt inside Vanguard; their old URLs redirect to rooms or records under `/vanguard`. The npm package retains its historical name, `bumex-it-dashboard`.

## Features

- **Daily work:** personal overview, My Work, mission boards and lists, tickets with keys, subtasks, comments, attachments, history, and time logs.
- **Missions and teams:** clients, contracts, milestones, calendars, planning, workload, and weekly timesheets with manager review.
- **ERP:** accounting, sales, purchases, banking, loans, fixed assets, tax, payroll, reports, and physical archives. Earlier BUMEX One finance records remain available as a read-only archive.
- **Administration:** invitations, password recovery, roles, entity and module permissions, notifications, and audit history.
- **Navigation:** flat pages by default; an optional 3D office building represents entities as floors and modules as rooms. Phones and tablets use the flat interface, with responsive navigation and home-screen installation support.
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
| Email | Resend, Microsoft Graph, or SMTP through Nodemailer |
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
| `db/erp/migrations/` | Ordered PostgreSQL migrations, currently `0001`–`0016` |
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
| `CRON_SECRET` | Bearer secret protecting `/api/cron/notifications` |
| `BUMEX_BILLING_*` | Company, contact, tax, bank, and footer metadata for the legacy invoice PDF service; fields are listed in `.env.example` |

### Email and scheduled notifications

Application email uses the first configured provider in this order:

1. **Resend:** `RESEND_API_KEY` and `NOTIFICATION_EMAIL_FROM`, using a verified sender domain.
2. **Microsoft Graph:** `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, and `NOTIFICATION_EMAIL_SENDER_EMAIL`.
3. **SMTP:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and sender configuration (`NOTIFICATION_EMAIL_FROM` for application mail; `SMTP_FROM` for direct SMTP callers).

The notification outbox and timesheet reminder logic live in PostgreSQL. A scheduler calls `GET /api/cron/notifications` with `Authorization: Bearer <CRON_SECRET>` to queue eligible reminders and dispatch pending emails. The retained `vercel.json` defines a daily 09:00 UTC schedule for Vercel. The Firebase App Hosting configuration does not define a scheduler; configure one separately for that deployment.

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
- Regenerate `vanguard/vanguard.css` with `node scripts/vanguard-css.mjs` after editing the source `vanguard/styles.css`. Work-screen and responsive additions live in `vanguard/work.css` and `vanguard/responsive.css`.
- Update both French and English text, and verify affected layouts at desktop, tablet, and phone widths.
- Treat `docs/plans/` as design history rather than a guaranteed description of current behavior. For example, workload now counts estimated hours across all open assigned tickets, irrespective of due date; the older weighted-week calculation has been replaced.
