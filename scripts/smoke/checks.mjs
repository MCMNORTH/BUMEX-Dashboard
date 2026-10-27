// What the smoke test checks (scripts/smoke/run.mjs), through the app as people use it: its server actions, its
// routes and its pages in Chrome; each write looked up in the database afterwards.
import { randomUUID } from "node:crypto";

import { C, M, OLD_PROJECT, T, id, uid } from "./seed.mjs";

export async function runChecks({ act, db, base, authPort, cookies, openBrowser, mail, cronSecret, check }) {
  const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  const all = async (sql, params = []) => (await db.query(sql, params)).rows;
  const get = (who, path) => fetch(`${base}${path}`, { headers: { Cookie: `${who ? `__session=${cookies[who]}; ` : ""}bumex-locale=fr` }, redirect: "manual" });
  const entity = Object.fromEntries((await all("select code, id from erp.entity")).map((r) => [r.code, r.id]));
  const A = M.audit;

  // ---- tickets ------------------------------------------------------------------------------------------------------
  let r = await act("mariem.sow", "createTicketAction", {
    prev: {},
    form: { title: "Circularisation clients", description: "Envoyer les lettres", project_id: A, assignee_id: uid.ahmed, reporter_id: uid.mariem, priority: "high", type: "task", due_date: "2026-11-05", create_another: "1", subtasks: ["Liste", "Envoi"] },
  });
  const created = r?.created?.id;
  check("the mission's manager creates a ticket", Boolean(created), r);
  const ticket = created ? await one("select t.*, (select count(*)::int from work.subtask s where s.task_id = t.id) subs from erp.task t where id = $1", [created]) : null;
  check("…on the mission's entity, its board's first column, with its sub-tasks", ticket?.entity_id === entity.bumex_audit && ticket?.stage_id === "todo" && ticket?.subs === 2, ticket && { stage: ticket.stage_id, subs: ticket.subs });
  const notified = await all("select n.title, e.status from work.notification n left join work.notification_email e on e.notification_id = n.id where n.subject_id = $1", [created]);
  check("…its assignee is notified, by e-mail too", notified.some((n) => n.title === "New ticket assignment" && n.status), notified);

  r = await act("khadija.diallo", "createTicketAction", { prev: {}, form: { title: "x", project_id: A, assignee_id: uid.khadija, reporter_id: uid.khadija, priority: "low", type: "task", create_another: "1" } });
  check("an employee cannot create a ticket", Boolean(r?.error), r);

  r = await act("ahmed.ba", "moveTicketStageAction", { args: [T.t1, { stageId: "review" }] });
  const moved = await one("select status, stage_id from erp.task where id = $1", [T.t1]);
  check("the assignee moves the ticket to review", moved.stage_id === "review" && moved.status === "review", { r, moved });
  r = await act("khadija.diallo", "moveTicketStageAction", { args: [T.t1, { stageId: "todo" }] });
  check("a sub-task owner does not move the ticket", (await one("select stage_id from erp.task where id = $1", [T.t1])).stage_id === "review", r);

  r = await act("ahmed.ba", "createSubtaskAction", { args: [T.t1, "Relance BCM"] });
  const sub = await one("select id from work.subtask where task_id = $1 and title = 'Relance BCM'", [T.t1]);
  check("the assignee adds a sub-task", Boolean(sub), r);
  r = await act("ahmed.ba", "toggleSubtaskAction", { args: [sub?.id, true] });
  check("…and ticks it", (await one("select completed_at is not null as stamped from work.subtask where id = $1", [sub?.id]))?.stamped === true, r);
  r = await act("khadija.diallo", "toggleSubtaskAction", { args: [id(602), true] });
  check("a sub-task's owner ticks theirs", (await one("select is_done from work.subtask where id = $1", [id(602)])).is_done === true, r);

  // ---- conversation -------------------------------------------------------------------------------------------------
  r = await act("ahmed.ba", "createCommentAction", { prev: {}, form: { body: "Relances envoyées @Mariem Sow", entity_type: "ticket", entity_id: T.t1 } });
  check("the assignee comments the ticket", r?.success === true, r);
  check("…the person mentioned is notified", Boolean(await one("select 1 from work.notification where user_id = $1 and type = 'mention'", [uid.mariem])));
  r = await act("sidi.associe", "createCommentAction", { prev: {}, form: { body: "Commentaire actionnaire", entity_type: "project", entity_id: A } });
  check("a shareholder cannot comment", Boolean(r?.error), r);
  r = await act("mariem.sow", "createNoteAction", { prev: {}, form: { title: "Revue", body: "Points de revue de la semaine", entity_type: "project", entity_id: A, visibility: "management" } });
  check("the manager writes a management note", r?.success === true, r);

  // ---- time ---------------------------------------------------------------------------------------------------------
  const lineId = randomUUID();
  r = await act("ahmed.ba", "saveTimeAction", { args: [{ id: lineId, project_id: A, work_date: "2026-10-26", hours: "1", minutes: "30", note: "Revue", mission: "Revue" }] });
  check("an employee enters time on their mission", r?.success === true, r);
  const line = await one("select minutes, entity_id from erp.time_entry where id = $1", [lineId]);
  check("…90 minutes on the mission's entity", line?.minutes === 90 && line?.entity_id === entity.bumex_audit, line);
  r = await act("ahmed.ba", "saveTimeAction", { args: [{ id: randomUUID(), project_id: A, work_date: "2026-10-26", hours: "23", minutes: "0", note: "", mission: "Revue" }] });
  check("…never more than 24 hours a day", r?.error === "daily_limit", r);
  r = await act("ahmed.ba", "saveTimeAction", { args: [{ id: lineId, project_id: A, work_date: "2026-10-26", hours: "2", minutes: "0", note: "Revue", mission: "Revue", updated_at: "2020-01-01T00:00:00Z" }] });
  check("…an edit from an old version is a conflict", r?.error === "conflict", r);
  r = await act("ahmed.ba", "submitTimesheetWeekAction", { args: ["2026-10-26"] });
  check("the employee sends the week", r?.success === true, r);
  r = await act("ahmed.ba", "saveTimeAction", { args: [{ id: randomUUID(), project_id: A, work_date: "2026-10-26", hours: "1", minutes: "0", note: "", mission: "Revue" }] });
  check("…then cannot add to it", r?.error === "unavailable", r);
  check("…their entity's manager is told", Boolean(await one("select 1 from work.notification where user_id = $1 and title = 'Timesheet submitted'", [uid.mariem])));
  await act("khadija.diallo", "approveTimesheetWeekAction", { args: [uid.ahmed, "2026-10-26"] });
  check("another entity's employee cannot approve it", (await one("select status from work.timesheet_week where user_id = $1 and week_start = '2026-10-26'", [uid.ahmed])).status === "submitted");
  await act("mariem.sow", "approveTimesheetWeekAction", { args: [uid.ahmed, "2026-10-26"] });
  const week = await one("select status, reviewed_by from work.timesheet_week where user_id = $1 and week_start = '2026-10-26'", [uid.ahmed]);
  check("the entity's manager approves it", week.status === "approved" && week.reviewed_by === uid.mariem, week);

  // ---- missions -----------------------------------------------------------------------------------------------------
  r = await act("mariem.sow", "saveMissionAction", {
    args: [{ name: "Due diligence", client_id: C.snim, description: "Revue d'acquisition", owner_id: uid.mariem, status: "active", start_date: "2026-11-01", end_date: "2026-12-15", budget_amount: "250000", priority: "high", project_kind: "client_mission", manual_progress: "", entity_id: entity.bumex_audit, member_ids: [uid.ahmed], fee_type: "time", budget_hours: "80" }],
  });
  const mission = await one("select e.*, (select count(*)::int from work.board b where b.engagement_id = e.id) boards, (select array_agg(work.initials(p.full_name)) from erp.engagement_staff s join work.person p on p.id = s.user_id where s.engagement_id = e.id) staff from erp.engagement e where name = 'Due diligence'");
  check("the manager creates a mission", r?.ok === true && Boolean(mission), { ok: r?.ok, error: r?.error });
  check("…numbered, with its client's customer, its board, its member and terms", mission?.code === "M-003" && Boolean(mission?.customer_id) && mission?.boards === 1 && mission?.staff?.join() === "A.B." && mission?.fee_type === "time", mission && { code: mission.code, customer: mission.customer_id, boards: mission.boards, staff: mission.staff });
  r = await act("ahmed.ba", "saveMissionAction", { args: [{ name: "Pas autorisé", client_id: "", description: "", owner_id: uid.ahmed, status: "active", start_date: "", end_date: "", budget_amount: "", priority: "medium", project_kind: "internal_tool", manual_progress: "", entity_id: entity.bumex_audit, member_ids: [], fee_type: "fixed", budget_hours: "" }] });
  check("an employee cannot create a mission", r?.ok === false, r);
  r = await act("mariem.sow", "removeProjectAction", { args: [mission?.id] });
  check("the manager deletes a mission without time", r?.success === true && !(await one("select 1 from erp.engagement where name = 'Due diligence'")), r);
  r = await act("mariem.sow", "removeProjectAction", { args: [A] });
  check("…but not one with time entered", Boolean(r?.error), r);

  // ---- clients: one client, two sides -------------------------------------------------------------------------------
  r = await act("mariem.sow", "saveClientAction", {
    form: { client_id: C.snim, name: "SNIM SA", legal_name: "", type: "company", industry: "Mines", contact_email: "finance@snim.mr", contact_phone: "", address: "", country: "MR", city: "Nouadhibou", website: "", tax_id: "NIF-9", status: "active", prospect_stage: "", next_follow_up_at: "", account_manager_id: uid.mariem, notes: "Client historique" },
  });
  const customer = await one("select name, nif from erp.customer where client_id = $1", [C.snim]);
  check("the account manager edits the client; its customer follows", r?.success === true && customer?.name === "SNIM SA" && customer?.nif === "NIF-9", { r, customer });
  r = await act("khadija.diallo", "saveClientAction", { form: { client_id: C.snim, name: "Piraté", type: "company", status: "active", contact_email: "", account_manager_id: "" } });
  check("someone else cannot", (await one("select name from work.client where id = $1", [C.snim])).name === "SNIM SA", r);

  // ---- reads that must not break ------------------------------------------------------------------------------------
  for (const [who, name, args] of [
    ["sidi.associe", "ticketViewAction", [T.t1]],
    ["ahmed.ba", "listNotificationsAction", [20, {}]],
    ["ahmed.ba", "notificationsVersionAction", []],
    ["mariem.sow", "bumexOneHistoryAction", [{}]],
    ["mohamed.cheikh", "financeArchiveAction", []],
    ["mariem.sow", "teamTimeAction", ["2026-10-26"]],
    ["mariem.sow", "reloadVanguardAction", []],
  ]) {
    const out = await act(who, name, { args });
    check(`${who} reads ${name}`, out !== null && out !== undefined && !out.raw && !out.error, Array.isArray(out) ? `${out.length} rows` : Object.keys(out ?? {}).slice(0, 6).join(","));
  }
  const legacy = await act("mariem.sow", "projectViewAction", { args: [OLD_PROJECT] });
  check("an old project link opens its mission", legacy?.project?.id === A, legacy?.project?.id);

  // ---- a newcomer: their entity first, then their access on the first opening ----------------------------------------
  let res = await get("nouvelle", "/vanguard");
  check("a newcomer is sent to choose their entity, with no access yet", (res.headers.get("location") ?? "").includes("/select-entity") && !(await one("select 1 from erp.user_access where user_id = $1", [uid.nouvelle])), { status: res.status });
  r = await act("nouvelle", "assignEntityAction", { form: { entity_code: "bumex_it" } });
  check("a newcomer chooses their entity", (await one("select entity_code from work.person where id = $1", [uid.nouvelle])).entity_code === "bumex_it", r?.redirect);
  res = await get("nouvelle", "/vanguard");
  const fresh = await one("select erp_role, entity_codes from erp.user_access where user_id = $1", [uid.nouvelle]);
  check("…and gets staff on it when they open the app", res.status === 200 && fresh?.erp_role === "staff" && fresh.entity_codes?.join() === "bumex_it", { status: res.status, fresh });
  await act("nouvelle", "assignEntityAction", { form: { entity_code: "bumex_audit" } });
  check("…once only", (await one("select entity_code from work.person where id = $1", [uid.nouvelle])).entity_code === "bumex_it");

  // ---- documents: the file in Storage, its row in the database -------------------------------------------------------
  const file = new File([new TextEncoder().encode("%PDF-1.4 smoke")], "rapport-smoke.pdf", { type: "application/pdf" });
  r = await act("mariem.sow", "saveDocumentAction", { form: { title: "Rapport smoke", description: "", document_type: "report", related_type: "project", related_id: A, visibility: "internal", file } });
  const doc = await one("select id from work.document where title = 'Rapport smoke'");
  check("the manager uploads a document to the mission", r?.success === true && Boolean(doc), r);
  res = await get("mariem.sow", `/api/documents/${doc?.id}/download`);
  check("…it downloads (a signed address of the file)", [302, 303, 307].includes(res.status) && (res.headers.get("location") ?? "").includes("rapport-smoke"), { status: res.status });
  res = await get("oumar.sy", `/api/documents/${doc?.id}/download`);
  check("…not for someone who does not see the mission", res.status >= 400 || !(res.headers.get("location") ?? "").includes("rapport-smoke"), { status: res.status });
  r = await act("mariem.sow", "changeDocumentAction", { args: [doc?.id, "delete"] });
  check("…and is deleted, row and file", r?.success === true && !(await one("select 1 from work.document where id = $1", [doc?.id])), r);

  // ---- search, old invoices -----------------------------------------------------------------------------------------
  res = await get("mariem.sow", "/api/search?q=audit");
  const found = JSON.stringify(await res.json().catch(() => null));
  check("search finds the mission and the contract", res.status === 200 && found.includes("Audit légal 2025") && found.includes("Contrat d"), { status: res.status });
  res = await get("mohamed.cheikh", `/api/invoices/${id(1201)}/pdf`);
  check("an old invoice's PDF", res.status === 200 && (res.headers.get("content-type") ?? "").includes("pdf"), { status: res.status });
  res = await get("ahmed.ba", `/api/invoices/${id(1201)}/pdf`);
  check("…not for an employee", res.status !== 200 || !(res.headers.get("content-type") ?? "").includes("pdf"), { status: res.status });

  // ---- permissions: who changes access, per-entity parts --------------------------------------------------------------
  const page = await act("mohamed.cheikh", "permissionsAction");
  check("the role modifier reads everyone's access", Array.isArray(page?.people) && page.people.some((p) => p.id === uid.salma && p.access?.role === "staff"), page?.people?.length);
  check("…an administrator who is not a role modifier does not", (await act("fatimetou.admin", "permissionsAction")) === null);
  check("…nor a manager", (await act("mariem.sow", "permissionsAction")) === null);
  const std = ["accounting", "clients", "suppliers", "bank", "assets", "tax", "archives", "reports"];
  const salmaAccess = { role: "accountant", allEntities: false, parts: { bumex_audit: std, bumex_it: ["archives"] }, consolidation: false, managesAccess: false, homeEntity: "bumex_audit" };
  r = await act("fatimetou.admin", "savePermissionsAction", { args: [uid.salma, salmaAccess] });
  check("an administrator who is not a role modifier cannot change access", r?.error === "not_allowed", r);
  r = await act("mohamed.cheikh", "savePermissionsAction", { args: [uid.salma, salmaAccess] });
  const salma = await one("select erp_role, entity_codes, modules, entity_modules from erp.user_access where user_id = $1", [uid.salma]);
  check("the role modifier makes Salma an accountant of Audit, with the archives only on IT", !r?.error && salma.erp_role === "accountant" && salma.entity_codes.join() === "bumex_audit,bumex_it" && salma.modules === null && JSON.stringify(salma.entity_modules) === '{"bumex_it":["archives"]}', { r, salma });
  const seen = await act("salma.fall", "reloadVanguardAction");
  check("…her rooms differ per entity", JSON.stringify(seen?.state?.session?.entityModules?.[entity.bumex_it]) === '["archives","missions","tasks"]' && seen?.state?.session?.modules?.includes("accounting"), seen?.state?.session?.entityModules);
  const years = Array.from({ length: 13 }, () => randomUUID());
  r = await act("salma.fall", "runVanguardChangeAction", { args: [{ calls: [{ name: "createFiscalYear", input: 0, args: [entity.bumex_it, 2027], ids: years }], result: 1 }] });
  check("…the server refuses her the accounting of IT", r?.ok === false && /sur cette entité/.test(r?.error ?? ""), r?.error);
  r = await act("mohamed.cheikh", "savePermissionsAction", { args: [uid.mohamed, { role: "admin", allEntities: true, parts: {}, consolidation: true, managesAccess: false, homeEntity: "bumex_holding" }] });
  check("the role modifier cannot drop their own flag", r?.error === "own_access", r);
  r = await act("mohamed.cheikh", "removeAccessAction", { args: [uid.mohamed] });
  check("…nor their own access", r?.error === "own_access", r);
  // the building in 3D: off for everyone until a role modifier gives it
  const managerStd = ["accounting", "clients", "suppliers", "bank", "assets", "hr", "tax", "archives", "reports"];
  check("the building in 3D is off by default", (await act("ahmed.ba", "reloadVanguardAction"))?.state?.session?.view3d === false);
  r = await act("mohamed.cheikh", "savePermissionsAction", { args: [uid.mariem, { role: "manager", allEntities: false, parts: { bumex_audit: managerStd }, consolidation: false, managesAccess: false, view3d: true, homeEntity: "bumex_audit" }] });
  const mariem = await one("select erp_role, entity_codes, modules, entity_modules, view_3d from erp.user_access where user_id = $1", [uid.mariem]);
  check("…the role modifier gives it to Mariem, her parts unchanged", !r?.error && mariem.view_3d === true && mariem.modules === null && mariem.entity_modules === null && mariem.entity_codes.join() === "bumex_audit", { r, mariem });
  check("…her session says so", (await act("mariem.sow", "reloadVanguardAction"))?.state?.session?.view3d === true);
  r = await act("mohamed.cheikh", "removeAccessAction", { args: [uid.salma] });
  check("the role modifier removes Salma's access", !r?.error && !(await one("select 1 from erp.user_access where user_id = $1", [uid.salma])), r);
  check("…she no longer opens the app", (await act("salma.fall", "reloadVanguardAction"))?.state === undefined);

  // ---- invitations ----------------------------------------------------------------------------------------------------
  r = await act("fatimetou.admin", "invitePersonAction", { args: [{ email: "x@bumex.mr", fullName: "X", homeEntity: "bumex_it", role: "staff" }] });
  check("an administrator who is not a role modifier cannot invite", r?.error === "not_allowed", r);
  r = await act("mohamed.cheikh", "invitePersonAction", { args: [{ email: "someone@gmail.com", fullName: "X", homeEntity: "bumex_it", role: "staff" }] });
  check("…nor anyone outside the group's addresses", r?.error === "email", r);
  r = await act("mohamed.cheikh", "invitePersonAction", { args: [{ email: "Ahmed.Ba@bumex.mr", fullName: "Ahmed", homeEntity: "bumex_it", role: "staff" }] });
  check("…someone who has an account is found, not invited again", r?.error === "exists" && r?.id === uid.ahmed, r);
  const before = mail.messages.length;
  r = await act("mohamed.cheikh", "invitePersonAction", { args: [{ email: "invitee@bumex.mr", fullName: "Invitée Smoke", homeEntity: "bumex_it", role: "staff" }] });
  const invitee = r?.id;
  const row = invitee ? await one("select p.entity_code, u.erp_role, u.entity_codes, (select count(*)::int from work.invitation i where i.person_id = p.id and i.used_at is null) open from work.person p join erp.user_access u on u.user_id = p.id where p.id = $1", [invitee]) : null;
  check("the role modifier invites someone: their account, entity and access", Boolean(invitee) && r?.mailed === true && row?.entity_code === "bumex_it" && row?.erp_role === "staff" && row?.entity_codes?.join() === "bumex_it" && row?.open === 1, { r, row });
  const letter = mail.messages.slice(before).find((m) => m.to.includes("invitee@bumex.mr"));
  const link = letter?.raw.match(/https?:\/\/[^\s"<>]+\/invite\/[A-Za-z0-9_-]{20,}/)?.[0];
  check("…who receives the link to choose their password", Boolean(link), letter ? letter.raw.slice(0, 200) : "no e-mail");
  r = await act("mohamed.cheikh", "resendInvitationAction", { args: [uid.ahmed] });
  check("…no invitation again for someone who has signed in", r?.error === "signed_in", r);

  const tab = await openBrowser();
  try {
    if (link) {
      const path = new URL(link).pathname;
      await tab.signIn(null);
      await tab.go(path);
      check("the invitation's page greets the person", await tab.until("document.body.innerText.includes('Invitée Smoke')"));
      await tab.evaluate(`(() => { for (const n of ['password', 'confirm']) document.querySelector('#' + n).value = 'Bienvenue-2026'; document.querySelector('form').requestSubmit(); })()`);
      const landed = await tab.until("location.pathname.startsWith('/vanguard')", 30_000);
      check("…they choose their password and land in the app, signed in", landed && Boolean(await tab.cookie("__session")), await tab.evaluate("location.pathname"));
      check("…their invitation is used", (await one("select count(*)::int n from work.invitation where person_id = $1 and used_at is null", [invitee])).n === 0);
      await tab.signIn(null);
      await tab.go(path);
      check("…and the link no longer works", await tab.until("document.body.innerText.includes('Lien expiré ou déjà utilisé')"));
      const signIn = await fetch(`http://127.0.0.1:${authPort}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=smoke`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "invitee@bumex.mr", password: "Bienvenue-2026", returnSecureToken: true }) });
      check("…their password is the one they chose", signIn.ok);
      tab.takeErrors();
    }

    // ---- e-mails go out --------------------------------------------------------------------------------------------
    const sent = mail.messages.length;
    res = await fetch(`${base}/api/cron/notifications`, { headers: { authorization: `Bearer ${cronSecret}` } });
    check("the delivery job sends the queued e-mails", res.status === 200 && mail.messages.slice(sent).some((m) => m.to.includes("ahmed.ba@bumex.mr")), { status: res.status, sent: mail.messages.length - sent });
    res = await fetch(`${base}/api/cron/notifications`, { headers: { authorization: "Bearer wrong" } });
    check("…and refuses a caller without the secret", res.status === 401, { status: res.status });

    // ---- the building in 3D for whoever has it, then every room and tab, in Chrome, with no error ----------------------
    await tab.signIn(cookies["ahmed.ba"]);
    await tab.go("/vanguard");
    await tab.until("Boolean(document.querySelector('.app .main')) && document.body.innerText.length > 150", 25_000);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const flatOnly = await tab.evaluate("!document.querySelector('.stage') && !document.querySelector('canvas') && !document.querySelector('.hright .seg')");
    check("without the 3D option, Vanguard opens flat: no building, no switch (WebGL on)", flatOnly && tab.takeErrors().length === 0);
    await tab.signIn(cookies["mariem.sow"]);
    await tab.go("/vanguard");
    const drawn = await tab.until("(() => { const c = document.querySelector('canvas'); return Boolean(c) && (c.getContext('webgl2') ?? c.getContext('webgl')) !== null; })()", 30_000);
    check("the building is drawn in 3D (WebGL)", drawn && tab.takeErrors().length === 0);
    await tab.webgl(false);
    const rooms = [
      "/vanguard", "/vanguard?room=myday", "/vanguard?room=myday&tab=work", `/vanguard?room=missions&tab=mission%3A${A}`, "/vanguard?room=missions&tab=week",
      "/vanguard?room=missions&tab=calendar", "/vanguard?room=missions&tab=milestones", "/vanguard?room=tasks", `/vanguard?room=tasks&tab=ticket%3A${T.t1}`,
      `/vanguard?room=tasks&tab=board%3A${A}`, "/vanguard?room=time", "/vanguard?room=inbox", "/vanguard?room=clients&tab=customers", "/vanguard?room=clients&tab=contracts",
      `/vanguard?room=clients&tab=client%3A${C.snim}`, `/vanguard?room=clients&tab=contract%3A${id(701)}`, "/vanguard?room=hr&tab=people", `/vanguard?room=hr&tab=person%3A${uid.ahmed}`,
      "/vanguard?room=archives&tab=documents", "/vanguard?room=reports&tab=archive", "/vanguard?room=reports&tab=activity", "/vanguard?room=settings&tab=account",
      "/vanguard?room=settings&tab=history", "/vanguard?room=accounting", "/vanguard?room=bank",
    ];
    for (const who of ["mariem.sow", "ahmed.ba", "sidi.associe", "mohamed.cheikh"]) {
      await tab.signIn(cookies[who]);
      const broken = [];
      const began = Date.now();
      for (const path of rooms) {
        try {
          await tab.go(path);
          const shown = await tab.until("document.readyState === 'complete' && document.body.innerText.length > 150", 25_000);
          await new Promise((resolve) => setTimeout(resolve, 600));
          const crashed = await tab.evaluate("/Application error|client-side exception|This page couldn’t load/i.test(document.body.innerText) || Boolean(document.querySelector('[role=alert] h2'))").catch(() => true);
          const errors = tab.takeErrors();
          if (!shown || crashed || errors.length) broken.push({ path, shown, crashed, errors: errors.slice(0, 2) });
        } catch (error) {
          broken.push({ path, error: error instanceof Error ? error.message : String(error) });
        }
      }
      check(`${who}: ${rooms.length} rooms and tabs open without an error`, broken.length === 0, broken.length ? broken.slice(0, 3) : `${Math.round((Date.now() - began) / 1000)} s`);
    }
    await tab.signIn(cookies["mohamed.cheikh"]);
    await tab.go("/vanguard?room=settings&tab=access");
    const listed = await tab.until("document.body.innerText.includes('Modificateurs') && document.body.innerText.includes('Salma Fall')");
    await tab.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.includes('Mariem Sow'))?.click()");
    const editor = await tab.until("document.body.innerText.includes('Modificateur de rôles') && document.body.innerText.includes('Bâtiment 3D') && document.querySelectorAll('table input[type=checkbox]').length > 60");
    check("the Permissions tab lists everyone and opens a person's grid", listed && editor && tab.takeErrors().length === 0);
    await tab.signIn(cookies["fatimetou.admin"]);
    await tab.go("/vanguard?room=settings");
    await tab.until("document.body.innerText.includes('Mon compte')");
    check("…it is not there for an administrator who is not a role modifier", !(await tab.evaluate("[...document.querySelectorAll('[role=tab]')].some((t) => t.innerText.includes('Permissions'))")));
  } finally {
    await tab.close();
  }
}
