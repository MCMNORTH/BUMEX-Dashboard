import "server-only";

import { getSubjectsActivity, logActivity } from "@/lib/activity/service";
import { matchesSearchTerms, searchTerms } from "@/lib/search/text";
import { asPerson, select, selectOne } from "@/lib/work/db";
import type { AppRole } from "@/types/auth";
import type {
  ContractClientPreview,
  ContractFilters,
  ContractFiltersData,
  ContractFormValues,
  ContractProjectPreview,
  ContractRecord,
  ContractResponsibleUser,
  ContractStatus,
  ContractType,
} from "@/types/contract";
import type { ActivityLogRecord } from "@/types/activity";

type ContractRow = {
  id: string;
  title: string;
  contract_number?: string | null;
  client_id: string;
  project_id?: string | null;
  status: ContractStatus;
  contract_type?: ContractType;
  start_date?: string | null;
  end_date?: string | null;
  signed_date?: string | null;
  renewal_date?: string | null;
  amount?: number | null;
  currency?: string;
  payment_terms?: string | null;
  responsible_user_id?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at?: string;
  client: ContractClientPreview | null;
  project: ContractProjectPreview | null;
  responsibleUser: ContractResponsibleUser | null;
};

function getDaysUntil(dateValue: string | null) {
  if (!dateValue) {
    return null;
  }

  const today = new Date();
  const date = new Date(dateValue);
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
}

function getRenewalState(contract: Pick<ContractRow, "renewal_date" | "end_date" | "status">): ContractRecord["renewalState"] {
  const reference = contract.renewal_date ?? contract.end_date ?? null;
  const days = getDaysUntil(reference);

  if (days === null) {
    return "none";
  }

  if (contract.status === "expired" || days < 0) {
    return "expired";
  }

  if (days <= 30) {
    return "renewing_soon";
  }

  return "scheduled";
}

// A contract (work.contract, 0008) with its client, mission and responsible person; its mission is the project.
const CONTRACT_SQL = `
  select k.id, k.title, k.contract_number, k.client_id, k.engagement_id as project_id, k.status, k.contract_type, k.start_date, k.end_date,
         k.signed_date, k.renewal_date, k.amount::float8 as amount, k.currency, k.payment_terms, k.responsible_user_id, k.notes, k.created_at, k.updated_at,
         (select jsonb_build_object('id', c.id, 'name', c.name, 'status', c.status, 'contact_email', c.contact_email) from work.client c where c.id = k.client_id) as client,
         (select jsonb_build_object('id', e.id, 'name', e.name, 'status', case when e.status = 'planned' then 'draft' else e.status::text end, 'end_date', e.deadline)
            from erp.engagement e where e.id = k.engagement_id) as project,
         (select jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email, 'avatar_url', p.avatar_url, 'role', work.person_role(p.id))
            from work.person p where p.id = k.responsible_user_id) as "responsibleUser"
    from work.contract k`;

function mapContract(row: ContractRow, role: AppRole, activity: ActivityLogRecord[] = []): ContractRecord {
  const renewalState = getRenewalState(row);
  const referenceDate = row.renewal_date ?? row.end_date ?? null;

  return {
    id: row.id,
    title: row.title,
    contract_number: row.contract_number ?? null,
    client_id: row.client_id,
    project_id: row.project_id ?? null,
    status: row.status,
    contract_type: row.contract_type ?? "development",
    start_date: row.start_date ?? null,
    end_date: row.end_date ?? null,
    signed_date: row.signed_date ?? null,
    renewal_date: row.renewal_date ?? null,
    amount: row.amount ?? null,
    currency: row.currency ?? "USD",
    payment_terms: role === "shareholder" ? null : (row.payment_terms ?? null),
    responsible_user_id: row.responsible_user_id ?? null,
    notes: role === "shareholder" ? null : (row.notes ?? null),
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
    client: row.client,
    project: row.project,
    responsibleUser: row.responsibleUser,
    recentActivity: activity.slice(0, 8),
    daysUntilRenewal: getDaysUntil(referenceDate),
    renewalState,
    viewMode: role === "shareholder" ? "summary" : "full",
  };
}

export async function getContracts(role: AppRole, filters: ContractFilters = {}) {
  const where: string[] = [];
  const params: unknown[] = [];
  const param = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date();
  soon.setDate(soon.getDate() + 30);

  if (filters.clientId) where.push(`k.client_id = ${param(filters.clientId)}::uuid`);
  if (filters.status) where.push(`k.status = ${param(filters.status)}`);
  if (filters.date === "expired") where.push(`(k.end_date < ${param(today)}::date or k.renewal_date < $${params.length}::date)`);
  if (filters.date === "renewing_soon") where.push(`k.renewal_date between ${param(today)}::date and ${param(soon.toISOString().slice(0, 10))}::date`);
  if (filters.date === "active_window") where.push(`k.end_date >= ${param(today)}::date`);
  if (filters.date === "none") where.push("k.end_date is null and k.renewal_date is null");
  if (filters.value === "under_10k") where.push("k.amount < 10000");
  if (filters.value === "10k_50k") where.push("k.amount >= 10000 and k.amount < 50000");
  if (filters.value === "50k_plus") where.push("k.amount >= 50000");
  if (filters.value === "unset") where.push("k.amount is null");

  const rows = await asPerson((tx) =>
    select<ContractRow>(tx, `${CONTRACT_SQL} ${where.length ? `where ${where.join(" and ")}` : ""} order by k.updated_at desc`, params),
  );
  const terms = filters.search ? searchTerms(filters.search) : [];
  const found = rows.filter((row) => matchesSearchTerms(terms, [row.title, row.contract_number]));
  const activityMap = await getSubjectsActivity("contract", found.map((contract) => contract.id), 8);

  return found.map((row) => mapContract(row, role, activityMap.get(row.id) ?? []));
}

export async function getContractsFilterData(): Promise<ContractFiltersData> {
  return asPerson(async (tx) => ({
    clients: await select<ContractClientPreview>(tx, "select id, name, status, contact_email from work.client order by name"),
    projects: await select<ContractProjectPreview>(
      tx,
      "select id, name, case when status = 'planned' then 'draft' else status::text end as status, deadline as end_date from erp.engagement order by name",
    ),
    responsibleUsers: await select<ContractResponsibleUser>(
      tx,
      `select p.id, p.full_name, p.email, p.avatar_url, work.person_role(p.id) as role from work.person p
        where work.person_role(p.id) in ('admin', 'manager') order by p.full_name`,
    ),
  }));
}

export async function getContractById(id: string, role: AppRole) {
  const row = await asPerson((tx) => selectOne<ContractRow>(tx, `${CONTRACT_SQL} where k.id = $1::uuid`, [id])).catch(() => null);

  if (!row) {
    return null;
  }

  const activityMap = await getSubjectsActivity("contract", [id], 8);
  return mapContract(row, role, activityMap.get(id) ?? []);
}

function parseContractPayload(values: ContractFormValues) {
  return {
    title: values.title.trim(),
    contract_number: values.contract_number.trim() || null,
    client_id: values.client_id,
    project_id: values.project_id || null,
    status: values.status,
    contract_type: values.contract_type,
    start_date: values.start_date || null,
    end_date: values.end_date || null,
    signed_date: values.signed_date || null,
    renewal_date: values.renewal_date || null,
    amount: values.amount ? Number(values.amount) : null,
    currency: values.currency.trim() || "USD",
    payment_terms: values.payment_terms.trim() || null,
    responsible_user_id: values.responsible_user_id || null,
    notes: values.notes.trim() || null,
  };
}

const payloadParams = (p: ReturnType<typeof parseContractPayload>) => [
  p.title, p.contract_number, p.client_id, p.project_id, p.status, p.contract_type, p.start_date, p.end_date, p.signed_date, p.renewal_date, p.amount,
  p.currency, p.payment_terms, p.responsible_user_id, p.notes,
];

export async function createContract(values: ContractFormValues, actorUserId: string) {
  const payload = parseContractPayload(values);
  const data = await asPerson((tx) =>
    selectOne<{ id: string }>(
      tx,
      `insert into work.contract (title, contract_number, client_id, engagement_id, status, contract_type, start_date, end_date, signed_date, renewal_date,
                                  amount, currency, payment_terms, responsible_user_id, notes, entity_code)
       values ($1, $2, $3::uuid, $4::uuid, $5, $6, $7::date, $8::date, $9::date, $10::date, $11::numeric, $12, $13, $14, $15,
               (select entity_code from work.person where id = erp.actor_id()))
       returning id`,
      payloadParams(payload),
    ),
  );

  if (!data) {
    throw new Error("Contract creation did not return an id.");
  }

  await logActivity({
    userId: actorUserId,
    action: `Created contract ${payload.title}`,
    entityType: "contract",
    entityId: data.id,
    metadata: { kind: "create", summary: "Contract created" },
  });

  return data.id;
}

export async function updateContract(id: string, values: ContractFormValues, actorUserId: string) {
  const payload = parseContractPayload(values);
  const previous = await asPerson(async (tx) => {
    const before = await selectOne<{ title: string; status: ContractStatus; signed_date: string | null; renewal_date: string | null; amount: number | null; project_id: string | null }>(
      tx,
      "select title, status, signed_date, renewal_date, amount::float8 as amount, engagement_id as project_id from work.contract where id = $1::uuid",
      [id],
    );
    const updated = await tx.run(
      `update work.contract
          set title = $1, contract_number = $2, client_id = $3::uuid, engagement_id = $4::uuid, status = $5, contract_type = $6, start_date = $7::date,
              end_date = $8::date, signed_date = $9::date, renewal_date = $10::date, amount = $11::numeric, currency = $12, payment_terms = $13,
              responsible_user_id = $14, notes = $15
        where id = $16::uuid`,
      [...payloadParams(payload), id],
    );
    if (!updated) throw new Error("You cannot edit this contract.");
    return before;
  });

  const activityTasks = [];

  if (!previous) {
    activityTasks.push(
      logActivity({
        userId: actorUserId,
        action: `Updated contract ${payload.title}`,
        entityType: "contract",
        entityId: id,
        metadata: { kind: "update", summary: "Contract updated" },
      }),
    );
  } else {
    const changes = [
      ["title", previous.title, payload.title, `Renamed contract to ${payload.title}`],
      ["status", previous.status, payload.status, `Changed contract status to ${payload.status}`],
      ["signed_date", previous.signed_date, payload.signed_date, "Updated signed date"],
      ["renewal_date", previous.renewal_date, payload.renewal_date, "Updated renewal date"],
      ["amount", previous.amount, payload.amount, "Updated contract amount"],
      ["project_id", previous.project_id, payload.project_id, "Changed linked project"],
    ] as const;

    for (const [field, from, to, action] of changes) {
      if (from !== to) {
        activityTasks.push(
          logActivity({ userId: actorUserId, action, entityType: "contract", entityId: id, metadata: { kind: "update", field, from, to } }),
        );
      }
    }

    if (previous.status !== "signed" && payload.status === "signed") {
      activityTasks.push(
        logActivity({
          userId: actorUserId,
          action: "Contract signed",
          entityType: "contract",
          entityId: id,
          metadata: { kind: "status_change", field: "status", from: previous.status, to: "signed" },
        }),
      );
    }

    if (previous.status !== "expired" && payload.status === "expired") {
      activityTasks.push(
        logActivity({
          userId: actorUserId,
          action: "Contract expired",
          entityType: "contract",
          entityId: id,
          metadata: { kind: "status_change", field: "status", from: previous.status, to: "expired" },
        }),
      );
    }
  }

  await Promise.all(activityTasks);

  return id;
}

export async function archiveContract(id: string, actorUserId: string) {
  const archived = await asPerson((tx) => tx.run("update work.contract set status = 'archived' where id = $1::uuid", [id]));

  if (!archived) {
    throw new Error("You cannot archive this contract.");
  }

  await logActivity({
    userId: actorUserId,
    action: "Archived contract",
    entityType: "contract",
    entityId: id,
    metadata: { kind: "update", field: "status", to: "archived", summary: "Contract archived" },
  });
}

export async function getContractsDueForRenewal(role: AppRole) {
  const contracts = await getContracts(role, { date: "renewing_soon" });
  return contracts
    .filter((contract) => contract.renewalState === "renewing_soon")
    .sort((left, right) => (left.daysUntilRenewal ?? 999) - (right.daysUntilRenewal ?? 999))
    .slice(0, 6);
}
