// What the smoke test checks (scripts/smoke/run.mjs), through the app as people use it: its server actions, its
// routes and its pages in Chrome; each write looked up in the database afterwards.
import { randomUUID } from "node:crypto";

import { C, M, OLD_PROJECT, PASSWORD, T, id, uid } from "./seed.mjs";

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

  // ---- the ticket as Jira has it (0012): a key, fields changed in place into its history, links ---------------------
  r = await act("ahmed.ba", "updateTicketFieldAction", { args: [T.t1, "estimated_hours", "6"] });
  const estimated = await one("select estimated_hours::float8 h, (select ticket_prefix from erp.entity where id = t.entity_id) || '-' || t.number as key from erp.task t where id = $1", [T.t1]);
  const logged = await one("select user_id, metadata from work.activity where subject_id = $1 and metadata->>'field' = 'estimated_hours'", [T.t1]);
  check("the assignee estimates their ticket in place; the database writes it to its history", r?.success === true && estimated?.h === 6 && logged?.user_id === uid.ahmed && /^AUD-\d+$/.test(estimated?.key ?? ""), { r, estimated, logged: logged?.metadata });
  r = await act("ahmed.ba", "updateTicketFieldAction", { args: [T.t1, "labels", ["Revue", "Revue", " BCM "]] });
  check("…labels it (trimmed, once each)", JSON.stringify((await one("select labels from erp.task where id = $1", [T.t1])).labels) === JSON.stringify(["Revue", "BCM"]), r);
  r = await act("khadija.diallo", "updateTicketFieldAction", { args: [T.t1, "priority", "urgent"] });
  check("…someone not on it cannot change it", Boolean(r?.error), r);
  r = await act("mariem.sow", "addTicketLinkAction", { args: [created, T.t1, "blocks"] });
  const linkView = await act("ahmed.ba", "ticketViewAction", { args: [T.t1] });
  const blocked = linkView?.links?.find((l) => l.ticket?.id === created);
  check("the manager links two tickets; the other side reads it as \"blocked by\"", !r?.error && blocked?.kind === "blocks" && blocked?.direction === "in" && /^AUD-\d+$/.test(blocked?.ticket?.key ?? ""), { r, blocked });
  check("…and both tickets' history says so", (await one("select count(*)::int n from work.activity where metadata->>'kind' = 'link' and subject_id in ($1, $2)", [T.t1, created])).n === 2);

  // ---- My work: everything the person has to do ----------------------------------------------------------------------
  const ahmedWork = await act("ahmed.ba", "myWorkAction", { args: [] });
  const t1 = ahmedWork?.tickets?.find((t) => t.id === T.t1);
  check("My work lists the assignee's tickets with their keys, and their load in weighted hours", Boolean(t1?.key) && t1?.estimatedHours === 6 && typeof ahmedWork?.load?.weekHours === "number" && ahmedWork?.load?.capacityHours > 0, { t1: t1 && { key: t1.key, est: t1.estimatedHours }, load: ahmedWork?.load });
  // the audit floor's board (0014): work waits for its reporter at its last step before "Terminé", "Rapport"
  r = await act("ahmed.ba", "moveTicketStageAction", { args: [T.t2, { stageId: "aud_report" }] });
  const mariemWork = await act("mariem.sow", "myWorkAction", { args: [] });
  check("…the reporter's sign-offs, and on the missions they lead what is unassigned, unestimated or late",
    !r?.error && (mariemWork?.signOff ?? []).some((t) => t.id === T.t2) && !(mariemWork?.signOff ?? []).some((t) => t.id === T.t1) && (mariemWork?.lead ?? []).some((x) => x.reasons.includes("unestimated")),
    { signOff: mariemWork?.signOff?.map((t) => t.key), lead: mariemWork?.lead?.map((x) => [x.ticket.key, x.reasons]) });

  const peopleRows = await act("mariem.sow", "peopleAction", { args: [] });
  const loads = await act("mariem.sow", "peopleLoadsAction", { args: [] });
  const ahmedRow = peopleRows?.find?.((p) => p.id === uid.ahmed);
  check("People and the pickers show each person's load in hours against their capacity", typeof ahmedRow?.load?.weekHours === "number" && ahmedRow?.load?.capacityHours > 0 && typeof loads?.[uid.ahmed]?.percent === "number", { row: ahmedRow?.load, pick: loads?.[uid.ahmed] });

  // ---- statuses: one board per floor, which every mission of the floor follows (0014, 2026-10-28) -------------------------
  const floorNow = (await act("mariem.sow", "floorBoardAction", { args: [entity.bumex_audit] }))?.workflow;
  const auditStages = floorNow?.stages?.map((st) => st.name).join(" → ");
  check("each floor starts from its model: BUMEX Audit's board is the audit one", auditStages === "Planification → Terrain → Revue → Rapport → Terminé", auditStages);
  const done = floorNow?.stages?.find((st) => st.id === "done");
  const draft = floorNow && {
    stages: [...floorNow.stages.filter((st) => st.id !== "done").map((st) => (st.id === "review" ? { ...st, name: "Code review" } : st)),
      { id: "stg_tomerge", name: "To merge", position: 9, is_default: false, is_completed: false, category: "review", archived_at: null }, done],
    transitions: {}, allow_backward: true, allow_skip_forward: true, allow_reopen: true, require_reason: false, custom_transitions_enabled: false,
  };
  r = await act("ahmed.ba", "saveFloorBoardAction", { args: [entity.bumex_audit, draft, floorNow?.updated_at ?? null] });
  check("an employee cannot change the floor's board", Boolean(r?.error), r);
  r = await act("oumar.sy", "saveFloorBoardAction", { args: [entity.bumex_audit, draft, floorNow?.updated_at ?? null] });
  check("…nor the manager of another floor", Boolean(r?.error), r);
  r = await act("mariem.sow", "saveFloorBoardAction", { args: [entity.bumex_audit, draft, floorNow?.updated_at ?? null] });
  check("the floor's manager renames a stage and adds one to the floor's board", Boolean(floorNow) && !r?.error, r);
  const boards = await act("mariem.sow", "boardWorkflowsAction", { args: [[A, M.done]] });
  const names = (b) => b?.stages?.filter((st) => !st.archived_at).map((st) => st.name).join(",");
  check("…every mission of the floor follows it", Boolean(names(boards?.[A])) && names(boards?.[A]) === names(boards?.[M.done]) && names(boards?.[A]).includes("To merge"), { a: names(boards?.[A]), done: names(boards?.[M.done]) });
  const t1State = (await act("ahmed.ba", "reloadVanguardAction"))?.state?.tasks?.find((x) => x.id === T.t1);
  const t1Work = (await act("ahmed.ba", "myWorkAction", { args: [] }))?.tickets?.find((t) => t.id === T.t1);
  check("…a ticket shows its floor's stage name in the app's state and in My work", t1State?.ticket?.stage_name === "Code review" && t1Work?.stageName === "Code review" && t1Work?.stageId === "review", { state: t1State?.ticket?.stage_name, work: t1Work?.stageName });
  r = await act("ahmed.ba", "moveTicketStageAction", { args: [T.t1, { stageId: "stg_tomerge" }] });
  const merged = await one("select stage_id, status from erp.task where id = $1", [T.t1]);
  check("…moves to a stage of its floor's board, reported as its category", !r?.error && merged.stage_id === "stg_tomerge" && merged.status === "review", { r, merged });
  const recentTime = await act("ahmed.ba", "myTimeAction", { args: [null] });
  check("the timesheet lists the tickets the person moved, the last moved first", recentTime?.recent?.[0]?.id === T.t1 && recentTime.recent.some((t) => t.id === T.t2), recentTime?.recent?.map((t) => t.key));
  r = await act("mariem.sow", "createTicketAction", { prev: {}, form: { title: "Lettre d'affirmation", project_id: A, assignee_id: uid.ahmed, reporter_id: uid.mariem, priority: "medium", type: "task", stage_id: "in_progress", create_another: "1" } });
  const started = r?.created?.id ? await one("select stage_id, status from erp.task where id = $1", [r.created.id]) : null;
  check("…a new ticket starts in the stage picked", started?.stage_id === "in_progress" && started?.status === "in_progress", { r, started });
  r = await act("mariem.sow", "createTicketAction", { prev: {}, form: { title: "Pas terminé d'office", project_id: A, assignee_id: uid.ahmed, reporter_id: uid.mariem, priority: "low", type: "task", stage_id: "done", create_another: "1" } });
  check("…but never in a completed one (the reporter signs off)", (await one("select stage_id from erp.task where id = $1", [r?.created?.id]))?.stage_id === "todo", r);

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
  const ticketLine = randomUUID();
  r = await act("ahmed.ba", "saveTimeAction", { args: [{ id: ticketLine, project_id: A, work_date: "2026-10-26", hours: "0", minutes: "45", note: "Relances", mission: "AUD-1 · Confirmations bancaires", task_id: T.t1 }] });
  const onTicket = await act("mariem.sow", "ticketViewAction", { args: [T.t1] });
  check("time entered on a ticket counts on it: its time spent and its work log", r?.success === true && onTicket?.ticket?.logged_minutes === 45 && onTicket?.worklog?.some((w) => w.id === ticketLine && w.minutes === 45), { r, logged: onTicket?.ticket?.logged_minutes, worklog: onTicket?.worklog?.length });
  const sheetWeek = await act("ahmed.ba", "myTimeAction", { args: ["2026-10-26"] });
  check("…the week shows the line with the ticket's key, and offers the person's open tickets", sheetWeek?.entries?.some((e) => e.id === ticketLine && /^AUD-\d+$/.test(e.task_key ?? "")) && sheetWeek?.tickets?.some((t) => t.id === T.t1), { tickets: sheetWeek?.tickets?.map((t) => t.key) });
  r = await act("ahmed.ba", "saveTimeAction", { args: [{ id: randomUUID(), project_id: A, work_date: "2026-10-26", hours: "23", minutes: "0", note: "", mission: "Revue" }] });
  check("…never more than 24 hours a day", r?.error === "daily_limit", r);
  r = await act("ahmed.ba", "saveTimeAction", { args: [{ id: lineId, project_id: A, work_date: "2026-10-26", hours: "2", minutes: "0", note: "Revue", mission: "Revue", updated_at: "2020-01-01T00:00:00Z" }] });
  check("…an edit from an old version is a conflict", r?.error === "conflict", r);
  const slip = randomUUID();
  await act("ahmed.ba", "saveTimeAction", { args: [{ id: slip, project_id: A, work_date: "2026-10-27", hours: "0", minutes: "30", note: "", mission: "Erreur" }] });
  const slipped = await one("select to_json(updated_at) #>> '{}' as updated_at from erp.time_entry where id = $1", [slip]);
  r = await act("khadija.diallo", "deleteTimeAction", { args: [slip, slipped?.updated_at ?? ""] });
  check("someone else cannot remove a person's line", Boolean(await one("select 1 from erp.time_entry where id = $1", [slip])), r);
  r = await act("ahmed.ba", "deleteTimeAction", { args: [slip, slipped?.updated_at ?? ""] });
  check("the person removes their own line (a cleared cell of the week)", r?.success === true && !(await one("select 1 from erp.time_entry where id = $1", [slip])), r);
  r = await act("ahmed.ba", "submitTimesheetWeekAction", { args: ["2026-10-26"] });
  check("the employee sends the week", r?.success === true, r);
  r = await act("ahmed.ba", "saveTimeAction", { args: [{ id: randomUUID(), project_id: A, work_date: "2026-10-26", hours: "1", minutes: "0", note: "", mission: "Revue" }] });
  check("…then cannot add to it", r?.error === "locked", r);
  const kept = await one("select to_json(updated_at) #>> '{}' as updated_at from erp.time_entry where id = $1", [lineId]);
  r = await act("ahmed.ba", "deleteTimeAction", { args: [lineId, kept?.updated_at ?? ""] });
  check("…nor remove a line of it", r?.error === "locked" && Boolean(await one("select 1 from erp.time_entry where id = $1", [lineId])), r);
  check("…their entity's manager is told", Boolean(await one("select 1 from work.notification where user_id = $1 and title = 'Timesheet submitted'", [uid.mariem])));
  await act("khadija.diallo", "approveTimesheetWeekAction", { args: [uid.ahmed, "2026-10-26"] });
  check("another entity's employee cannot approve it", (await one("select status from work.timesheet_week where user_id = $1 and week_start = '2026-10-26'", [uid.ahmed])).status === "submitted");
  await act("mariem.sow", "approveTimesheetWeekAction", { args: [uid.ahmed, "2026-10-26"] });
  const week = await one("select status, reviewed_by from work.timesheet_week where user_id = $1 and week_start = '2026-10-26'", [uid.ahmed]);
  check("the entity's manager approves it", week.status === "approved" && week.reviewed_by === uid.mariem, week);

  // ---- the floor's overview and a person's page (2026-10-28) -----------------------------------------------------------
  const ahmedMinutes = (await one("select coalesce(sum(minutes), 0)::int m from erp.time_entry t join erp.entity e on e.id = t.entity_id where user_id = $1 and work_date >= date_trunc('week', now())::date and work_date < date_trunc('week', now())::date + 7 and not e.is_test", [uid.ahmed])).m;
  const overview = await act("mariem.sow", "floorOverviewAction", { args: [entity.bumex_audit] });
  const ahmedThere = overview?.people?.find((p) => p.id === uid.ahmed);
  check("the floor's overview lists its people with their load and, for their manager, their week's hours and timesheet",
    Boolean(ahmedThere?.home) && typeof ahmedThere?.load?.percent === "number" && ahmedThere?.week?.minutes === ahmedMinutes && ahmedThere?.week?.byDay?.length === 7,
    { ahmed: ahmedThere && { load: ahmedThere.load?.percent, week: ahmedThere.week }, expected: ahmedMinutes });
  check("…and the floor's recent activity, with ticket keys", (overview?.activity ?? []).some((a) => /^AUD-\d+$/.test(a.key ?? "")), overview?.activity?.length);
  const asColleague = await act("khadija.diallo", "floorOverviewAction", { args: [entity.bumex_audit] });
  check("…a colleague sees the team but not someone else's hours", asColleague?.people?.find((p) => p.id === uid.ahmed)?.week === null && asColleague?.people?.find((p) => p.id === uid.khadija)?.week !== null,
    asColleague?.people?.map((p) => [p.name, Boolean(p.week)]));
  const ahmedPage = await act("mariem.sow", "personViewAction", { args: [uid.ahmed] });
  check("a person's page shows their week, what they are on (with its stage) and what comes next",
    ahmedPage?.week?.minutes === ahmedMinutes && ahmedPage?.current?.some((t) => t.id === T.t1 && t.stageName === "To merge") && ahmedPage?.next?.some((t) => t.title === "Circularisation clients"),
    { week: ahmedPage?.week?.minutes, current: ahmedPage?.current?.map((t) => [t.key, t.stageName]), next: ahmedPage?.next?.map((t) => t.key) });

  // ---- a mission's team from another floor (0015): Khadija, of BUMEX IT, is on the audit mission's team ----------------
  const khWork = await act("khadija.diallo", "myWorkAction", { args: [] });
  const onAudit = khWork?.missions?.find((m) => m.id === A);
  check("a team member from another floor finds the mission in My work, as another entity's", Boolean(onAudit) && onAudit.home === false && onAudit.entity === "BUMEX Audit", onAudit);
  const khView = await act("khadija.diallo", "projectViewAction", { args: [A] });
  check("…opens it and reads its tickets", khView?.project?.id === A && (khView?.project?.tasks?.length ?? 0) > 0, { id: khView?.project?.id, tasks: khView?.project?.tasks?.length });
  r = await act("khadija.diallo", "saveTimeAction", { args: [{ id: randomUUID(), project_id: A, work_date: "2026-10-27", hours: "1", minutes: "0", note: "Maquettes", mission: "Audit" }] });
  const khLine = await one("select count(*)::int n from erp.time_entry where user_id = $1 and engagement_id = $2 and work_date = '2026-10-27'", [uid.khadija, A]);
  check("…and logs time on it", !r?.error && khLine?.n === 1, { r, khLine });
  check("someone of that floor who is not on the team does not open it", (await act("oumar.sy", "projectViewAction", { args: [A] })) === null);

  // ---- missions -----------------------------------------------------------------------------------------------------
  r = await act("mariem.sow", "saveMissionAction", {
    args: [{ name: "Due diligence", client_id: C.snim, description: "Revue d'acquisition", owner_id: uid.mariem, status: "active", start_date: "2026-11-01", end_date: "2026-12-15", budget_amount: "250000", priority: "high", project_kind: "client_mission", manual_progress: "", entity_id: entity.bumex_audit, member_ids: [uid.ahmed], fee_type: "time", budget_hours: "80" }],
  });
  const mission = await one("select e.*, (select count(*)::int from work.floor_board b where b.entity_id = e.entity_id) boards, (select array_agg(work.initials(p.full_name)) from erp.engagement_staff s join work.person p on p.id = s.user_id where s.engagement_id = e.id) staff from erp.engagement e where name = 'Due diligence'");
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

  // ---- the test floor (0011): off by default, filled once, invisible without it, no e-mail, time apart ------------------
  const floor = entity.bumex_testing;
  check("the test floor is off for everyone", !(await act("mohamed.cheikh", "reloadVanguardAction"))?.state?.entities?.some((e) => e.isTest));
  r = await act("fatimetou.admin", "prepareTestFloorAction");
  check("…only a role modifier fills it with samples", r?.error === "not_allowed", r);
  r = await act("mohamed.cheikh", "prepareTestFloorAction");
  const sample = await one(
    `select (select count(*)::int from erp.account where entity_id = $1) accounts, (select count(*)::int from erp.sales_invoice where entity_id = $1) invoices,
            (select count(*)::int from erp.engagement where entity_id = $1) missions, (select count(*)::int from erp.task where entity_id = $1) tickets,
            (select count(*)::int from work.client where is_test) clients`,
    [floor],
  );
  check("the role modifier fills it: books, clients, missions, tickets", !r?.error && sample.accounts > 0 && sample.invoices === 3 && sample.missions === 2 && sample.tickets === 4 && sample.clients === 3, { r, sample });
  check("…once", (await act("mohamed.cheikh", "prepareTestFloorAction"))?.error === "ready");
  const demo = (await one("select id from erp.engagement where entity_id = $1 and name = 'Mission de démonstration'", [floor]))?.id;
  const blind = (await act("fatimetou.admin", "reloadVanguardAction"))?.state;
  check("…an administrator without the floor sees nothing of it", Boolean(blind) && !blind.entities.some((e) => e.isTest) && !blind.engagements.some((e) => e.id === demo), blind?.entities?.length);
  const every = ["accounting", "clients", "suppliers", "bank", "assets", "hr", "tax", "archives", "reports"];
  r = await act("mohamed.cheikh", "savePermissionsAction", { args: [uid.mohamed, { role: "admin", allEntities: true, parts: { bumex_testing: every }, consolidation: true, managesAccess: true, view3d: false, homeEntity: "bumex_holding" }] });
  const r2 = await act("mohamed.cheikh", "savePermissionsAction", { args: [uid.ahmed, { role: "staff", allEntities: false, parts: { bumex_audit: ["archives"], bumex_testing: ["archives"] }, consolidation: false, managesAccess: false, view3d: false, homeEntity: "bumex_audit" }] });
  const testers = await all("select user_id, entity_codes, test_floor from erp.user_access where test_floor order by user_id");
  check("the role modifier gives the floor to himself and to Ahmed", !r?.error && !r2?.error && testers.length === 2 && testers.some((t) => t.user_id === uid.ahmed && t.entity_codes.join() === "bumex_audit"), { r, r2, testers });
  const seenBy = (await act("ahmed.ba", "reloadVanguardAction"))?.state;
  const onFloor = (await act("ahmed.ba", "reloadVanguardAction", { test: true }))?.state;
  check("…Ahmed now has the basement; its missions only while he is on it (test mode, 0013), and then nothing else",
    Boolean(seenBy?.entities?.some((e) => e.isTest && e.code === "TEST")) && seenBy.session.testMode === false && !seenBy.engagements.some((e) => e.id === demo)
      && onFloor?.session?.testMode === true && onFloor.engagements.some((e) => e.id === demo) && onFloor.engagements.every((e) => e.entityId === floor) && onFloor.accounts.every((a) => a.entityId === floor),
    { normal: seenBy?.engagements?.length, test: onFloor?.engagements?.map((e) => e.name) });
  check("…someone without the floor gets no test mode, whatever the cookie says", (await act("khadija.diallo", "reloadVanguardAction", { test: true }))?.state?.session?.testMode === false);
  const testClients = (await act("mohamed.cheikh", "missionOptionsAction", { args: [floor], test: true }))?.clients ?? [];
  const realClients = (await act("mohamed.cheikh", "missionOptionsAction", { args: [entity.bumex_audit] }))?.clients ?? [];
  check("a mission there is offered the floor's clients only", testClients.length === 3 && !realClients.some((c) => testClients.some((t) => t.id === c.id)), { test: testClients.length, real: realClients.length });
  r = await act("mohamed.cheikh", "createTicketAction", { prev: {}, form: { title: "Ticket de test", project_id: demo, assignee_id: uid.ahmed, reporter_id: uid.mohamed, priority: "medium", type: "task", create_another: "1" }, test: true });
  const testTicket = r?.created?.id;
  const testNotes = testTicket ? await all("select n.id, e.status from work.notification n left join work.notification_email e on e.notification_id = n.id where n.subject_id = $1", [testTicket]) : [];
  check("a ticket there notifies Ahmed in the app, never by e-mail", Boolean(testTicket) && testNotes.length > 0 && testNotes.every((n) => !n.status), { r, testNotes });
  const testLine = randomUUID();
  r = await act("ahmed.ba", "saveTimeAction", { args: [{ id: testLine, project_id: demo, work_date: "2026-10-26", hours: "1", minutes: "0", note: "", mission: "Essai" }, true], test: true });
  const written = await one("select entity_id from erp.time_entry where id = $1", [testLine]);
  check("Ahmed enters test time on a day of his approved week", r?.success === true && written?.entity_id === floor, { r, written });
  const real = await act("ahmed.ba", "myTimeAction", { args: ["2026-10-26"] });
  const team = await act("mariem.sow", "teamTimeAction", { args: ["2026-10-26"] });
  check("…kept apart: not in his real sheet nor his manager's review", Boolean(real) && !real.entries.some((e) => e.id === testLine) && !team?.entries?.some((e) => e.id === testLine));
  check("…but in his test sheet", (await act("ahmed.ba", "myTimeAction", { args: ["2026-10-26", true], test: true }))?.entries?.some((e) => e.id === testLine) === true);
  check("…which someone without the floor cannot open", !(await act("khadija.diallo", "myTimeAction", { args: ["2026-10-26", true], test: true }))?.entries);
  // sealed (0013): nothing of the floor anywhere else, for its testers too; and nothing else on it
  const plain = JSON.stringify([await act("ahmed.ba", "myWorkAction", { args: [] }), await act("ahmed.ba", "myDayAction", { args: [] }), await act("ahmed.ba", "listNotificationsAction", { args: [200, {}] }), await act("ahmed.ba", "peopleAction", { args: [] })]);
  check("a tester's My work, My day, notifications and People show nothing of the test floor", Boolean(testTicket) && !plain.includes(testTicket) && !plain.includes(demo) && !plain.includes("Ticket de test"));
  const testWork = await act("ahmed.ba", "myWorkAction", { args: [], test: true });
  const testInbox = await act("ahmed.ba", "listNotificationsAction", { args: [200, {}], test: true });
  check("…and on the test floor, only its tickets and notifications", testWork?.tickets?.some((t) => t.id === testTicket) && testWork.tickets.every((t) => t.projectId !== A) && JSON.stringify(testInbox).includes(testTicket) && !JSON.stringify(testInbox).includes(T.t1),
    { work: testWork?.tickets?.map((t) => t.title), inbox: testInbox?.length });
  const testClientName = (await one("select name from work.client where is_test order by name limit 1"))?.name ?? "";
  const searched = await (await get("ahmed.ba", `/api/search?q=${encodeURIComponent(testClientName)}`)).json().catch(() => null);
  const testClientIds = (await all("select id from work.client where is_test")).map((c) => c.id);
  check("…the search finds no test client", Boolean(testClientName) && !JSON.stringify(searched ?? {}).split('"').some((v) => testClientIds.includes(v)), { testClientName, searched: searched && JSON.stringify(searched).slice(0, 200) });

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

  // ---- passwords: set by the role modifier, a link sent, or asked for from the sign-in page ----------------------------
  const signInWith = (email, password) =>
    fetch(`http://127.0.0.1:${authPort}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=smoke`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) }).then((res) => res.ok);
  r = await act("fatimetou.admin", "setPasswordAction", { args: [uid.khadija, "Nouveau-Pass-2026"] });
  check("an administrator who is not a role modifier cannot set a password", r?.error === "not_allowed", r);
  r = await act("mohamed.cheikh", "setPasswordAction", { args: [uid.khadija, "court"] });
  check("…nor anyone a password under 8 characters", r?.error === "password", r);
  r = await act("mohamed.cheikh", "setPasswordAction", { args: [uid.khadija, "Nouveau-Pass-2026"] });
  check("the role modifier sets Khadija's password: the new one signs in, the old one no longer",
    !r?.error && (await signInWith("khadija.diallo@bumex.mr", "Nouveau-Pass-2026")) && !(await signInWith("khadija.diallo@bumex.mr", PASSWORD)), r);
  check("…and her open session ends", (await act("khadija.diallo", "reloadVanguardAction"))?.state === undefined);
  let mailed = mail.messages.length;
  r = await act("mohamed.cheikh", "sendPasswordLinkAction", { args: [uid.ahmed] });
  const resetMail = mail.messages.slice(mailed).find((m) => m.to.includes("ahmed.ba@bumex.mr"));
  const resetLink = resetMail?.raw.match(/https?:\/\/[^\s"<>]+\/invite\/[A-Za-z0-9_-]{20,}/)?.[0];
  check("the role modifier sends Ahmed a link to choose a new password", r?.mailed === true && /mot de passe/i.test(resetMail?.raw ?? "") && Boolean(resetLink), { r, to: resetMail?.to });
  const resetPage = resetLink ? await (await get(null, new URL(resetLink).pathname)).text() : "";
  check("…its page asks for a new password", resetPage.includes("Nouveau mot de passe"));
  const forgot = (email) => act("mohamed.cheikh", "forgotPasswordAction", { prev: {}, form: { email } });
  mailed = mail.messages.length;
  const answers = [await forgot("personne@bumex.mr"), await forgot("someone@gmail.com"), await forgot("Oumar.Sy@bumex.mr"), await forgot("oumar.sy@bumex.mr")];
  const toOumar = mail.messages.slice(mailed).filter((m) => m.to.includes("oumar.sy@bumex.mr")).length;
  check("“Forgot password?” answers the same whoever asks, and mails a known address once in a while",
    answers.every((a) => a?.sent === true) && toOumar === 1 && mail.messages.length - mailed === 1, { answers, toOumar, all: mail.messages.length - mailed });

  // ---- the default entity (0015) -----------------------------------------------------------------------------------------
  const homeFirst = (await act("mohamed.cheikh", "reloadVanguardAction"))?.state?.session?.defaultEntityId;
  check("a person's default entity is their home one until they choose", homeFirst === entity.bumex_holding, homeFirst);
  r = await act("mohamed.cheikh", "setDefaultEntityAction", { args: [entity.bumex_it] });
  const chosen = (await act("mohamed.cheikh", "reloadVanguardAction"))?.state?.session?.defaultEntityId;
  check("…they choose another one in their account", !r?.error && chosen === entity.bumex_it, { r, chosen });
  r = await act("mariem.sow", "setDefaultEntityAction", { args: [entity.bumex_it] });
  check("…only among the floors they see", Boolean(r?.error), r);

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
    check("…the floors are chosen from the rail only (no entity list beside the page)", await tab.evaluate("!document.querySelector('.page > .nav')"));
    const railWork = await tab.evaluate("[...document.querySelectorAll('.rail .grp')].map((g) => [...g.querySelectorAll('.sb-item')].map((b) => b.getAttribute('aria-label')))");
    const workGroup = railWork?.find((g) => g.length === 5 && /Ma journée|My day/.test(g[0]));
    check("the rail keeps the person's work together (My day, My work, tasks, time, archives) and fits without scrolling",
      Boolean(workGroup) && /Mon travail|My work/.test(workGroup[1]) && await tab.evaluate("(() => { const r = document.querySelector('.rail'); return r.scrollHeight <= r.clientHeight + 1; })()"), railWork);
    const profile = "document.querySelector('.bumex-tools button[aria-label=\"Mon profil\"], .bumex-tools button[aria-label=\"My profile\"]')";
    await tab.evaluate(`${profile}.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }))`);
    const menuOpen = await tab.until("[...document.querySelectorAll('[role=menu] [role=menuitem]')].some((i) => /Mon compte|My account/.test(i.innerText))");
    const oldSwitcher = await tab.evaluate("/Entité active|Active entity/.test(document.querySelector('[role=menu]')?.innerText ?? '')");
    check("the profile menu opens on the person's own panels, without the old entity switcher", menuOpen && !oldSwitcher);
    await tab.evaluate("[...document.querySelectorAll('[role=menu] [role=menuitem]')].find((i) => /Mon compte|My account/.test(i.innerText)).click()");
    check("…and \"My account\" opens the settings on that tab", await tab.until("/Paramètres|Settings/.test(document.querySelector('.page-main .sheet-head')?.innerText ?? '') && !document.querySelector('[role=menu]')") && tab.takeErrors().length === 0);
    await tab.signIn(cookies["mariem.sow"]);
    await tab.go("/vanguard");
    const drawn = await tab.until("(() => { const c = document.querySelector('canvas'); return Boolean(c) && (c.getContext('webgl2') ?? c.getContext('webgl')) !== null; })()", 30_000);
    check("the building is drawn in 3D (WebGL)", drawn && tab.takeErrors().length === 0);
    await tab.webgl(false);
    const rooms = [
      "/vanguard", "/vanguard?room=overview", `/vanguard?room=overview&tab=person%3A${uid.ahmed}`, "/vanguard?room=myday", "/vanguard?room=mywork", `/vanguard?room=missions&tab=mission%3A${A}`, "/vanguard?room=missions&tab=week",
      "/vanguard?room=missions&tab=calendar", "/vanguard?room=missions&tab=milestones", "/vanguard?room=missions&tab=billing", "/vanguard?room=tasks", `/vanguard?room=tasks&tab=ticket%3A${T.t1}`,
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
          // every dropdown is the app's own (vanguard/ui/Select.tsx), never the browser's
          const native = await tab.evaluate("document.querySelectorAll('select, datalist').length").catch(() => 0);
          if (native) broken.push({ path, native });
          const errors = tab.takeErrors();
          if (!shown || crashed || errors.length) broken.push({ path, shown, crashed, errors: errors.slice(0, 2) });
        } catch (error) {
          broken.push({ path, error: error instanceof Error ? error.message : String(error) });
        }
      }
      check(`${who}: ${rooms.length} rooms and tabs open without an error`, broken.length === 0, broken.length ? broken.slice(0, 3) : `${Math.round((Date.now() - began) / 1000)} s`);
    }
    // the ticket page, as Jira lays it out
    await tab.signIn(cookies["mariem.sow"]);
    await tab.go(`/vanguard?room=tasks&tab=${encodeURIComponent(`ticket:${T.t1}`)}`);
    const page = await tab.until("/^AUD-\\d+$/.test(document.querySelector('.tk-key')?.innerText.trim() ?? '') && document.querySelectorAll('.tk-acttabs [role=tab]').length === 4 && document.body.innerText.includes('Pièces jointes') && document.body.innerText.includes('Tickets associés') && Boolean(document.querySelector('.tk-details'))", 25_000);
    const historyShown = await tab.evaluate("[...document.querySelectorAll('.tk-entry-h')].some((h) => h.innerText.includes(\"a mis à jour l'estimation\"))");
    check("the ticket page shows its key, details, attachments, links and activity (with the estimate in its history)", page && historyShown && tab.takeErrors().length === 0, { page, historyShown });
    // the floor's overview: the first page of flat mode; a person opens on their page
    await tab.go("/vanguard");
    const overviewShown = await tab.until("document.querySelectorAll('.ov-figs .ov-fig').length === 7 && [...document.querySelectorAll('.ov-team tbody tr')].some((r) => r.innerText.includes('Ahmed Ba'))", 25_000);
    await tab.evaluate("[...document.querySelectorAll('.ov-team tbody tr')].find((r) => r.innerText.includes('Ahmed Ba')).click()");
    const personShown = await tab.until("Boolean(document.querySelector('.pv-week .pv-days')) && document.body.innerText.includes('À venir') && document.body.innerText.includes('Circularisation clients')", 25_000);
    check("flat mode opens on the floor's overview; a person opens on their page with their week, current and next tickets", overviewShown && personShown && tab.takeErrors().length === 0, { overviewShown, personShown });
    await tab.go("/vanguard?room=overview");
    await tab.until("document.querySelectorAll('.ov-figs .ov-fig').length === 7", 15_000);
    await tab.evaluate("[...document.querySelectorAll('.ov-fig')].find((f) => /Non assignés/.test(f.innerText)).click()");
    check("…a figure opens the list behind it", await tab.until("Boolean(document.querySelector('.wk-toolbar')) && document.querySelector('.wk-people button.on') !== null && Boolean(document.querySelector('table'))", 15_000) && tab.takeErrors().length === 0);
    // the Missions room, redrawn: cards by status, a mission's page, the list remembered, the calendar's day, full names
    await tab.go("/vanguard?room=missions");
    const cards = await tab.until("[...document.querySelectorAll('.ms-card .ms-card-name')].some((n) => n.innerText === 'Audit légal 2025') && Boolean(document.querySelector('.ms-group-h'))", 25_000);
    check("the Missions room shows the floor's missions as cards grouped by status, without the old desks", cards && !(await tab.evaluate("Boolean(document.querySelector('.desk'))")) && tab.takeErrors().length === 0);
    await tab.evaluate("[...document.querySelectorAll('.ms-card')].find((c) => c.innerText.includes('Audit légal 2025')).click()");
    const missionPage = await tab.until("document.querySelector('.mp-title')?.innerText === 'Audit légal 2025' && document.querySelectorAll('.mp-ticket').length > 0 && Boolean(document.querySelector('.tk-details'))", 25_000);
    check("…a card opens the mission's page: its tickets, its milestones, its details beside", missionPage && await tab.until("Boolean(document.querySelector('.mp-steps .mp-step'))", 15_000) && tab.takeErrors().length === 0);
    await tab.go("/vanguard?room=missions");
    await tab.until("document.querySelectorAll('.ms-card').length > 0", 15_000);
    await tab.evaluate("[...document.querySelectorAll('.ms-toolbar-r .seg-mini button')].find((b) => /Liste|List/.test(b.innerText)).click()");
    await tab.go("/vanguard?room=missions");
    check("…the list view, once chosen, is remembered", await tab.until("Boolean(document.querySelector('.ms-table')) && !document.querySelector('.ms-card')", 15_000));
    await tab.evaluate("[...document.querySelectorAll('.ms-toolbar-r .seg-mini button')].find((b) => /Cartes|Cards/.test(b.innerText)).click()");
    await tab.go("/vanguard?room=missions&tab=calendar");
    const calendar = await tab.until("document.querySelectorAll('.cal-grid .cal-day').length % 7 === 0 && document.querySelectorAll('.cal-grid .cal-day').length >= 28 && Boolean(document.querySelector('.cal-side-day'))", 25_000);
    const dayBefore = await tab.evaluate("document.querySelector('.cal-side-day').innerText");
    await tab.evaluate("document.querySelectorAll('.cal-grid .cal-day:not(.sel)')[3].click()");
    check("the calendar draws the month and lists a picked day beside it", calendar && await tab.until(`document.querySelector('.cal-side-day').innerText !== ${JSON.stringify(dayBefore)}`, 10_000) && tab.takeErrors().length === 0);
    await tab.go("/vanguard?room=missions&tab=milestones");
    const lanes = await tab.until("document.querySelectorAll('.rm-row .rm-name').length > 0", 25_000);
    const cut = await tab.evaluate("[...document.querySelectorAll('.rm-name, .rm-group-h .linkish b')].filter((n) => n.scrollWidth > n.clientWidth + 1 || getComputedStyle(n).textOverflow === 'ellipsis').map((n) => n.innerText)");
    check("the milestones show every mission's full name", lanes && cut.length === 0 && tab.takeErrors().length === 0, cut);
    // statuses: the list changes a ticket's stage in place, among its board's stages
    await tab.go("/vanguard?room=tasks&tab=list");
    const stageCell = await tab.until("[...document.querySelectorAll('.stage-pick')].some((p) => p.innerText.includes('TO MERGE') || p.innerText.includes('To merge'))", 25_000);
    check("the list shows each ticket's own stage, to change in place", stageCell && tab.takeErrors().length === 0);
    // the timesheet, made simple: the week in a strip, the quick entry, a grid typed into
    await tab.go("/vanguard?room=time");
    const sheet = await tab.until("Boolean(document.querySelector('.ts-strip')) && Boolean(document.querySelector('.ql .ql-dur input')) && Boolean(document.querySelector('.ts-grid'))", 25_000);
    const setValue = (selector, value) => `(() => { const i = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(value)}); i.dispatchEvent(new Event('input', { bubbles: true })); })()`;
    await tab.evaluate(setValue(".ql .ql-dur input", "1h30"));
    await tab.evaluate("document.querySelector('.ql .ql-what').click()");
    await tab.until("document.querySelectorAll('.vsel-pop [role=option]').length > 0", 5_000);
    await tab.evaluate("[...document.querySelectorAll('.vsel-pop [role=option]')].find((o) => /Autre travail/.test(o.innerText) && o.innerText.includes('Audit légal 2025')).click()");
    await tab.until("Boolean(document.querySelector('.ql .ql-label'))", 5_000);
    await tab.evaluate(setValue(".ql .ql-label", "Revue smoke"));
    await tab.evaluate("document.querySelector('.ql .ql-save').click()");
    const quickSaved = await tab.until("[...document.querySelectorAll('.ts-grid tbody th')].some((h) => h.innerText.includes('Revue smoke'))", 15_000);
    const quick = await one("select id, minutes, work_date::text d from erp.time_entry where user_id = $1 and mission = 'Revue smoke'", [uid.mariem]);
    check("the quick entry logs \"1h30\" in one go", quickSaved && quick?.minutes === 90, quick);
    const cell = `(() => { const rows = [...document.querySelectorAll('.ts-grid tbody tr')]; const r = rows.findIndex((x) => x.innerText.includes('Revue smoke')); const days = [...document.querySelectorAll('.ts-grid thead th')].slice(1, 8); const c = days.findIndex((d) => d.classList.contains('today')); return document.querySelector('[data-cell="' + r + '-' + c + '"]'); })()`;
    await tab.evaluate(`${cell}.click()`);
    await tab.until("Boolean(document.querySelector('.ts-cellin'))", 5_000);
    await tab.evaluate(setValue(".ts-cellin", "2"));
    await tab.evaluate("document.querySelector('.ts-cellin').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))");
    let cellLine = null;
    for (let i = 0; i < 40 && cellLine?.minutes !== 120; i++) { await new Promise((resolve) => setTimeout(resolve, 250)); cellLine = await one("select minutes from erp.time_entry where id = $1", [quick?.id]); }
    check("…a cell typed into (\"2\", Enter) saves the line", sheet && cellLine?.minutes === 120 && tab.takeErrors().length === 0, cellLine);
    // the test floor: entering it switches the whole app to its data, leaving it switches back
    await tab.signIn(cookies["ahmed.ba"]);
    await tab.go("/vanguard?room=mywork");
    const realWork = await tab.until("document.body.innerText.includes('Circularisation clients')", 25_000);
    const leakBefore = await tab.evaluate("document.body.innerText.includes('Ticket de test')");
    await tab.evaluate("document.querySelector('.rail [aria-haspopup=menu]').click()");
    await tab.until("[...document.querySelectorAll('button')].some((b) => b.innerText.includes('BUMEX Testing'))", 5_000);
    await tab.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.includes('BUMEX Testing')).click()");
    const inTest = await tab.until("document.cookie.includes('bumex-floor-mode=test') && Boolean(document.querySelector('.test-banner')) && !document.querySelector('.mode-switch')", 25_000);
    await tab.go("/vanguard?room=mywork");
    const testOnly = await tab.until("document.body.innerText.includes('Ticket de test') && Boolean(document.querySelector('.test-banner'))", 25_000) && !(await tab.evaluate("document.body.innerText.includes('Circularisation clients')"));
    await tab.evaluate("[...document.querySelectorAll('.test-banner button')].find((b) => /Quitter/.test(b.innerText)).click()");
    const back = await tab.until("!document.cookie.includes('bumex-floor-mode=test') && !document.querySelector('.test-banner') && !document.querySelector('.mode-switch')", 25_000);
    check("the test floor: nothing of it in My work outside; entering it shows only its data; leaving it switches back",
      realWork && !leakBefore && inTest && testOnly && back && tab.takeErrors().length === 0, { realWork, leakBefore, inTest, testOnly, back });
    await tab.signIn(cookies["mariem.sow"]);
    // the board: every mission of the floor on the floor's board, cards with their key; the search narrows them
    await tab.go("/vanguard?room=tasks&tab=board");
    const boardShown = await tab.until("['planification', 'terrain', 'code review', 'rapport', 'to merge', 'terminé'].every((n) => [...document.querySelectorAll('.wk-col-name')].some((c) => c.textContent.trim().toLowerCase() === n)) && [...document.querySelectorAll('.wk-card')].some((c) => /AUD-\\d+/.test(c.innerText))", 25_000);
    const before = await tab.evaluate("document.querySelectorAll('.wk-card').length");
    await tab.evaluate(`(() => { const i = document.querySelector('.wk-search input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Circularisation'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    const narrowed = await tab.until("document.querySelectorAll('.wk-card').length === 1 && document.querySelector('.wk-card').innerText.includes('Circularisation')", 5_000);
    await tab.evaluate(`(() => { const i = document.querySelector('.wk-search input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    check("the board shows the floor's tickets on the floor's stages with their keys, and its search narrows them", boardShown && before > 1 && narrowed && tab.takeErrors().length === 0, { boardShown, before, narrowed });
    // the floor's board, its statuses and rules: a tab of the Tasks room, for the floor's manager to change
    // creating tickets fast: Enter creates, then the next one is ready on the same mission, the rest back to default
    await tab.go("/vanguard?room=tasks&tab=list");
    await tab.until("Boolean(document.querySelector('.sheet-head .hright .btn.primary'))", 15_000);
    await tab.evaluate("document.querySelector('.sheet-head .hright .btn.primary').click()");
    await tab.until("Boolean(document.querySelector('.wk-new .wk-chip'))", 10_000);
    const missionBefore = await tab.evaluate("document.querySelector('.wk-new .field .vsel')?.innerText");
    await tab.evaluate("[...document.querySelectorAll('.wk-new .wk-chip')].find((b) => b.innerText.trim() === '4 h').click()");
    await tab.evaluate(`(() => { const i = document.querySelector('.wk-new input[placeholder]:not(.wk-est-in)'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Ticket rapide'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    const reporterField = await tab.evaluate("[...document.querySelectorAll('.wk-new .field label')].some((l) => /Rapporteur|Reporter/.test(l.innerText))");
    await tab.evaluate("(() => { const a = document.querySelector('.wk-new .rt-area'); a.focus(); document.execCommand('insertText', false, 'Contexte'); a.dispatchEvent(new Event('input', { bubbles: true })); })()");
    await tab.evaluate("[...document.querySelectorAll('.wk-new .rt-tool')].find((b) => b.innerText === '•').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))");
    await tab.evaluate("document.querySelector('.wk-new input[placeholder]:not(.wk-est-in)').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))");
    const ready = await tab.until("Boolean(document.querySelector('.wk-made')) && document.querySelector('.wk-new input[placeholder]:not(.wk-est-in)').value === '' && !document.querySelector('.wk-new .wk-chip.on')", 15_000);
    const fast = await one("select estimated_hours::float8 h, engagement_id, notes, reporter_id, id from erp.task where title = 'Ticket rapide'");
    const missionAfter = await tab.evaluate("document.querySelector('.wk-new .field .vsel')?.innerText");
    check("a ticket is created with Enter and a 4 h chip; the next one is ready on the same mission, the rest cleared",
      ready && fast?.h === 4 && missionBefore === missionAfter && tab.takeErrors().length === 0, { ready, fast, missionBefore, missionAfter });
    check("…the form has its reporter (me by default), and the description typed as in a word processor is kept as a list",
      reporterField && fast?.reporter_id === uid.mariem && fast?.notes === "- Contexte", { reporterField, notes: fast?.notes, reporter: fast?.reporter_id });
    // logging time on what one just moved: one click, and undone
    r = await act("mariem.sow", "moveTicketStageAction", { args: [fast?.id, { stageId: "in_progress" }] });
    await tab.go("/vanguard?room=time");
    const recentRow = `[...document.querySelectorAll('.ts-recent-row')].find((x) => x.innerText.includes('Ticket rapide'))`;
    const shownRecent = await tab.until(`Boolean(${recentRow})`, 20_000);
    const firstRow = await tab.evaluate("document.querySelector('.ts-recent-row b')?.innerText");
    await tab.evaluate(`[...${recentRow}.querySelectorAll('.wk-chip')].find((b) => b.innerText === '+1 h').click()`);
    const minutesOn = async () => (await one("select coalesce(sum(minutes), 0)::int m from erp.time_entry where user_id = $1 and task_id = $2 and work_date = current_date", [uid.mariem, fast?.id])).m;
    const pollMinutes = async (want) => { const end = Date.now() + 10_000; while (Date.now() < end) { if ((await minutesOn()) === want) return true; await new Promise((res) => setTimeout(res, 300)); } return false; };
    const logged = await pollMinutes(60);
    await tab.until(`Boolean(${recentRow}?.querySelector('.ts-recent-undo'))`, 10_000);
    await tab.evaluate(`${recentRow}.querySelector('.ts-recent-undo').click()`);
    const undone = await pollMinutes(0);
    check("the timesheet shows the tickets just moved, the last first; one click logs an hour on one, and it can be undone",
      !r?.error && shownRecent && firstRow === "Ticket rapide" && logged && undone && tab.takeErrors().length === 0, { moved: r, shownRecent, firstRow, logged, undone });
    await tab.go("/vanguard?room=tasks&tab=rules");
    const rules = await tab.until("Boolean(document.querySelector('.wf-floor')) && [...document.querySelectorAll('.sheet-body table input')].some((i) => i.value === 'Code review' && !i.disabled)", 25_000);
    check("the floor's board is changed in the Tasks room's \"Statuts et règles\" tab", rules && tab.takeErrors().length === 0);
    // its moves: a setting ticked stays ticked (the editor used to reload itself and drop it); custom transitions start
    // from the settings; the board saves them, and a move back then asks its reason
    const setting = (n) => `[...document.querySelectorAll('.wf-setting input')][${n}]`; // backward, skip, reopen, reason, custom
    const saveBoard = "[...document.querySelectorAll('.actions .btn.primary')].find((b) => /Enregistrer le tableau|Save the board/.test(b.innerText))?.click()";
    const boardRow = () => one("select require_reason, custom_transitions_enabled, (select count(*)::int from jsonb_object_keys(transitions)) n from work.floor_board where entity_id = $1", [entity.bumex_audit]);
    const until = async (test, ms = 10_000) => { const end = Date.now() + ms; while (Date.now() < end) { if (test(await boardRow())) return true; await new Promise((r) => setTimeout(r, 300)); } return false; };
    await tab.evaluate(`${setting(3)}.click()`);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const reasonKept = await tab.evaluate(`${setting(3)}.checked`);
    await tab.evaluate(`${setting(4)}.click()`);
    const prefilled = await tab.until("document.querySelectorAll('.wf-matrix input:checked').length > 0 && document.querySelectorAll('.wf-setting.off').length === 3", 5_000);
    await tab.evaluate(saveBoard);
    const savedMoves = await until((b) => b.require_reason && b.custom_transitions_enabled && b.n > 0);
    r = await act("ahmed.ba", "moveTicketStageAction", { args: [T.t2, { stageId: "todo" }] });
    check("the board's moves: a ticked setting stays, custom transitions start from the settings, the board saves them, a move back asks why",
      reasonKept && prefilled && savedMoves && r?.code === "reason_required" && tab.takeErrors().length === 0, { reasonKept, prefilled, savedMoves, move: r?.code });
    await tab.evaluate(`${setting(4)}.click()`);
    await tab.evaluate(`${setting(3)}.click()`);
    await tab.evaluate(saveBoard);
    await until((b) => !b.require_reason && !b.custom_transitions_enabled);
    // the app opens on the person's default entity, and the logo leads back to it
    await tab.signIn(cookies["mohamed.cheikh"]);
    await tab.go("/vanguard");
    const openedHome = await tab.until("/BUMEX IT/.test(document.querySelector('.crumbs')?.innerText ?? '')", 25_000);
    await tab.go("/vanguard?room=missions");
    await tab.until("Boolean(document.querySelector('.sheet-head'))", 15_000);
    await tab.evaluate("document.querySelector('.brand').click()");
    const backHome = await tab.until("/BUMEX IT/.test(document.querySelector('.crumbs')?.innerText ?? '') && !document.querySelector('.ms')", 15_000);
    check("the app opens on the person's default entity, and the logo leads back to it", openedHome && backHome && tab.takeErrors().length === 0, { openedHome, backHome });
    await tab.signIn(cookies["mohamed.cheikh"]);
    await tab.go("/vanguard?room=settings&tab=access");
    const listed = await tab.until("document.body.innerText.includes('Modificateurs') && document.body.innerText.includes('Salma Fall')");
    await tab.evaluate("[...document.querySelectorAll('button')].find((b) => b.innerText.includes('Mariem Sow'))?.click()");
    const editor = await tab.until("document.body.innerText.includes('Modificateur de rôles') && document.body.innerText.includes('Bâtiment 3D') && document.body.innerText.includes('BUMEX Testing') && document.body.innerText.includes('Étage de test · sous-sol') && document.querySelectorAll('table input[type=checkbox]').length > 60");
    check("the Permissions tab lists everyone and opens a person's grid", listed && editor && tab.takeErrors().length === 0);
    // a dropdown, by the keyboard: typed to search from the closed field, Enter picks the best match
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const role = "[...document.querySelectorAll('.field')].find((f) => f.querySelector('label')?.innerText.trim() === 'Rôle')?.querySelector('button.vsel')";
    await tab.evaluate(`(() => { const b = ${role}; b.focus(); b.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true, cancelable: true })); })()`);
    const searching = await tab.until("document.querySelector('.vsel-pop .vsel-search input')?.value === 'c'", 5_000);
    await tab.evaluate(`(() => {
      const input = document.querySelector('.vsel-pop .vsel-search input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'compt');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await sleep(150);
    const ranked = await tab.evaluate("[...document.querySelectorAll('.vsel-pop [role=option]')].map((o) => o.innerText.trim())");
    await tab.evaluate("document.querySelector('.vsel-pop .vsel-search input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))");
    await sleep(150);
    const typed = await tab.evaluate(`({ label: ${role}.innerText.trim(), open: Boolean(document.querySelector('.vsel-pop')), marked: ${JSON.stringify(ranked)} })`);
    check("a dropdown searches as one types and Enter picks the match", searching && ranked[0] === "Comptable" && typed.label === "Comptable" && !typed.open, { ranked, typed });
    // …and by the mouse: opened, an option clicked; Escape closes it without closing the room
    await tab.evaluate(`${role}.click()`);
    const opened = await tab.until("document.querySelectorAll('.vsel-pop [role=option]').length >= 6", 5_000);
    await tab.evaluate("[...document.querySelectorAll('.vsel-pop [role=option]')].find((o) => o.innerText.trim() === 'Associé').click()");
    await sleep(150);
    const clicked = await tab.evaluate(`${role}.innerText.trim()`);
    await tab.evaluate(`${role}.click()`);
    await tab.until("Boolean(document.querySelector('.vsel-pop'))", 5_000);
    await tab.evaluate("document.querySelector('.vsel-pop .vsel-search input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))");
    await sleep(150);
    const escaped = await tab.evaluate("({ open: Boolean(document.querySelector('.vsel-pop')), room: document.body.innerText.includes('Modificateur de rôles') })");
    check("…and by the mouse; Escape closes the list, not the room", opened && clicked === "Associé" && !escaped.open && escaped.room && tab.takeErrors().length === 0, { clicked, escaped });
    await tab.signIn(cookies["fatimetou.admin"]);
    await tab.go("/vanguard?room=settings");
    await tab.until("document.body.innerText.includes('Mon compte')");
    check("…it is not there for an administrator who is not a role modifier", !(await tab.evaluate("[...document.querySelectorAll('[role=tab]')].some((t) => t.innerText.includes('Permissions'))")));
  } finally {
    await tab.close();
  }
}
