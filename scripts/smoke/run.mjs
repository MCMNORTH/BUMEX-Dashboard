// The smoke test, before every deploy: the app built as production builds it, started on a throwaway PostgreSQL (the
// migrations run by a non-superuser owner, as on Cloud SQL; the app logs in as bumex_app) and Firebase's Auth and
// Storage emulators, then checked through its pages, routes and server actions (checks.mjs).
//
//   npm run smoke                  build, start, check, stop
//   npm run smoke -- --no-build    reuse the last build (nothing changed since)
//   npm run smoke -- --keep        leave everything running afterwards, to look around; then npm run smoke -- --stop
//   npm run smoke -- --screens     then every screen at a PC's, a tablet's and a phone's size (screens.mjs; --screens-only,
//                                  --sizes=pc,phone, --label=before, --strict)
//
// Needs PostgreSQL 16 or later (initdb and pg_ctl on the PATH), the Firebase CLI and Google Chrome (CHROME=<path> for
// another). Works in <tmp>/bumex-smoke on a copy of the files git would commit: the repository's .env files are never
// read, and the app gets no variable but the smoke test's (no real database, account or e-mail is reached).
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import pg from "pg";

import { runChecks } from "./checks.mjs";
import { runScreens } from "./screens.mjs";
import { actions, browser, mailbox, report } from "./lib.mjs";
import { PASSWORD, people, seed } from "./seed.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const work = join(tmpdir(), "bumex-smoke");
const build = join(work, "build");
const pids = join(work, "pids.json");
const args = process.argv.slice(2);
const port = { pg: 54339, auth: 9399, storage: 9398, hub: 4498, logging: 4598, app: 3199, chrome: 9339, smtp: 2599 };
const base = `http://127.0.0.1:${port.app}`;
const PROJECT = "demo-bumex-smoke";
const chrome = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const superUrl = `postgres://smoke_super@127.0.0.1:${port.pg}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const started = Date.now();
const step = (what) => console.log(`\n▸ ${what}  (${Math.round((Date.now() - started) / 1000)} s)`);

function run(command, list, options = {}) {
  const out = spawnSync(command, list, { encoding: "utf8", ...options });
  if (out.status !== 0) throw new Error(`${command} ${list.join(" ")} failed:\n${(out.stderr || out.stdout || out.error?.message || "").slice(-2000)}`);
  return out.stdout;
}

// A process of the run, in its own group (stopped with everything it started), its output in a log.
const children = [];
function start(name, command, list, { cwd = work, env } = {}) {
  const log = openSync(join(work, `${name}.log`), "w");
  const child = spawn(command, list, { cwd, env, detached: true, stdio: ["ignore", log, log] });
  children.push({ name, pid: child.pid });
  writeFileSync(pids, JSON.stringify(children));
  return child;
}

async function waitFor(what, test, timeout = 90_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await test().catch(() => false)) return;
    await sleep(500);
  }
  throw new Error(`${what} did not start in ${timeout / 1000} s (see the logs in ${work})`);
}

function stopAll() {
  const known = existsSync(pids) ? JSON.parse(readFileSync(pids, "utf8")) : [];
  for (const { pid } of known) {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
  if (existsSync(join(work, "pg", "postmaster.pid"))) spawnSync("pg_ctl", ["-D", join(work, "pg"), "-m", "fast", "-w", "stop"], { stdio: "ignore" });
  rmSync(pids, { force: true });
}

const free = (p) =>
  new Promise((resolve) => {
    const server = createServer().once("error", () => resolve(false)).listen(p, "127.0.0.1", () => server.close(() => resolve(true)));
  });

// The files git would commit (tracked, and new ones not ignored), copied over the last run's; its node_modules and
// .next stay, so a second run only copies and builds what changed.
function copyRepo() {
  mkdirSync(build, { recursive: true });
  for (const entry of readdirSync(build)) if (entry !== "node_modules" && entry !== ".next") rmSync(join(build, entry), { recursive: true, force: true });
  const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: repo, maxBuffer: 64 * 1024 * 1024 })
    .toString("utf8").split("\0").filter((f) => f && !/(^|\/)\.env/.test(f) && existsSync(join(repo, f)));
  run("rsync", ["-a", "--from0", "--files-from=-", `${repo}/`, `${build}/`], { input: files.join("\0") });
  run("rsync", ["-a", "--delete", `${repo}/node_modules/`, `${build}/node_modules/`]);
}

if (args.includes("--stop")) {
  stopAll();
  console.log("Stopped.");
  process.exit(0);
}

const { check, failures, total } = report();
let keepRunning = false;
const interrupted = () => {
  stopAll();
  process.exit(130);
};
process.on("SIGINT", interrupted);
process.on("SIGTERM", interrupted);

try {
  step("Checking the tools and ports");
  const version = Number(run("pg_ctl", ["--version"]).match(/(\d+)\.\d+/)?.[1] ?? 0);
  if (version < 16) throw new Error(`PostgreSQL 16 or later is needed (pg_ctl ${version}).`);
  run("firebase", ["--version"]);
  if (!existsSync(chrome)) throw new Error(`Google Chrome not found at ${chrome} (set CHROME=<path>).`);
  mkdirSync(work, { recursive: true });
  stopAll();
  for (const [name, p] of Object.entries(port)) if (!(await free(p))) throw new Error(`Port ${p} (${name}) is busy: stop what uses it (npm run smoke -- --stop for a kept run).`);

  // the app's environment, and nothing else of this machine's but what running programs needs
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  const cronSecret = randomBytes(16).toString("hex");
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR ?? tmpdir(),
    LANG: "en_US.UTF-8",
    NEXT_TELEMETRY_DISABLED: "1",
    FIREBASE_PROJECT_ID: PROJECT,
    FIREBASE_CLIENT_EMAIL: `smoke@${PROJECT}.iam.gserviceaccount.com`,
    FIREBASE_PRIVATE_KEY: privateKey,
    FIREBASE_API_KEY: "smoke-api-key",
    FIREBASE_STORAGE_BUCKET: `${PROJECT}.appspot.com`,
    FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${port.auth}`,
    FIREBASE_STORAGE_EMULATOR_HOST: `127.0.0.1:${port.storage}`,
    ERP_DATABASE_URL: `postgres://bumex_app@127.0.0.1:${port.pg}/bumex_erp`,
    APP_URL: base,
    ENABLE_SELF_SIGNUP: "0",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: String(port.smtp),
    SMTP_USER: "smoke",
    SMTP_PASS: "smoke",
    SMTP_FROM: "BUMEX <smoke@bumex.mr>",
    CRON_SECRET: cronSecret,
  };

  step("PostgreSQL: a new cluster, the migrations by a non-superuser owner");
  const pgdir = join(work, "pg");
  rmSync(pgdir, { recursive: true, force: true });
  run("initdb", ["-D", pgdir, "-U", "smoke_super", "--auth=trust", "-E", "UTF8", "--locale=C"]);
  run("pg_ctl", ["-D", pgdir, "-l", join(work, "postgres.log"), "-w", "-o", `-p ${port.pg} -k "" -c listen_addresses=127.0.0.1`, "start"]);
  const admin = new pg.Client({ connectionString: `${superUrl}/postgres` });
  await admin.connect();
  await admin.query("create role bumex_owner login createrole; create role bumex_app login");
  await admin.query("create database bumex_erp owner bumex_owner");
  await admin.end();
  const ownerUrl = `postgres://bumex_owner@127.0.0.1:${port.pg}/bumex_erp`;
  console.log(run(process.execPath, [join(repo, "scripts", "erp-migrate.mjs")], { cwd: repo, env: { PATH: process.env.PATH, ERP_DATABASE_URL: ownerUrl } }).trim().split("\n").filter((l) => l.startsWith("done")).join("\n"));
  const owner = new pg.Client({ connectionString: ownerUrl });
  await owner.connect();
  await owner.query("grant erp_app to bumex_app with inherit false, set true");
  await owner.end();

  step("Firebase emulators (Auth, Storage) and the mailbox");
  const emu = join(work, "emu");
  mkdirSync(emu, { recursive: true });
  writeFileSync(join(emu, "storage.rules"), "rules_version = '2';\nservice firebase.storage { match /b/{bucket}/o { match /{path=**} { allow read, write: if false; } } }\n");
  writeFileSync(join(emu, "firebase.json"), JSON.stringify({
    storage: { rules: "storage.rules" },
    emulators: { auth: { port: port.auth, host: "127.0.0.1" }, storage: { port: port.storage, host: "127.0.0.1" }, hub: { port: port.hub, host: "127.0.0.1" }, logging: { port: port.logging, host: "127.0.0.1" }, ui: { enabled: false } },
  }));
  start("emulators", "firebase", ["emulators:start", "--only", "auth,storage", "--project", PROJECT], { cwd: emu, env: { PATH: process.env.PATH, HOME: process.env.HOME } });
  const mail = mailbox(port.smtp);
  await mail.start();
  await waitFor("The Auth emulator", async () => (await fetch(`http://127.0.0.1:${port.auth}/`)).ok);
  await waitFor("The Storage emulator", async () => Boolean(await fetch(`http://127.0.0.1:${port.storage}/`)));

  step("The office: people, missions, tickets, time");
  process.env.FIREBASE_AUTH_EMULATOR_HOST = `127.0.0.1:${port.auth}`;
  const auth = getAuth(initializeApp({ projectId: PROJECT }));
  await seed({ databaseUrl: `${superUrl}/bumex_erp`, auth });

  if (!args.includes("--no-build") || !existsSync(join(build, ".next", "BUILD_ID"))) {
    step("Building the app (a copy of the files git would commit)");
    copyRepo();
    run(process.execPath, [join(build, "node_modules", "next", "dist", "bin", "next"), "build"], { cwd: build, env, maxBuffer: 64 * 1024 * 1024 });
  }

  step("Starting the app and Chrome");
  start("app", process.execPath, [join(build, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port.app), "-H", "127.0.0.1"], { cwd: build, env });
  start("chrome", chrome, ["--headless=new", `--remote-debugging-port=${port.chrome}`, `--user-data-dir=${join(work, "chrome")}`, "--no-first-run", "--no-default-browser-check",
    "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--window-size=1440,900", "about:blank"]);
  await waitFor("The app", async () => (await fetch(`${base}/login`)).status === 200);
  await waitFor("Chrome", async () => (await fetch(`http://127.0.0.1:${port.chrome}/json/version`)).ok);

  // a session for each person, as the sign-in makes it
  const cookies = {};
  for (const [login] of people) {
    const res = await fetch(`http://127.0.0.1:${port.auth}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=smoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: `${login}@bumex.mr`, password: PASSWORD, returnSecureToken: true }),
    });
    cookies[login] = await auth.createSessionCookie((await res.json()).idToken, { expiresIn: 6 * 3600 * 1000 });
  }

  step("Checking");
  const db = new pg.Client({ connectionString: `${superUrl}/bumex_erp` });
  await db.connect();
  try {
    if (!args.includes("--screens-only")) await runChecks({ act: actions(base, build, cookies), db, base, authPort: port.auth, cookies, openBrowser: () => browser(port.chrome, base), mail, cronSecret, check });
    if (args.includes("--screens") || args.includes("--screens-only")) {
      const option = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
      step("Screens");
      await runScreens({
        openBrowser: () => browser(port.chrome, base),
        cookies,
        check,
        dir: join(work, "screens", option("label") ?? "latest"),
        sizes: option("sizes")?.split(","),
        strict: args.includes("--strict"),
      });
    }
  } finally {
    await db.end();
    await mail.stop();
  }

  keepRunning = args.includes("--keep");
  if (keepRunning) {
    console.log(`\nStill running: ${base} (sign in as <name>@bumex.mr, password ${PASSWORD}: ${people.map(([l]) => l).join(", ")}).`);
    console.log("Stop it with: npm run smoke -- --stop");
  }
} catch (error) {
  check("the smoke test ran to its end", false, error instanceof Error ? error.message : String(error));
} finally {
  if (!keepRunning) stopAll();
}

const failed = failures();
console.log(`\n${total() - failed}/${total()} passed${failed ? ` — ${failed} FAILED (logs: ${work})` : ""}  (${Math.round((Date.now() - started) / 1000)} s)`);
process.exit(failed ? 1 : 0);
