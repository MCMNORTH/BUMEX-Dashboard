import "server-only";

import { logActivity } from "@/lib/activity/service";
import {
  applyEntityScope,
  extendWithEntityCode,
  getCurrentEntityCode,
  isEntityScopingEnabled,
} from "@/lib/entities/scope";
import { createClient } from "@/lib/supabase/server";
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
  client: ContractClientPreview | ContractClientPreview[] | null;
  project: ContractProjectPreview | ContractProjectPreview[] | null;
  responsibleUser: ContractResponsibleUser | ContractResponsibleUser[] | null;
};

type ActivityRow = {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: ActivityLogRecord["entity_type"];
  entity_id: string;
  metadata: ActivityLogRecord["metadata"];
  created_at: string;
  user:
    | {
        id: string;
        full_name: string;
        email: string;
        avatar_url: string | null;
      }
    | Array<{
        id: string;
        full_name: string;
        email: string;
        avatar_url: string | null;
      }>
    | null;
};

function single<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function mapActivity(row: ActivityRow): ActivityLogRecord {
  return {
    id: row.id,
    user_id: row.user_id,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    metadata: row.metadata ?? {},
    created_at: row.created_at,
    user: single(row.user),
  };
}

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

const FULL_CONTRACT_SELECT = `
  id,
  title,
  contract_number,
  client_id,
  project_id,
  status,
  contract_type,
  start_date,
  end_date,
  signed_date,
  renewal_date,
  amount,
  currency,
  payment_terms,
  responsible_user_id,
  notes,
  created_at,
  updated_at,
  client:clients (
    id,
    name,
    status,
    contact_email
  ),
  project:projects (
    id,
    name,
    status,
    end_date
  ),
  responsibleUser:profiles!contracts_responsible_user_id_fkey (
    id,
    full_name,
    email,
    avatar_url,
    role
  )
`;

const LEGACY_CONTRACT_SELECT = `
  id,
  title,
  client_id,
  status,
  amount,
  created_at,
  client:clients (
    id,
    name,
    status,
    contact_email
  )
`;

const FULL_CONTRACT_PREVIOUS_SELECT =
  "title, status, signed_date, renewal_date, amount, project_id";
const LEGACY_CONTRACT_PREVIOUS_SELECT = "title, status, amount";

function isMissingOptionalContractField(message: string) {
  return [
    "contracts.contract_number",
    "contracts.project_id",
    "contracts.contract_type",
    "contracts.start_date",
    "contracts.end_date",
    "contracts.signed_date",
    "contracts.renewal_date",
    "contracts.currency",
    "contracts.payment_terms",
    "contracts.responsible_user_id",
    "contracts.notes",
    "contracts.updated_at",
  ].some((column) => message.includes(`column ${column} does not exist`))
    || [
      "contract_number",
      "project_id",
      "contract_type",
      "start_date",
      "end_date",
      "signed_date",
      "renewal_date",
      "currency",
      "payment_terms",
      "responsible_user_id",
      "notes",
      "updated_at",
    ].some((column) => message.includes(`'${column}' column of 'contracts'`));
}

function stripOptionalContractFields(
  payload: ReturnType<typeof parseContractPayload>,
) {
  return {
    title: payload.title,
    client_id: payload.client_id,
    status: payload.status,
    amount: payload.amount,
  };
}

function stripOptionalContractUpdateFields(
  payload: ReturnType<typeof parseContractPayload> & { updated_at: string },
) {
  return {
    title: payload.title,
    client_id: payload.client_id,
    status: payload.status,
    amount: payload.amount,
  };
}

async function getContractActivityMap(contractIds: string[]) {
  const supabase = await createClient();

  if (!supabase || !contractIds.length) {
    return new Map<string, ActivityLogRecord[]>();
  }

  const { data, error } = await supabase
    .from("activity_logs")
    .select(
      `
        id,
        user_id,
        action,
        entity_type,
        entity_id,
        metadata,
        created_at,
        user:profiles (
          id,
          full_name,
          email,
          avatar_url
        )
      `,
    )
    .or(`and(entity_type.eq.contract,entity_id.in.(${contractIds.join(",")}))`)
    .order("created_at", { ascending: false })
    .limit(120)
    .returns<ActivityRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  const map = new Map<string, ActivityLogRecord[]>();

  for (const activity of (data ?? []).map(mapActivity)) {
    const current = map.get(activity.entity_id) ?? [];
    current.push(activity);
    map.set(activity.entity_id, current);
  }

  return map;
}

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
    client: single(row.client),
    project: single(row.project),
    responsibleUser: single(row.responsibleUser),
    recentActivity: activity.slice(0, 8),
    daysUntilRenewal: getDaysUntil(referenceDate),
    renewalState,
    viewMode: role === "shareholder" ? "summary" : "full",
  };
}

export async function getContracts(role: AppRole, filters: ContractFilters = {}) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const scopedSupabase = supabase;
  const entityCode = await getCurrentEntityCode();

  async function runContractsQuery(useLegacy = false) {
    let query = scopedSupabase
      .from("contracts")
      .select(useLegacy ? LEGACY_CONTRACT_SELECT : FULL_CONTRACT_SELECT)
      .order(useLegacy ? "created_at" : "updated_at", { ascending: false });

    query = applyEntityScope(query, entityCode);

    if (filters.search) {
      query = useLegacy
        ? query.ilike("title", `%${filters.search}%`)
        : query.or(`title.ilike.%${filters.search}%,contract_number.ilike.%${filters.search}%`);
    }

    if (filters.clientId) {
      query = query.eq("client_id", filters.clientId);
    }

    if (filters.status) {
      query = query.eq("status", filters.status);
    }

    const today = new Date().toISOString().slice(0, 10);
    const soon = new Date();
    soon.setDate(soon.getDate() + 30);

    if (!useLegacy) {
      if (filters.date === "expired") {
        query = query.or(`end_date.lt.${today},renewal_date.lt.${today}`);
      }

      if (filters.date === "renewing_soon") {
        query = query
          .gte("renewal_date", today)
          .lte("renewal_date", soon.toISOString().slice(0, 10));
      }

      if (filters.date === "active_window") {
        query = query.gte("end_date", today);
      }

      if (filters.date === "none") {
        query = query.is("end_date", null).is("renewal_date", null);
      }
    }

    if (filters.value === "under_10k") {
      query = query.lt("amount", 10000);
    }

    if (filters.value === "10k_50k") {
      query = query.gte("amount", 10000).lt("amount", 50000);
    }

    if (filters.value === "50k_plus") {
      query = query.gte("amount", 50000);
    }

    if (filters.value === "unset") {
      query = query.is("amount", null);
    }

    const { data, error } = await query.returns<ContractRow[]>();

    if (error) {
      throw new Error(error.message);
    }

    return data ?? [];
  }

  let rows: ContractRow[];

  try {
    rows = await runContractsQuery(false);
  } catch (error) {
    if (!(error instanceof Error) || !isMissingOptionalContractField(error.message)) {
      throw error;
    }

    rows = await runContractsQuery(true);
  }

  const activityMap = await getContractActivityMap(rows.map((contract) => contract.id));

  return rows.map((row) => mapContract(row, role, activityMap.get(row.id) ?? []));
}

export async function getContractsFilterData(): Promise<ContractFiltersData> {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  let clientsQuery = supabase
    .from("clients")
    .select("id, name, status, contact_email");
  let projectsQuery = supabase
    .from("projects")
    .select("id, name, status, end_date");
  let usersQuery = supabase
    .from("profiles")
    .select("id, full_name, email, avatar_url, role");

  if (isEntityScopingEnabled()) {
    clientsQuery = clientsQuery.eq("entity_code", entityCode);
    projectsQuery = projectsQuery.eq("entity_code", entityCode);
    usersQuery = usersQuery.eq("entity_code", entityCode);
  }

  const [{ data: clients, error: clientsError }, { data: projects, error: projectsError }, { data: responsibleUsers, error: usersError }] =
    await Promise.all([
      clientsQuery
        .order("name", { ascending: true })
        .returns<ContractClientPreview[]>(),
      projectsQuery
        .order("name", { ascending: true })
        .returns<ContractProjectPreview[]>(),
      usersQuery
        .in("role", ["admin", "manager"])
        .order("full_name", { ascending: true })
        .returns<ContractResponsibleUser[]>(),
    ]);

  if (clientsError) throw new Error(clientsError.message);
  if (projectsError) throw new Error(projectsError.message);
  if (usersError) throw new Error(usersError.message);

  return {
    clients: clients ?? [],
    projects: projects ?? [],
    responsibleUsers: responsibleUsers ?? [],
  };
}

export async function getContractById(id: string, role: AppRole) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const scopedSupabase = supabase;
  const entityCode = await getCurrentEntityCode();

  async function runContractByIdQuery(useLegacy = false) {
    let query = scopedSupabase
      .from("contracts")
      .select(useLegacy ? LEGACY_CONTRACT_SELECT : FULL_CONTRACT_SELECT)
      .eq("id", id);

    query = applyEntityScope(query, entityCode);

    const { data, error } = await query.maybeSingle<ContractRow>();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  let data: ContractRow | null;

  try {
    data = await runContractByIdQuery(false);
  } catch (error) {
    if (!(error instanceof Error) || !isMissingOptionalContractField(error.message)) {
      throw error;
    }

    data = await runContractByIdQuery(true);
  }

  if (!data) {
    return null;
  }

  const activityMap = await getContractActivityMap([id]);
  return mapContract(data, role, activityMap.get(id) ?? []);
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

export async function createContract(values: ContractFormValues, actorUserId: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  const payload = extendWithEntityCode(parseContractPayload(values), entityCode);
  let createResponse = await supabase
    .from("contracts")
    .insert(payload)
    .select("id")
    .single<{ id: string }>();

  if (createResponse.error && isMissingOptionalContractField(createResponse.error.message)) {
    createResponse = await supabase
      .from("contracts")
      .insert(extendWithEntityCode(stripOptionalContractFields(parseContractPayload(values)), entityCode))
      .select("id")
      .single<{ id: string }>();
  }

  const { data, error } = createResponse;

  if (error) {
    throw new Error(error.message);
  }

  await logActivity({
    userId: actorUserId,
    action: `Created contract ${payload.title}`,
    entityType: "contract",
    entityId: data.id,
    metadata: {
      kind: "create",
      summary: "Contract created",
    },
  });

  return data.id;
}

export async function updateContract(id: string, values: ContractFormValues, actorUserId: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const scopedSupabase = supabase;
  const entityCode = await getCurrentEntityCode();

  async function getPreviousContract(useLegacy = false) {
    let previousQuery = scopedSupabase
      .from("contracts")
      .select(useLegacy ? LEGACY_CONTRACT_PREVIOUS_SELECT : FULL_CONTRACT_PREVIOUS_SELECT)
      .eq("id", id);

    if (isEntityScopingEnabled()) {
      previousQuery = previousQuery.eq("entity_code", entityCode);
    }

    return previousQuery.maybeSingle();
  }

  let previousResponse = await getPreviousContract(false);
  if (previousResponse.error && isMissingOptionalContractField(previousResponse.error.message)) {
    previousResponse = await getPreviousContract(true);
  }

  const { data: previous, error: previousError } = previousResponse as {
    data: {
      title: string;
      status: ContractStatus;
      signed_date?: string | null;
      renewal_date?: string | null;
      amount: number | null;
      project_id?: string | null;
    } | null;
    error: { message: string } | null;
  };

  if (previousError) {
    throw new Error(previousError.message);
  }

  const payload = {
    ...parseContractPayload(values),
    updated_at: new Date().toISOString(),
  };

  let updateQuery = supabase.from("contracts").update(payload).eq("id", id);

  if (isEntityScopingEnabled()) {
    updateQuery = updateQuery.eq("entity_code", entityCode);
  }

  let { error } = await updateQuery;

  if (error && isMissingOptionalContractField(error.message)) {
    let legacyUpdateQuery = supabase
      .from("contracts")
      .update(stripOptionalContractUpdateFields(payload))
      .eq("id", id);

    if (isEntityScopingEnabled()) {
      legacyUpdateQuery = legacyUpdateQuery.eq("entity_code", entityCode);
    }

    ({ error } = await legacyUpdateQuery);
  }

  if (error) {
    throw new Error(error.message);
  }

  const activityTasks = [];

  if (!previous) {
    activityTasks.push(
      logActivity({
        userId: actorUserId,
        action: `Updated contract ${payload.title}`,
        entityType: "contract",
        entityId: id,
        metadata: {
          kind: "update",
          summary: "Contract updated",
        },
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
          logActivity({
            userId: actorUserId,
            action,
            entityType: "contract",
            entityId: id,
            metadata: {
              kind: "update",
              field,
              from,
              to,
            },
          }),
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
          metadata: {
            kind: "status_change",
            field: "status",
            from: previous.status,
            to: "signed",
          },
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
          metadata: {
            kind: "status_change",
            field: "status",
            from: previous.status,
            to: "expired",
          },
        }),
      );
    }
  }

  await Promise.all(activityTasks);
  return id;
}

export async function archiveContract(id: string, actorUserId: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  let archiveQuery = supabase
    .from("contracts")
    .update({
      status: "archived",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (isEntityScopingEnabled()) {
    archiveQuery = archiveQuery.eq("entity_code", entityCode);
  }

  let { error } = await archiveQuery;

  if (error && isMissingOptionalContractField(error.message)) {
    let legacyArchiveQuery = supabase
      .from("contracts")
      .update({
        status: "archived",
      })
      .eq("id", id);

    if (isEntityScopingEnabled()) {
      legacyArchiveQuery = legacyArchiveQuery.eq("entity_code", entityCode);
    }

    ({ error } = await legacyArchiveQuery);
  }

  if (error) {
    throw new Error(error.message);
  }

  await logActivity({
    userId: actorUserId,
    action: "Archived contract",
    entityType: "contract",
    entityId: id,
    metadata: {
      kind: "update",
      field: "status",
      to: "archived",
      summary: "Contract archived",
    },
  });
}

export async function getContractsDueForRenewal(role: AppRole) {
  const contracts = await getContracts(role, { date: "renewing_soon" });
  return contracts
    .filter((contract) => contract.renewalState === "renewing_soon")
    .sort((left, right) => (left.daysUntilRenewal ?? 999) - (right.daysUntilRenewal ?? 999))
    .slice(0, 6);
}
