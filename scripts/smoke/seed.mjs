// The smoke test's office (scripts/smoke/run.mjs): people in the Auth emulator and the database as production has
// them since the move to PostgreSQL. Written by the database's superuser, so the guards and defaults run (a mission's
// number and customer, a ticket's entity…) and the history names "smoke-seed".
//
//   mohamed  admin, every entity, role modifier       fatimetou  admin, every entity (not a role modifier)
//   mariem   manager of BUMEX Audit, owns A           oumar      manager of BUMEX IT, owns the IT mission
//   ahmed    staff of Audit, on A, T1's assignee       khadija    staff of IT, on A (a sub-task of T1) and the IT mission
//   sidi     sees the reports only (a shareholder)     salma      staff of Audit, nothing assigned
//   nouvelle signed up, no entity chosen, no access yet
import pg from "pg";

export const PASSWORD = "Smoke-1234!";
export const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const uid = {
  mohamed: "kTq8ZJ2rN4pV9mWc1sXe3hYb6dLf",
  fatimetou: "Fa7imeTou2Adm1nN0tMod1f1er00",
  mariem: "11111111-1111-4111-8111-111111111111",
  ahmed: "22222222-2222-4222-8222-222222222222",
  khadija: "Qp4LmN8rT2vX6zB1cD5fG9hJ3kRw",
  sidi: "33333333-3333-4333-8333-333333333333",
  oumar: "44444444-4444-4444-8444-444444444444",
  salma: "55555555-5555-4555-8555-555555555555",
  nouvelle: "Zx9Cv8Bn7Mm6Ll5Kk4Jj3Hh2Gg1F",
};

// login (the part before @bumex.mr), uid, name, home entity, super admin, access [role, entities, modules, manages access]
export const people = [
  ["mohamed.cheikh", uid.mohamed, "Mohamed Cheikh", "bumex_holding", true, ["admin", null, null, true]],
  ["fatimetou.admin", uid.fatimetou, "Fatimetou Admin", "bumex_holding", false, ["admin", null, null, false]],
  ["mariem.sow", uid.mariem, "Mariem Sow", "bumex_audit", false, ["manager", ["bumex_audit"], null, false]],
  ["ahmed.ba", uid.ahmed, "Ahmed Ba", "bumex_audit", false, ["staff", ["bumex_audit"], null, false]],
  ["khadija.diallo", uid.khadija, "Khadija Diallo", "bumex_it", false, ["staff", ["bumex_it"], null, false]],
  ["sidi.associe", uid.sidi, "Sidi Associé", "bumex_holding", false, ["staff", null, ["reports"], false]],
  ["oumar.sy", uid.oumar, "Oumar Sy", "bumex_it", false, ["manager", ["bumex_it"], null, false]],
  ["salma.fall", uid.salma, "Salma Fall", "bumex_audit", false, ["staff", ["bumex_audit"], null, false]],
  ["nouvelle", uid.nouvelle, "Nouvelle Personne", null, false, null],
];

export const M = { audit: id(121), done: id(122), it: id(123), tool: id(124) };
export const OLD_PROJECT = id(101); // the audit mission's address in BUMEX One (old links)
export const C = { snim: id(201), bp: id(202), web: id(203) };
export const T = { t1: id(301), t2: id(302), t3: id(303), t4: id(304) };

export async function seed({ databaseUrl, auth }) {
  for (const [login, u, name] of people) {
    await auth.deleteUser(u).catch(() => undefined);
    await auth.createUser({ uid: u, email: `${login}@bumex.mr`, password: PASSWORD, displayName: name, emailVerified: true });
  }

  const db = new pg.Client({ connectionString: databaseUrl });
  await db.connect();
  const q = (sql, params = []) => db.query(sql, params);
  try {
    await q("begin");
    await q("select erp.open_system_session('smoke-seed')");
    const entity = Object.fromEntries((await q("select code, id from erp.entity")).rows.map((r) => [r.code, r.id]));

    for (const [login, u, name, home, superAdmin, access] of people) {
      await q(
        `insert into work.person (id, email, full_name, entity_code, is_super_admin, job_title, department, skills, availability_status, weekly_capacity_hours)
         values ($1, $2, $3, $4, $5, $6, 'Audit', '{IFRS}', 'available', 40)`,
        [u, `${login}@bumex.mr`, name, home, superAdmin, access?.[0] === "manager" ? "Associée audit" : "Consultant"],
      );
      if (access) {
        await q("insert into erp.user_access (user_id, erp_role, entity_codes, modules, manages_access) values ($1, $2, $3, $4, $5)", [u, ...access]);
      }
    }

    // the Audit floor's customer collective: a mission's client gets its customer there
    const ar = (await q("insert into erp.account (entity_id, code, name_fr, class, kind) values ($1, '411000', 'Clients', 4, 'asset') returning id", [entity.bumex_audit])).rows[0].id;
    await q("insert into erp.account_mapping (entity_id, key, account_id) values ($1, 'AR_CONTROL', $2)", [entity.bumex_audit, ar]);

    await q(
      `insert into work.client (id, name, type, status, contact_email, account_manager_id, country, prospect_stage, next_follow_up_at, tax_id, website, notes) values
         ($1, 'SNIM', 'company', 'active', 'dg@snim.mr', $4, 'MR', null, null, null, null, 'Client historique'),
         ($2, 'Banque Populaire', 'company', 'prospect', null, null, 'Mauritanie', 'negotiation', '2026-11-02', '123', null, null),
         ($3, 'Client Web', 'ngo', 'active', null, null, null, null, null, null, 'https://www.client.mr', null)`,
      [C.snim, C.bp, C.web, uid.mariem],
    );

    const mission = (mid, e, client, owner, name, more) =>
      q(
        `insert into erp.engagement (id, entity_id, client_id, owner_id, name, code, project_kind, status, start_date, deadline, fee_type, fixed_fee,
                                     budget_hours, description, priority, manual_progress, bumex_project_id)
         values ($1, $2, $3, $4, $5, null, $6, $7, '2026-05-01', '2026-11-30', $8, $9, $10, $11, $12, $13, $14)`,
        [mid, e, client, owner, name, more.kind ?? "client_mission", more.status ?? "active", more.fee ?? "fixed", more.amount ?? null, more.hours ?? null,
          more.description ?? null, more.priority ?? "medium", more.progress ?? null, more.old ?? null],
      );
    await mission(M.audit, entity.bumex_audit, C.snim, uid.mariem, "Audit légal 2025", { fee: "time", amount: 900000, hours: 120, description: "Audit des comptes 2025", priority: "high", old: OLD_PROJECT });
    await mission(M.done, entity.bumex_audit, C.snim, uid.mariem, "Mission terminée", { status: "completed", progress: 80 });
    await mission(M.it, entity.bumex_it, C.web, uid.oumar, "Refonte du site", { status: "planned" });
    await mission(M.tool, entity.bumex_holding, C.bp, uid.mohamed, "Outil interne", { kind: "internal_tool" });
    for (const [m, u] of [[M.audit, uid.ahmed], [M.audit, uid.khadija], [M.it, uid.khadija]]) {
      await q("insert into erp.engagement_staff (engagement_id, user_id, role) values ($1, $2, 'employee')", [m, u]);
    }
    // their boards are their floors' (0014): BUMEX Audit's is the audit model (todo, in_progress, review, aud_report, done)
    await q(
      `insert into work.milestone (id, engagement_id, title, status, due_date, owner_id) values
         ($1, $3, 'Planification', 'completed', '2026-06-01', $4), ($2, $3, 'Rapport', 'planned', '2026-11-15', $4)`,
      [id(501), id(502), M.audit, uid.mariem],
    );

    const ticket = (tid, m, title, more) =>
      q(
        `insert into erp.task (id, entity_id, engagement_id, title, assignee_id, reporter_id, status, stage_id, priority, due_date, completed_at)
         values ($1, (select entity_id from erp.engagement where id = $2), $2, $3, $4, $5, $6, $7, $8, $9, case when $6 = 'done' then current_date end)`,
        [tid, m, title, more.assignee ?? null, more.reporter, more.status, more.status, more.priority ?? "medium", more.due ?? null],
      );
    await ticket(T.t1, M.audit, "Confirmations bancaires", { assignee: uid.ahmed, reporter: uid.mariem, status: "in_progress", priority: "high", due: "2026-10-20" });
    await ticket(T.t2, M.audit, "Revue des stocks", { assignee: uid.ahmed, reporter: uid.mariem, status: "review", priority: "urgent" });
    await ticket(T.t3, M.audit, "Lettre d'affirmation", { reporter: uid.khadija, status: "done" });
    await ticket(T.t4, M.it, "Maquettes", { assignee: uid.khadija, reporter: uid.oumar, status: "todo" });
    await q(
      `insert into work.subtask (id, task_id, title, is_done, assignee_id, position, completed_at, created_by) values
         ($1, $4, 'BNM', true, $6, 0, now(), $8), ($2, $4, 'BMCI', false, $7, 1, null, $8), ($3, $5, 'Accueil', false, null, 0, null, $9)`,
      [id(601), id(602), id(603), T.t1, T.t4, uid.ahmed, uid.khadija, uid.mariem, uid.oumar],
    );

    await q(
      `insert into work.contract (id, client_id, engagement_id, title, status, contract_type, start_date, end_date, amount, currency, responsible_user_id) values
         ($1, $2, $3, 'Contrat d''audit', 'active', 'audit', '2026-05-01', '2027-04-30', 900000, 'MRU', $4)`,
      [id(701), C.snim, M.audit, uid.mariem],
    );
    await q(
      `insert into work.document (id, title, document_type, related_type, related_id, file_url, file_name, file_size, mime_type, uploaded_by, visibility) values
         ($1, 'Rapport intermédiaire', 'report', 'project', $2, $3, 'rapport.pdf', 1200, 'application/pdf', $4, 'internal')`,
      [id(801), M.audit, `${uid.mariem}/2026/10/a-rapport.pdf`, uid.mariem],
    );

    await q(
      `insert into work.comment (id, subject_type, subject_id, author_id, body, is_internal) values
         ($1, 'project', $3, $5, 'Lancement de la mission', false), ($2, 'ticket', $4, $6, 'Demandes envoyées', true)`,
      [id(901), id(902), M.audit, T.t1, uid.mariem, uid.ahmed],
    );
    await q(
      "insert into work.note (id, subject_type, subject_id, author_id, title, body, visibility, pinned) values ($1, 'project', $2, $3, 'Équipe', 'Point d''équipe hebdomadaire', 'team', true)",
      [id(911), M.audit, uid.mariem],
    );
    await q(
      `insert into work.notification (id, user_id, type, title, body, subject_type, subject_id, skip_email) values
         ($1, $2, 'assignment', 'New ticket assignment', 'You were assigned to Confirmations bancaires.', 'ticket', $3, true)`,
      [id(921), uid.ahmed, T.t1],
    );
    await q(
      `insert into work.activity (id, user_id, action, subject_type, subject_id, metadata, entity_code) values
         ($1, $3, 'Created project Audit légal 2025', 'project', $4, '{"kind":"create","summary":"Project created"}', 'bumex_audit'),
         ($2, $5, 'Moved ticket from À faire to En cours', 'task', $6, '{"kind":"status_change","from":"À faire","to":"En cours"}', 'bumex_audit')`,
      [id(941), id(942), uid.mariem, M.audit, uid.ahmed, T.t1],
    );

    const line = (n, u, m, day, minutes, mission = "") =>
      q("insert into erp.time_entry (id, entity_id, engagement_id, user_id, work_date, minutes, mission) values ($1, (select entity_id from erp.engagement where id = $2), $2, $3, $4, $5, $6)", [id(n), m, u, day, minutes, mission]);
    await line(1001, uid.ahmed, M.audit, "2026-10-19", 120, "Revue");
    await line(1002, uid.ahmed, M.audit, "2026-10-20", 60);
    await line(1003, uid.khadija, M.it, "2026-10-19", 90);
    await line(1004, uid.ahmed, M.audit, "2026-10-13", 30);
    await q(
      "insert into work.timesheet_week (user_id, week_start, entity_id, status, submitted_at, reviewed_at, reviewed_by) values ($1, '2026-10-12', $2, 'approved', '2026-10-17T16:00:00Z', '2026-10-18T09:00:00Z', $3)",
      [uid.ahmed, entity.bumex_audit, uid.mariem],
    );

    // the old finance records (read-only since the ERP keeps the books)
    await q(
      `insert into work.finance_invoice (id, invoice_number, client_id, engagement_id, contract_id, issue_date, due_date, amount_ht, tax_amount, amount_ttc, currency,
                                         status, notes, approval_status, approved_by, approved_at, created_by, entity_code, created_at, updated_at)
       values ($1, 'INV-AB12C-DE34F', $2, $3, $4, '2026-06-01', '2026-07-01', 450000, 72000, 522000, 'MRU', 'partially_paid', '[TAX_REGIME:STANDARD]',
               'approved', $5, now(), $5, 'bumex_audit', now(), now())`,
      [id(1201), C.snim, M.audit, id(701), uid.mohamed],
    );
    await q(
      `insert into work.finance_payment (id, invoice_id, client_id, engagement_id, amount, currency, payment_date, method, status, reference, created_by, entity_code, created_at, updated_at)
       values ($1, $2, $3, $4, 200000, 'MRU', '2026-06-20', 'bank_transfer', 'received', 'VIR-001', $5, 'bumex_audit', now(), now())`,
      [id(1202), id(1201), C.snim, M.audit, uid.mohamed],
    );
    await q("commit");
  } catch (error) {
    await q("rollback").catch(() => undefined);
    throw error;
  } finally {
    await db.end();
  }
}
