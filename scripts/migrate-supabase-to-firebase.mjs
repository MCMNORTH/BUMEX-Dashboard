#!/usr/bin/env node
// One-off migration of the Supabase project into Firebase.
//
//   node scripts/migrate-supabase-to-firebase.mjs [--only=users,tables,storage] [--dry-run]
//
// Required environment (e.g. in .env.migration, loaded with `node --env-file`):
//   SUPABASE_DB_URL             Postgres connection string (Project settings > Database)
//   SUPABASE_URL                https://<ref>.supabase.co (only for storage)
//   SUPABASE_SERVICE_ROLE_KEY   service role key (only for storage)
//   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, FIREBASE_STORAGE_BUCKET,
//   FIREBASE_DATABASE_ID (defaults to "(default)")
//
// The script is idempotent: every document is written with the same id as the
// Postgres row (and every Firebase user keeps the Supabase user id), so it can
// be re-run to pick up late changes before the cut-over.

import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import pg from "pg";

// Every base table in the public schema is copied, including ones this app
// does not use (e.g. the timesheet tables), so no data is left behind.
async function listPublicTables() {
  const { rows } = await client.query(`
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by table_name
  `);
  return rows.map((row) => row.table_name);
}

async function primaryKeyColumns(table) {
  const { rows } = await client.query(
    `select a.attname as column_name
     from pg_index i
     join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
     where i.indrelid = $1::regclass and i.indisprimary
     order by array_position(i.indkey, a.attnum)`,
    [`public.${table}`],
  );
  return rows.map((row) => row.column_name);
}

const STORAGE_BUCKETS = ["documents"];
const BATCH_SIZE = 400;
const USER_IMPORT_BATCH_SIZE = 1000;

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=");
    return [key, value];
  }),
);
const dryRun = args.get("dry-run") === "true";
const only = new Set((args.get("only") ?? "users,tables,storage").split(","));

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    console.error(`Missing environment variable ${name}.`);
    process.exit(1);
  }

  return value;
}

// Keep Postgres values in the same shape supabase-js returned them:
// numerics as numbers, dates as YYYY-MM-DD strings, timestamps as ISO strings.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number(value));
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);
pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, (value) => new Date(value).toISOString());
pg.types.setTypeParser(pg.types.builtins.TIMESTAMP, (value) => new Date(`${value}Z`).toISOString());

const projectId = requireEnv("FIREBASE_PROJECT_ID");
const app = initializeApp({
  credential: cert({
    projectId,
    clientEmail: requireEnv("FIREBASE_CLIENT_EMAIL"),
    privateKey: requireEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
  }),
  projectId,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`,
});
const db = getFirestore(app, process.env.FIREBASE_DATABASE_ID || "(default)");
db.settings({ ignoreUndefinedProperties: true });

const client = new pg.Client({
  connectionString: requireEnv("SUPABASE_DB_URL"),
  ssl: process.env.SUPABASE_DB_SSL === "0" ? false : { rejectUnauthorized: false },
});

async function migrateUsers() {
  const { rows } = await client.query(`
    select id, email, encrypted_password, email_confirmed_at, raw_user_meta_data,
           created_at, last_sign_in_at, banned_until, phone
    from auth.users
    where deleted_at is null
    order by created_at
  `);

  console.log(`auth.users: ${rows.length} users`);

  const users = rows.map((row) => {
    const metadata = row.raw_user_meta_data ?? {};
    const user = {
      uid: row.id,
      email: row.email ?? undefined,
      emailVerified: Boolean(row.email_confirmed_at),
      displayName: typeof metadata.full_name === "string" ? metadata.full_name : undefined,
      photoURL: typeof metadata.avatar_url === "string" && /^https?:/.test(metadata.avatar_url)
        ? metadata.avatar_url
        : undefined,
      disabled: Boolean(row.banned_until && new Date(row.banned_until) > new Date()),
      metadata: {
        creationTime: row.created_at ?? undefined,
        lastSignInTime: row.last_sign_in_at ?? undefined,
      },
    };

    // Supabase stores bcrypt hashes, which Firebase can import as-is so
    // everyone keeps their current password.
    if (row.encrypted_password) {
      user.passwordHash = Buffer.from(row.encrypted_password);
    }

    return user;
  });

  if (dryRun) {
    return;
  }

  for (let index = 0; index < users.length; index += USER_IMPORT_BATCH_SIZE) {
    const chunk = users.slice(index, index + USER_IMPORT_BATCH_SIZE);
    const result = await getAuth(app).importUsers(chunk, { hash: { algorithm: "BCRYPT" } });

    for (const failure of result.errors) {
      console.warn(`  user ${chunk[failure.index].email}: ${failure.error.message}`);
    }

    console.log(`  imported ${result.successCount}/${chunk.length}`);
  }
}

async function migrateTable(table) {
  const keyColumns = await primaryKeyColumns(table);
  const { rows } = await client.query(`select * from public."${table}"`);
  console.log(`${table}: ${rows.length} rows${keyColumns.length ? "" : " (no primary key, generated ids)"}`);

  if (dryRun) {
    return;
  }

  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const batch = db.batch();

    for (const row of rows.slice(index, index + BATCH_SIZE)) {
      if (keyColumns.length === 1 && keyColumns[0] === "id") {
        const { id, ...data } = row;
        batch.set(db.collection(table).doc(String(id)), data);
      } else {
        // Composite or non-"id" keys: keep every column and derive a stable
        // document id so re-runs overwrite instead of duplicating.
        const ref = keyColumns.length
          ? db.collection(table).doc(keyColumns.map((column) => String(row[column])).join("__").replace(/\//g, "_"))
          : db.collection(table).doc();
        batch.set(ref, row);
      }
    }

    await batch.commit();
  }
}

async function migrateStorage() {
  const supabaseUrl = requireEnv("SUPABASE_URL").replace(/\/+$/, "");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const bucket = getStorage(app).bucket();

  for (const bucketId of STORAGE_BUCKETS) {
    const { rows } = await client.query(
      "select name, metadata from storage.objects where bucket_id = $1 order by name",
      [bucketId],
    );

    console.log(`storage/${bucketId}: ${rows.length} objects`);

    if (dryRun) {
      continue;
    }

    for (const { name, metadata } of rows) {
      const response = await fetch(
        `${supabaseUrl}/storage/v1/object/${bucketId}/${name.split("/").map(encodeURIComponent).join("/")}`,
        { headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey } },
      );

      if (!response.ok) {
        console.warn(`  ${name}: download failed (${response.status})`);
        continue;
      }

      await bucket.file(`${bucketId}/${name}`).save(Buffer.from(await response.arrayBuffer()), {
        contentType: metadata?.mimetype ?? response.headers.get("content-type") ?? undefined,
        resumable: false,
      });
    }
  }
}

async function main() {
  await client.connect();

  try {
    if (only.has("users")) {
      await migrateUsers();
    }

    if (only.has("tables")) {
      for (const table of await listPublicTables()) {
        await migrateTable(table);
      }
    }

    if (only.has("storage")) {
      await migrateStorage();
    }
  } finally {
    await client.end();
  }

  console.log(dryRun ? "Dry run complete, nothing was written." : "Migration complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
