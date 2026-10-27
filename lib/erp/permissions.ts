import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { isAllowedCompanyEmail, normalizeEmail } from "@/lib/auth/company-email";
import { accessOf, deleteErpAccess, writeErpAccess, type ErpAccessInput } from "@/lib/erp/access";
import { erpConsolidationRoles, erpEntityModuleKeys, isErpRole, resolveErpModules } from "@/lib/erp/config";
import { withErpSession, withErpSystemSession, type ErpTransaction } from "@/lib/erp/db";
import { floors } from "@/lib/erp/vanguard/floors";
import { sendAppMail } from "@/lib/email/send";
import { adminAuth } from "@/lib/firebase/admin";
import type { BumexEntityCode, ErpEntityCode } from "@/types/entity";
import type { ErpEntityModules, ErpModuleKey, ErpRole } from "@/types/erp";

// The permissions page (vanguard/one/Permissions.tsx): everyone's access, read by the server, changed in the role
// modifier's own ERP session, where the database refuses anyone else and what nobody may do to themselves (migration
// 0009). A role gives its standard parts (lib/erp/config.ts); the page tweaks them per person and per entity, and
// what is stored is the person's usual parts (modules, null = the role's) and the entities where they differ
// (entity_modules). The test floor (0011) is apart: "every entity" leaves it out, test_floor gives it, with its own
// parts when they differ. Invitations: a Firebase account without a password, the person, their access, and a link
// sent to them where they choose their password (app/invite).

export type PermissionsError =
  | "not_allowed" | "own_access" | "invalid" | "no_entity" | "email" | "name" | "exists" | "signed_in" | "expired" | "password" | "unavailable";

// What a person reaches: their role, and on every entity they see, its parts (consolidation is the group's; the test
// floor is among them when they have it, whatever allEntities says); and whether they see the building in 3D (0010,
// off unless given).
export type PersonAccess = {
  role: ErpRole;
  allEntities: boolean;
  parts: Partial<Record<ErpEntityCode, ErpModuleKey[]>>;
  consolidation: boolean;
  managesAccess: boolean;
  view3d: boolean;
};

export type PermissionPerson = {
  id: string;
  name: string;
  email: string;
  homeEntity: BumexEntityCode | null;
  jobTitle: string | null;
  access: PersonAccess | null;
  removed: boolean; // had access, removed since
  invitedUntil: string | null; // an invitation not used yet (may be past)
  neverSignedIn: boolean;
};

export type PermissionsData = {
  me: string;
  people: PermissionPerson[];
  entities: { code: ErpEntityCode; name: string; floor: string; isTest: boolean }[];
  // the test floor's sample data: whether it is there (a chart of accounts)
  testFloorReady: boolean;
};

export type PermissionsInput = PersonAccess & { homeEntity: BumexEntityCode | null };

export type InviteInput = { email: string; fullName: string; homeEntity: BumexEntityCode; role: ErpRole };

const INVITATION_DAYS = 7;

type PersonRow = {
  id: string;
  name: string;
  email: string;
  entity_code: BumexEntityCode | null;
  job_title: string | null;
  erp_role: ErpRole | null;
  entity_codes: BumexEntityCode[] | null;
  modules: ErpModuleKey[] | null;
  entity_modules: ErpEntityModules | null;
  manages_access: boolean | null;
  view_3d: boolean | null;
  test_floor: boolean | null;
  removed: boolean;
  invited_until: Date | null;
};

type EntityRow = { code: ErpEntityCode; name: string; is_test: boolean };

async function entityRows(tx: ErpTransaction) {
  return tx.query<EntityRow>("select code, name, is_test from erp.entity where active order by floor_order");
}

// the real entities, and the test floor's code
function split(rows: EntityRow[]) {
  return { all: rows.filter((e) => !e.is_test).map((e) => e.code as BumexEntityCode), test: rows.find((e) => e.is_test)?.code ?? null };
}

function personAccess(row: PersonRow, all: BumexEntityCode[], test: ErpEntityCode | null): PersonAccess | null {
  if (!row.erp_role) return null;
  const access = accessOf({
    erp_role: row.erp_role, entity_codes: row.entity_codes, modules: row.modules, entity_modules: row.entity_modules,
    manages_access: row.manages_access === true, view_3d: row.view_3d === true, test_floor: row.test_floor === true,
  });
  const usual = access.modules.filter((m) => m !== "consolidation");
  const seen: ErpEntityCode[] = [...(access.entityCodes ?? all), ...(access.testFloor && test ? [test] : [])];
  return {
    role: access.role,
    allEntities: access.entityCodes === null,
    parts: Object.fromEntries(seen.map((code) => [code, access.entityModules[code] ?? usual])),
    consolidation: access.modules.includes("consolidation"),
    managesAccess: access.managesAccess,
    view3d: access.view3d,
  };
}

// The Firebase accounts that never signed in (an invitation not taken up yet). Unknown when Firebase cannot be read.
async function neverSignedIn(ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  try {
    for (let i = 0; i < ids.length; i += 100) {
      const { users } = await adminAuth().getUsers(ids.slice(i, i + 100).map((uid) => ({ uid })));
      for (const u of users) if (!u.metadata.lastSignInTime) out.add(u.uid);
    }
  } catch (error) {
    console.error("[permissions:firebase]", error instanceof Error ? error.message : error);
  }
  return out;
}

// Everyone, with their access: the server's read (the caller checked the person manages access).
export async function listPermissions(actorId: string): Promise<PermissionsData> {
  const { rows, entities, ready } = await withErpSystemSession(actorId, async (tx) => ({
    entities: await entityRows(tx),
    ready: (await tx.query<{ ready: boolean }>(
      "select exists (select 1 from erp.account a join erp.entity e on e.id = a.entity_id where e.is_test) as ready",
    ))[0].ready,
    rows: await tx.query<PersonRow>(
      `select p.id, coalesce(nullif(trim(p.full_name), ''), p.email) as name, p.email, p.entity_code, p.job_title,
              u.erp_role, u.entity_codes, u.modules, u.entity_modules, u.manages_access, u.view_3d, u.test_floor,
              u.user_id is null and exists (select 1 from erp.audit_log a where a.table_name = 'user_access'
                                                and coalesce(a.after_row, a.before_row) ->> 'user_id' = p.id) as removed,
              (select max(i.expires_at) from work.invitation i where i.person_id = p.id and i.used_at is null) as invited_until
         from work.person p left join erp.user_access u on u.user_id = p.id
        order by 2`,
    ),
  }));
  const { all, test } = split(entities);
  const fresh = await neverSignedIn(rows.map((r) => r.id));
  return {
    me: actorId,
    entities: entities.map((e) => ({ code: e.code, name: e.name, isTest: e.is_test, floor: floors[e.code]?.code ?? e.code.toUpperCase() })),
    testFloorReady: ready,
    people: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      homeEntity: r.entity_code,
      jobTitle: r.job_title,
      access: personAccess(r, all, test),
      removed: r.removed,
      invitedUntil: r.invited_until ? r.invited_until.toISOString() : null,
      neverSignedIn: fresh.has(r.id),
    })),
  };
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));
const canonical = (modules: readonly string[]) => erpEntityModuleKeys.filter((m) => modules.includes(m));

// The page's choices as stored: the usual parts are the ones most real entities have (the role's on a tie), null
// when they are the role's; the entities that differ keep their own. The test floor is test_floor, its parts an
// exception when they are not the usual ones; someone may have it alone.
export function storedAccess(input: PersonAccess, all: readonly BumexEntityCode[], test: ErpEntityCode | null = null): ErpAccessInput | PermissionsError {
  if (!input || typeof input !== "object" || !isErpRole(input.role) || typeof input.parts !== "object" || !input.parts) return "invalid";
  const chosen = Object.keys(input.parts) as ErpEntityCode[];
  if (chosen.some((code) => code !== test && !(all as readonly string[]).includes(code))) return "invalid";
  for (const code of chosen) {
    const modules = input.parts[code];
    if (!Array.isArray(modules) || modules.some((m) => typeof m !== "string" || !(erpEntityModuleKeys as string[]).includes(m))) return "invalid";
  }
  const seen = input.allEntities === true ? [...all] : all.filter((code) => chosen.includes(code));
  const testFloor = test !== null && chosen.includes(test);
  if (!seen.length && !testFloor) return "no_entity";

  const role = input.role;
  const roleParts = resolveErpModules(role, null).filter((m) => m !== "consolidation");
  const sets = new Map<ErpEntityCode, ErpModuleKey[]>(seen.map((code) => [code, input.parts[code] ? canonical(input.parts[code]!) : roleParts]));
  const count = new Map<string, number>();
  for (const set of sets.values()) count.set(set.join(), (count.get(set.join()) ?? 0) + 1);
  const most = Math.max(0, ...count.values());
  const usual = count.get(roleParts.join()) === most || !seen.length ? roleParts : [...sets.values()].find((set) => count.get(set.join()) === most)!;
  if (testFloor) sets.set(test, canonical(input.parts[test]!));

  const group = input.consolidation === true && erpConsolidationRoles.includes(role);
  const modules: ErpModuleKey[] = [...usual, ...(group ? (["consolidation"] as const) : [])];
  const exceptions = [...sets.keys()].filter((code) => sets.get(code)!.join() !== usual.join());
  return {
    role,
    entityCodes: input.allEntities === true ? null : seen,
    modules: sameList(modules, resolveErpModules(role, null)) ? null : modules,
    entityModules: exceptions.length ? Object.fromEntries(exceptions.map((code) => [code, sets.get(code)!])) : null,
    managesAccess: role === "admin" && input.managesAccess === true,
    view3d: input.view3d === true,
    testFloor,
  };
}

// The database's refusals, as the page says them.
function refusal(error: unknown): PermissionsError {
  const message = error instanceof Error ? error.message : "";
  if (/own administrator role|own access/.test(message)) return "own_access";
  if (/manages access|row-level security/.test(message)) return "not_allowed";
  if (/wrong modules|unknown entity|check constraint|violates|invalid input/.test(message)) return "invalid";
  console.error("[permissions]", message || error);
  return "unavailable";
}

export async function savePermissions(actorId: string, userId: string, input: PermissionsInput): Promise<{ error?: PermissionsError }> {
  if (typeof userId !== "string" || !userId) return { error: "invalid" };
  try {
    return await withErpSession(actorId, async (tx) => {
      const { all, test } = split(await entityRows(tx));
      const stored = storedAccess(input, all, test);
      if (typeof stored === "string") return { error: stored };
      if (input.homeEntity && !(all as readonly string[]).includes(input.homeEntity)) return { error: "invalid" };
      await writeErpAccess(tx, userId, stored);
      if (typeof input.homeEntity === "string" && input.homeEntity) {
        await tx.run("update work.person set entity_code = $2 where id = $1 and entity_code is distinct from $2", [userId, input.homeEntity]);
      }
      return {};
    });
  } catch (error) {
    return { error: refusal(error) };
  }
}

export async function removeAccess(actorId: string, userId: string): Promise<{ error?: PermissionsError }> {
  try {
    await withErpSession(actorId, (tx) => deleteErpAccess(tx, userId));
    return {};
  } catch (error) {
    return { error: refusal(error) };
  }
}

// ---- invitations -------------------------------------------------------------------------------------------------

const digest = (token: string) => createHash("sha256").update(token).digest("hex");

// A new link for the person (the older ones stop working); the token itself is only in the e-mail.
async function newInvitation(actorId: string, personId: string) {
  const token = randomBytes(32).toString("base64url");
  await withErpSystemSession(actorId, async (tx) => {
    await tx.query("delete from work.invitation where person_id = $1 and used_at is null", [personId]);
    await tx.query(
      `insert into work.invitation (person_id, token_hash, expires_at) values ($1, $2, now() + make_interval(days => $3))`,
      [personId, digest(token), INVITATION_DAYS],
    );
  });
  return token;
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

async function mailInvitation(to: { email: string; name: string }, inviter: string, link: string) {
  const subject = "Votre accès à BUMEX Vanguard · Your BUMEX Vanguard access";
  const text = [
    `Bonjour ${to.name},`,
    `${inviter} vous a ouvert un accès à BUMEX Vanguard. Choisissez votre mot de passe (lien valable ${INVITATION_DAYS} jours, une seule fois) :`,
    link,
    "",
    `Hello ${to.name},`,
    `${inviter} gave you access to BUMEX Vanguard. Choose your password (the link works once, for ${INVITATION_DAYS} days):`,
    link,
  ].join("\n");
  const button = `<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 18px;border-radius:6px;background:#1f3a68;color:#fff;text-decoration:none">`;
  const html = [
    `<p>Bonjour ${escapeHtml(to.name)},</p>`,
    `<p>${escapeHtml(inviter)} vous a ouvert un accès à BUMEX Vanguard. Choisissez votre mot de passe : le lien est valable ${INVITATION_DAYS} jours, une seule fois.</p>`,
    `${button}Choisir mon mot de passe</a></p>`,
    `<hr style="border:none;border-top:1px solid #ddd;margin:20px 0">`,
    `<p>Hello ${escapeHtml(to.name)},</p>`,
    `<p>${escapeHtml(inviter)} gave you access to BUMEX Vanguard. Choose your password: the link works once, for ${INVITATION_DAYS} days.</p>`,
    `${button}Choose my password</a></p>`,
  ].join("\n");
  await sendAppMail({ to: to.email, subject, html, text });
}

async function sendInvitation(actorId: string, inviter: string, person: { id: string; email: string; name: string }, baseUrl: string) {
  const token = await newInvitation(actorId, person.id);
  try {
    await mailInvitation(person, inviter, `${baseUrl}/invite/${token}`);
    return true;
  } catch (error) {
    console.error("[permissions:invitation-mail]", error instanceof Error ? error.message : error);
    return false;
  }
}

// A new person: their Firebase account (without a password), their row on their entity, their role's access there
// (every entity for the administrators' roles), then the link. Written in the role modifier's session: a refusal
// leaves nothing behind.
export async function invitePerson(actorId: string, inviter: string, input: InviteInput, baseUrl: string): Promise<{ id?: string; mailed?: boolean; error?: PermissionsError }> {
  const email = normalizeEmail(typeof input?.email === "string" ? input.email : "");
  const fullName = typeof input?.fullName === "string" ? input.fullName.trim() : "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !isAllowedCompanyEmail(email)) return { error: "email" };
  if (!fullName) return { error: "name" };
  if (!isErpRole(input.role)) return { error: "invalid" };

  const known = await withErpSystemSession(actorId, async (tx) => ({
    entities: split(await entityRows(tx)).all,
    person: (await tx.query<{ id: string }>("select id from work.person where lower(email) = $1", [email]))[0],
  }));
  if (!known.entities.includes(input.homeEntity)) return { error: "invalid" };
  if (known.person) return { id: known.person.id, error: "exists" };

  let uid: string;
  let created = false;
  try {
    uid = (await adminAuth().getUserByEmail(email)).uid;
  } catch (error) {
    if ((error as { code?: string })?.code !== "auth/user-not-found") return { error: "unavailable" };
    uid = (await adminAuth().createUser({ email, displayName: fullName, emailVerified: false })).uid;
    created = true;
  }

  try {
    await withErpSession(actorId, async (tx) => {
      await tx.query("insert into work.person (id, email, full_name, entity_code) values ($1, $2, $3, $4)", [uid, email, fullName, input.homeEntity]);
      await writeErpAccess(tx, uid, {
        role: input.role,
        entityCodes: erpConsolidationRoles.includes(input.role) ? null : [input.homeEntity],
        modules: null,
      });
    });
  } catch (error) {
    if (created) await adminAuth().deleteUser(uid).catch(() => null);
    return { error: refusal(error) };
  }

  const mailed = await sendInvitation(actorId, inviter, { id: uid, email, name: fullName }, baseUrl);
  return { id: uid, mailed };
}

// Another link, for someone who has not signed in yet.
export async function resendInvitation(actorId: string, inviter: string, userId: string, baseUrl: string): Promise<{ mailed?: boolean; error?: PermissionsError }> {
  const person = await withErpSystemSession(actorId, async (tx) =>
    (await tx.query<{ id: string; email: string; name: string }>(
      "select id, email, coalesce(nullif(trim(full_name), ''), email) as name from work.person where id = $1",
      [userId],
    ))[0],
  );
  if (!person) return { error: "invalid" };
  const fresh = await neverSignedIn([person.id]);
  if (!fresh.has(person.id)) return { error: "signed_in" };
  return { mailed: await sendInvitation(actorId, inviter, person, baseUrl) };
}

export type Invitation = { email: string; name: string } | { error: "expired" };

export async function findInvitation(token: string): Promise<Invitation> {
  if (typeof token !== "string" || token.length < 20) return { error: "expired" };
  const [row] = await withErpSystemSession("invitation", (tx) =>
    tx.query<{ email: string; name: string }>(
      `select p.email, coalesce(nullif(trim(p.full_name), ''), p.email) as name
         from work.invitation i join work.person p on p.id = i.person_id
        where i.token_hash = $1 and i.used_at is null and i.expires_at > now()`,
      [digest(token)],
    ),
  );
  return row ?? { error: "expired" };
}

// The person chooses their password: the link proves their address. Used once; the caller signs them in.
export async function acceptInvitation(token: string, password: string): Promise<{ email: string } | { error: PermissionsError }> {
  if (typeof password !== "string" || password.length < 8 || password.length > 128) return { error: "password" };
  if (typeof token !== "string" || token.length < 20) return { error: "expired" };
  try {
    return await withErpSystemSession("invitation", async (tx) => {
      const [row] = await tx.query<{ person_id: string; email: string }>(
        `select i.person_id, p.email from work.invitation i join work.person p on p.id = i.person_id
          where i.token_hash = $1 and i.used_at is null and i.expires_at > now() for update of i`,
        [digest(token)],
      );
      if (!row) return { error: "expired" as const };
      await adminAuth().updateUser(row.person_id, { password, emailVerified: true });
      await tx.query("update work.invitation set used_at = now() where person_id = $1 and used_at is null", [row.person_id]);
      return { email: row.email };
    });
  } catch (error) {
    console.error("[permissions:accept]", error instanceof Error ? error.message : error);
    return { error: "unavailable" };
  }
}
