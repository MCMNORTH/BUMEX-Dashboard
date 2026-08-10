import "server-only";

import { logActivity } from "@/lib/activity/service";
import { calculateProjectHealth, calculateProjectProgress } from "@/lib/projects/helpers";
import { createClient } from "@/lib/supabase/server";
import {
  applyEntityScope,
  extendWithEntityCode,
  getCurrentEntityCode,
  isEntityScopingEnabled,
} from "@/lib/entities/scope";
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

async function getClientActivityMap(clientIds: string[], projectIds: string[]) {
  const supabase = await createClient();

  if (!supabase || (!clientIds.length && !projectIds.length)) {
    return new Map<string, ActivityLogRecord[]>();
  }

  const clientFilter = clientIds.length
    ? `and(entity_type.eq.client,entity_id.in.(${clientIds.join(",")}))`
    : "";
  const projectFilter = projectIds.length
    ? `and(entity_type.eq.project,entity_id.in.(${projectIds.join(",")}))`
    : "";
  const orFilter = [clientFilter, projectFilter].filter(Boolean).join(",");

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
    .or(orFilter)
    .order("created_at", { ascending: false })
    .limit(120)
    .returns<ActivityRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  const activityMap = new Map<string, ActivityLogRecord[]>();
  const mapped = (data ?? []).map(mapActivity);

  for (const activity of mapped) {
    if (activity.entity_type === "client") {
      const current = activityMap.get(activity.entity_id) ?? [];
      current.push(activity);
      activityMap.set(activity.entity_id, current);
    }
  }

  return activityMap;
}

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
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  let query = supabase
    .from("clients")
    .select(
      `
        id,
        name,
        legal_name,
        type,
        industry,
        contact_email,
        contact_phone,
        address,
        country,
        city,
        website,
        tax_id,
        status,
        prospect_stage,
        next_follow_up_at,
        account_manager_id,
        notes,
        created_at,
        updated_at,
        accountManager:profiles!clients_account_manager_id_fkey (
          id,
          full_name,
          email,
          avatar_url,
          role
        ),
        projects (
          id,
          name,
          status,
          end_date,
          tasks (
            id,
            title,
            status,
            priority,
            due_date,
            assignee_id
          )
        )
      `,
    )
    .order("updated_at", { ascending: false });

  query = applyEntityScope(query, entityCode);

  if (filters.search) {
    query = query.or(`name.ilike.%${filters.search}%,legal_name.ilike.%${filters.search}%,industry.ilike.%${filters.search}%`);
  }

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.prospectStage) {
    query = query.eq("prospect_stage", filters.prospectStage);
  }

  if (filters.type) {
    query = query.eq("type", filters.type);
  }

  if (filters.accountManagerId) {
    query = query.eq("account_manager_id", filters.accountManagerId);
  }

  const { data, error } = await query.returns<ClientRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  const rows = data ?? [];
  const projectIds = rows.flatMap((client) => (client.projects ?? []).map((project) => project.id));
  const activityMap = await getClientActivityMap(rows.map((client) => client.id), projectIds);

  return rows.map((row) => mapClient(row, role, activityMap.get(row.id) ?? []));
}

export async function getClientsFilterData(): Promise<ClientFiltersData> {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  let query = supabase
    .from("profiles")
    .select("id, full_name, email, avatar_url, role")
    .in("role", ["admin", "manager"])
    .order("full_name", { ascending: true });

  if (isEntityScopingEnabled()) {
    query = query.eq("entity_code", entityCode);
  }

  const { data, error } = await query.returns<ClientAccountManager[]>();

  if (error) {
    throw new Error(error.message);
  }

  return {
    accountManagers: data ?? [],
  };
}

export async function getClientById(id: string, role: AppRole) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  let query = supabase
    .from("clients")
    .select(
      `
        id,
        name,
        legal_name,
        type,
        industry,
        contact_email,
        contact_phone,
        address,
        country,
        city,
        website,
        tax_id,
        status,
        prospect_stage,
        next_follow_up_at,
        account_manager_id,
        notes,
        created_at,
        updated_at,
        accountManager:profiles!clients_account_manager_id_fkey (
          id,
          full_name,
          email,
          avatar_url,
          role
        ),
        projects (
          id,
          name,
          status,
          end_date,
          tasks (
            id,
            title,
            status,
            priority,
            due_date,
            assignee_id
          )
        )
      `,
    )
    .eq("id", id);

  query = applyEntityScope(query, entityCode);

  const { data, error } = await query.maybeSingle<ClientRow>();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  const activityMap = await getClientActivityMap(
    [id],
    (data.projects ?? []).map((project) => project.id),
  );

  return mapClient(data, role, activityMap.get(id) ?? []);
}

export async function getClientLinkedProjects(clientId: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  let query = supabase
    .from("projects")
    .select(
      `
        id,
        name,
        status,
        end_date,
        tasks (
          id,
          title,
          status,
          priority,
          due_date,
          assignee_id
        )
      `,
    )
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (isEntityScopingEnabled()) {
    query = query.eq("entity_code", entityCode);
  }

  const { data, error } = await query.returns<ProjectRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapProjectPreview);
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
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const projects = await getClientLinkedProjects(clientId);
  const projectIds = projects.map((project) => project.id);

  if (!projectIds.length) {
    return [];
  }

  const { data, error } = await supabase
    .from("tasks")
    .select(
      `
        id,
        title,
        description,
        project_id,
        assignee_id,
        reporter_id,
        status,
        priority,
        type,
        due_date,
        estimated_hours,
        actual_hours,
        github_issue_url,
        created_at,
        updated_at,
        project:projects (
          id,
          name,
          status,
          end_date,
          client:clients (
            id,
            name,
            contact_email
          )
        ),
        assignee:profiles!tasks_assignee_id_fkey (
          id,
          full_name,
          email,
          avatar_url,
          role
        ),
        reporter:profiles!tasks_reporter_id_fkey (
          id,
          full_name,
          email,
          avatar_url,
          role
        )
      `,
    )
    .in("project_id", projectIds)
    .order("updated_at", { ascending: false })
    .returns<TicketRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => {
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

function mapTicketForClient(row: TicketRow, role: AppRole): TicketRecord {
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

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const projectIds = projects.map((project) => project.id);
  const ticketIds = tickets.map((ticket) => ticket.id);
  const contractIds = contracts.map((contract) => contract.id);
  const documentIds = documents.map((document) => document.id);

  const scopes = [
    `and(entity_type.eq.client,entity_id.eq.${clientId})`,
    projectIds.length ? `and(entity_type.eq.project,entity_id.in.(${projectIds.join(",")}))` : "",
    ticketIds.length ? `and(entity_type.eq.task,entity_id.in.(${ticketIds.join(",")}))` : "",
    contractIds.length ? `and(entity_type.eq.contract,entity_id.in.(${contractIds.join(",")}))` : "",
    documentIds.length ? `and(entity_type.eq.document,entity_id.in.(${documentIds.join(",")}))` : "",
  ].filter(Boolean);

  if (!scopes.length) {
    return [];
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
    .or(scopes.join(","))
    .order("created_at", { ascending: false })
    .limit(250)
    .returns<ActivityRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  let items = (data ?? []).map(mapActivity).map(mapTimelineItem);

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

export async function createClientRecord(values: ClientFormValues, actorUserId: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  const payload = extendWithEntityCode(parseClientPayload(values), entityCode);
  const { data, error } = await supabase
    .from("clients")
    .insert(payload)
    .select("id")
    .single<{ id: string }>();

  if (error) {
    throw new Error(error.message);
  }

  await logActivity({
    userId: actorUserId,
    action: `Created client ${payload.name}`,
    entityType: "client",
    entityId: data.id,
    metadata: {
      kind: "create",
      summary: "Client created",
    },
  });

  return data.id;
}

export async function updateClient(id: string, values: ClientFormValues, actorUserId: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  const previousQuery = applyEntityScope(supabase
    .from("clients")
    .select("name, status, account_manager_id, contact_email, type")
    .eq("id", id), entityCode);
  const previousResponse = await previousQuery.maybeSingle();
  const { data: previous, error: previousError } = previousResponse as {
    data: {
      name: string;
      status: ClientStatus;
      account_manager_id: string | null;
      contact_email: string | null;
      type: ClientRecord["type"];
    } | null;
    error: { message: string } | null;
  };

  if (previousError) {
    throw new Error(previousError.message);
  }

  const payload = {
    ...parseClientPayload(values),
    updated_at: new Date().toISOString(),
  };

  const { error } = await applyEntityScope(supabase.from("clients").update(payload).eq("id", id), entityCode);

  if (error) {
    throw new Error(error.message);
  }

  const activityTasks = [];

  if (!previous) {
    activityTasks.push(
      logActivity({
        userId: actorUserId,
        action: `Updated client ${payload.name}`,
        entityType: "client",
        entityId: id,
        metadata: {
          kind: "update",
          summary: "Client updated",
        },
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
          logActivity({
            userId: actorUserId,
            action,
            entityType: "client",
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
  }

  await Promise.all(activityTasks);

  return id;
}

export async function archiveClient(id: string, actorUserId: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  const { error } = await applyEntityScope(
    supabase
      .from("clients")
      .update({
        status: "archived",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id),
    entityCode,
  );

  if (error) {
    throw new Error(error.message);
  }

  await logActivity({
    userId: actorUserId,
    action: "Archived client",
    entityType: "client",
    entityId: id,
    metadata: {
      kind: "update",
      field: "status",
      to: "archived",
      summary: "Client archived",
    },
  });
}
