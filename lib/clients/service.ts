import "server-only";

import { getScopedActivity, getSubjectsActivity, logActivity } from "@/lib/activity/service";
import { calculateProjectHealth, calculateProjectProgress } from "@/lib/projects/helpers";
import { matchesSearchTerms, searchTerms } from "@/lib/search/text";
import { asPerson, select, selectOne } from "@/lib/work/db";
import { getDocuments } from "@/lib/documents/service";
import { getContracts } from "@/lib/contracts/service";
import type { AppRole } from "@/types/auth";
import type {
  ClientAccountManager,
  ClientFilters,
  ClientFiltersData,
  ClientFormValues,
  ClientLinkedContract,
  ClientLinkedDocument,
  ClientLinkedTicket,
  ClientProjectPreview,
  ClientRelationshipSummary,
  ClientRecord,
  ClientStatus,
  ProspectStage,
  ClientTimelineFilter,
  ClientTimelineItem,
  RelationshipHealth,
} from "@/types/client";
import type { ActivityLogRecord } from "@/types/activity";
import type { TicketRecord } from "@/types/ticket";

type ProjectRow = {
  id: string;
  name: string;
  status: string;
  end_date: string | null;
  tasks:
    | Array<{
        id: string;
        title: string;
        status: string;
        priority: string | null;
        due_date: string | null;
        assignee_id: string | null;
      }>
    | null;
};

type ClientRow = {
  id: string;
  name: string;
  legal_name: string | null;
  type: ClientRecord["type"];
  industry: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  country: string | null;
  city: string | null;
  website: string | null;
  tax_id: string | null;
  status: ClientStatus;
  prospect_stage: ProspectStage | null;
  next_follow_up_at: string | null;
  account_manager_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  accountManager: ClientAccountManager | ClientAccountManager[] | null;
  projects: ProjectRow[] | null;
};

type TicketRow = {
  id: string;
  title: string;
  description: string | null;
  project_id: string;
  assignee_id: string | null;
  reporter_id: string | null;
  status: string;
  priority: string | null;
  type: TicketRecord["type"];
  due_date: string | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  logged_minutes: number | null;
  number: number | null;
  key: string | null;
  labels: string[] | null;
  github_issue_url: string | null;
  created_at: string;
  updated_at: string;
  project: TicketRecord["project"] | TicketRecord["project"][] | null;
  assignee: TicketRecord["assignee"] | TicketRecord["assignee"][] | null;
  reporter: TicketRecord["reporter"] | TicketRecord["reporter"][] | null;
};

function single<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function mapProjectPreview(project: ProjectRow): ClientProjectPreview {
  const tasks = (project.tasks ?? []).map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    priority: (task.priority ?? "medium") as "low" | "medium" | "high" | "critical",
    due_date: task.due_date,
    assignee_id: task.assignee_id,
  }));
  const progress = calculateProjectProgress(tasks);
  const { health } = calculateProjectHealth(progress, project.end_date, project.status, tasks);

  return {
    id: project.id,
    name: project.name,
    status: project.status as ClientProjectPreview["status"],
    progress,
    health,
    end_date: project.end_date,
  };
}

// A client's mission as its pages preview it (`e` the engagement), with its tickets for the progress and health.
const PROJECT_PREVIEW_SQL = `
  select e.created_at, jsonb_build_object(
           'id', e.id, 'name', e.name, 'status', case when e.status = 'planned' then 'draft' else e.status::text end, 'end_date', e.deadline,
           'tasks', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'status', t.status,
                                                                  'priority', case when t.priority = 'normal' then 'medium' else t.priority end,
                                                                  'due_date', t.due_date, 'assignee_id', t.assignee_id))
                                from erp.task t where t.engagement_id = e.id), '[]'::jsonb)) as project
    from erp.engagement e`;

function getClientTimelineType(entityType: ActivityLogRecord["entity_type"]): ClientTimelineFilter {
  if (entityType === "project") {
    return "projects";
  }

  if (entityType === "task") {
    return "tickets";
  }

  if (entityType === "contract") {
    return "contracts";
  }

  if (entityType === "document") {
    return "documents";
  }

  return "client";
}

function buildTimelineHref(activity: ActivityLogRecord) {
  if (activity.entity_type === "project") {
    return `/projects/${activity.entity_id}`;
  }

  if (activity.entity_type === "task") {
    return `/tickets/${activity.entity_id}`;
  }

  if (activity.entity_type === "contract") {
    return `/contracts/${activity.entity_id}`;
  }

  if (activity.entity_type === "document") {
    return `/documents?document=${activity.entity_id}`;
  }

  if (activity.entity_type === "client") {
    return `/clients/${activity.entity_id}`;
  }

  return null;
}

function getTimelineMetadataLabel(activity: ActivityLogRecord) {
  if (activity.metadata.field) {
    return activity.metadata.field.replaceAll("_", " ");
  }

  return activity.metadata.summary ?? null;
}

function getTimelineDetails(activity: ActivityLogRecord) {
  if (activity.metadata.field) {
    return `${activity.metadata.field.replaceAll("_", " ")} changed from ${activity.metadata.from ?? "empty"} to ${activity.metadata.to ?? "empty"}.`;
  }

  return activity.metadata.summary ?? null;
}

function mapTimelineItem(activity: ActivityLogRecord): ClientTimelineItem {
  return {
    id: activity.id,
    date: activity.created_at,
    type: getClientTimelineType(activity.entity_type),
    title: activity.action,
    description: activity.metadata.summary ?? null,
    metadataLabel: getTimelineMetadataLabel(activity),
    entityType: activity.entity_type,
    entityId: activity.entity_id,
    href: buildTimelineHref(activity),
    actorName: activity.user?.full_name ?? "System",
    expandableDetails: getTimelineDetails(activity),
  };
}

function calculateRelationshipHealth(params: {
  overdueTickets: number;
  delayedProjects: number;
  expiredContracts: number;
  lastActivityDate: string | null;
  upcomingDeadlineDays: number | null;
  upcomingRenewalDays: number | null;
}): RelationshipHealth {
  const now = new Date();
  const lastActivityAge =
    params.lastActivityDate
      ? Math.floor((now.getTime() - new Date(params.lastActivityDate).getTime()) / 86400000)
      : null;

  if (
    params.delayedProjects > 0
    || params.expiredContracts > 0
    || params.overdueTickets >= 3
  ) {
    return "at_risk";
  }

  if (
    params.overdueTickets > 0
    || (params.upcomingDeadlineDays !== null && params.upcomingDeadlineDays <= 10)
    || (params.upcomingRenewalDays !== null && params.upcomingRenewalDays <= 14)
    || (lastActivityAge !== null && lastActivityAge > 30)
  ) {
    return "attention_needed";
  }

  return "healthy";
}

function getDaysUntil(value: string | null) {
  if (!value) {
    return null;
  }

  const today = new Date();
  const date = new Date(value);
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
}

// The client (the group's relationship side: work.client, 0008) with its account manager and its missions.
const CLIENT_SQL = `
  select c.id, c.name, c.legal_name, c.type, c.industry, c.contact_email, c.contact_phone, c.address, c.country, c.city, c.website, c.tax_id,
         c.status, c.prospect_stage, c.next_follow_up_at, c.account_manager_id, c.notes, c.created_at, c.updated_at,
         (select jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email, 'avatar_url', p.avatar_url, 'role', work.person_role(p.id))
            from work.person p where p.id = c.account_manager_id) as "accountManager",
         coalesce((select jsonb_agg(project order by created_at desc) from (${PROJECT_PREVIEW_SQL} where e.client_id = c.id) pr), '[]'::jsonb) as projects
    from work.client c`;

function mapClient(
  row: ClientRow,
  role: AppRole,
  activity: ActivityLogRecord[] = [],
): ClientRecord {
  const linkedProjects = (row.projects ?? []).map(mapProjectPreview);
  const activeProjectsCount = linkedProjects.filter((project) => project.status === "active").length;

  return {
    id: row.id,
    name: row.name,
    legal_name: row.legal_name,
    type: row.type,
    industry: row.industry,
    contact_email: row.contact_email,
    contact_phone: role === "shareholder" ? null : row.contact_phone,
    address: role === "shareholder" ? null : row.address,
    country: row.country,
    city: row.city,
    website: row.website,
    tax_id: role === "shareholder" ? null : row.tax_id,
    status: row.status,
    prospect_stage: row.prospect_stage,
    next_follow_up_at: row.next_follow_up_at,
    account_manager_id: row.account_manager_id,
    notes: role === "shareholder" ? null : row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    accountManager: single(row.accountManager),
    linkedProjects,
    activeProjectsCount,
    totalContractValuePlaceholder: "Reserved for finance integration",
    lastActivityAt: activity[0]?.created_at ?? row.updated_at,
    recentActivity: activity.slice(0, 8),
    viewMode: role === "shareholder" ? "summary" : "full",
  };
}

export async function getClients(role: AppRole, filters: ClientFilters = {}) {
  const where: string[] = [];
  const params: unknown[] = [];
  const param = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  if (filters.status) where.push(`c.status = ${param(filters.status)}`);
  if (filters.prospectStage) where.push(`c.prospect_stage = ${param(filters.prospectStage)}`);
  if (filters.type) where.push(`c.type = ${param(filters.type)}`);
  if (filters.accountManagerId) where.push(`c.account_manager_id = ${param(filters.accountManagerId)}`);

  const rows = await asPerson((tx) =>
    select<ClientRow>(tx, `${CLIENT_SQL} ${where.length ? `where ${where.join(" and ")}` : ""} order by c.updated_at desc`, params),
  );
  const terms = filters.search ? searchTerms(filters.search) : [];
  const found = rows.filter((row) => matchesSearchTerms(terms, [row.name, row.legal_name, row.industry]));
  const activityMap = await getSubjectsActivity("client", found.map((client) => client.id), 8);

  return found.map((row) => mapClient(row, role, activityMap.get(row.id) ?? []));
}

export async function getClientsFilterData(): Promise<ClientFiltersData> {
  const accountManagers = await asPerson((tx) =>
    select<ClientAccountManager>(
      tx,
      `select p.id, p.full_name, p.email, p.avatar_url, work.person_role(p.id) as role from work.person p
        where work.person_role(p.id) in ('admin', 'manager') order by p.full_name`,
    ),
  );

  return { accountManagers };
}

export async function getClientById(id: string, role: AppRole) {
  const row = await asPerson((tx) => selectOne<ClientRow>(tx, `${CLIENT_SQL} where c.id = $1::uuid`, [id])).catch(() => null);

  if (!row) {
    return null;
  }

  const activityMap = await getSubjectsActivity("client", [id], 8);
  return mapClient(row, role, activityMap.get(id) ?? []);
}

export async function getClientLinkedProjects(clientId: string) {
  const rows = await asPerson((tx) =>
    select<{ project: ProjectRow }>(tx, `${PROJECT_PREVIEW_SQL} where e.client_id = $1::uuid order by e.created_at desc`, [clientId]),
  );
  return rows.map((row) => mapProjectPreview(row.project));
}

export async function getClientLinkedContracts(clientId: string, role: AppRole) {
  const contracts = await getContracts(role, { clientId });

  return contracts.map((contract): ClientLinkedContract => ({
    id: contract.id,
    title: contract.title,
    status: contract.status,
    contract_type: contract.contract_type,
    renewal_date: contract.renewal_date,
    end_date: contract.end_date,
    renewalState: contract.renewalState,
    daysUntilRenewal: contract.daysUntilRenewal,
  }));
}

export async function getClientLinkedDocuments(clientId: string, role: AppRole) {
  const [projects, contracts, tickets, documents] = await Promise.all([
    getClientLinkedProjects(clientId),
    getClientLinkedContracts(clientId, role),
    getClientLinkedTickets(clientId, role),
    getDocuments(role, { archiveState: "all" }),
  ]);

  const projectIds = new Set(projects.map((project) => project.id));
  const contractIds = new Set(contracts.map((contract) => contract.id));
  const ticketIds = new Set(tickets.map((ticket) => ticket.id));

  const scopedDocuments = documents.filter((document) => {
    if (document.related_type === "client" && document.client?.id === clientId) {
      return true;
    }

    if (document.related_type === "project" && document.project?.id && projectIds.has(document.project.id)) {
      return true;
    }

    if (document.related_type === "contract" && document.contract?.id && contractIds.has(document.contract.id)) {
      return true;
    }

    if (document.related_type === "task" && document.ticket?.id && ticketIds.has(document.ticket.id)) {
      return true;
    }

    return false;
  });

  return scopedDocuments.map((document): ClientLinkedDocument => ({
    id: document.id,
    title: document.title,
    document_type: document.document_type,
    visibility: document.visibility,
    is_archived: document.is_archived,
    updated_at: document.updated_at,
    related_type: document.related_type,
    relatedLabel: document.relatedLabel,
  }));
}

export async function getClientLinkedTickets(clientId: string, role: AppRole) {
  const rows = await asPerson((tx) =>
    select<TicketRow>(
      tx,
      `select t.id, t.title, t.notes as description, t.engagement_id as project_id, t.assignee_id, t.reporter_id, t.status,
              case when t.priority = 'normal' then 'medium' else t.priority end as priority, t.type, t.due_date,
              t.estimated_hours::float8 as estimated_hours, t.actual_hours::float8 as actual_hours, t.github_issue_url, t.created_at, t.updated_at,
              work.task_logged_minutes(t.id) as logged_minutes, t.number, t.labels,
              (select x.ticket_prefix || '-' || t.number from erp.entity x where x.id = t.entity_id) as key,
              jsonb_build_object('id', e.id, 'name', e.name, 'status', case when e.status = 'planned' then 'draft' else e.status::text end, 'end_date', e.deadline,
                                 'client', (select jsonb_build_object('id', c.id, 'name', c.name, 'contact_email', c.contact_email) from work.client c where c.id = e.client_id)) as project,
              work.person_card(t.assignee_id) as assignee, work.person_card(t.reporter_id) as reporter
         from erp.task t join erp.engagement e on e.id = t.engagement_id
        where e.client_id = $1::uuid
        order by t.updated_at desc`,
      [clientId],
    ),
  );

  return rows.map((row) => {
    const ticket = mapTicketForClient(row, role);

    return {
      id: ticket.id,
      title: ticket.title,
      status: ticket.status,
      priority: ticket.priority,
      due_date: ticket.due_date,
      updated_at: ticket.updated_at,
      project_id: ticket.project_id,
      project: ticket.project,
      assignee: ticket.assignee,
      viewMode: ticket.viewMode,
    } satisfies ClientLinkedTicket;
  });
}

// Client pages only list a ticket's status, so the board stage is not resolved here.
function mapTicketForClient(row: TicketRow, role: AppRole): Omit<TicketRecord, "stage_id" | "stage_name"> {
  const normalizeStatus = row.status === "in_review" ? "review" : (row.status as TicketRecord["status"]);
  const normalizePriority = row.priority === "critical" ? "urgent" : ((row.priority ?? "medium") as TicketRecord["priority"]);

  return {
    id: row.id,
    title: row.title,
    description: role === "shareholder" ? null : row.description,
    project_id: row.project_id,
    assignee_id: row.assignee_id,
    reporter_id: row.reporter_id,
    status: normalizeStatus,
    priority: normalizePriority,
    type: row.type,
    due_date: row.due_date,
    estimated_hours: row.estimated_hours,
    actual_hours: row.actual_hours,
    logged_minutes: row.logged_minutes ?? 0,
    number: row.number ?? null,
    key: row.key ?? null,
    labels: row.labels ?? [],
    github_issue_url: role === "shareholder" ? null : row.github_issue_url,
    created_at: row.created_at,
    updated_at: row.updated_at,
    project: single(row.project),
    assignee: single(row.assignee),
    reporter: single(row.reporter),
    activity: [],
    viewMode: role === "shareholder" ? "summary" : "full",
  };
}

export async function getClientTimeline(clientId: string, role: AppRole, filter: ClientTimelineFilter = "all") {
  const [projects, contracts, documents, tickets, client] = await Promise.all([
    getClientLinkedProjects(clientId),
    getClientLinkedContracts(clientId, role),
    getClientLinkedDocuments(clientId, role),
    getClientLinkedTickets(clientId, role),
    getClientById(clientId, role),
  ]);

  if (!client) {
    return [];
  }

  const activity = await getScopedActivity(
    [
      { type: "client", ids: [clientId] },
      { type: "project", ids: projects.map((project) => project.id) },
      { type: "task", ids: tickets.map((ticket) => ticket.id) },
      { type: "contract", ids: contracts.map((contract) => contract.id) },
      { type: "document", ids: documents.map((document) => document.id) },
    ],
    250,
  );

  let items = activity.map(mapTimelineItem);

  if (role === "employee") {
    items = items.filter((item) => item.type === "projects" || item.type === "tickets" || item.type === "client");
  }

  if (role === "shareholder") {
    items = items.filter((item) => item.type === "projects" || item.type === "contracts" || item.type === "client");
  }

  if (filter !== "all") {
    items = items.filter((item) => item.type === filter);
  }

  return items;
}

export async function getClientRelationshipSummary(clientId: string, role: AppRole): Promise<ClientRelationshipSummary> {
  const [projects, contracts, documents, tickets, client] = await Promise.all([
    getClientLinkedProjects(clientId),
    getClientLinkedContracts(clientId, role),
    getClientLinkedDocuments(clientId, role),
    getClientLinkedTickets(clientId, role),
    getClientById(clientId, role),
  ]);

  const activeProjects = projects.filter((project) => project.status === "active").length;
  const openTickets = tickets.filter((ticket) => ticket.status !== "done" && ticket.status !== "archived").length;
  const activeContracts = contracts.filter((contract) => contract.status === "active" || contract.status === "signed").length;
  const archivedDocumentsCount = documents.filter((document) => document.is_archived).length;
  const overdueTickets = tickets.filter((ticket) => {
    if (!ticket.due_date || ticket.status === "done" || ticket.status === "archived") {
      return false;
    }

    return getDaysUntil(ticket.due_date) !== null && getDaysUntil(ticket.due_date)! < 0;
  }).length;
  const delayedProjects = projects.filter((project) => project.health === "delayed" || project.health === "at_risk").length;
  const expiredContracts = contracts.filter((contract) => contract.status === "expired").length;
  const upcomingContractRenewal =
    contracts
      .filter((contract) => contract.renewal_date || contract.end_date)
      .sort((left, right) => (left.daysUntilRenewal ?? 9999) - (right.daysUntilRenewal ?? 9999))[0] ?? null;
  const upcomingProjectDeadline =
    projects
      .filter((project) => project.end_date)
      .sort((left, right) => (getDaysUntil(left.end_date) ?? 9999) - (getDaysUntil(right.end_date) ?? 9999))[0] ?? null;

  const upcomingDeadlineDays = upcomingProjectDeadline?.end_date ? getDaysUntil(upcomingProjectDeadline.end_date) : null;
  const upcomingRenewalDays = upcomingContractRenewal?.renewal_date
    ? getDaysUntil(upcomingContractRenewal.renewal_date)
    : upcomingContractRenewal?.end_date
      ? getDaysUntil(upcomingContractRenewal.end_date)
      : null;

  return {
    totalProjects: projects.length,
    activeProjects,
    openTickets,
    activeContracts,
    documentsCount: documents.length,
    archivedDocumentsCount,
    lastActivityDate: client?.lastActivityAt ?? null,
    upcomingContractRenewal,
    upcomingProjectDeadline,
    overdueTickets,
    delayedProjects,
    expiredContracts,
    relationshipHealth: calculateRelationshipHealth({
      overdueTickets,
      delayedProjects,
      expiredContracts,
      lastActivityDate: client?.lastActivityAt ?? null,
      upcomingDeadlineDays,
      upcomingRenewalDays,
    }),
  };
}

function parseClientPayload(values: ClientFormValues) {
  return {
    name: values.name.trim(),
    legal_name: values.legal_name.trim() || null,
    type: values.type,
    industry: values.industry.trim() || null,
    contact_email: values.contact_email.trim() || null,
    contact_phone: values.contact_phone.trim() || null,
    address: values.address.trim() || null,
    country: values.country.trim() || null,
    city: values.city.trim() || null,
    website: values.website.trim() || null,
    tax_id: values.tax_id.trim() || null,
    status: values.status,
    prospect_stage: values.status === "prospect" ? values.prospect_stage || "initial_contact" : null,
    next_follow_up_at: values.status === "prospect" ? values.next_follow_up_at || null : null,
    account_manager_id: values.account_manager_id || null,
    notes: values.notes.trim() || null,
  };
}

const payloadParams = (p: ReturnType<typeof parseClientPayload>) => [
  p.name, p.legal_name, p.type, p.industry, p.contact_email, p.contact_phone, p.address, p.country, p.city, p.website, p.tax_id, p.status,
  p.prospect_stage, p.next_follow_up_at, p.account_manager_id, p.notes,
];

// floor: the entity it is created from; the test floor's clients are its own (0011)
export async function createClientRecord(values: ClientFormValues, actorUserId: string, floor: string | null = null) {
  const payload = parseClientPayload(values);
  const data = await asPerson((tx) =>
    selectOne<{ id: string }>(
      tx,
      `insert into work.client (name, legal_name, type, industry, contact_email, contact_phone, address, country, city, website, tax_id, status,
                                prospect_stage, next_follow_up_at, account_manager_id, notes, entity_code, is_test)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::date, $15, $16, (select entity_code from work.person where id = erp.actor_id()),
               erp.is_test_entity($17::uuid))
       returning id`,
      [...payloadParams(payload), floor],
    ),
  );

  if (!data) {
    throw new Error("Client creation did not return an id.");
  }

  await logActivity({
    userId: actorUserId,
    action: `Created client ${payload.name}`,
    entityType: "client",
    entityId: data.id,
    metadata: { kind: "create", summary: "Client created" },
  });

  return data.id;
}

export async function updateClient(id: string, values: ClientFormValues, actorUserId: string) {
  const payload = parseClientPayload(values);
  const previous = await asPerson(async (tx) => {
    const before = await selectOne<{ name: string; status: ClientStatus; account_manager_id: string | null; contact_email: string | null; type: ClientRecord["type"] }>(
      tx,
      "select name, status, account_manager_id, contact_email, type from work.client where id = $1::uuid",
      [id],
    );
    const updated = await tx.run(
      `update work.client
          set name = $1, legal_name = $2, type = $3, industry = $4, contact_email = $5, contact_phone = $6, address = $7, country = $8, city = $9,
              website = $10, tax_id = $11, status = $12, prospect_stage = $13, next_follow_up_at = $14::date, account_manager_id = $15, notes = $16
        where id = $17::uuid`,
      [...payloadParams(payload), id],
    );
    if (!updated) throw new Error("You cannot edit this client.");
    return before;
  });

  const activityTasks = [];

  if (!previous) {
    activityTasks.push(
      logActivity({
        userId: actorUserId,
        action: `Updated client ${payload.name}`,
        entityType: "client",
        entityId: id,
        metadata: { kind: "update", summary: "Client updated" },
      }),
    );
  } else {
    const changes = [
      ["name", previous.name, payload.name, `Renamed client to ${payload.name}`],
      ["status", previous.status, payload.status, `Changed client status to ${payload.status}`],
      ["account_manager_id", previous.account_manager_id, payload.account_manager_id, "Changed account manager"],
      ["contact_email", previous.contact_email, payload.contact_email, "Updated client contact email"],
      ["type", previous.type, payload.type, `Changed client type to ${payload.type}`],
    ] as const;

    for (const [field, from, to, action] of changes) {
      if (from !== to) {
        activityTasks.push(
          logActivity({ userId: actorUserId, action, entityType: "client", entityId: id, metadata: { kind: "update", field, from, to } }),
        );
      }
    }
  }

  await Promise.all(activityTasks);

  return id;
}

export async function archiveClient(id: string, actorUserId: string) {
  const archived = await asPerson((tx) =>
    tx.run("update work.client set status = 'archived', prospect_stage = null, next_follow_up_at = null where id = $1::uuid", [id]),
  );

  if (!archived) {
    throw new Error("You cannot archive this client.");
  }

  await logActivity({
    userId: actorUserId,
    action: "Archived client",
    entityType: "client",
    entityId: id,
    metadata: { kind: "update", field: "status", to: "archived", summary: "Client archived" },
  });
}
