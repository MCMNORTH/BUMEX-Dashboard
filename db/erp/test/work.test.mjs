// BUMEX ERP — guarantees of migration 0008 (the work data: people, missions, tickets, time, conversation), run on PGlite
// like bumex-one.test.mjs, through the application's path: a transaction, `set local role erp_app`, then
// erp.open_session(<Firebase uid>) or erp.open_system_session(<actor>).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const migrations = join(here, '..', 'migrations');
const DDL = readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(join(migrations, f), 'utf8')).join('\n');

const results = [];
let db;
let ids;

async function one(sql, params = []) {
  return (await db.query(sql, params)).rows[0];
}
async function all(sql, params = []) {
  return (await db.query(sql, params)).rows;
}

async function within(open, fn) {
  await db.exec('begin');
  try {
    await db.exec('set local role erp_app');
    await open();
    const out = await fn();
    await db.exec('commit');
    return out;
  } catch (err) {
    await db.exec('rollback');
    throw err;
  }
}
const as = (uid, fn) => within(() => db.query('select erp.open_session($1)', [uid]), fn);
const asTest = (uid, fn) => within(() => db.query('select erp.open_session($1, true)', [uid]), fn); // test mode (0013)
const asSystem = (fn) => within(() => db.query("select erp.open_system_session('test')"), fn);

async function expectError(fn, pattern) {
  try {
    await fn();
  } catch (err) {
    if (pattern.test(err.message)) return err.message.split('\n')[0];
    throw new Error(`wrong error: ${err.message}`);
  }
  throw new Error(`expected an error matching ${pattern}, got none`);
}

async function test(name, fn) {
  try {
    const note = await fn();
    results.push({ name, ok: true, note: note ?? '' });
  } catch (err) {
    results.push({ name, ok: false, note: err.message });
  }
}

const same = (got, want, what) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

// The office: two floors (Audit, IT); people of every class; two clients; three missions; three tickets.
//   adm admin · mgr manager (Audit, owns P1, account manager of K1) · mgr2 manager (IT, owns P2) · emp staff (Audit)
//   emp2 staff (IT, member of P1) · sh staff seeing the reports only (a shareholder) · out without access
//   P1 Audit/K1 (T1 → emp, reported by mgr; T3 → nobody, reported by emp2) · P2 IT/K2 (T2 → emp2, a sub-task → emp) · P3 Audit
async function office() {
  db = new PGlite();
  await db.exec(DDL);
  ids = {};
  for (const r of await all('select id, code from erp.entity')) ids[r.code] = r.id;
  await asSystem(async () => {
    const people = [
      ['adm', 'bumex_holding', 'admin', null, null],
      ['mgr', 'bumex_audit', 'manager', ['bumex_audit'], null],
      ['mgr2', 'bumex_it', 'manager', ['bumex_it'], null],
      ['emp', 'bumex_audit', 'staff', ['bumex_audit'], null],
      ['emp2', 'bumex_it', 'staff', ['bumex_it'], null],
      ['sh', 'bumex_holding', 'staff', null, ['reports']],
      ['out', 'bumex_audit', null, null, null],
    ];
    for (const [id, entity, role, entities, modules] of people) {
      await db.query('insert into work.person (id, email, full_name, entity_code) values ($1, $2, $3, $4)', [id, `${id}@bumex.mr`, `Person ${id}`, entity]);
      if (role) await db.query('insert into erp.user_access (user_id, erp_role, entity_codes, modules) values ($1, $2, $3, $4)', [id, role, entities, modules]);
    }
    ids.K1 = (await one(`insert into work.client (name, account_manager_id, status) values ('Client Un', 'mgr', 'active') returning id`)).id;
    ids.K2 = (await one(`insert into work.client (name, status) values ('Client Deux', 'active') returning id`)).id;
    const mission = async (entity, owner, client, name) =>
      (await one(`insert into erp.engagement (entity_id, owner_id, client_id, name, project_kind, status, deadline) values ($1, $2, $3, $4, 'client_mission', 'active', '2026-12-31') returning id`,
        [ids[entity], owner, client, name])).id;
    ids.P1 = await mission('bumex_audit', 'mgr', ids.K1, 'Mission Un');
    ids.P2 = await mission('bumex_it', 'mgr2', ids.K2, 'Mission Deux');
    ids.P3 = await mission('bumex_audit', 'adm', null, 'Mission Trois');
    await db.query(`insert into erp.engagement_staff (engagement_id, user_id, role) values ($1, 'emp2', 'employee')`, [ids.P1]);
    const ticket = async (mission, title, assignee, reporter) =>
      (await one(`insert into erp.task (engagement_id, title, assignee_id, reporter_id, priority) values ($1, $2, $3, $4, 'medium') returning id`, [mission, title, assignee, reporter])).id;
    ids.T1 = await ticket(ids.P1, 'Ticket Un', 'emp', 'mgr');
    ids.T2 = await ticket(ids.P2, 'Ticket Deux', 'emp2', 'mgr2');
    ids.T3 = await ticket(ids.P1, 'Ticket Trois', null, 'emp2');
    await db.query(`insert into work.subtask (task_id, title, assignee_id) values ($1, 'Sous-tâche', 'emp')`, [ids.T2]);
  });
}

const titles = (uid, sql) => as(uid, async () => (await all(sql)).map((r) => r.t).sort());

// ---------------------------------------------------------------------------
await test('missions: numbered per entity, kind from the project kind, the entity currency, a ticket on its mission entity', async () => {
  await office();
  const rows = await all(`select code, kind, currency, entity_id = $1 as audit from erp.engagement order by name`, [ids.bumex_audit]);
  // by name: Deux (IT), Trois (Audit, the second), Un (Audit, the first)
  same(rows.map((r) => [r.code, r.kind, r.currency, r.audit]), [['M-001', 'Mission client', 'MRU', false], ['M-002', 'Mission client', 'MRU', true], ['M-001', 'Mission client', 'MRU', true]], 'missions');
  const t = await one('select entity_id, module, status, created_at::text <> \'\' as stamped from erp.task where id = $1', [ids.T2]);
  if (t.entity_id !== ids.bumex_it || t.module !== 'missions' || t.status !== 'todo') throw new Error(JSON.stringify(t));
  return 'M-001/M-002 per floor, Mission client, MRU; T2 on IT';
});

await test('classes: Vanguard roles read as BUMEX One rules (admin, manager, employee, shareholder, none)', async () => {
  await office();
  const got = {};
  for (const uid of ['adm', 'mgr', 'emp', 'sh', 'out']) got[uid] = await as(uid, async () => (await one('select work.actor_class() c')).c);
  got.system = await asSystem(async () => (await one('select work.actor_class() c')).c);
  same(got, { adm: 'admin', mgr: 'manager', emp: 'employee', sh: 'shareholder', out: 'none', system: 'admin' }, 'classes');
  return Object.entries(got).map(([k, v]) => `${k}=${v}`).join(' ');
});

await test('missions: the floor sees its missions; workers and members of another floor see theirs; nobody else', async () => {
  await office();
  const seen = {};
  for (const uid of ['mgr', 'mgr2', 'emp', 'emp2', 'sh', 'out']) seen[uid] = await titles(uid, 'select name t from erp.engagement');
  same(seen.mgr, ['Mission Trois', 'Mission Un'], 'mgr');
  same(seen.emp, ['Mission Deux', 'Mission Trois', 'Mission Un'], 'emp (floor + sub-task on P2)');
  same(seen.emp2, ['Mission Deux', 'Mission Un'], 'emp2 (an employee of IT on the team of P1, 0015)');
  same(seen.sh, ['Mission Deux', 'Mission Trois', 'Mission Un'], 'sh');
  same(seen.out, [], 'out');
  const edited = await as('emp', async () => (await db.query(`update erp.engagement set description = 'x' where id = $1`, [ids.P1])).affectedRows);
  const byOwner = await as('mgr', async () => (await db.query(`update erp.engagement set description = 'x' where id = $1`, [ids.P1])).affectedRows);
  if (edited !== 0 || byOwner !== 1) throw new Error(`employee edited ${edited}, owner ${byOwner}`);
  const refused = await expectError(() => as('mgr', () => db.query(`insert into erp.engagement (entity_id, owner_id, name, project_kind, deadline) values ($1, 'adm', 'x', 'internal_tool', '2026-12-31')`, [ids.bumex_audit])), /row-level security/);
  return `emp ${seen.emp.length}, emp2 ${seen.emp2.length}; employee edits nothing, owner edits; a manager creates only their own (${refused.slice(0, 30)}…)`;
});

await test('tickets: assignee, sub-task owner, reporter and the mission managers read them; writes follow BUMEX One', async () => {
  await office();
  const seen = {};
  for (const uid of ['mgr', 'emp', 'emp2', 'sh', 'out']) seen[uid] = await titles(uid, 'select title t from erp.task');
  same(seen.mgr, ['Ticket Trois', 'Ticket Un'], 'mgr');
  same(seen.emp, ['Ticket Deux', 'Ticket Un'], 'emp');
  same(seen.emp2, ['Ticket Deux', 'Ticket Trois', 'Ticket Un'], 'emp2 (on the team of P1: its tickets, 0015)');
  same(seen.sh.length, 3, 'sh');
  same(seen.out, [], 'out');
  const reporterMoves = await as('emp2', async () => (await db.query(`update erp.task set stage_id = 'review', status = 'review' where id = $1`, [ids.T3])).affectedRows);
  const strangerMoves = await as('emp', async () => (await db.query(`update erp.task set status = 'review' where id = $1`, [ids.T3])).affectedRows);
  if (reporterMoves !== 1 || strangerMoves !== 0) throw new Error(`reporter ${reporterMoves}, stranger ${strangerMoves}`);
  await expectError(() => as('emp', () => db.query(`insert into erp.task (engagement_id, title) values ($1, 'x')`, [ids.P1])), /row-level security/);
  await as('mgr', () => db.query(`insert into erp.task (engagement_id, title, reporter_id) values ($1, 'Par le manager', 'mgr')`, [ids.P1]));
  await expectError(() => as('mgr', () => db.query(`update erp.task set status = 'done' where id = $1`, [ids.T1])), /check/);
  return 'mgr 2, emp 2, emp2 2, sh 3, out 0; reporter moves, stranger cannot; employee cannot create';
});

await test('sub-tasks: the ticket assignee adds them, an owner ticks theirs and cannot hand it on', async () => {
  await office();
  await as('emp', () => db.query(`insert into work.subtask (task_id, title) values ($1, 'Par l''assigné')`, [ids.T1]));
  await expectError(() => as('emp2', () => db.query(`insert into work.subtask (task_id, title) values ($1, 'x')`, [ids.T1])), /row-level security/);
  const ticked = await as('emp', async () => (await db.query(`update work.subtask set is_done = true where assignee_id = 'emp'`)).affectedRows);
  await expectError(() => as('emp', () => db.query(`update work.subtask set assignee_id = 'adm' where task_id = $1`, [ids.T2])), /row-level security/);
  return `added on T1; ticked ${ticked} on T2; handing it on refused`;
});

await test('clients: account manager, mission managers and the people working on their missions read them', async () => {
  await office();
  same(await titles('mgr', 'select name t from work.client'), ['Client Un'], 'mgr');
  same(await titles('mgr2', 'select name t from work.client'), ['Client Deux'], 'mgr2');
  same(await titles('emp', 'select name t from work.client'), ['Client Deux', 'Client Un'], 'emp');
  same(await titles('emp2', 'select name t from work.client'), ['Client Deux'], 'emp2');
  const edits = await as('mgr2', async () => (await db.query(`update work.client set notes = 'x'`)).affectedRows);
  if (edits !== 0) throw new Error(`mgr2 edited ${edits} (not their account)`);
  return 'mgr K1, mgr2 K2, emp both, emp2 K2; only the account manager edits';
});

await test('comments and notes: who writes where; internal comments hidden from shareholders; note visibility', async () => {
  await office();
  await as('emp', () => db.query(`insert into work.comment (subject_type, subject_id, author_id, body) values ('ticket', $1, 'emp', 'Bonjour')`, [ids.T1]));
  await as('emp', () => db.query(`insert into work.comment (subject_type, subject_id, author_id, body, is_internal) values ('project', $1, 'emp', 'Public', false)`, [ids.P1]));
  await expectError(() => as('emp', () => db.query(`insert into work.comment (subject_type, subject_id, author_id, body) values ('client', $1, 'emp', 'x')`, [ids.K1])), /row-level security/);
  await expectError(() => as('sh', () => db.query(`insert into work.comment (subject_type, subject_id, author_id, body) values ('project', $1, 'sh', 'x')`, [ids.P1])), /row-level security/);
  same(await titles('sh', 'select body t from work.comment'), ['Public'], 'shareholder');
  same(await titles('emp2', 'select body t from work.comment'), ['Bonjour', 'Public'], 'emp2 reads P1 and T1, on the team of P1 (0015)');
  same(await titles('mgr2', 'select body t from work.comment'), [], 'mgr2 does not read P1 nor T1');
  await expectError(() => as('emp', () => db.query(`insert into work.note (subject_type, subject_id, author_id, title, body, visibility) values ('project', $1, 'emp', 'x', 'x', 'management')`, [ids.P1])), /row-level security/);
  await as('emp', () => db.query(`insert into work.note (subject_type, subject_id, author_id, title, body) values ('project', $1, 'emp', 'Équipe', 'x')`, [ids.P1]));
  await as('mgr', () => db.query(`insert into work.note (subject_type, subject_id, author_id, title, body, visibility) values ('project', $1, 'mgr', 'Direction', 'x', 'management')`, [ids.P1]));
  same(await titles('emp', 'select title t from work.note'), ['Équipe'], 'emp notes');
  same(await titles('mgr', 'select title t from work.note'), ['Direction', 'Équipe'], 'mgr notes');
  same(await titles('sh', 'select title t from work.note'), [], 'sh notes');
  return 'employee comments on tickets and projects only; shareholders read public comments; notes by visibility';
});

await test('time: own lines on own floor or worked-on missions; 24 h a day; no future; a sent week is locked', async () => {
  await office();
  const day = '2026-10-19';
  await as('emp', () => db.query(`insert into erp.time_entry (engagement_id, user_id, work_date, minutes, mission) values ($1, 'emp', $2, 60, 'Revue')`, [ids.P1, day]));
  const onIt = await as('emp', async () => (await one(`insert into erp.time_entry (engagement_id, user_id, work_date, minutes) values ($1, 'emp', $2, 30) returning entity_id`, [ids.P2, day])).entity_id);
  if (onIt !== ids.bumex_it) throw new Error('a line takes its mission entity');
  // a member of the team from another floor logs time on it (0015); a manager of another floor who is not, does not
  await as('emp2', () => db.query(`insert into erp.time_entry (engagement_id, user_id, work_date, minutes) values ($1, 'emp2', $2, 30)`, [ids.P1, day]));
  await expectError(() => as('mgr2', () => db.query(`insert into erp.time_entry (engagement_id, user_id, work_date, minutes) values ($1, 'mgr2', $2, 30)`, [ids.P1, day])), /row-level security/);
  await expectError(() => as('emp', () => db.query(`insert into erp.time_entry (engagement_id, user_id, work_date, minutes) values ($1, 'mgr', $2, 30)`, [ids.P1, day])), /row-level security/);
  await expectError(() => as('emp', () => db.query(`insert into erp.time_entry (engagement_id, user_id, work_date, minutes) values ($1, 'emp', $2, 1400)`, [ids.P1, day])), /time_entry_daily_limit/);
  await expectError(() => as('emp', () => db.query(`insert into erp.time_entry (engagement_id, user_id, work_date, minutes) values ($1, 'emp', current_date + 2, 30)`, [ids.P1])), /time_entry_future_date/);
  const hours = (await one(`select sum(hours)::text h from erp.time_entry`)).h;
  await as('emp', () => db.query(`insert into work.timesheet_week (user_id, week_start, entity_id) values ('emp', '2026-10-19', $1)`, [ids.bumex_audit]));
  await expectError(() => as('emp', () => db.query(`insert into erp.time_entry (engagement_id, user_id, work_date, minutes) values ($1, 'emp', '2026-10-20', 30)`, [ids.P1])), /timesheet_week_locked/);
  const mgr2Reviews = await as('mgr2', async () => (await db.query(`update work.timesheet_week set status = 'approved', reviewed_by = 'mgr2', reviewed_at = now() where user_id = 'emp'`)).affectedRows);
  const mgrReviews = await as('mgr', async () => (await db.query(`update work.timesheet_week set status = 'returned', reviewed_by = 'mgr', reviewed_at = now(), review_note = 'Compléter' where user_id = 'emp'`)).affectedRows);
  if (mgr2Reviews !== 0 || mgrReviews !== 1) throw new Error(`mgr2 ${mgr2Reviews}, mgr ${mgrReviews}`);
  const events = await all(`select status, actor_id, note from work.timesheet_week_event order by created_at`);
  same(events.map((e) => [e.status, e.actor_id, e.note]), [['submitted', 'emp', null], ['returned', 'mgr', 'Compléter']], 'week events');
  await as('emp', () => db.query(`insert into erp.time_entry (engagement_id, user_id, work_date, minutes) values ($1, 'emp', '2026-10-20', 30)`, [ids.P1]));
  same(await titles('mgr', `select minutes::text t from erp.time_entry where user_id = 'emp'`), ['30', '60'], 'the Audit manager reads the Audit lines');
  return `${hours} h logged; refusals: other floor, someone else, 24 h, future, sent week; returned week reopens`;
});

await test('notifications: e-mailed unless kept in the app or turned off; claimed once; Monday reminders', async () => {
  await office();
  await asSystem(async () => {
    await db.query(`update work.person set email_notifications = false where id = 'emp2'`);
    for (const [user, skip] of [['emp', false], ['emp2', false], ['mgr', true]]) {
      await db.query(`insert into work.notification (user_id, type, title, body, subject_type, subject_id, skip_email) values ($1, 'assignment', 'T', 'B', 'ticket', $2, $3)`, [user, ids.T1, skip]);
    }
  });
  const queued = (await all('select user_id from work.notification_email')).map((r) => r.user_id);
  same(queued, ['emp'], 'queued');
  const claimed = await asSystem(async () => (await all('select * from work.claim_notification_emails(10)')).length);
  const again = await asSystem(async () => (await all('select * from work.claim_notification_emails(10)')).length);
  if (claimed !== 1 || again !== 0) throw new Error(`claimed ${claimed} then ${again}`);
  const hidden = await as('emp', async () => (await all('select * from work.notification_email')).length);
  if (hidden !== 0) throw new Error('the e-mails are the server\'s');
  const sent = await asSystem(async () => (await one(`select work.queue_weekly_timesheet_reminders('2026-10-19') n`)).n);
  const twice = await asSystem(async () => (await one(`select work.queue_weekly_timesheet_reminders('2026-10-19') n`)).n);
  const reminded = (await all(`select user_id from work.timesheet_auto_reminder order by user_id`)).map((r) => r.user_id);
  same(reminded, ['adm', 'emp', 'emp2', 'mgr', 'mgr2'], 'reminded (not the shareholder, not without access)');
  if (sent !== 5 || twice !== 0) throw new Error(`sent ${sent} then ${twice}`);
  await expectError(() => asSystem(() => db.query(`select work.queue_weekly_timesheet_reminders('2026-10-20')`)), /Monday/);
  return 'one e-mail of three; claimed once; 5 reminders, none twice';
});

await test('clients and customers: one client, two sides, kept in step both ways', async () => {
  await office();
  await asSystem(async () => {
    const ar = (await one(`insert into erp.account (entity_id, code, name_fr, class, kind) values ($1, '411000', 'Clients', 4, 'asset') returning id`, [ids.bumex_audit])).id;
    await db.query(`insert into erp.account_mapping (entity_id, key, account_id) values ($1, 'AR_CONTROL', $2)`, [ids.bumex_audit, ar]);
    // a mission saved again on a floor that now has its chart: its client gets a customer there
    await db.query(`update erp.engagement set description = 'chart ready' where id = $1`, [ids.P1]);
  });
  const c = await one(`select c.id, c.code, c.name, c.client_id, e.customer_id = c.id as linked from erp.customer c join erp.engagement e on e.id = $1`, [ids.P1]);
  if (c.client_id !== ids.K1 || c.name !== 'Client Un' || !c.linked) throw new Error(JSON.stringify(c));
  await as('mgr', () => db.query(`update work.client set name = 'Client Un SA', tax_id = 'NIF1' where id = $1`, [ids.K1]));
  const renamed = await one(`select name, nif from erp.customer where id = $1`, [c.id]);
  same([renamed.name, renamed.nif], ['Client Un SA', 'NIF1'], 'client → customer');
  await asSystem(() => db.query(`update erp.customer set email = 'compta@un.mr' where id = $1`, [c.id]));
  same((await one(`select contact_email from work.client where id = $1`, [ids.K1])).contact_email, 'compta@un.mr', 'customer → client');
  await asSystem(() => db.query(`insert into erp.customer (entity_id, code, name) values ($1, null, 'Client Deux')`, [ids.bumex_audit]));
  await asSystem(() => db.query(`insert into erp.customer (entity_id, code, name, email) values ($1, null, 'Nouveau', 'n@x.mr')`, [ids.bumex_audit]));
  const linked = await all(`select k.name, k.contact_email from erp.customer c join work.client k on k.id = c.client_id order by k.name`);
  same(linked.map((r) => [r.name, r.contact_email]), [['Client Deux', null], ['Client Un SA', 'compta@un.mr'], ['Nouveau', 'n@x.mr']], 'linked');
  return `customer ${c.code} for K1; renames and e-mails follow; a new customer finds or makes its client`;
});

await test('people: everyone with access reads them; super-admin flag and e-mail are the server\'s; the entity set once', async () => {
  await office();
  const n = await as('emp', async () => (await one('select count(*)::int n from work.person')).n);
  const outSees = await titles('out', 'select id t from work.person');
  same(outSees, ['out'], 'without access: themselves');
  await expectError(() => as('emp', () => db.query(`update work.person set is_super_admin = true where id = 'emp'`)), /person_locked_field/);
  await expectError(() => as('emp', () => db.query(`update work.person set entity_code = 'bumex_it' where id = 'emp'`)), /person_entity_locked/);
  await as('adm', () => db.query(`update work.person set entity_code = 'bumex_it' where id = 'emp'`));
  const others = await as('emp', async () => (await db.query(`update work.person set phone = '1' where id = 'mgr'`)).affectedRows);
  const v0 = (await one('select work.version() v')).v;
  await as('emp', () => db.query(`update work.person set phone = '2' where id = 'emp'`));
  const v1 = (await one('select work.version() v')).v;
  if (others !== 0 || !(Number(v1) > Number(v0))) throw new Error(`others ${others}, version ${v0} → ${v1}`);
  return `emp reads ${n}; flags locked; admin moves an entity; the version moves`;
});

await test('writes judged on the row they leave: a note archived by its author; a ticket its assignee cannot hand on (as BUMEX One)', async () => {
  await office();
  await as('emp', () => db.query(`insert into work.note (subject_type, subject_id, author_id, title, body) values ('project', $1, 'emp', 'Équipe', 'x')`, [ids.P1]));
  const archived = await as('emp', async () => (await db.query(`update work.note set archived_at = now() where author_id = 'emp'`)).affectedRows);
  if (archived !== 1) throw new Error(`archived ${archived}`);
  await expectError(() => as('emp', () => db.query(`update erp.task set assignee_id = 'mgr2' where id = $1`, [ids.T1])), /row-level security/);
  const byManager = await as('mgr', async () => (await db.query(`update erp.task set assignee_id = 'emp2' where id = $1`, [ids.T1])).affectedRows);
  if (byManager !== 1) throw new Error(`manager reassigned ${byManager}`);
  return 'note archived; the assignee hands nothing on, the mission manager reassigns';
});

await test('old finance: read only, even for an administrator', async () => {
  await office();
  await expectError(() => as('adm', () => db.query(`insert into work.finance_invoice (id, invoice_number, status, created_at, updated_at) values (gen_random_uuid(), 'X', 'paid', now(), now())`)), /permission denied/);
  await db.query(`insert into work.finance_invoice (id, invoice_number, client_id, status, created_at, updated_at) values (gen_random_uuid(), 'INV-1', $1, 'paid', now(), now())`, [ids.K1]);
  same(await titles('mgr', 'select invoice_number t from work.finance_invoice'), ['INV-1'], 'account manager');
  same(await titles('emp', 'select invoice_number t from work.finance_invoice'), [], 'employee');
  return 'no writes for the application; the account manager reads K1\'s invoice';
});

await test('review fixes: no session is no one, even in the helpers; the triggers\' functions are not callable', async () => {
  await office();
  await db.exec('begin');
  await db.exec('set local role erp_app');
  const none = await one(`select (select count(*)::int from work.client) clients, (select count(*)::int from erp.engagement) missions,
                                 (select count(*)::int from erp.task) tickets, (select count(*)::int from work.subtask) subtasks,
                                 work.mission_hours($1) hours, work.can_read_client($2) reads`, [ids.P1, ids.K1]);
  await db.exec('rollback');
  same([none.clients, none.missions, none.tickets, none.subtasks, none.hours, none.reads], [0, 0, 0, 0, null, false], 'no session');
  await expectError(() => as('emp', () => db.query('select erp.ensure_customer($1, $2)', [ids.bumex_it, ids.K2])), /permission denied/);
  await expectError(() => as('adm', () => db.query('select erp.time_entry_guard()')), /permission denied/);
  const hidden = await as('out', async () => (await one('select work.mission_hours($1) h, work.mission_staff($1) s', [ids.P1])));
  if (hidden.h !== null || hidden.s !== null) throw new Error('figures of a mission one does not see');
  return 'nothing without a session; ensure_customer and the guards refused; no figures of unseen missions';
});

await test('review fixes: people, documents, notifications and weeks', async () => {
  await office();
  await asSystem(() => db.query(`insert into work.person (id, email, full_name) values ('ptn', 'ptn@bumex.mr', 'Partner')`));
  await asSystem(() => db.query(`insert into erp.user_access (user_id, erp_role) values ('ptn', 'partner')`));
  await expectError(() => as('ptn', () => db.query(`insert into work.person (id, email, full_name, is_super_admin) values ('x9', 'x9@bumex.mr', 'X', true)`)), /row-level security/);
  const removed = await as('adm', async () => (await db.query(`delete from work.person where id = 'out'`)).affectedRows);
  if (removed !== 0) throw new Error('an administrator deleted a person');
  // a manager manages the files of their mission, "shareholders" ones too
  const doc = await as('mgr', async () => (await one(`insert into work.document (title, related_type, related_id, file_url, file_name, uploaded_by, visibility)
                                                       values ('Pour les actionnaires', 'project', $1, 'f', 'f.pdf', 'mgr', 'shareholders') returning id`, [ids.P1])).id);
  const edited = await as('mgr', async () => (await db.query(`update work.document set title = 'Bilan' where id = $1`, [doc])).affectedRows);
  if (edited !== 1) throw new Error('the manager could not edit it');
  await expectError(() => as('out', () => db.query(`insert into work.notification (user_id, type, title, body) values ('adm', 'system', 'x', 'y')`)), /row-level security/);
  await as('emp', () => db.query(`insert into work.timesheet_week (user_id, week_start, entity_id) values ('emp', '2026-10-19', $1)`, [ids.bumex_audit]));
  await expectError(() => as('emp', () => db.query(`update work.timesheet_week set status = 'approved', reviewed_by = 'emp', reviewed_at = now() where user_id = 'emp'`)), /row-level security/);
  return 'no super admin by insert, no deletion, a manager edits a shareholders document, no notification from no one, no self-approval';
});

await test('review fixes: the time guard reveals nothing of others; a line leaves no locked week', async () => {
  await office();
  await asSystem(() => db.query(`insert into erp.time_entry (engagement_id, user_id, work_date, minutes) values ($1, 'mgr', '2026-10-13', 1400)`, [ids.P1]));
  // the same refusal whatever the other person's day holds
  const a = await expectError(() => as('emp', () => db.query(`insert into erp.time_entry (engagement_id, user_id, work_date, minutes) values ($1, 'mgr', '2026-10-13', 30)`, [ids.P1])), /row-level security/);
  const b = await expectError(() => as('emp', () => db.query(`insert into erp.time_entry (engagement_id, user_id, work_date, minutes) values ($1, 'mgr', '2026-10-13', 50)`, [ids.P1])), /row-level security/);
  if (a !== b) throw new Error(`${a} / ${b}`);
  const line = await as('emp', async () => (await one(`insert into erp.time_entry (engagement_id, user_id, work_date, minutes) values ($1, 'emp', '2026-10-13', 60) returning id`, [ids.P1])).id);
  await as('emp', () => db.query(`insert into work.timesheet_week (user_id, week_start, entity_id) values ('emp', '2026-10-12', $1)`, [ids.bumex_audit]));
  await expectError(() => as('emp', () => db.query(`update erp.time_entry set work_date = '2026-10-20' where id = $1`, [line])), /timesheet_week_locked/);
  return 'others\' days stay unknown; a line cannot move out of a sent week';
});

await test('review fixes: missions keep their floor; no client, no customer; odd customers leave clients alone', async () => {
  await office();
  await asSystem(async () => {
    const ar = (await one(`insert into erp.account (entity_id, code, name_fr, class, kind) values ($1, '411000', 'Clients', 4, 'asset') returning id`, [ids.bumex_audit])).id;
    await db.query(`insert into erp.account_mapping (entity_id, key, account_id) values ($1, 'AR_CONTROL', $2), ($1, 'AR_GROUP', $2)`, [ids.bumex_audit, ar]);
    await db.query(`update erp.engagement set description = 'chart' where id = $1`, [ids.P1]);
  });
  await expectError(() => as('mgr', () => db.query(`update erp.engagement set entity_id = $2 where id = $1`, [ids.P1, ids.bumex_it])), /mission_entity_locked/);
  await as('mgr', () => db.query(`update erp.engagement set client_id = null where id = $1`, [ids.P1]));
  same((await one('select customer_id from erp.engagement where id = $1', [ids.P1])).customer_id, null, 'no client, no customer');
  await asSystem(async () => {
    await db.query(`insert into erp.customer (entity_id, code, name, email) values ($1, null, 'Sans arobase', 'pas-un-email')`, [ids.bumex_audit]);
    await db.query(`insert into erp.customer (entity_id, code, name, group_entity_id) values ($1, null, 'BUMEX IT (groupe)', $2)`, [ids.bumex_audit, ids.bumex_it]);
  });
  const clients = (await all(`select name, contact_email from work.client order by name`)).map((c) => [c.name, c.contact_email]);
  same(clients.filter(([n]) => ['Sans arobase', 'BUMEX IT (groupe)'].includes(n)), [['Sans arobase', null]], 'clients made');
  return 'floor locked; customer cleared with the client; an e-mail without @ and a group company handled';
});

await test('test floor (0011): hidden from whoever lacks it, whatever their role; no e-mail; time apart; clients never mixed', async () => {
  await office();
  await asSystem(async () => {
    await db.query(`insert into work.person (id, email, full_name, entity_code) values ('tst', 'tst@bumex.mr', 'Testeur', 'bumex_audit')`);
    await db.query(`insert into erp.user_access (user_id, erp_role, entity_codes, test_floor) values ('tst', 'staff', '{bumex_audit}', true)`);
    ids.KT = (await one(`insert into work.client (name, status, is_test) values ('Client Test', 'active', true) returning id`)).id;
    ids.PT = (await one(`insert into erp.engagement (entity_id, owner_id, client_id, name, project_kind, status, deadline) values ($1, 'tst', $2, 'Mission Test', 'client_mission', 'active', '2026-12-31') returning id`,
      [ids.bumex_testing, ids.KT])).id;
    ids.TT = (await one(`insert into erp.task (engagement_id, title, assignee_id, reporter_id, priority) values ($1, 'Ticket Test', 'tst', 'tst', 'medium') returning id`, [ids.PT])).id;
    for (const user of ['tst', 'adm']) {
      await db.query(`insert into work.notification (user_id, type, title, body, subject_type, subject_id) values ($1, 'assignment', 'T', 'B', 'ticket', $2)`, [user, ids.TT]);
    }
  });
  const sees = (uid, open = asTest) => open(uid, async () => ({
    mission: (await all(`select 1 from erp.engagement where id = $1`, [ids.PT])).length,
    ticket: (await all(`select 1 from erp.task where id = $1`, [ids.TT])).length,
    client: (await all(`select 1 from work.client where id = $1`, [ids.KT])).length,
    notes: (await all(`select 1 from work.notification where subject_id = $1::text`, [ids.TT])).length,
    floor: (await one(`select erp.can_see_entity($1) s`, [ids.bumex_testing])).s,
  }));
  same(await sees('adm'), { mission: 0, ticket: 0, client: 0, notes: 0, floor: false }, 'an administrator without the floor');
  same(await sees('sh'), { mission: 0, ticket: 0, client: 0, notes: 0, floor: false }, 'a shareholder');
  same(await sees('tst'), { mission: 1, ticket: 1, client: 1, notes: 1, floor: true }, 'the tester, in test mode');
  await asSystem(() => db.query(`update erp.user_access set test_floor = true where user_id = 'adm'`));
  same(await sees('adm'), { mission: 1, ticket: 1, client: 1, notes: 2, floor: true }, 'the administrator given the floor, in test mode');
  same((await all('select user_id from work.notification_email')).length, 0, 'no e-mail about a test record');
  // time: the tester's real week sent, a test line still goes in; a real one does not
  await asTest('tst', () => db.query(`insert into erp.time_entry (engagement_id, user_id, work_date, minutes) values ($1, 'tst', '2026-10-19', 60)`, [ids.PT]));
  await as('tst', () => db.query(`insert into work.timesheet_week (user_id, week_start, entity_id) values ('tst', '2026-10-19', $1)`, [ids.bumex_audit]));
  await asTest('tst', () => db.query(`insert into erp.time_entry (engagement_id, user_id, work_date, minutes) values ($1, 'tst', '2026-10-20', 30)`, [ids.PT]));
  await expectError(() => as('tst', () => db.query(`insert into erp.time_entry (engagement_id, user_id, work_date, minutes) values ($1, 'tst', '2026-10-20', 30)`, [ids.P3])), /timesheet_week_locked/);
  await asSystem(() => db.query(`update erp.user_access set test_floor = false where user_id = 'adm'`));
  same(await as('adm', async () => (await all(`select 1 from erp.time_entry where user_id = 'tst'`)).length), 0, 'test time hidden from the administrator');
  // clients: a test customer named like a real client gets a test client; renaming it leaves the real one
  await asSystem(async () => {
    const ar = (await one(`insert into erp.account (entity_id, code, name_fr, class, kind) values ($1, '411000', 'Clients', 4, 'asset') returning id`, [ids.bumex_testing])).id;
    await db.query(`insert into erp.account_mapping (entity_id, key, account_id) values ($1, 'AR_CONTROL', $2)`, [ids.bumex_testing, ar]);
    await db.query(`insert into erp.customer (entity_id, code, name) values ($1, null, 'Client Un')`, [ids.bumex_testing]);
    await db.query(`update erp.customer set name = 'Client Un bis' where entity_id = $1 and name = 'Client Un'`, [ids.bumex_testing]);
  });
  same((await all(`select name, is_test from work.client where lower(name) like 'client un%' order by name`)).map((c) => [c.name, c.is_test]), [['Client Un', false], ['Client Un bis', true]], 'clients kept apart');
  await expectError(() => asSystem(() => db.query(`insert into erp.engagement (entity_id, owner_id, client_id, name) values ($1, 'tst', $2, 'X')`, [ids.bumex_testing, ids.K1])), /test_client_mismatch/);
  await expectError(() => asSystem(() => db.query(`update erp.engagement set client_id = $2 where id = $1`, [ids.P1, ids.KT])), /test_client_mismatch/);
  await expectError(() => asSystem(() => db.query(`insert into work.contract (client_id, engagement_id, title) values ($1, $2, 'C')`, [ids.KT, ids.P1])), /test_client_mismatch/);
  // access: the floor is test_floor, never an entity code; its parts only with it
  await expectError(() => asSystem(() => db.query(`update erp.user_access set entity_codes = '{bumex_testing}' where user_id = 'emp'`)), /unknown entity code/);
  await expectError(() => asSystem(() => db.query(`update erp.user_access set entity_modules = '{"bumex_testing": ["accounting"]}' where user_id = 'emp'`)), /wrong modules/);
  await asSystem(() => db.query(`update erp.user_access set entity_modules = '{"bumex_testing": ["accounting"]}' where user_id = 'tst'`));
  return 'hidden from admin/shareholder, seen by testers; 0 e-mails; test time past a sent week; clients, missions, contracts apart; access checked';
});

await test('test mode (0013): test data only in test mode, and then only test data; no test mode without the floor', async () => {
  await office();
  await asSystem(async () => {
    await db.query(`insert into work.person (id, email, full_name, entity_code) values ('tst', 'tst@bumex.mr', 'Testeur', 'bumex_audit')`);
    await db.query(`insert into erp.user_access (user_id, erp_role, entity_codes, test_floor) values ('tst', 'admin', null, true)`);
    ids.KT = (await one(`insert into work.client (name, status, is_test) values ('Client Test', 'active', true) returning id`)).id;
    ids.PT = (await one(`insert into erp.engagement (entity_id, owner_id, client_id, name, project_kind, status, deadline) values ($1, 'tst', $2, 'Mission Test', 'client_mission', 'active', '2026-12-31') returning id`,
      [ids.bumex_testing, ids.KT])).id;
    ids.TT = (await one(`insert into erp.task (engagement_id, title, assignee_id, reporter_id, priority) values ($1, 'Ticket Test', 'tst', 'tst', 'medium') returning id`, [ids.PT])).id;
    await db.query(`insert into erp.task (engagement_id, title, assignee_id, reporter_id, priority) values ($1, 'Ticket Réel', 'tst', 'mgr', 'medium')`, [ids.P1]);
    for (const [kind, subject] of [['ticket', ids.TT], ['ticket', ids.T1]]) {
      await db.query(`insert into work.notification (user_id, type, title, body, subject_type, subject_id) values ('tst', 'assignment', 'T', 'B', $1, $2)`, [kind, subject]);
    }
    await db.query(`insert into erp.time_entry (engagement_id, user_id, work_date, minutes) values ($1, 'tst', '2026-10-21', 60), ($2, 'tst', '2026-10-21', 90)`, [ids.PT, ids.P1]);
  });
  const view = (open, uid) => open(uid, async () => ({
    mode: (await one('select work.in_test() m')).m,
    tickets: (await all(`select title from erp.task where assignee_id = $1 order by title`, [uid])).map((r) => r.title),
    missions: (await all(`select name from erp.engagement where id = any($1::uuid[]) order by name`, [[ids.PT, ids.P1]])).map((r) => r.name),
    clients: (await all(`select name from work.client where id = any($1::uuid[]) order by name`, [[ids.KT, ids.K1]])).map((r) => r.name),
    notes: (await all(`select subject_id from work.notification where user_id = $1`, [uid])).length,
    minutes: (await all(`select minutes from erp.time_entry where user_id = $1 order by minutes`, [uid])).map((r) => r.minutes),
    testFloor: (await one(`select erp.can_see_entity($1) s`, [ids.bumex_testing])).s,
    audit: (await one(`select erp.can_see_entity($1) s`, [ids.bumex_audit])).s,
  }));
  same(await view(as, 'tst'), { mode: false, tickets: ['Ticket Réel'], missions: ['Mission Un'], clients: ['Client Un'], notes: 1, minutes: [90], testFloor: false, audit: true },
    'a tester in normal mode: no test record');
  same(await view(asTest, 'tst'), { mode: true, tickets: ['Ticket Test'], missions: ['Mission Test'], clients: ['Client Test'], notes: 1, minutes: [60], testFloor: true, audit: false },
    'the tester in test mode: only test records');
  same((await asTest('emp', async () => ({ mode: (await one('select work.in_test() m')).m, tickets: (await all(`select 1 from erp.task`)).length > 0 }))), { mode: false, tickets: true },
    'no test mode without the floor');
  // writes follow: no real ticket in test mode, no test ticket in normal mode
  await expectError(() => asTest('tst', () => db.query(`insert into erp.task (engagement_id, title, assignee_id, reporter_id) values ($1, 'X', 'tst', 'tst')`, [ids.P1])), /row-level security|not allowed|violates/);
  await expectError(() => as('tst', () => db.query(`insert into erp.task (engagement_id, title, assignee_id, reporter_id) values ($1, 'X', 'tst', 'tst')`, [ids.PT])), /row-level security|not allowed|violates/);
  await asTest('tst', () => db.query(`insert into erp.task (engagement_id, title, assignee_id, reporter_id) values ($1, 'Ticket Test 2', 'tst', 'tst')`, [ids.PT]));
  same((await asSystem(async () => (await all(`select 1 from erp.task`)).length)) > 4, true, 'the system sees every ticket');
  return 'normal mode hides test records from a tester-admin; test mode shows only them; no mode without the floor; writes follow';
});

await test('time (0013): a person removes their own line of an open week, not of a sent one nor anyone else\'s', async () => {
  await office();
  const line = (uid, date) => as(uid, async () => (await one(`insert into erp.time_entry (engagement_id, user_id, work_date, minutes) values ($1, $2, $3, 60) returning id`, [ids.P1, uid, date])).id);
  const open = await line('emp', '2026-10-21');
  const sent = await line('emp', '2026-10-14');
  await as('emp', () => db.query(`insert into work.timesheet_week (user_id, week_start, entity_id) values ('emp', '2026-10-12', $1)`, [ids.bumex_audit]));
  same(await as('mgr', async () => (await db.query('delete from erp.time_entry where id = $1', [open])).affectedRows), 0, "a manager removes no one else's line");
  await expectError(() => as('emp', () => db.query('delete from erp.time_entry where id = $1', [sent])), /timesheet_week_locked/);
  same(await as('emp', async () => (await db.query('delete from erp.time_entry where id = $1', [open])).affectedRows), 1, 'their own line of an open week');
  same((await asSystem(async () => (await all('select id from erp.time_entry where user_id = $1', ['emp'])).map((r) => r.id))), [sent], 'the sent one stays');
  return 'own open line removed; sent week locked; others untouched';
});

await test('tickets (0012): keys per floor, renumbered on another floor; every field change in the history', async () => {
  await office();
  const keys = async () => Object.fromEntries((await all(`select title, work.task_key(id) k from erp.task order by title`)).map((r) => [r.title, r.k]));
  same(await keys(), { 'Ticket Deux': 'IT-1', 'Ticket Trois': 'AUD-2', 'Ticket Un': 'AUD-1' }, 'numbered in creation order');
  const t4 = await as('mgr', async () => (await one(`insert into erp.task (engagement_id, title, assignee_id, reporter_id) values ($1, 'Ticket Quatre', 'emp', 'mgr') returning id`, [ids.P1])).id);
  same((await one('select work.task_key($1) k', [t4])).k, 'AUD-3', 'the next number');
  await expectError(() => asSystem(() => db.query('update erp.task set number = 9 where id = $1', [ids.T1])), /task_number_immutable/);
  await as('mgr', () => db.query(
    `update erp.task set priority = 'high', estimated_hours = 6, notes = 'Le texte', labels = '{RH,Démo}', due_date = '2026-11-30', status = 'in_progress' where id = $1`, [ids.T1]));
  const rows = await all(`select user_id, metadata from work.activity where subject_type = 'task' and subject_id = $1 order by metadata->>'field'`, [ids.T1]);
  same(rows.map((r) => [r.user_id, r.metadata.field, r.metadata.from, r.metadata.to]), [
    ['mgr', 'due_date', null, '2026-11-30'], ['mgr', 'estimated_hours', null, 6], ['mgr', 'labels', [], ['RH', 'Démo']],
    ['mgr', 'notes', null, null], ['mgr', 'priority', 'medium', 'high'],
  ], 'one line per field, the stage apart, no description text');
  await expectError(() => as('mgr', () => db.query(`update erp.task set labels = '{" RH"}' where id = $1`, [ids.T1])), /task_labels_check/);
  // moved to the IT floor: IT's next number, the old key in its history
  await asSystem(() => db.query('update erp.task set engagement_id = $2 where id = $1', [ids.T3, ids.P2]));
  same((await one('select work.task_key($1) k', [ids.T3])).k, 'IT-2', 'renumbered');
  const moved = await one(`select metadata from work.activity where subject_id = $1 and metadata->>'field' = 'key'`, [ids.T3]);
  same([moved.metadata.from, moved.metadata.to], ['AUD-2', 'IT-2'], 'the old key kept');
  return 'AUD-1/2, IT-1, AUD-3 next; 5 fields logged by mgr; AUD-2 → IT-2';
});

await test('tickets (0012): links both ways; time on a ticket, its total and work log; attachments by its people', async () => {
  await office();
  await as('mgr', () => db.query(`insert into work.task_link (from_task, to_task, kind) values ($1, $2, 'blocks')`, [ids.T1, ids.T3]));
  await expectError(() => as('mgr', () => db.query(`insert into work.task_link (from_task, to_task, kind) values ($1, $2, 'blocks')`, [ids.T1, ids.T3])), /duplicate key/);
  await expectError(() => as('mgr', () => db.query(`insert into work.task_link (from_task, to_task, kind) values ($1, $1, 'relates')`, [ids.T1])), /check constraint/);
  await expectError(() => as('sh', () => db.query(`insert into work.task_link (from_task, to_task, kind) values ($1, $2, 'relates')`, [ids.T3, ids.T1])), /row-level security/);
  same(await as('sh', async () => (await all('select kind from work.task_link')).map((r) => r.kind)), ['blocks'], 'a reader sees the link');
  const logged = await all(`select subject_id, metadata->>'direction' d, metadata->>'other_key' k from work.activity where metadata->>'kind' = 'link' order by d`);
  same(logged.map((r) => [r.subject_id === ids.T3 ? 'T3' : 'T1', r.d, r.k]), [['T3', 'in', 'AUD-1'], ['T1', 'out', 'AUD-2']], 'logged on both tickets');
  // a test ticket never links to a real one
  const testTask = await asSystem(async () => {
    const p = (await one(`insert into erp.engagement (entity_id, owner_id, name, project_kind, status, deadline) values ($1, 'adm', 'Essai', 'client_mission', 'active', '2026-12-31') returning id`, [ids.bumex_testing])).id;
    return (await one(`insert into erp.task (engagement_id, title) values ($1, 'Essai') returning id`, [p])).id;
  });
  await expectError(() => asSystem(() => db.query(`insert into work.task_link (from_task, to_task, kind) values ($1, $2, 'relates')`, [ids.T1, testTask])), /test_task_mismatch/);
  // time on a ticket of the entry's mission only
  await as('emp', () => db.query(`insert into erp.time_entry (engagement_id, task_id, user_id, work_date, minutes, description) values ($1, $2, 'emp', '2026-10-20', 90, 'Revue')`, [ids.P1, ids.T1]));
  await expectError(() => as('emp', () => db.query(`insert into erp.time_entry (engagement_id, task_id, user_id, work_date, minutes) values ($1, $2, 'emp', '2026-10-20', 30)`, [ids.P1, ids.T2])), /time_entry_task_mismatch/);
  same(await as('sh', async () => (await one('select work.task_logged_minutes($1) m', [ids.T1])).m), 90, 'the total, for a reader of the ticket');
  same(await as('mgr2', async () => (await one('select work.task_logged_minutes($1) m', [ids.T1])).m), 0, 'nothing for someone who cannot read it');
  same(await as('mgr', async () => (await all('select user_id, minutes, note from work.task_worklog($1)', [ids.T1])).map((r) => [r.user_id, r.minutes, r.note])), [['emp', 90, 'Revue']], 'the work log');
  // attachments: the assignee (and reporter) of the ticket, not another employee
  const can = (uid, task) => as(uid, async () => (await one(`select work.can_manage_document('task', $1) c`, [task])).c);
  same([await can('emp', ids.T1), await can('emp2', ids.T1), await can('emp2', ids.T3)], [true, false, true], 'emp on T1; emp2 not on T1, but reporter of T3');
  return 'link logged both ways, no duplicate/self/reader/test mix; 90 min on T1 for readers; attachments by assignee and reporter';
});

// ---------------------------------------------------------------------------
await test('0014: one board per floor, from its model; its floor reads it, its managers and the administrators change it', async () => {
  await office();
  const names = async (code) => (await one(`select array_agg(s->>'name' order by (s->>'position')::int) n from work.floor_board f, jsonb_array_elements(f.stages) s where f.entity_id = $1`, [ids[code]])).n;
  same(await names('bumex_audit'), ['Planification', 'Terrain', 'Revue', 'Rapport', 'Terminé'], 'audit');
  same(await names('bumex_it'), ['To Do', 'Ready to implement', 'Pending', 'In progress', 'Code review', 'Ready for test', 'Test', 'To merge', 'Done'], 'it');
  same(await names('bumex_holding'), ['À faire', 'En cours', 'En revue', 'Terminé'], 'holding');
  const reads = async (uid) => as(uid, async () => (await all('select e.code from work.floor_board f join erp.entity e on e.id = f.entity_id order by e.code')).map((r) => r.code));
  same(await reads('mgr'), ['bumex_audit'], 'a manager reads their floor');
  same(await reads('emp'), ['bumex_audit', 'bumex_it'], 'an employee reads theirs, and the floor of a mission they work on');
  same(await reads('out'), [], 'no access, no board');
  const rename = (uid, code) => as(uid, async () => (await db.query(`update work.floor_board set stages = stages where entity_id = $1`, [ids[code]])).affectedRows);
  same([await rename('mgr', 'bumex_audit'), await rename('mgr', 'bumex_it'), await rename('emp', 'bumex_audit'), await rename('mgr2', 'bumex_it'), await rename('adm', 'bumex_audit')], [1, 0, 0, 1, 1], 'who changes');
  const created = await asSystem(async () => {
    const g = (await one('select group_id from erp.entity limit 1')).group_id;
    const e = (await one(`insert into erp.entity (group_id, code, name, country, functional_currency, coa_template) values ($1, 'bumex_new', 'BUMEX Nouveau', 'MR', 'MRU', 'PCM') returning id`, [g])).id;
    return (await one(`select jsonb_array_length(stages) n from work.floor_board where entity_id = $1`, [e])).n;
  });
  same(created, 4, 'a new floor gets the standard board');
  return 'audit/IT/standard models; read by the floor and its workers; changed by its managers and the administrators; new floors get one';
});

await test('0014: every ticket on its floor\'s stage of the same name and status, else the first of its status; no status changes', async () => {
  const files = readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort();
  db = new PGlite();
  await db.exec(files.filter((f) => f < '0014').map((f) => readFileSync(join(migrations, f), 'utf8')).join('\n'));
  const entity = Object.fromEntries((await all('select code, id from erp.entity')).map((r) => [r.code, r.id]));
  const t = {};
  await asSystem(async () => {
    await db.query(`insert into work.person (id, email, full_name, entity_code) values ('mgr', 'mgr@bumex.mr', 'Manager', 'bumex_audit')`);
    const mission = async (code) => (await one(`insert into erp.engagement (entity_id, owner_id, name, project_kind, status, deadline) values ($1, 'mgr', 'M', 'internal_tool', 'active', '2026-12-31') returning id`, [entity[code]])).id;
    const audit = await mission('bumex_audit');
    const it = await mission('bumex_it');
    const st = (id, name, category, done = false) => ({ id, name, category, is_completed: done, is_default: id === 'todo', position: 0, archived_at: null });
    await db.query(`insert into work.board (engagement_id, stages) values ($1, $2)`, [audit, JSON.stringify([st('todo', 'À faire', 'todo'), st('stg_field', 'terrain', 'in_progress'), st('stg_rev', 'En révision', 'review'), st('stg_wait', 'Attente client', 'blocked'), st('stg_rep', ' RAPPORT', 'review'), st('done', 'Terminé', 'in_progress', true)])]);
    const ticket = async (mission, status, stage) => (await one(`insert into erp.task (engagement_id, title, status, stage_id, completed_at) values ($1, 'x', $2, $3, case when $2 = 'done' then now() end) returning id`, [mission, status, stage])).id;
    t.field = await ticket(audit, 'in_progress', 'stg_field');
    t.rev = await ticket(audit, 'review', 'stg_rev');
    t.wait = await ticket(audit, 'blocked', 'stg_wait');
    t.rep = await ticket(audit, 'review', 'stg_rep');
    t.done = await ticket(audit, 'done', 'done');
    t.plain = await ticket(audit, 'todo', null);
    t.it = await ticket(it, 'review', null);
  });
  await db.exec(readFileSync(join(migrations, files.find((f) => f.startsWith('0014'))), 'utf8'));
  const got = {};
  for (const [k, id] of Object.entries(t)) got[k] = Object.values(await one('select stage_id, status from erp.task where id = $1', [id]));
  same(got, { field: ['in_progress', 'in_progress'], rev: ['review', 'review'], wait: ['blocked', 'blocked'], rep: ['aud_report', 'review'], done: ['done', 'done'], plain: ['todo', 'todo'], it: ['review', 'review'] }, 'remapped');
  const audit = (await one(`select array_agg(s->>'name' order by (s->>'position')::int) n from work.floor_board f, jsonb_array_elements(f.stages) s where f.entity_id = $1`, [entity.bumex_audit])).n;
  same(audit, ['Planification', 'Terrain', 'Revue', 'Rapport', 'Bloqué', 'Terminé'], 'the audit floor gains Bloqué, its blocked ticket keeps its status');
  return 'terrain → Terrain, " RAPPORT" → Rapport (not Revue) by name; En révision → Revue by status; blocked kept (Bloqué added); done, plain and IT by status';
});

// ---------------------------------------------------------------------------
await test('0016: a mission with tickets is at its share done, whatever its manual progress; without tickets, the manual one', async () => {
  await office();
  await asSystem(async () => {
    await db.query('update erp.engagement set manual_progress = 100 where id = any($1::uuid[])', [[ids.P1, ids.P3]]);
    await db.query("update erp.task set status = 'done', completed_at = now() where id = $1", [ids.T1]);
  });
  const progress = (p) => as('adm', async () => (await one('select work.mission_progress($1) p', [p])).p);
  same([await progress(ids.P1), await progress(ids.P3)], [50, 100], 'P1 (1 of 2 done, manual 100 ignored), P3 (no ticket: manual)');
  return 'P1 50 % (not its manual 100), P3 100 % (manual, no ticket)';
});

// ---------------------------------------------------------------------------
let failed = 0;
for (const r of results) {
  if (!r.ok) failed += 1;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.slice(0, 84).padEnd(84)}  ${r.note}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
