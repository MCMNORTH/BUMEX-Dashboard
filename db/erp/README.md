# BUMEX ERP — PostgreSQL

The app (BUMEX VANGUARD) keeps all its data in PostgreSQL, in the Firebase project `bumex-one`: the books (schema
`erp`, delivered by the ERP team) and the work (schema `work`, migration 0008: people, clients, missions, tickets,
time, conversation, documents' metadata, the old finance records). Firebase keeps the sign-in (Auth) and the
documents' files (Storage). BUMEX One's Firestore database `bumex` is no longer read by the app: it stays as it was
on the day of the copy (`scripts/work-copy.mjs`), the way back.

| Path | What it is |
|---|---|
| `db/erp/migrations/0001–0003` | The ERP team's schema, **as delivered** (schema `erp`: ledger, triggers, row-level security) |
| `db/erp/migrations/0004_bumex_one.sql` | Our adaptation: ERP access per BUMEX One user, session functions, role `erp_app`, the 8 entities with BUMEX One codes |
| `db/erp/migrations/0005_no_session_no_data.sql` | No session = no data for `erp_app`; app logins switch to the role, never inherit it |
| `db/erp/migrations/0006_accounting.sql` | Customer / supplier required by an account, who may post (checked by the database), fiscal years with their 12 periods, row-level security on the last ledger tables |
| `db/erp/migrations/0007_vanguard.sql` | The fields Vanguard keeps that the schema lacked, the invoices' service categories, row-level security on the remaining open tables (document lines, bank lines, counters…) |
| `db/erp/migrations/0008_work.sql` | The work: a project is an `erp.engagement`, a ticket an `erp.task`, a time line an `erp.time_entry`, a member an `erp.engagement_staff` row; everything else in schema `work`. BUMEX One's access rules as row-level security |
| `db/erp/migrations/0009_permissions.sql` | Permissions: a person's modules per entity (`entity_modules`), the "role modifier" (`manages_access`, an administrator's only) who alone changes access, the invitations' links |
| `db/erp/test/work.test.mjs` | Tests of 0008: who reads and writes what, the timesheet's guards, the e-mails, one client with two sides |
| `scripts/work-copy.mjs` | The one-shot copy of BUMEX One's Firestore data into 0008's tables (dry run first) |
| `lib/erp/vanguard/` | BUMEX Vanguard on this database: the state read for a person, their changes replayed with the engine and written (see `vanguard/VENDOR.md`); tests in `test/` run on the real schema |
| `db/erp/test/guarantees.test.mjs` | The ERP team's 35 guarantee tests (now run against every migration, 0004 included) |
| `db/erp/test/bumex-one.test.mjs` | Tests of 0004–0006 and 0009 |
| `lib/erp/engine/` | The ERP team's TypeScript engine, **as delivered** but for marked changes (`withIdSource` and the rooms per entity in `core.ts`, two session fields in `types.ts`); 65 tests in `lib/erp/engine/test` |
| `lib/erp/*.ts` | Our code: connection, access, pages' data |
| `scripts/erp-migrate.mjs` | Applies pending migrations |

Files marked "as delivered" are not edited (they are excluded from lint), so a new delivery can be copied over and
compared. Changes we need go into new migrations / files of ours.

## Who sees what

- People sign in with Firebase Auth; each is a `work.person` (their Firebase uid). One person, one role: Vanguard's.
  `erp.user_access` gives a person an **ERP role** — admin, partner, raf, manager, accountant, staff, intern — plus
  their entities (null = all) and modules (null = the role's standard modules, `lib/erp/config.ts`), and, per entity,
  the modules where they differ (`entity_modules`, 0009; the group's consolidation is never an entity's). A newcomer
  chooses their entity, then gets staff on it on their first visit (`lib/erp/roles.ts`; the copy gave everyone else
  theirs from their BUMEX One role). Someone whose access was removed is not given one again and sees a "no access"
  page.
- Access is managed in Vanguard's Settings › Permissions (`vanguard/one/Permissions.tsx`, `lib/erp/permissions.ts`)
  by the administrators who are **role modifiers** (`manages_access`), and by nobody else: `erp.user_access_guard`
  refuses everyone else, whatever their role, and nobody removes their own access, administrator role or flag. The
  page also invites people: a Firebase account without a password, their `work.person` on their entity, their role's
  access there, and an e-mail with a link (`/invite/<token>`, 7 days, used once; only its digest is kept in
  `work.invitation`) where they choose their password.
- The books' row-level security is by entity; what each person's browser receives is then narrowed to the modules of
  each row's entity (`lib/erp/vanguard/visible.ts`), and every change the server replays must open its room on every
  entity it touches (`lib/erp/vanguard/replay.ts`).
- The work follows BUMEX One's rules, as row-level security (0008): the Vanguard role reads as BUMEX One's
  (`work.actor_class`: admin, partner and finance lead → administrator; manager; staff seeing the reports only →
  shareholder; everyone else → employee). A mission is seen by its floor (the ERP's rule) and by whoever works on it;
  a ticket by its assignee, sub-task owners, reporter and the mission's managers; a client by its account manager
  and the people of its missions; and so on (`work.can_*`). The rules' helpers run as the no-login role
  `work_reader` (security definer), which every rule lets through, so that they read across tables.
- Every transaction the app opens does `set local role erp_app` (never bypasses row-level security) and
  `select erp.open_session(<uid>)`, which sets `erp.actor_id`, `erp.actor_role` and `erp.entity_ids` for that
  transaction only. Access is changed in the role modifier's own session.
  Only `lib/erp/db.ts` talks to the database, so no query runs without that context.

## Run it locally

    brew services start postgresql@17        # or any PostgreSQL 15+
    createdb bumex_erp
    echo 'ERP_DATABASE_URL=postgres://localhost:5432/bumex_erp' >> .env.local
    npm run erp:migrate                      # `-- --status` to only list
    npm run dev

The super admin (`BUMEX_SUPER_ADMIN_EMAIL`) gets the admin role on their first visit. Without `ERP_DATABASE_URL` the
app only shows that its database is unavailable.

## Tests

    npm run test:erp     # engine + accounting layer (vitest) + schema guarantees + our migrations, on PGlite
    npm run smoke        # before every deploy: the app built as production builds it, checked end to end

`npm run smoke` (`scripts/smoke/`) starts a throwaway PostgreSQL (the migrations run by a non-superuser owner, as
on Cloud SQL; the app logs in as `bumex_app`), Firebase's Auth and Storage emulators and an SMTP inbox, seeds an
office (`seed.mjs`), builds a copy of the files git would commit (never the `.env` files; the app gets no variable
but the test's), and checks it through its server actions, routes and pages in headless Chrome (`checks.mjs`:
tickets, time, missions, clients, documents, search, permissions, an invitation from the e-mail to the first
sign-in, the e-mail job, every room of four people). `-- --no-build` reuses the last build; `-- --keep` leaves it
running to look around (`-- --stop` afterwards). Needs PostgreSQL 16+ (`initdb`, `pg_ctl`), the Firebase CLI and
Google Chrome.

## Deploying a change that adds a migration

Migrate first, then deploy: the new code expects the new columns and functions. Until then, only the pages using
them fail; the rest keeps working.

## The move from Firestore (the cutover)

Once, in a quiet window (nobody working: what is written to Firestore after the copy stays there):

1. `npm run erp:migrate` (0008), as below.
2. `node scripts/work-copy.mjs --dry-run` with `ERP_DATABASE_URL` (as below), `FIREBASE_PROJECT_ID=bumex-one` and
   Application Default Credentials (`gcloud auth application-default login`): everything is copied in one transaction
   and rolled back; the report lists, per collection, what was read, copied, set right and left out.
3. The same without `--dry-run`: copied and committed.
4. Deploy the app that reads PostgreSQL.

The way back: deploy the previous app again (it reads Firestore, untouched; 0008 only added to the database).

## Production

- Instance: Cloud SQL for PostgreSQL 18 `bumex-one:europe-west4:bumex-erp-vanguard` (Enterprise, backups and
  point-in-time recovery on, deletion protection, trusted client certificates required, no authorised networks).
- Database `bumex_erp`; the app logs in as `bumex_app` through Google's connector (`ERP_CLOUDSQL_INSTANCE` and
  friends in `apphosting.yaml`, password in the secret `erp-database-password`). The App Hosting service account has
  the Cloud SQL Client role.
- Migrations are run from a Mac through the proxy, as `postgres`:

      cloud-sql-proxy --port 5433 bumex-one:europe-west4:bumex-erp-vanguard     # window 1
      read -s "PGPASSWORD?postgres password: " && export PGPASSWORD             # window 2
      ERP_DATABASE_URL='postgres://postgres@127.0.0.1:5433/bumex_erp' npm run erp:migrate
      unset PGPASSWORD

The migrating account receives role `erp_app` automatically. Any other login the app uses must be given the role
once — switch only, no inherited rights — or every ERP query fails with `permission denied to set role "erp_app"`
(the app then hides the ERP and Settings → Users shows "ERP unavailable"):

    grant erp_app to <app login> with inherit false, set true;

The instance was created through Firebase SQL Connect (label `firebase-data-connect`). Never deploy a SQL Connect
schema to `bumex_erp` in STRICT mode: it drops the tables it does not manage.
