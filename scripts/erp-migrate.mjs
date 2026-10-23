// Applies the ERP's PostgreSQL migrations (db/erp/migrations/*.sql) to ERP_DATABASE_URL, in name order, each once
// and each in its own transaction. Applied files are recorded in public.erp_schema_migrations.
//
//   npm run erp:migrate            apply what is pending
//   npm run erp:migrate -- --status  list applied and pending files, change nothing
//
// Run it with an account that may create roles and schemas (the instance's admin user), not the app's.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const url = process.env.ERP_DATABASE_URL?.trim();
if (!url) {
  console.error("ERP_DATABASE_URL is not set (in .env.local or the environment).");
  process.exit(1);
}

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "erp", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const statusOnly = process.argv.includes("--status");

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  await client.query(`create table if not exists public.erp_schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )`);
  const applied = new Set((await client.query("select name from public.erp_schema_migrations")).rows.map((r) => r.name));
  const pending = files.filter((f) => !applied.has(f));

  for (const f of files) console.log(`${applied.has(f) ? "applied" : "pending"}  ${f}`);
  if (statusOnly || !pending.length) {
    console.log(pending.length ? `\n${pending.length} pending` : "\nUp to date");
    process.exit(0);
  }

  for (const f of pending) {
    const sql = readFileSync(join(dir, f), "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into public.erp_schema_migrations (name) values ($1)", [f]);
      await client.query("commit");
      console.log(`done     ${f}`);
    } catch (error) {
      await client.query("rollback");
      console.error(`failed   ${f}: ${error.message}`);
      process.exit(1);
    }
  }
} finally {
  await client.end();
}
