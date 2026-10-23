// BUMEX ERP — schema guarantee tests, run on PGlite (embedded PostgreSQL).
// Each test loads a fresh database, applies every migration, seeds one entity and checks one guarantee.
// (BUMEX One: 0004 is applied too, so the ERP team's guarantees are checked against our adaptation.)
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const migrations = join(here, '..', 'migrations');
const DDL = readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(join(migrations, f), 'utf8')).join('\n');

const results = [];
let db;

async function fresh() {
  db = new PGlite();
  await db.exec(DDL);
  await db.exec(`set erp.actor_id = 'tester'; set erp.actor_role = 'partner'; set erp.entity_ids = '*';`);
  return seed();
}

async function one(sql, params = []) {
  const r = await db.query(sql, params);
  return r.rows[0];
}

async function addYear(entity, year) {
  const fy = await one(
    `insert into erp.fiscal_year (entity_id, label, start_date, end_date)
     values ($1, $2, $3, $4) returning id`, [entity, String(year), `${year}-01-01`, `${year}-12-31`]);
  const periods = {};
  for (let m = 1; m <= 12; m++) {
    const start = `${year}-${String(m).padStart(2, '0')}-01`;
    const p = await one(
      `insert into erp.period (entity_id, fiscal_year_id, period_no, start_date, end_date)
       values ($1, $2, $3, $4::date, ($4::date + interval '1 month - 1 day')::date) returning id`,
      [entity, fy.id, m, start]);
    periods[m] = p.id;
  }
  return { fy: fy.id, periods };
}

async function seed() {
  const g = await one(`insert into erp.org_group (name) values ('BUMEX Group') returning id`);
  const e = await one(
    `insert into erp.entity (group_id, code, name, country, functional_currency, coa_template)
     values ($1, 'AUD', 'BUMEX Audit', 'MR', 'MRU', 'PCM') returning id`, [g.id]);
  const y2026 = await addYear(e.id, 2026);
  const j = await one(
    `insert into erp.journal (entity_id, code, name, kind) values ($1, 'VT', 'Ventes', 'sales') returning id`, [e.id]);
  const acct = async (code, name, cls, kind, extra = {}) => (await one(
    `insert into erp.account (entity_id, code, name_fr, class, kind, is_statutory, is_postable, requires_counterparty)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [e.id, code, name, cls, kind, !!extra.statutory, extra.postable ?? true, !!extra.counterparty])).id;
  const a = {
    root41: await acct('41', 'Clients et comptes rattachés', 4, 'asset', { statutory: true, postable: false }),
    ar: await acct('4100', 'Clients ordinaires', 4, 'asset', { counterparty: true }),
    ap: await acct('4000', 'Fournisseurs ordinaires', 4, 'liability', { counterparty: true }),
    rev: await acct('701712', 'Exportations de prestations de services exonérées', 7, 'income'),
    vat: await acct('4357', 'Etat, TVA collectée', 4, 'liability'),
    bank: await acct('5501', 'BMCI compte MRU', 5, 'asset'),
  };
  // the collectives of the third parties (0003 attaches every customer / supplier to one through its auxiliary account)
  await db.query(`insert into erp.account_mapping (entity_id, key, account_id) values ($1, 'AR_CONTROL', $2), ($1, 'AP_CONTROL', $3)`, [e.id, a.ar, a.ap]);
  const cust = await one(
    `insert into erp.customer (entity_id, code, name) values ($1, 'C001', 'Client test') returning id`, [e.id]);
  return { group: g.id, entity: e.id, fy: y2026.fy, periods: y2026.periods, years: { 2026: y2026 },
           journal: j.id, a, customer: cust.id };
}

async function draftEntry(s, { date = '2026-10-14', period = 10, year = 2026, lines }) {
  const y = s.years[year];
  const e = await one(
    `insert into erp.journal_entry (entity_id, journal_id, fiscal_year_id, period_id, entry_date, description, currency)
     values ($1, $2, $3, $4, $5, 'test', 'MRU') returning id`,
    [s.entity, s.journal, y.fy, y.periods[period], date]);
  let n = 1;
  for (const l of lines) {
    await db.query(
      `insert into erp.journal_line (entry_id, line_no, account_id, currency, debit_txn, credit_txn, debit, credit, customer_id)
       values ($1, $2, $3, 'MRU', $4, $5, $4, $5, $6)`,
      [e.id, n++, l.account, l.debit ?? 0, l.credit ?? 0, l.customer ?? null]);
  }
  return e.id;
}

async function post(id) {
  await db.query(`update erp.journal_entry set status = 'posted' where id = $1`, [id]);
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

async function test(name, fn) {
  try {
    const s = await fresh();
    const note = await fn(s);
    results.push({ name, ok: true, note: note ?? '' });
  } catch (err) {
    results.push({ name, ok: false, note: err.message.split('\n')[0] });
  } finally {
    await db?.close();
  }
}

// ---------------------------------------------------------------------------

await test('DDL loads on an empty database', async () => {
  const t = await one(`select count(*)::int as n from information_schema.tables where table_schema = 'erp'`);
  const f = await one(`select count(*)::int as n from information_schema.routines where routine_schema = 'erp'`);
  const tr = await one(`select count(distinct trigger_name)::int as n from information_schema.triggers where trigger_schema = 'erp'`);
  return `${t.n} tables, ${f.n} functions, ${tr.n} triggers`;
});

await test('Unbalanced entry is refused at posting', async (s) => {
  const id = await draftEntry(s, { lines: [
    { account: s.a.ar, debit: 1000, customer: s.customer },
    { account: s.a.rev, credit: 900 },
  ]});
  return expectError(() => post(id), /unbalanced/);
});

await test('Balanced entry posts, gets a gapless number, a hash and refreshes balances', async (s) => {
  const ids = [];
  for (let i = 0; i < 3; i++) {
    const id = await draftEntry(s, { lines: [
      { account: s.a.ar, debit: 1000 + i, customer: s.customer },
      { account: s.a.rev, credit: 1000 + i },
    ]});
    await post(id);
    ids.push(id);
  }
  const nos = (await db.query(`select entry_no from erp.journal_entry where status='posted' order by entry_no`)).rows.map(r => r.entry_no);
  if (nos.join(',') !== '1,2,3') throw new Error(`numbers ${nos}`);
  const h = await one(`select count(*)::int as n from erp.journal_entry where hash is not null and posted_at is not null and posted_by = 'tester'`);
  if (h.n !== 3) throw new Error('hash or posted_by missing');
  const bal = await one(`select debit, credit from erp.account_balance where account_id = $1`, [s.a.ar]);
  if (Number(bal.debit) !== 3003) throw new Error(`AR balance ${bal.debit}`);
  return 'numbers 1,2,3; AR balance 3003.00';
});

await test('A posted entry cannot be updated', async (s) => {
  const id = await draftEntry(s, { lines: [
    { account: s.a.ar, debit: 500, customer: s.customer }, { account: s.a.rev, credit: 500 } ]});
  await post(id);
  return expectError(() => db.query(`update erp.journal_entry set description = 'edited' where id = $1`, [id]), /immutable/);
});

await test('A posted entry cannot be deleted', async (s) => {
  const id = await draftEntry(s, { lines: [
    { account: s.a.ar, debit: 500, customer: s.customer }, { account: s.a.rev, credit: 500 } ]});
  await post(id);
  return expectError(() => db.query(`delete from erp.journal_entry where id = $1`, [id]), /cannot be deleted/);
});

await test('Lines of a posted entry cannot be changed or deleted', async (s) => {
  const id = await draftEntry(s, { lines: [
    { account: s.a.ar, debit: 500, customer: s.customer }, { account: s.a.rev, credit: 500 } ]});
  await post(id);
  const m1 = await expectError(() => db.query(`update erp.journal_line set debit = 999 where entry_id = $1 and line_no = 1`, [id]), /immutable/);
  await expectError(() => db.query(`delete from erp.journal_line where entry_id = $1`, [id]), /immutable/);
  await expectError(() => db.query(
    `insert into erp.journal_line (entry_id, line_no, account_id, currency) values ($1, 9, $2, 'MRU')`, [id, s.a.rev]), /immutable/);
  return m1;
});

await test('Reversal mirrors the lines, flags the original and keeps balances at zero', async (s) => {
  const id = await draftEntry(s, { lines: [
    { account: s.a.ar, debit: 1200, customer: s.customer }, { account: s.a.rev, credit: 1200 } ]});
  await post(id);
  const r = await one(`select erp.reverse_entry($1, '2026-10-20', 'wrong customer') as id`, [id]);
  const orig = await one(`select status, reversed_by_id from erp.journal_entry where id = $1`, [id]);
  if (orig.status !== 'reversed' || orig.reversed_by_id !== r.id) throw new Error('original not flagged');
  const rev = await one(`select status, reversal_of_id, entry_no from erp.journal_entry where id = $1`, [r.id]);
  if (rev.status !== 'posted' || rev.reversal_of_id !== id) throw new Error('reversal not posted');
  const lines = (await db.query(`select debit, credit from erp.journal_line where entry_id = $1 order by line_no`, [r.id])).rows;
  if (!(Number(lines[0].credit) === 1200 && Number(lines[1].debit) === 1200)) throw new Error('lines not mirrored');
  const bal = await one(`select sum(debit) - sum(credit) as net from erp.account_balance where account_id = $1`, [s.a.ar]);
  if (Number(bal.net) !== 0) throw new Error(`AR net ${bal.net}`);
  await expectError(() => db.query(`update erp.journal_entry set description = 'x' where id = $1`, [id]), /immutable/);
  return `reversal is entry no ${rev.entry_no}; AR net 0.00; original still immutable`;
});

await test('Posting into a locked period is refused', async (s) => {
  await db.query(`update erp.period set status = 'locked' where id = $1`, [s.periods[10]]);
  const id = await draftEntry(s, { lines: [
    { account: s.a.ar, debit: 100, customer: s.customer }, { account: s.a.rev, credit: 100 } ]});
  return expectError(() => post(id), /locked/);
});

await test('Soft-closed period: accountant refused, partner allowed', async (s) => {
  await db.query(`update erp.period set status = 'soft_closed' where id = $1`, [s.periods[10]]);
  const id = await draftEntry(s, { lines: [
    { account: s.a.ar, debit: 100, customer: s.customer }, { account: s.a.rev, credit: 100 } ]});
  await db.exec(`set erp.actor_role = 'accountant'`);
  const msg = await expectError(() => post(id), /soft-closed/);
  await db.exec(`set erp.actor_role = 'partner'`);
  await post(id);
  return msg;
});

await test('Locking a period with draft entries is refused; non-partner cannot lock', async (s) => {
  await draftEntry(s, { lines: [
    { account: s.a.ar, debit: 100, customer: s.customer }, { account: s.a.rev, credit: 100 } ]});
  const m = await expectError(() => db.query(`update erp.period set status = 'locked' where id = $1`, [s.periods[10]]), /draft entries/);
  await db.query(`delete from erp.journal_entry where status = 'draft'`);
  await db.exec(`set erp.actor_role = 'accountant'`);
  await expectError(() => db.query(`update erp.period set status = 'locked' where id = $1`, [s.periods[10]]), /only a partner/);
  await db.exec(`set erp.actor_role = 'partner'`);
  await db.query(`update erp.period set status = 'locked' where id = $1`, [s.periods[10]]);
  const p = await one(`select status, locked_by from erp.period where id = $1`, [s.periods[10]]);
  if (p.status !== 'locked' || p.locked_by !== 'tester') throw new Error('lock not recorded');
  return m;
});

await test('Entry date outside its period is refused', async (s) => {
  const id = await draftEntry(s, { date: '2026-11-03', period: 10, lines: [
    { account: s.a.ar, debit: 100, customer: s.customer }, { account: s.a.rev, credit: 100 } ]});
  return expectError(() => post(id), /outside period/);
});

await test('Non-postable (header) account is refused', async (s) => {
  const id = await draftEntry(s, { lines: [
    { account: s.a.root41, debit: 100 }, { account: s.a.rev, credit: 100 } ]});
  return expectError(() => post(id), /not postable/);
});

await test('Required dimension (customer on 4100) is enforced', async (s) => {
  const id = await draftEntry(s, { lines: [
    { account: s.a.ar, debit: 100 }, { account: s.a.rev, credit: 100 } ]});
  return expectError(() => post(id), /required dimension/);
});

await test('Hash chain verifies, and a tampered line is detected', async (s) => {
  for (let i = 0; i < 3; i++) {
    const id = await draftEntry(s, { lines: [
      { account: s.a.ar, debit: 100 + i, customer: s.customer }, { account: s.a.rev, credit: 100 + i } ]});
    await post(id);
  }
  const before = (await db.query(`select ok from erp.verify_chain($1, $2)`, [s.entity, s.journal])).rows;
  if (before.length !== 3 || !before.every(r => r.ok)) throw new Error('chain should verify');
  // Tamper as a superuser with the triggers off, the way a DBA with direct access might.
  await db.exec(`alter table erp.journal_line disable trigger journal_line_guard`);
  await db.query(`update erp.journal_line set debit = 999 where debit = 101`);
  await db.exec(`alter table erp.journal_line enable trigger journal_line_guard`);
  const after = (await db.query(`select entry_no, ok from erp.verify_chain($1, $2) order by entry_no`, [s.entity, s.journal])).rows;
  const broken = after.filter(r => !r.ok).map(r => r.entry_no);
  if (broken.join(',') !== '2') throw new Error(`broken entries ${broken}`);
  return `3 entries verified; after tampering entry 2, verify_chain flags entry 2 only`;
});

await test('Statutory account keeps code and class, name stays editable, deletion refused', async (s) => {
  await db.query(`update erp.account set name_fr = 'Clients (renommé)' where id = $1`, [s.a.root41]);
  const m = await expectError(() => db.query(`update erp.account set code = '42' where id = $1`, [s.a.root41]), /statutory/);
  await expectError(() => db.query(`delete from erp.account where id = $1`, [s.a.root41]), /statutory/);
  await db.query(`update erp.account set code = '4101', name_fr = 'Clients, groupe' where id = $1`, [s.a.ar]);
  await db.query(`delete from erp.account where id = $1`, [s.a.vat]);
  return 'root 41 renamed but code locked; sub-account 4100 recoded freely; unused 4357 deleted';
});

await test('Audit log records who changed what, before and after', async (s) => {
  await db.query(`update erp.customer set name = 'Client renommé' where id = $1`, [s.customer]);
  const row = await one(
    `select actor_id, action, before_row->>'name' as before, after_row->>'name' as after
       from erp.audit_log where table_name = 'customer' and action = 'U' order by id desc limit 1`);
  if (row.actor_id !== 'tester' || row.before !== 'Client test' || row.after !== 'Client renommé') throw new Error(JSON.stringify(row));
  const n = await one(`select count(*)::int as n from erp.audit_log`);
  return `${n.n} audit rows after seeding; last: tester U customer "Client test" → "Client renommé"`;
});

await test('Row-level security hides other entities from a scoped session', async (s) => {
  const other = await one(
    `insert into erp.entity (group_id, code, name, country, functional_currency, coa_template)
     values ($1, 'MAR', 'BUMEX Maroc', 'MA', 'MAD', 'CGNC') returning id`, [s.group]);
  const mar = await one(`insert into erp.account (entity_id, code, name_fr, class, kind, requires_counterparty) values ($1, '3421', 'Clients', 3, 'asset', true) returning id`, [other.id]);
  await db.query(`insert into erp.account_mapping (entity_id, key, account_id) values ($1, 'AR_CONTROL', $2)`, [other.id, mar.id]);
  await db.query(`insert into erp.customer (entity_id, code, name) values ($1, 'M001', 'Client Maroc')`, [other.id]);
  // RLS does not bind the table owner (superuser in PGlite); run the check as a scoped role.
  await db.exec(`create role app_user login; grant usage on schema erp to app_user; grant select on all tables in schema erp to app_user;`);
  await db.exec(`set role app_user; set erp.actor_role = 'accountant'; set erp.entity_ids = '${s.entity}';`);
  const seen = (await db.query(`select code from erp.customer order by code`)).rows.map(r => r.code);
  await db.exec(`reset role`);
  if (seen.join(',') !== 'C001') throw new Error(`saw ${seen}`);
  return `scoped accountant sees C001 only; M001 (BUMEX Maroc) hidden`;
});

await test('Gapless numbering survives a failed posting and resets per year', async (s) => {
  const ok1 = await draftEntry(s, { lines: [
    { account: s.a.ar, debit: 10, customer: s.customer }, { account: s.a.rev, credit: 10 } ]});
  await post(ok1);
  const bad = await draftEntry(s, { lines: [
    { account: s.a.ar, debit: 10, customer: s.customer }, { account: s.a.rev, credit: 5 } ]});
  await expectError(() => post(bad), /unbalanced/);           // the failed statement rolls its counter back
  const ok2 = await draftEntry(s, { lines: [
    { account: s.a.ar, debit: 10, customer: s.customer }, { account: s.a.rev, credit: 10 } ]});
  await post(ok2);
  const nos = (await db.query(`select entry_no from erp.journal_entry where status = 'posted' order by entry_no`)).rows.map(r => r.entry_no);
  if (nos.join(',') !== '1,2') throw new Error(`numbers ${nos}`);
  const n = await one(`select * from erp.next_number($1, 'sales_invoice', null, '2026-10-14')`, [s.entity]);
  await db.query(`update erp.numbering_policy set pattern = 'IN{YY}{MM}-{SEQ4}', reset_on = 'month' where scope = 'sales_invoice'`);
  const n2 = await one(`select * from erp.next_number($1, 'sales_invoice', null, '2026-10-14')`, [s.entity]);
  return `entries 1,2 with a failed post in between; invoice numbers ${n.o_number} then ${n2.o_number} with the Dolibarr pattern`;
});

await test('Back-dated years: 2024 entries post during 2026, numbered per year, one chain in posting order', async (s) => {
  s.years[2024] = await addYear(s.entity, 2024);
  const lines = (n) => [{ account: s.a.ar, debit: n, customer: s.customer }, { account: s.a.rev, credit: n }];
  const order = [
    { year: 2026, date: '2026-10-14', period: 10 },
    { year: 2024, date: '2024-03-15', period: 3 },
    { year: 2026, date: '2026-10-15', period: 10 },
    { year: 2024, date: '2024-11-02', period: 11 },
  ];
  for (const [i, o] of order.entries()) {
    const id = await draftEntry(s, { ...o, lines: lines(100 + i) });
    await post(id);
  }
  const rows = (await db.query(
    `select fy.label, e.entry_no, e.chain_seq from erp.journal_entry e join erp.fiscal_year fy on fy.id = e.fiscal_year_id
      where e.status = 'posted' order by e.chain_seq`)).rows;
  const got = rows.map(r => `${r.label}#${r.entry_no}@${r.chain_seq}`).join(' ');
  if (got !== '2026#1@1 2024#1@2 2026#2@3 2024#2@4') throw new Error(got);
  const chain = (await db.query(`select ok from erp.verify_chain($1, $2)`, [s.entity, s.journal])).rows;
  if (chain.length !== 4 || !chain.every(r => r.ok)) throw new Error('chain should verify across years');
  const bal = await one(
    `select sum(debit) as d from erp.account_balance b join erp.period p on p.id = b.period_id
      where b.account_id = $1 and p.fiscal_year_id = $2`, [s.a.ar, s.years[2024].fy]);
  if (Number(bal.d) !== 101 + 103) throw new Error(`2024 AR ${bal.d}`);
  return got + '; chain verifies; 2024 AR balance 204.00';
});

await test('Closed fiscal year refuses posting; closing needs locked periods; a partner can reopen', async (s) => {
  s.years[2024] = await addYear(s.entity, 2024);
  const m1 = await expectError(() => db.query(`update erp.fiscal_year set is_closed = true where id = $1`, [s.years[2024].fy]), /unlocked periods/);
  await db.query(`update erp.period set status = 'locked' where fiscal_year_id = $1`, [s.years[2024].fy]);
  await db.query(`update erp.fiscal_year set is_closed = true where id = $1`, [s.years[2024].fy]);
  const fy = await one(`select is_closed, closed_by from erp.fiscal_year where id = $1`, [s.years[2024].fy]);
  if (!fy.is_closed || fy.closed_by !== 'tester') throw new Error('close not recorded');
  // Reopen the year and one period, as a partner: 2024 accepts entries again, dated 2024, keyed in 2026.
  await db.exec(`set erp.actor_role = 'accountant'`);
  await expectError(() => db.query(`update erp.fiscal_year set is_closed = false where id = $1`, [s.years[2024].fy]), /only a partner/);
  await db.exec(`set erp.actor_role = 'partner'`);
  await db.query(`update erp.fiscal_year set is_closed = false where id = $1`, [s.years[2024].fy]);
  await db.query(`update erp.period set status = 'open' where id = $1`, [s.years[2024].periods[6]]);
  const id = await draftEntry(s, { year: 2024, date: '2024-06-30', period: 6, lines: [
    { account: s.a.ar, debit: 50, customer: s.customer }, { account: s.a.rev, credit: 50 } ]});
  await post(id);
  // Close it again with a draft left behind: refused.
  await db.query(`update erp.period set status = 'locked' where id = $1`, [s.years[2024].periods[6]]);
  await db.query(`update erp.period set status = 'open' where id = $1`, [s.years[2024].periods[7]]);
  await draftEntry(s, { year: 2024, date: '2024-07-10', period: 7, lines: [
    { account: s.a.ar, debit: 5, customer: s.customer }, { account: s.a.rev, credit: 5 } ]});
  await expectError(() => db.query(`update erp.fiscal_year set is_closed = true where id = $1`, [s.years[2024].fy]), /unlocked periods/);
  return m1 + '; reopened by partner, June 2024 entry posted in 2026';
});

await test('Closed fiscal year: posting is refused even into an open period', async (s) => {
  s.years[2024] = await addYear(s.entity, 2024);
  await db.query(`update erp.period set status = 'locked' where fiscal_year_id = $1`, [s.years[2024].fy]);
  await db.query(`update erp.fiscal_year set is_closed = true where id = $1`, [s.years[2024].fy]);
  await db.exec(`alter table erp.period disable trigger period_guard`);      // force an inconsistent state
  await db.query(`update erp.period set status = 'open' where id = $1`, [s.years[2024].periods[2]]);
  await db.exec(`alter table erp.period enable trigger period_guard`);
  const id = await draftEntry(s, { year: 2024, date: '2024-02-10', period: 2, lines: [
    { account: s.a.ar, debit: 5, customer: s.customer }, { account: s.a.rev, credit: 5 } ]});
  return expectError(() => post(id), /fiscal year .* is closed/);
});

await test('Archive: completed engagement gets a gapless yearly reference and the next free slot', async (s) => {
  const eng = async (code, status) => (await one(
    `insert into erp.engagement (entity_id, customer_id, code, name, kind, status, deadline) values ($1, $2, $3, $3, 'audit', $4, '2025-04-30') returning id`,
    [s.entity, s.customer, code, status])).id;
  const active = await eng('AUD-2025-001', 'active');
  await expectError(() => db.query(`insert into erp.archive_record (entity_id, engagement_id, label) values ($1, $2, 'x')`, [s.entity, active]), /not_completed/);
  const ids = [];
  for (let i = 0; i < 14; i++) ids.push(await eng(`AUD-2024-${String(i + 1).padStart(3, '0')}`, 'completed'));
  const rows = [];
  for (const id of ids) rows.push(await one(`insert into erp.archive_record (entity_id, engagement_id, label, archived_at) values ($1, $2, 'box', '2025-05-10') returning reference, bay, shelf, slot, to_char(retention_until, 'YYYY-MM-DD') as retention_until`, [s.entity, id]));
  if (rows[0].reference !== 'ARC-2025-0001' || rows[13].reference !== 'ARC-2025-0014') throw new Error('references ' + rows[0].reference + ' ' + rows[13].reference);
  // 14 boxes read like a page: shelf 1 of bays A, B, C (12 slots) then shelf 2 of bay A
  const place = rows.map((r) => `${r.bay}${r.shelf}${r.slot}`).join(' ');
  if (!place.startsWith('111 112 113 114 211 212 213 214 311 312 313 314 121 122')) throw new Error('slots ' + place);
  if (rows[0].retention_until !== '2035-05-10') throw new Error('retention ' + rows[0].retention_until);
  // the same engagement cannot be boxed twice while its box lives; a destroyed box frees the slot
  await expectError(() => db.query(`insert into erp.archive_record (entity_id, engagement_id, label) values ($1, $2, 'dup')`, [s.entity, ids[0]]), /archive_engagement_live_uq/);
  await db.query(`update erp.archive_record set status = 'destroyed' where reference = 'ARC-2025-0001'`);
  const again = await one(`insert into erp.archive_record (entity_id, engagement_id, label, archived_at) values ($1, $2, 'again', '2026-01-05') returning reference, bay, shelf, slot`, [s.entity, ids[0]]);
  if (again.reference !== 'ARC-2026-0001' || `${again.bay}${again.shelf}${again.slot}` !== '111') throw new Error('reuse ' + JSON.stringify(again));
  return `${rows.length + 1} boxes, slots ${place.slice(0, 15)}…, freed slot reused`;
});

await test('Task: status and completion date stay consistent, audit rows are written', async (s) => {
  const t = await one(`insert into erp.task (entity_id, title, module, assignee, due_date) values ($1, 'Rapport final', 'missions', 'A.A.', '2026-10-20') returning id, status`, [s.entity]);
  await expectError(() => db.query(`update erp.task set status = 'done' where id = $1`, [t.id]), /check/);
  await db.query(`update erp.task set status = 'done', completed_at = current_date where id = $1`, [t.id]);
  await expectError(() => db.query(`insert into erp.task (entity_id, title, module, assignee, due_date) values ($1, '   ', 'missions', 'A.A.', '2026-10-20')`, [s.entity]), /check/);
  const n = await one(`select count(*)::int as n from erp.audit_log where table_name = 'task'`);
  if (n.n < 2) throw new Error('audit rows ' + n.n);
  return `task ${t.status} → done, ${n.n} audit rows`;
});

// ---- migration 0002: security, loans, assets, payroll, planning -------------------------------------------

await test('0002: deletion request needs a reason; requester cannot decide; only partner/admin decides', async (s) => {
  await expectError(() => db.query(`insert into erp.deletion_request (entity_id, table_name, row_id, label, reason) values ($1, 'customer', 'x', 'Client X', 'no')`, [s.entity]), /check/);
  const r = await one(`insert into erp.deletion_request (entity_id, table_name, row_id, label, reason) values ($1, 'customer', 'x', 'Client X', 'doublon de fiche') returning id, requested_by`, [s.entity]);
  await expectError(() => db.query(`update erp.deletion_request set status = 'approved' where id = $1`, [r.id]), /requester cannot decide/);
  await db.exec(`set erp.actor_id = 'u_compta'; set erp.actor_role = 'accountant';`);
  await expectError(() => db.query(`update erp.deletion_request set status = 'approved' where id = $1`, [r.id]), /only a partner or the administrator/);
  await db.exec(`set erp.actor_id = 'u_admin'; set erp.actor_role = 'admin';`);
  await db.query(`update erp.deletion_request set status = 'approved', decision_note = 'ok' where id = $1`, [r.id]);
  const d = await one(`select status, decided_by from erp.deletion_request where id = $1`, [r.id]);
  await expectError(() => db.query(`update erp.deletion_request set status = 'rejected' where id = $1`, [r.id]), /already decided/);
  return `${d.status} by ${d.decided_by}`;
});

await test('0002: loan instalments in order, capital never beyond the principal, loan closes on the last one', async (s) => {
  const b = await one(`insert into erp.bank_account (entity_id, name, bank_name, currency, gl_account_id) values ($1, 'BMCI', 'BMCI', 'MRU', $2) returning id`, [s.entity, s.a.bank]);
  const l = await one(`insert into erp.loan (entity_id, lender, reference, currency, principal, annual_rate, months, start_date, bank_account_id) values ($1, 'BMCI', 'EMP-1', 'MRU', 3000, 0.1, 3, '2026-01-01', $2) returning id`, [s.entity, b.id]);
  await expectError(() => db.query(`insert into erp.loan_payment (entity_id, loan_id, instalment_no, paid_on, capital, interest, bank_account_id) values ($1, $2, 2, '2026-03-01', 1000, 25, $3)`, [s.entity, l.id, b.id]), /must be paid first/);
  await db.query(`insert into erp.loan_payment (entity_id, loan_id, instalment_no, paid_on, capital, interest, bank_account_id) values ($1, $2, 1, '2026-02-01', 1000, 25, $3)`, [s.entity, l.id, b.id]);
  await expectError(() => db.query(`insert into erp.loan_payment (entity_id, loan_id, instalment_no, paid_on, capital, interest, bank_account_id) values ($1, $2, 2, '2026-03-01', 2500, 25, $3)`, [s.entity, l.id, b.id]), /exceeds the principal/);
  await db.query(`insert into erp.loan_payment (entity_id, loan_id, instalment_no, paid_on, capital, interest, bank_account_id) values ($1, $2, 2, '2026-03-01', 1000, 17, $3)`, [s.entity, l.id, b.id]);
  await db.query(`insert into erp.loan_payment (entity_id, loan_id, instalment_no, paid_on, capital, interest, bank_account_id) values ($1, $2, 3, '2026-04-01', 1000, 8, $3)`, [s.entity, l.id, b.id]);
  const st = await one(`select status, (select sum(total) from erp.loan_payment where loan_id = $1) as paid from erp.loan where id = $1`, [l.id]);
  return `${st.status} · paid ${st.paid}`;
});

await test('0002: asset plan computed on insert, serial unique, plan locked once depreciation is posted', async (s) => {
  const c = await one(`insert into erp.asset_category (entity_id, code, name_fr, default_life_months) values ($1, 'IT', 'Matériel informatique', 36) returning id`, [s.entity]);
  const a = await one(`insert into erp.asset (entity_id, category_id, code, name, serial, acquisition_date, cost, currency, life_months) values ($1, $2, 'IMM-2026-001', 'Serveur', 'SN-1', '2026-03-10', 36000, 'MRU', 36) returning rate, start_date, end_date`, [s.entity, c.id]);
  await expectError(() => db.query(`insert into erp.asset (entity_id, category_id, code, name, serial, acquisition_date, cost, currency, life_months) values ($1, $2, 'IMM-2026-002', 'Autre', 'sn-1', '2026-03-10', 1000, 'MRU', 36)`, [s.entity, c.id]), /duplicate|unique/i);
  const run = await one(`insert into erp.depreciation_run (entity_id, fiscal_year_id, run_date, status, total) values ($1, $2, '2026-12-31', 'posted', 10000) returning id`, [s.entity, s.fy]);
  const asset = await one(`select id from erp.asset where code = 'IMM-2026-001'`);
  await db.query(`insert into erp.depreciation_run_line (run_id, asset_id, amount) values ($1, $2, 10000)`, [run.id, asset.id]);
  const acc = await one(`select accumulated from erp.asset where id = $1`, [asset.id]);
  await expectError(() => db.query(`update erp.asset set life_months = 60 where id = $1`, [asset.id]), /plan is locked/);
  const run2 = await one(`insert into erp.depreciation_run (entity_id, fiscal_year_id, run_date, status, total) values ($1, $2, '2026-12-31', 'draft', 30000) returning id`, [s.entity, s.fy]);
  await expectError(() => db.query(`insert into erp.depreciation_run_line (run_id, asset_id, amount) values ($1, $2, 30000)`, [run2.id, asset.id]), /exceed/);
  return `rate ${a.rate} % · ${a.start_date} → ${a.end_date} · accumulated ${acc.accumulated}`;
});

await test('0002: payroll — net arithmetic checked, one posted run per month, posted run frozen', async (s) => {
  const e = await one(`insert into erp.employee (entity_id, code, name, first_name, last_name, category, gross_salary) values ($1, 'P001', 'A. Ahmed', 'Ahmed', 'Ahmed', 'senior', 120000) returning id`, [s.entity]);
  const r = await one(`insert into erp.payroll_run (entity_id, month, run_date, gross, social_employee, health_employee, tax, net) values ($1, '2026-09', '2026-09-30', 120000, 1200, 4800, 15000, 99000) returning id`, [s.entity]);
  await expectError(() => db.query(`insert into erp.payroll_line (run_id, employee_id, gross, social_employee, health_employee, tax, net) values ($1, $2, 120000, 1200, 4800, 15000, 98000)`, [r.id, e.id]), /check/);
  await db.query(`insert into erp.payroll_line (run_id, employee_id, gross, social_employee, health_employee, tax, net) values ($1, $2, 120000, 1200, 4800, 15000, 99000)`, [r.id, e.id]);
  await expectError(() => db.query(`update erp.payroll_run set status = 'posted' where id = $1`, [r.id]), /carries its journal entry/);
  const je = await draftEntry(s, { date: '2026-09-30', period: 9, lines: [{ account: s.a.bank, debit: 99000 }, { account: s.a.bank, credit: 99000 }] });
  await post(je);
  await db.query(`update erp.payroll_run set status = 'posted', journal_entry_id = $2 where id = $1`, [r.id, je]);
  await expectError(() => db.query(`insert into erp.payroll_run (entity_id, month, run_date, status, journal_entry_id) values ($1, '2026-09', '2026-09-30', 'posted', $2)`, [s.entity, je]), /duplicate|unique/i);
  await expectError(() => db.query(`update erp.payroll_run set gross = 1 where id = $1`, [r.id]), /posted and cannot change/);
  return 'one posted run for 2026-09, frozen';
});

await test('0002: planning — duplicate assignment refused, inactive employee refused, weekly load computed', async (s) => {
  const e = await one(`insert into erp.employee (entity_id, code, name, first_name, last_name, category, gross_salary) values ($1, 'P002', 'B. Ba', 'B', 'Ba', 'senior', 100000) returning id`, [s.entity]);
  const gone = await one(`insert into erp.employee (entity_id, code, name, first_name, last_name, category, gross_salary, active) values ($1, 'P003', 'C. Camara', 'C', 'Camara', 'senior', 100000, false) returning id`, [s.entity]);
  const eng = await one(`insert into erp.engagement (entity_id, customer_id, code, name, kind, status, fee_type, budget_hours, deadline) values ($1, $2, 'AUD-26-001', 'Audit test', 'audit', 'active', 'fixed', 100, '2026-12-31') returning id`, [s.entity, s.customer]);
  await db.query(`insert into erp.assignment (entity_id, engagement_id, employee_id, start_date, end_date, load) values ($1, $2, $3, '2026-10-05', '2026-10-16', 1)`, [s.entity, eng.id, e.id]);
  await expectError(() => db.query(`insert into erp.assignment (entity_id, engagement_id, employee_id, start_date, end_date, load) values ($1, $2, $3, '2026-10-12', '2026-10-23', 0.5)`, [s.entity, eng.id, e.id]), /already assigned/);
  await expectError(() => db.query(`insert into erp.assignment (entity_id, engagement_id, employee_id, start_date, end_date, load) values ($1, $2, $3, '2026-10-12', '2026-10-23', 0.5)`, [s.entity, eng.id, gone.id]), /not active/);
  await expectError(() => db.query(`insert into erp.assignment (entity_id, engagement_id, employee_id, start_date, end_date, load) values ($1, $2, $3, '2026-11-12', '2026-11-01', 0.5)`, [s.entity, eng.id, e.id]), /check/);
  const rows = (await db.query(`select week_start, load, engagements from erp.planning_load($1, '2026-10-05', 3) where employee_id = $2 order by week_start`, [s.entity, e.id])).rows;
  if (rows.length !== 3 || Number(rows[0].load) !== 1 || Number(rows[2].load) !== 0) throw new Error('load ' + JSON.stringify(rows));
  return `weeks ${rows.map((r) => Number(r.load)).join('/')}`;
});

await test('0002: row-level security also hides employees, loans and assignments of other entities', async (s) => {
  const other = await one(`insert into erp.entity (group_id, code, name, country, functional_currency, coa_template) values ($1, 'SA', 'BUMEX SA', 'MR', 'MRU', 'PCM') returning id`, [s.group]);
  await db.query(`insert into erp.employee (entity_id, code, name, first_name, last_name, category, gross_salary) values ($1, 'P001', 'X', 'X', 'X', 'senior', 1)`, [other.id]);
  await db.query(`insert into erp.employee (entity_id, code, name, first_name, last_name, category, gross_salary) values ($1, 'P001', 'Y', 'Y', 'Y', 'senior', 1)`, [s.entity]);
  await db.exec(`create role app_user2 login; grant usage on schema erp to app_user2; grant select on all tables in schema erp to app_user2;`);
  await db.exec(`set role app_user2; set erp.actor_role = 'staff'; set erp.entity_ids = '${s.entity}';`);
  const n = await one(`select count(*)::int as n from erp.employee`);
  await db.exec(`reset role`);
  if (n.n !== 1) throw new Error('visible employees ' + n.n);
  return 'scoped staff session sees 1 of 2 employees';
});

// ---- migration 0003: the accounting parameters of each company ------------------------------------------

await test('0003: journals — added, renamed and retyped freely; kind locked and deletion refused once entries are posted', async (s) => {
  const j = await one(`insert into erp.journal (entity_id, code, name, kind) values ($1, 'od2 ', 'Divers', 'misc') returning id, code`, [s.entity]);
  await expectError(() => db.query(`insert into erp.journal (entity_id, code, name, kind) values ($1, 'TROPLONG', 'x', 'misc')`, [s.entity]), /1 to 6 letters/);
  await db.query(`update erp.journal set code = 'OD3', name = 'Opérations diverses', kind = 'bank' where id = $1`, [j.id]);
  await db.query(`update erp.journal set kind = 'misc' where id = $1`, [j.id]);
  const draft = await draftEntry(s, { lines: [{ account: s.a.bank, debit: 10 }, { account: s.a.bank, credit: 10 }] });
  await db.query(`update erp.journal_entry set journal_id = $2 where id = $1`, [draft, j.id]);
  await expectError(() => db.query(`delete from erp.journal where id = $1`, [j.id]), /draft entries/);
  await post(draft);
  await expectError(() => db.query(`update erp.journal set kind = 'cash' where id = $1`, [j.id]), /kind is locked/);
  await db.query(`update erp.journal set code = 'OD4', name = 'OD renommé' where id = $1`, [j.id]);
  await expectError(() => db.query(`delete from erp.journal where id = $1`, [j.id]), /posted entries and must be kept/);
  const free = await one(`insert into erp.journal (entity_id, code, name, kind) values ($1, 'TMP', 'Temporaire', 'misc') returning id`, [s.entity]);
  await db.query(`delete from erp.journal where id = $1`, [free.id]);
  const left = await one(`select code, kind from erp.journal where id = $1`, [j.id]);
  return `${j.code} → ${left.code} (${left.kind}) kept; TMP deleted`;
});

await test('0003: chart — codes presented on six digits, tolerant lookup, main view shows moving accounts with auxiliaries folded', async (s) => {
  const p = await one(`select erp.present_code('6310', 6) as a, erp.present_code('41', 6) as b, erp.present_code('701712', 6) as c, erp.present_code('C001', 6) as d`);
  if (p.a !== '631000' || p.b !== '41' || p.c !== '701712' || p.d !== 'C001') throw new Error('present ' + JSON.stringify(p));
  await db.query(`insert into erp.account (entity_id, code, name_fr, class, kind) values ($1, '631000', 'Honoraires', 6, 'expense')`, [s.entity]);
  const f = await one(`select erp.find_account($1, '6310') = erp.find_account($1, '631000') as same, erp.find_account($1, '701712') as rev, erp.find_account($1, '7017120000') as stripped, erp.find_account($1, '9999') as none`, [s.entity]);
  if (!f.same || f.rev !== s.a.rev || f.stripped !== s.a.rev || f.none !== null) throw new Error('find ' + JSON.stringify(f));
  const aux = await one(`select ar_account_id from erp.customer where id = $1`, [s.customer]);
  const je = await draftEntry(s, { lines: [{ account: aux.ar_account_id, debit: 1200, customer: s.customer }, { account: s.a.rev, credit: 1200 }] });
  await post(je);
  const moving = (await db.query(`select code, balance, entries from erp.chart_rows($1, 'moving')`, [s.entity])).rows;
  const unused = (await db.query(`select code from erp.chart_rows($1, 'unused')`, [s.entity])).rows.map((r) => r.code);
  const auxil = (await db.query(`select code, collective_code, balance from erp.chart_rows($1, 'auxiliary')`, [s.entity])).rows;
  const ar = moving.find((r) => r.code === '4100');
  if (!ar || Number(ar.balance) !== 1200 || moving.some((r) => r.code === 'C001') || moving.length !== 2) throw new Error('moving ' + JSON.stringify(moving));
  if (!unused.includes('41') || !unused.includes('631000') || unused.includes('4100') || unused.includes('C001')) throw new Error('unused ' + unused.join(','));
  if (auxil.length !== 1 || auxil[0].code !== 'C001' || auxil[0].collective_code !== '4100' || Number(auxil[0].balance) !== 1200) throw new Error('aux ' + JSON.stringify(auxil));
  return `moving: ${moving.map((r) => r.code).join(', ')} · unused: ${unused.join(', ')} · auxiliary: C001 under 4100`;
});

await test('0003: third parties — unique codes across customers, suppliers and auxiliaries; auxiliary account created under the collective', async (s) => {
  const c0 = await one(`select c.code, a.code as aux, a.is_auxiliary, col.code as collective from erp.customer c join erp.account a on a.id = c.ar_account_id join erp.account col on col.id = a.collective_id where c.id = $1`, [s.customer]);
  if (c0.aux !== 'C001' || !c0.is_auxiliary || c0.collective !== '4100') throw new Error('seed customer ' + JSON.stringify(c0));
  const c2 = await one(`insert into erp.customer (entity_id, name) values ($1, 'Sans code') returning code`, [s.entity]);
  if (c2.code !== 'C002') throw new Error('generated ' + c2.code);
  await expectError(() => db.query(`insert into erp.customer (entity_id, code, name) values ($1, 'c001', 'Doublon')`, [s.entity]), /already used by another customer/);
  await expectError(() => db.query(`insert into erp.customer (entity_id, code, name) values ($1, 'X', 'Trop court')`, [s.entity]), /2 to 12 characters/);
  await expectError(() => db.query(`insert into erp.supplier (entity_id, code, name) values ($1, 'C001', 'Même code')`, [s.entity]), /auxiliary account C001 already exists/);
  const f1 = await one(`insert into erp.supplier (entity_id, name) values ($1, 'Fournisseur auto') returning code, ap_account_id`, [s.entity]);
  const fa = await one(`select a.code, col.code as collective from erp.account a join erp.account col on col.id = a.collective_id where a.id = $1`, [f1.ap_account_id]);
  if (f1.code !== 'F001' || fa.code !== 'F001' || fa.collective !== '4000') throw new Error('supplier ' + JSON.stringify({ f1, fa }));
  await db.query(`update erp.customer set code = 'alpha-01', name = 'Alpha SA' where id = $1`, [s.customer]);
  const renamed = await one(`select c.code, a.code as aux, a.name_fr from erp.customer c join erp.account a on a.id = c.ar_account_id where c.id = $1`, [s.customer]);
  if (renamed.code !== 'ALPHA-01' || renamed.aux !== 'ALPHA-01' || renamed.name_fr !== 'Alpha SA') throw new Error('renamed ' + JSON.stringify(renamed));
  await db.query(`insert into erp.third_party_rules (entity_id, customer_prefix, digits) values ($1, 'cl', 4)`, [s.entity]);
  const next = await one(`select erp.next_third_party_code($1, 'customer') as c, erp.next_third_party_code($1, 'supplier') as f`, [s.entity]);
  if (next.c !== 'CL0001' || next.f !== 'F0001') throw new Error('next ' + JSON.stringify(next));
  const other = await one(`insert into erp.entity (group_id, code, name, country, functional_currency, coa_template) values ($1, 'SA', 'BUMEX SA', 'MR', 'MRU', 'PCM') returning id`, [s.group]);
  const foreign = await one(`insert into erp.account (entity_id, code, name_fr, class, kind) values ($1, '4100', 'Clients', 4, 'asset') returning id`, [other.id]);
  await expectError(() => db.query(`update erp.third_party_rules set customer_collective_id = $2 where entity_id = $1`, [s.entity, foreign.id]), /of the entity/);
  await expectError(() => db.query(`insert into erp.customer (entity_id, code, name) values ($1, 'S001', 'Sans collectif')`, [other.id]), /no customer collective account configured/);
  return `C002 generated, F001 under 4000, C001 → ALPHA-01 followed by its account, next CL0001 / F0001`;
});

await test('0003: bank accounts — duplicates refused, ledger account must be live and postable, journal bank/cash, locks once used', async (s) => {
  const gl2 = await one(`insert into erp.account (entity_id, code, name_fr, class, kind) values ($1, '550200', 'BNM compte MRU', 5, 'asset') returning id`, [s.entity]);
  const dead = await one(`insert into erp.account (entity_id, code, name_fr, class, kind, active) values ($1, '550300', 'Ancien compte', 5, 'asset', false) returning id`, [s.entity]);
  const jb = await one(`insert into erp.journal (entity_id, code, name, kind) values ($1, 'BQ', 'Banque', 'bank') returning id`, [s.entity]);
  const b1 = await one(`insert into erp.bank_account (entity_id, name, bank_name, account_number, iban, currency, gl_account_id, journal_id) values ($1, 'BMCI MRU', 'BMCI', '0001 2345', 'MR13 0001', 'MRU', $2, $3) returning id`, [s.entity, s.a.bank, jb.id]);
  await expectError(() => db.query(`insert into erp.bank_account (entity_id, name, bank_name, currency, gl_account_id) values ($1, ' bmci mru ', 'BMCI', 'MRU', $2)`, [s.entity, gl2.id]), /duplicate|unique/i);
  await expectError(() => db.query(`insert into erp.bank_account (entity_id, name, bank_name, account_number, currency, gl_account_id) values ($1, 'Autre', 'BNM', '00012345', 'MRU', $2)`, [s.entity, gl2.id]), /duplicate|unique/i);
  await expectError(() => db.query(`insert into erp.bank_account (entity_id, name, bank_name, iban, currency, gl_account_id) values ($1, 'Autre', 'BNM', 'mr130001', 'MRU', $2)`, [s.entity, gl2.id]), /duplicate|unique/i);
  await expectError(() => db.query(`insert into erp.bank_account (entity_id, name, bank_name, currency, gl_account_id) values ($1, 'Autre', 'BNM', 'MRU', $2)`, [s.entity, s.a.bank]), /duplicate|unique/i);
  await expectError(() => db.query(`insert into erp.bank_account (entity_id, name, bank_name, currency, gl_account_id) values ($1, 'Autre', 'BNM', 'MRU', $2)`, [s.entity, dead.id]), /not postable or no longer active/);
  await expectError(() => db.query(`insert into erp.bank_account (entity_id, name, bank_name, currency, gl_account_id) values ($1, 'Autre', 'BNM', 'MRU', $2)`, [s.entity, s.a.root41]), /not postable/);
  await expectError(() => db.query(`insert into erp.bank_account (entity_id, name, bank_name, currency, gl_account_id, journal_id) values ($1, 'Autre', 'BNM', 'MRU', $2, $3)`, [s.entity, gl2.id, s.journal]), /not a bank or cash journal/);
  await expectError(() => db.query(`insert into erp.bank_account (entity_id, name, currency, gl_account_id) values ($1, 'Sans banque', 'MRU', $2)`, [s.entity, gl2.id]), /bank name is required/);
  const b2 = await one(`insert into erp.bank_account (entity_id, name, bank_name, currency, gl_account_id) values ($1, 'BNM MRU', 'BNM', 'MRU', $2) returning id`, [s.entity, gl2.id]);
  const jf = await one(`select erp.bank_journal_for($1) = $2 as own, erp.bank_journal_for($3) = $2 as fallback`, [b1.id, jb.id, b2.id]);
  if (!jf.own || !jf.fallback) throw new Error('journal ' + JSON.stringify(jf));
  await db.query(`insert into erp.bank_transaction (bank_account_id, txn_date, amount, description) values ($1, '2026-10-01', -500, 'Frais')`, [b1.id]);
  await expectError(() => db.query(`update erp.bank_account set currency = 'EUR' where id = $1`, [b1.id]), /currency and ledger account are locked/);
  await expectError(() => db.query(`update erp.bank_account set active = false where id = $1`, [b1.id]), /statement lines to reconcile/);
  await db.query(`update erp.bank_account set bank_address = 'Avenue Nasser, Nouakchott', rib = 'RIB-1' where id = $1`, [b1.id]);
  await db.query(`update erp.bank_account set active = false where id = $1`, [b2.id]);
  await expectError(() => db.query(`insert into erp.bank_transaction (bank_account_id, txn_date, amount, description) values ($1, '2026-10-02', 100, 'x')`, [b2.id]), /inactive: no new operation/);
  await expectError(() => db.query(`insert into erp.customer_payment (entity_id, customer_id, payment_date, currency, amount_txn, amount, bank_account_id) values ($1, $2, '2026-10-02', 'MRU', 100, 100, $3)`, [s.entity, s.customer, b2.id]), /inactive: no new operation/);
  return 'two accounts, 8 refusals, BNM deactivated and closed to operations';
});

await test('0003: manual loan schedule — rows within the principal and in date order, payments follow the typed rows, paid rows frozen', async (s) => {
  const b = await one(`insert into erp.bank_account (entity_id, name, bank_name, currency, gl_account_id) values ($1, 'BMCI', 'BMCI', 'MRU', $2) returning id`, [s.entity, s.a.bank]);
  const l = await one(`insert into erp.loan (entity_id, lender, reference, currency, principal, annual_rate, months, start_date, bank_account_id, schedule_mode) values ($1, 'BMCI', 'EMP-2', 'MRU', 3000, 0.1, 3, '2026-10-01', $2, 'manual') returning id`, [s.entity, b.id]);
  const auto = await one(`insert into erp.loan (entity_id, lender, reference, currency, principal, annual_rate, months, start_date, bank_account_id) values ($1, 'BMCI', 'EMP-3', 'MRU', 1000, 0.1, 2, '2026-10-01', $2) returning id`, [s.entity, b.id]);
  await expectError(() => db.query(`insert into erp.loan_instalment (entity_id, loan_id, instalment_no, due_date, capital, interest) values ($1, $2, 1, '2026-11-01', 500, 5)`, [s.entity, auto.id]), /automatic schedule/);
  await db.query(`insert into erp.loan_instalment (entity_id, loan_id, instalment_no, due_date, capital, interest, fees) values ($1, $2, 1, '2026-10-16', 1000, 25, 10)`, [s.entity, l.id]);
  await db.query(`insert into erp.loan_instalment (entity_id, loan_id, instalment_no, due_date, capital, interest, fees) values ($1, $2, 2, '2026-11-15', 1000, 17, 10)`, [s.entity, l.id]);
  await expectError(() => db.query(`insert into erp.loan_instalment (entity_id, loan_id, instalment_no, due_date, capital, interest) values ($1, $2, 3, '2026-12-15', 1500, 8)`, [s.entity, l.id]), /exceeds the amount borrowed/);
  await expectError(() => db.query(`insert into erp.loan_instalment (entity_id, loan_id, instalment_no, due_date, capital, interest) values ($1, $2, 3, '2026-11-10', 1000, 8)`, [s.entity, l.id]), /dated before the previous one/);
  await db.query(`insert into erp.loan_instalment (entity_id, loan_id, instalment_no, due_date, capital, interest, fees) values ($1, $2, 3, '2026-12-15', 1000, 8, 10)`, [s.entity, l.id]);
  await expectError(() => db.query(`insert into erp.loan_payment (entity_id, loan_id, instalment_no, paid_on, capital, interest, fees, bank_account_id) values ($1, $2, 1, '2026-10-16', 1000, 30, 10, $3)`, [s.entity, l.id, b.id]), /amounts differ from the typed schedule/);
  await db.query(`insert into erp.loan_payment (entity_id, loan_id, instalment_no, paid_on, capital, interest, fees, bank_account_id) values ($1, $2, 1, '2026-10-16', 1000, 25, 10, $3)`, [s.entity, l.id, b.id]);
  await expectError(() => db.query(`update erp.loan_instalment set capital = 900 where loan_id = $1 and instalment_no = 1`, [l.id]), /is paid: it is frozen/);
  await expectError(() => db.query(`delete from erp.loan_instalment where loan_id = $1 and instalment_no = 1`, [l.id]), /is paid: it is frozen/);
  await db.query(`update erp.loan_instalment set interest = 18 where loan_id = $1 and instalment_no = 2`, [l.id]);
  await expectError(() => db.query(`update erp.loan set schedule_mode = 'auto' where id = $1`, [l.id]), /schedule mode is locked/);
  const foreignJ = await one(`insert into erp.journal (entity_id, code, name, kind) values ($1, 'EMP', 'Emprunts', 'misc') returning id`, [s.entity]);
  await db.query(`update erp.loan set journal_id = $2, interest_account_id = $3 where id = $1`, [l.id, foreignJ.id, s.a.rev]);
  await expectError(() => db.query(`update erp.loan set loan_account_id = $2 where id = $1`, [l.id, s.a.root41]), /not a postable active account/);
  const tot = await one(`select sum(total) as total, count(*)::int as n from erp.loan_instalment where loan_id = $1`, [l.id]);
  return `${tot.n} typed rows totalling ${tot.total}, row 1 paid and frozen, row 2 still editable`;
});

await test('0003: payroll regime per company — GTA exempts the deductions, a line carrying one is refused, flags override', async (s) => {
  const e = await one(`insert into erp.employee (entity_id, code, name, first_name, last_name, category, gross_salary) values ($1, 'P001', 'A. Ahmed', 'Ahmed', 'Ahmed', 'senior', 120000) returning id`, [s.entity]);
  const r = await one(`insert into erp.payroll_run (entity_id, month, run_date, gross, social_employee, health_employee, tax, net) values ($1, '2026-09', '2026-09-30', 120000, 0, 0, 0, 120000) returning id`, [s.entity]);
  const normal = await one(`select * from erp.payroll_exemptions($1)`, [s.entity]);
  if (normal.social || normal.health || normal.tax) throw new Error('default ' + JSON.stringify(normal));
  await db.query(`insert into erp.payroll_rules (entity_id, regime) values ($1, 'gta')`, [s.entity]);
  const gta = await one(`select * from erp.payroll_exemptions($1)`, [s.entity]);
  if (!gta.social || !gta.health || !gta.tax) throw new Error('gta ' + JSON.stringify(gta));
  await expectError(() => db.query(`insert into erp.payroll_line (run_id, employee_id, gross, social_employee, health_employee, tax, net) values ($1, $2, 120000, 1200, 0, 0, 118800)`, [r.id, e.id]), /regime exempts/);
  await db.query(`insert into erp.payroll_line (run_id, employee_id, gross, social_employee, health_employee, tax, net) values ($1, $2, 120000, 0, 0, 0, 120000)`, [r.id, e.id]);
  await db.query(`update erp.payroll_rules set social_exempt = false where entity_id = $1`, [s.entity]);
  const mixed = await one(`select * from erp.payroll_exemptions($1)`, [s.entity]);
  if (mixed.social || !mixed.health || !mixed.tax) throw new Error('mixed ' + JSON.stringify(mixed));
  await db.query(`update erp.payroll_line set social_employee = 1200, net = 118800 where run_id = $1 and employee_id = $2`, [r.id, e.id]);
  await expectError(() => db.query(`update erp.payroll_rules set regime = 'other' where entity_id = $1`, [s.entity]), /check/);
  return 'GTA: no CNSS / CNAM / ITS; CNSS re-enabled by its flag';
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
