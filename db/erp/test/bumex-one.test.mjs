// BUMEX ERP — guarantees of migration 0004 (the ERP inside BUMEX One), run on PGlite like guarantees.test.mjs.
// Every check goes through the application's path: a transaction, `set local role erp_app`, then
// erp.open_session(<Firebase uid>) or erp.open_system_session(<actor>).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const migrations = join(here, '..', 'migrations');
const DDL = readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(join(migrations, f), 'utf8')).join('\n');

const BUMEX_ONE_CODES = ['bumex_holding', 'bumex_sa', 'bumex_audit', 'bumex_advisory', 'bumex_mauritanie', 'bumex_avocat', 'bumex_it', 'bumex_maroc'];

const results = [];
let db;

async function fresh() {
  db = new PGlite();
  await db.exec(DDL);
  const ids = {};
  for (const r of (await db.query('select id, code from erp.entity')).rows) ids[r.code] = r.id;
  return ids;
}

async function one(sql, params = []) {
  return (await db.query(sql, params)).rows[0];
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
const asUser = (uid, fn) => within(() => db.query('select erp.open_session($1)', [uid]), fn);
const asSystem = (actor, fn) => within(() => db.query('select erp.open_system_session($1)', [actor]), fn);

const grant = (uid, role, entities = null, modules = null) =>
  db.query('insert into erp.user_access (user_id, erp_role, entity_codes, modules) values ($1, $2, $3, $4)', [uid, role, entities, modules]);

// rows of a table that follows its entity (tasks follow the work's rules since 0008: work.test.mjs)
async function addTasks(ids) {
  await asSystem('seed', async () => {
    for (const code of ['bumex_audit', 'bumex_it']) {
      await db.query(`insert into erp.approval_policy (entity_id, document_type, required_role) values ($1, $2, 'partner')`, [ids[code], `task ${code}`]);
    }
  });
}

async function expectError(fn, pattern) {
  try {
    await fn();
  } catch (err) {
    if (pattern.test(err.message)) return err.message.split('\n')[0];
    throw new Error(`wrong error: ${err.message}`);
  }
  throw new Error(`expected an error matching ${pattern}, got none`);
}

const same = (got, want, what) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

async function test(name, fn) {
  try {
    const note = await fn();
    results.push({ name, ok: true, note: note ?? '' });
  } catch (err) {
    results.push({ name, ok: false, note: err.message });
  }
}

// ---------------------------------------------------------------------------
await test('entities: the eight BUMEX One codes, Maroc on CGNC / MAD, OHADA chart accepted', async () => {
  const ids = await fresh();
  const codes = (await db.query('select code from erp.entity order by floor_order')).rows.map((r) => r.code);
  if (JSON.stringify(codes) !== JSON.stringify(BUMEX_ONE_CODES)) throw new Error(codes.join(','));
  const ma = await one(`select country, functional_currency, coa_template from erp.entity where code = 'bumex_maroc'`);
  if (ma.country !== 'MA' || ma.functional_currency !== 'MAD' || ma.coa_template !== 'CGNC') throw new Error(JSON.stringify(ma));
  const hold = await one(`select is_holding from erp.entity where id = $1`, [ids.bumex_holding]);
  if (!hold.is_holding) throw new Error('holding flag');
  await db.query(`insert into erp.entity (group_id, code, name, country, functional_currency, coa_template)
                  select group_id, 'ohada_test', 'Test OHADA', 'SN', 'EUR', 'SYSCOHADA' from erp.entity limit 1`);
  const m0004 = readFileSync(join(migrations, '0004_bumex_one.sql'), 'utf8');
  await db.exec(m0004.slice(m0004.indexOf('-- 6. The group'))); // the seed is idempotent
  const n = await one('select count(*)::int n from erp.entity');
  return `${codes.length} entities, Maroc CGNC/MAD, SYSCOHADA ok, seed re-run keeps ${n.n}`;
});

await test('access: no access row = no ERP (role none, nothing visible)', async () => {
  const ids = await fresh();
  await addTasks(ids);
  const seen = await asUser('nobody', async () => {
    const role = await one(`select current_setting('erp.actor_role') r`);
    const n = await one('select count(*)::int n from erp.approval_policy');
    return { role: role.r, n: n.n };
  });
  if (seen.role !== 'none' || seen.n !== 0) throw new Error(JSON.stringify(seen));
  return 'role none, 0 of 2 tasks';
});

await test('access: a partner given one entity sees that entity only (0001 let every partner see all)', async () => {
  const ids = await fresh();
  await addTasks(ids);
  await asSystem('admin-uid', () => grant('u_partner', 'partner', ['bumex_audit']));
  const titles = await asUser('u_partner', async () => (await db.query('select document_type as title from erp.approval_policy')).rows.map((r) => r.title));
  if (titles.length !== 1 || titles[0] !== 'task bumex_audit') throw new Error(titles.join(','));
  const refused = await expectError(
    () => asUser('u_partner', () => db.query(`insert into erp.approval_policy (entity_id, document_type, required_role) values ($1, 'x', 'partner')`, [ids.bumex_it])),
    /row-level security/,
  );
  return `sees 1 of 2; writing to BUMEX IT refused (${refused.slice(0, 40)}…)`;
});

await test('access: no entity list = every entity', async () => {
  const ids = await fresh();
  await addTasks(ids);
  await asSystem('admin-uid', () => grant('u_raf', 'raf'));
  const n = await asUser('u_raf', async () => (await one('select count(*)::int n from erp.approval_policy')).n);
  if (n !== 2) throw new Error(`saw ${n}`);
  return 'sees 2 of 2';
});

await test('access: only an ERP administrator or the system changes access; entities and modules checked', async () => {
  await fresh();
  await asSystem('super-admin-uid', async () => {
    await grant('u_admin', 'admin');
    await db.query(`update erp.user_access set manages_access = true where user_id = 'u_admin'`);
    await grant('u_partner', 'partner', ['bumex_audit']);
  });
  await expectError(() => asUser('u_partner', () => grant('u_x', 'staff', ['bumex_audit'])), /only an ERP administrator/);
  await asUser('u_admin', () => grant('u_acc', 'accountant', ['bumex_it'], ['accounting', 'tax']));
  await expectError(() => asUser('u_admin', () => grant('u_y', 'staff', ['bumex_nowhere'])), /unknown entity code/);
  await expectError(() => asUser('u_admin', () => grant('u_z', 'staff', null, ['missions'])), /check constraint/);
  await expectError(() => asUser('u_admin', () => grant('u_w', 'boss')), /check constraint/);
  await expectError(() => asUser('u_admin', () => db.query(`update erp.user_access set erp_role = 'partner' where user_id = 'u_admin'`)), /own administrator role/);
  await expectError(() => asUser('u_admin', () => db.query(`delete from erp.user_access where user_id = 'u_admin'`)), /own access/);
  await asUser('u_admin', () => db.query(`update erp.user_access set entity_codes = '{bumex_it,bumex_sa}' where user_id = 'u_acc'`));
  const row = await one(`select granted_by, updated_by, entity_codes from erp.user_access where user_id = 'u_acc'`);
  if (row.granted_by !== 'u_admin' || row.updated_by !== 'u_admin' || row.entity_codes.length !== 2) throw new Error(JSON.stringify(row));
  const audit = await one(`select count(*)::int n from erp.audit_log where table_name = 'user_access'`);
  if (audit.n < 4) throw new Error(`audit rows ${audit.n}`);
  return `partner refused, admin grants, 5 refusals, ${audit.n} audit rows`;
});

await test('permissions (0009): only a role modifier changes access; parts per entity checked; nobody drops their own', async () => {
  await fresh();
  await asSystem('super-admin-uid', async () => {
    await grant('u_mod', 'admin');
    await db.query(`update erp.user_access set manages_access = true where user_id = 'u_mod'`);
    await grant('u_admin', 'admin');
    await grant('u_acc', 'accountant', ['bumex_audit', 'bumex_it']);
  });
  // an administrator who does not manage access changes nothing, not even someone else's parts
  await expectError(() => asUser('u_admin', () => db.query(`update erp.user_access set modules = '{accounting}' where user_id = 'u_acc'`)), /manages access/);
  await expectError(() => asUser('u_admin', () => grant('u_new', 'staff', ['bumex_audit'])), /manages access/);
  await expectError(() => asUser('u_admin', () => db.query(`update erp.user_access set manages_access = true where user_id = 'u_admin'`)), /manages access/);
  // the role modifier sets an entity's parts: entities the person sees, known modules, no consolidation
  const set = (json) => asUser('u_mod', () => db.query(`update erp.user_access set entity_modules = $1::jsonb where user_id = 'u_acc'`, [json]));
  await set('{"bumex_it": ["accounting", "reports"]}');
  await expectError(() => set('{"bumex_sa": ["accounting"]}'), /wrong modules for entity\(ies\): bumex_sa/);
  await expectError(() => set('{"bumex_nowhere": []}'), /wrong modules/);
  await expectError(() => set('{"bumex_it": ["consolidation"]}'), /wrong modules/);
  await expectError(() => set('{"bumex_it": ["missions"]}'), /wrong modules/);
  await expectError(() => set('{"bumex_it": "accounting"}'), /wrong modules/);
  await expectError(() => set('["accounting"]'), /check constraint/);
  // the flag is an administrator's only; the modifier hands it on, never drops their own
  await expectError(() => asUser('u_mod', () => db.query(`update erp.user_access set manages_access = true where user_id = 'u_acc'`)), /check constraint/);
  await asUser('u_mod', () => db.query(`update erp.user_access set manages_access = true where user_id = 'u_admin'`));
  await expectError(() => asUser('u_mod', () => db.query(`update erp.user_access set manages_access = false where user_id = 'u_mod'`)), /own administrator role or access management/);
  await expectError(() => asUser('u_mod', () => db.query(`update erp.user_access set erp_role = 'partner', manages_access = false where user_id = 'u_mod'`)), /own administrator role/);
  await expectError(() => asUser('u_mod', () => db.query(`delete from erp.user_access where user_id = 'u_mod'`)), /own access/);
  // …and the other modifier may take it back
  await asUser('u_admin', () => db.query(`update erp.user_access set manages_access = false where user_id = 'u_mod'`));
  await expectError(() => asUser('u_mod', () => db.query(`delete from erp.user_access where user_id = 'u_acc'`)), /manages access/);
  const row = await one(`select entity_modules, updated_by from erp.user_access where user_id = 'u_acc'`);
  same(row.entity_modules, { bumex_it: ['accounting', 'reports'] }, 'parts kept');
  // the migration's grant: el.havedh@bumex.mr's person becomes an administrator who manages access
  await asSystem('seed', () => db.query(`insert into work.person (id, email, full_name) values ('u_eh', 'El.Havedh@bumex.mr', 'El Havedh')`));
  const m0009 = readFileSync(join(migrations, '0009_permissions.sql'), 'utf8');
  await db.exec(m0009.slice(m0009.indexOf('-- 3. The first role modifier'), m0009.indexOf('-- 4. Invitations')));
  const eh = await one(`select erp_role, manages_access, entity_codes from erp.user_access where user_id = 'u_eh'`);
  same(eh, { erp_role: 'admin', manages_access: true, entity_codes: null }, 'el.havedh');
  return 'admin refused ×3, 6 wrong parts refused, flag admins-only, own flag/role/row kept, el.havedh granted';
});

await test('session: the context lasts one transaction and ends with it', async () => {
  await fresh();
  await asSystem('super-admin-uid', () => grant('u_acc', 'accountant', ['bumex_audit']));
  const inside = await asUser('u_acc', async () => one(`select current_user u, current_setting('erp.actor_id') a, current_setting('erp.actor_role') r, current_setting('erp.entity_ids') e`));
  if (inside.u !== 'erp_app' || inside.a !== 'u_acc' || inside.r !== 'accountant' || inside.e.split(',').length !== 1) throw new Error(JSON.stringify(inside));
  const after = await one(`select current_user u, coalesce(current_setting('erp.actor_role', true), '') r, coalesce(current_setting('erp.entity_ids', true), '') e`);
  if (after.u === 'erp_app' || after.r !== '' || after.e !== '') throw new Error(JSON.stringify(after));
  return `inside: ${inside.u} / ${inside.r}; after commit: ${after.u}, context empty`;
});

await test('erp_app never bypasses row-level security and cannot rewrite the audit trail', async () => {
  await fresh();
  const role = await one(`select rolbypassrls, rolsuper from pg_roles where rolname = 'erp_app'`);
  if (role.rolbypassrls || role.rolsuper) throw new Error(JSON.stringify(role));
  await asSystem('super-admin-uid', () => grant('u_admin', 'admin'));
  await expectError(() => asSystem('x', () => db.query(`update erp.audit_log set actor_id = 'edited'`)), /permission denied/);
  await expectError(() => asSystem('x', () => db.query('delete from erp.audit_log')), /permission denied/);
  return 'no bypass; update / delete on audit_log denied';
});

await test('no session: erp_app sees nothing; an app login reaches the schema only through set role (0005)', async () => {
  const ids = await fresh();
  await addTasks(ids);
  await db.exec('begin');
  await db.exec('set local role erp_app');
  const app = await one(`select erp.actor_role() r, (select count(*)::int from erp.approval_policy) n`);
  await db.exec('rollback');
  if (app.r !== 'none' || app.n !== 0) throw new Error('erp_app without session ' + JSON.stringify(app));
  const admin = await one(`select erp.actor_role() r, (select count(*)::int from erp.approval_policy) n`);
  if (admin.r !== 'system' || admin.n !== 2) throw new Error('administrator ' + JSON.stringify(admin));
  // a login granted the usual way, then 0005 applied again (it is idempotent)
  await db.exec(`create role app_login login; grant erp_app to app_login`);
  await db.exec(readFileSync(join(migrations, '0005_no_session_no_data.sql'), 'utf8'));
  const m = await one(`select has_table_privilege('app_login', 'erp.task', 'select') direct,
                              pg_has_role('app_login', 'erp_app', 'SET') can_set,
                              pg_has_role('app_login', 'erp_app', 'USAGE') inherits`);
  if (m.direct || !m.can_set || m.inherits) throw new Error(JSON.stringify(m));
  return 'erp_app alone: none, 0 of 2 tasks; admin: system; login: no direct rights, may set role';
});

// A small chart for BUMEX Audit: bank, receivable (customer required), expense, income; journal OD; fiscal year 2026.
async function miniLedger(ids) {
  return asSystem('seed', async () => {
    const e = ids.bumex_audit;
    const acc = async (code, name, kind, customer = false) =>
      (await one(`insert into erp.account (entity_id, code, name_fr, class, kind, requires_customer) values ($1, $2, $3, $4, $5, $6) returning id`, [e, code, name, Number(code[0]), kind, customer])).id;
    const bank = await acc('550100', 'Banque', 'asset');
    const ar = await acc('410000', 'Clients', 'asset', true);
    const fees = await acc('631000', 'Honoraires', 'expense');
    const journal = (await one(`insert into erp.journal (entity_id, code, name, kind) values ($1, 'OD', 'Opérations diverses', 'misc') returning id`, [e])).id;
    const fy = (await one(`select erp.create_fiscal_year($1, 2026) id`, [e])).id;
    const period = (await one(`select id from erp.period where fiscal_year_id = $1 and period_no = 10`, [fy])).id;
    return { e, bank, ar, fees, journal, fy, period };
  });
}

async function draft(l, lines) {
  const entry = (await one(
    `insert into erp.journal_entry (entity_id, journal_id, fiscal_year_id, period_id, entry_date, description, currency)
     values ($1, $2, $3, $4, '2026-10-15', 'test', 'MRU') returning id`, [l.e, l.journal, l.fy, l.period])).id;
  let n = 1;
  for (const [account, debit, credit] of lines) {
    await db.query(`insert into erp.journal_line (entry_id, line_no, account_id, currency, debit_txn, credit_txn, debit, credit) values ($1, $2, $3, 'MRU', $4, $5, $4, $5)`, [entry, n++, account, debit, credit]);
  }
  return entry;
}

await test('posting (0006): staff cannot post, an accountant can; number and hash are set', async () => {
  const ids = await fresh();
  const l = await miniLedger(ids);
  await asSystem('admin-uid', async () => {
    await grant('u_staff', 'staff', ['bumex_audit'], ['accounting']);
    await grant('u_acc', 'accountant', ['bumex_audit']);
  });
  const entry = await asUser('u_staff', () => draft(l, [[l.fees, 1000, 0], [l.bank, 0, 1000]]));
  const refused = await expectError(() => asUser('u_staff', () => db.query(`update erp.journal_entry set status = 'posted' where id = $1`, [entry])), /cannot post entries/);
  await asUser('u_acc', () => db.query(`update erp.journal_entry set status = 'posted' where id = $1`, [entry]));
  const posted = await one(`select entry_no, status, hash is not null as sealed, posted_by from erp.journal_entry where id = $1`, [entry]);
  if (posted.entry_no !== 1 || posted.status !== 'posted' || !posted.sealed || posted.posted_by !== 'u_acc') throw new Error(JSON.stringify(posted));
  return `staff: ${refused.slice(0, 32)}…; accountant posts n° 1, sealed`;
});

await test('posting (0006): an account that requires a customer refuses a line without one', async () => {
  const ids = await fresh();
  const l = await miniLedger(ids);
  const flags = await one(`select requires_counterparty from erp.account where id = $1`, [l.ar]);
  if (!flags.requires_counterparty) throw new Error('requires_counterparty not set from requires_customer');
  await asSystem('admin-uid', () => grant('u_acc', 'accountant', ['bumex_audit']));
  const entry = await asUser('u_acc', () => draft(l, [[l.ar, 500, 0], [l.bank, 0, 500]]));
  const refused = await expectError(() => asUser('u_acc', () => db.query(`update erp.journal_entry set status = 'posted' where id = $1`, [entry])), /required dimension|customer or supplier/);
  return `refused: ${refused.slice(0, 60)}…`;
});

await test('fiscal years (0006): twelve periods in one call, idempotent, seen only by the entity\'s people', async () => {
  const ids = await fresh();
  const l = await miniLedger(ids);
  const again = await asSystem('seed', async () => (await one(`select erp.create_fiscal_year($1, 2026) id`, [ids.bumex_audit])).id);
  if (again !== l.fy) throw new Error('not idempotent');
  await asSystem('seed', () => db.query(`select erp.create_fiscal_year($1, 2026)`, [ids.bumex_it]));
  const periods = await one(`select count(*)::int n, min(start_date)::text first, max(end_date)::text last from erp.period where fiscal_year_id = $1`, [l.fy]);
  if (periods.n !== 12 || periods.first !== '2026-01-01' || periods.last !== '2026-12-31') throw new Error(JSON.stringify(periods));
  await asSystem('admin-uid', () => grant('u_acc', 'accountant', ['bumex_audit']));
  const seen = await asUser('u_acc', async () => (await one('select count(*)::int n from erp.fiscal_year')).n);
  if (seen !== 1) throw new Error(`accountant of Audit sees ${seen} fiscal years`);
  await expectError(() => asSystem('seed', () => db.query(`select erp.create_fiscal_year($1, 1800)`, [ids.bumex_audit])), /out of range/);
  return '12 periods 2026-01-01 → 2026-12-31; Audit accountant sees 1 of 2 years; 1800 refused';
});

// ---------------------------------------------------------------------------
const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${pad(r.name, 78)}  ${r.note}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
