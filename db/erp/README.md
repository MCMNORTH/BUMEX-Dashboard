# BUMEX ERP — PostgreSQL

The ERP (BUMEX VANGUARD, delivered by the ERP team) is being integrated into BUMEX One. BUMEX One keeps Firestore
(database `bumex`). The ERP's accounting data lives in PostgreSQL, in the same Firebase project (`bumex-one`).

| Path | What it is |
|---|---|
| `db/erp/migrations/0001–0003` | The ERP team's schema, **as delivered** (schema `erp`: ledger, triggers, row-level security) |
| `db/erp/migrations/0004_bumex_one.sql` | Our adaptation: ERP access per BUMEX One user, session functions, role `erp_app`, the 8 entities with BUMEX One codes |
| `db/erp/test/guarantees.test.mjs` | The ERP team's 35 guarantee tests (now run against every migration, 0004 included) |
| `db/erp/test/bumex-one.test.mjs` | Tests of 0004 |
| `lib/erp/engine/` | The ERP team's TypeScript engine, **as delivered** (65 tests in `lib/erp/engine/test`) |
| `lib/erp/*.ts` | Our code: connection, access, pages' data |
| `scripts/erp-migrate.mjs` | Applies pending migrations |

Files marked "as delivered" are not edited (they are excluded from lint), so a new delivery can be copied over and
compared. Changes we need go into new migrations / files of ours.

## Who sees what

- People sign in with BUMEX One. Their BUMEX One role (`profiles.role`) is not touched by the ERP.
- `erp.user_access` gives a person (Firebase uid) an **ERP role** — admin, partner, raf, manager, accountant, staff,
  intern — plus their entities (null = all) and modules (null = the role's modules, `lib/erp/config.ts`).
  No row = no ERP: the sidebar has no ERP tab and `/erp` redirects.
- Access is managed in Settings → Users (column "ERP access") by the BUMEX One super admin or an ERP admin.
- Every transaction the app opens does `set local role erp_app` (never bypasses row-level security) and
  `select erp.open_session(<uid>)`, which sets `erp.actor_id`, `erp.actor_role` and `erp.entity_ids` for that
  transaction only. Access management by the super admin uses `erp.open_system_session(<uid>)`.
  Only `lib/erp/db.ts` talks to the database, so no query runs without that context.

## Run it locally

    brew services start postgresql@17        # or any PostgreSQL 15+
    createdb bumex_erp
    echo 'ERP_DATABASE_URL=postgres://localhost:5432/bumex_erp' >> .env.local
    npm run erp:migrate                      # `-- --status` to only list
    npm run dev

Then, as the super admin, Settings → Users → ERP access → give yourself a role. Without `ERP_DATABASE_URL` the app
runs exactly as before.

## Tests

    npm run test:erp     # engine (vitest) + schema guarantees + 0004, on PGlite: no PostgreSQL needed

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
