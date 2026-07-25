import "server-only";

import { canViewInternalTickets, canViewSensitiveFinance } from "@/lib/auth/permissions";
import {
  canSearchEntity,
  canViewSearchResult,
  sanitizeSearchResultForRole,
} from "@/lib/search/permissions";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/auth";
import type { GlobalSearchEntityType, GlobalSearchResult } from "@/types/search";

const RESULT_LIMIT = 5;

type SearchViewer = {
  id: string;
  role: AppRole;
};

function withWildcards(query: string) {
  return `%${query.trim()}%`;
}

function entityLabel(entityType: GlobalSearchEntityType) {
  const labels: Record<GlobalSearchEntityType, string> = {
    project: "Projects",
    ticket: "Tickets",
    client: "Clients",
    contract: "Contracts",
    document: "Documents",
    invoice: "Invoices",
    payment: "Payments",
    team_member: "Team members",
  };

  return labels[entityType];
}

async function safeSearch<T>(callback: () => Promise<T[]>) {
  try {
    return await callback();
  } catch {
    return [];
  }
}

export async function searchProjects(query: string, limit = RESULT_LIMIT) {
  return safeSearch(async () => {
    const supabase = await createClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("projects")
      .select(
        `
          id,
          name,
          status,
          description,
          created_at,
          client:clients (
            name
          )
        `,
      )
      .or(`name.ilike.${withWildcards(query)},description.ilike.${withWildcards(query)}`)
      .order("created_at", { ascending: false })
      .limit(limit)
      .returns<Array<{
        id: string;
        name: string;
        status: string;
        description: string | null;
        created_at: string;
        client: { name: string } | { name: string }[] | null;
      }>>();

    if (error) throw error;

    return (data ?? []).map((project) => ({
      id: project.id,
      entityType: "project" as const,
      title: project.name,
      description: project.description,
      status: project.status,
      relatedLabel: Array.isArray(project.client) ? project.client[0]?.name ?? null : project.client?.name ?? null,
      updatedAt: project.created_at,
      href: `/projects/${project.id}`,
    }));
  });
}

export async function searchTickets(query: string, limit = RESULT_LIMIT) {
  return safeSearch(async () => {
    const supabase = await createClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("tasks")
      .select(
        `
          id,
          title,
          status,
          priority,
          type,
          updated_at,
          project:projects (
            name,
            client:clients (
              name
            )
          )
        `,
      )
      .or(`title.ilike.${withWildcards(query)},type.ilike.${withWildcards(query)}`)
      .order("updated_at", { ascending: false })
      .limit(limit)
      .returns<Array<{
        id: string;
        title: string;
        status: string;
        priority: string | null;
        type: string;
        updated_at: string;
        project:
          | {
              name: string;
              client: { name: string } | { name: string }[] | null;
            }
          | Array<{
              name: string;
              client: { name: string } | { name: string }[] | null;
            }>
          | null;
      }>>();

    if (error) throw error;

    return (data ?? []).map((ticket) => {
      const project = Array.isArray(ticket.project) ? ticket.project[0] ?? null : ticket.project;
      const client = project?.client ? (Array.isArray(project.client) ? project.client[0] ?? null : project.client) : null;

      return {
        id: ticket.id,
        entityType: "ticket" as const,
        title: ticket.title,
        // Intentionally omit internal ticket body text from global search results.
        description: [ticket.type.replaceAll("_", " "), ticket.priority].filter(Boolean).join(" / "),
        status: ticket.status,
        relatedLabel: project?.name ?? client?.name ?? null,
        updatedAt: ticket.updated_at,
        href: `/tickets/${ticket.id}`,
      };
    });
  });
}

export async function searchClients(query: string, limit = RESULT_LIMIT) {
  return safeSearch(async () => {
    const supabase = await createClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("clients")
      .select(
        `
          id,
          name,
          status,
          industry,
          updated_at,
          accountManager:profiles!clients_account_manager_id_fkey (
            full_name
          )
        `,
      )
      .or(`name.ilike.${withWildcards(query)},industry.ilike.${withWildcards(query)}`)
      .order("updated_at", { ascending: false })
      .limit(limit)
      .returns<Array<{
        id: string;
        name: string;
        status: string;
        industry: string | null;
        updated_at: string;
        accountManager: { full_name: string } | { full_name: string }[] | null;
      }>>();

    if (error) throw error;

    return (data ?? []).map((client) => ({
      id: client.id,
      entityType: "client" as const,
      title: client.name,
      description: client.industry,
      status: client.status,
      relatedLabel: Array.isArray(client.accountManager)
        ? client.accountManager[0]?.full_name ?? null
        : client.accountManager?.full_name ?? null,
      updatedAt: client.updated_at,
      href: `/clients/${client.id}`,
    }));
  });
}

export async function searchContracts(query: string, limit = RESULT_LIMIT) {
  return safeSearch(async () => {
    const supabase = await createClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("contracts")
      .select(
        `
          id,
          title,
          status,
          contract_type,
          updated_at,
          client:clients (
            name
          )
        `,
      )
      .or(`title.ilike.${withWildcards(query)},contract_type.ilike.${withWildcards(query)}`)
      .order("updated_at", { ascending: false })
      .limit(limit)
      .returns<Array<{
        id: string;
        title: string;
        status: string;
        contract_type: string;
        updated_at: string;
        client: { name: string } | { name: string }[] | null;
      }>>();

    if (error) throw error;

    return (data ?? []).map((contract) => ({
      id: contract.id,
      entityType: "contract" as const,
      title: contract.title,
      description: contract.contract_type.replaceAll("_", " "),
      status: contract.status,
      relatedLabel: Array.isArray(contract.client) ? contract.client[0]?.name ?? null : contract.client?.name ?? null,
      updatedAt: contract.updated_at,
      href: `/contracts/${contract.id}`,
    }));
  });
}

export async function searchDocuments(query: string, limit = RESULT_LIMIT, role?: AppRole) {
  return safeSearch(async () => {
    const supabase = await createClient();
    if (!supabase) return [];

    let queryBuilder = supabase
      .from("documents")
      .select(
        `
          id,
          title,
          document_type,
          related_type,
          is_archived,
          updated_at
        `,
      )
      .or(`title.ilike.${withWildcards(query)},document_type.ilike.${withWildcards(query)}`)
      .order("updated_at", { ascending: false });

    if (role === "shareholder") {
      queryBuilder = queryBuilder.eq("visibility", "shareholders");
    }

    if (role === "employee") {
      queryBuilder = queryBuilder.neq("visibility", "restricted");
    }

    const { data, error } = await queryBuilder
      .limit(limit)
      .returns<Array<{
        id: string;
        title: string;
        document_type: string;
        related_type: string;
        is_archived: boolean;
        updated_at: string;
      }>>();

    if (error) throw error;

    return (data ?? []).map((document) => ({
      id: document.id,
      entityType: "document" as const,
      title: document.title,
      description: document.document_type.replaceAll("_", " "),
      status: document.is_archived ? "archived" : "active",
      relatedLabel: document.related_type.replaceAll("_", " "),
      updatedAt: document.updated_at,
      href: `/documents?document=${document.id}`,
    }));
  });
}

export async function searchInvoices(query: string, limit = RESULT_LIMIT) {
  return safeSearch(async () => {
    const supabase = await createClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("invoices")
      .select(
        `
          id,
          invoice_number,
          status,
          amount_ttc,
          currency,
          updated_at,
          client:clients (
            name
          )
        `,
      )
      .or(`invoice_number.ilike.${withWildcards(query)},status.ilike.${withWildcards(query)}`)
      .order("updated_at", { ascending: false })
      .limit(limit)
      .returns<Array<{
        id: string;
        invoice_number: string;
        status: string;
        amount_ttc: number;
        currency: string;
        updated_at: string;
        client: { name: string } | { name: string }[] | null;
      }>>();

    if (error) throw error;

    return (data ?? []).map((invoice) => ({
      id: invoice.id,
      entityType: "invoice" as const,
      title: invoice.invoice_number,
      description: new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: invoice.currency,
        maximumFractionDigits: 0,
      }).format(invoice.amount_ttc),
      status: invoice.status,
      relatedLabel: Array.isArray(invoice.client) ? invoice.client[0]?.name ?? null : invoice.client?.name ?? null,
      updatedAt: invoice.updated_at,
      href: `/finance/invoices?invoice=${invoice.id}`,
    }));
  });
}

export async function searchPayments(query: string, limit = RESULT_LIMIT) {
  return safeSearch(async () => {
    const supabase = await createClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("payments")
      .select(
        `
          id,
          status,
          amount,
          currency,
          reference,
          updated_at,
          client:clients (
            name
          )
        `,
      )
      .or(`reference.ilike.${withWildcards(query)},status.ilike.${withWildcards(query)}`)
      .order("updated_at", { ascending: false })
      .limit(limit)
      .returns<Array<{
        id: string;
        status: string;
        amount: number;
        currency: string;
        reference: string | null;
        updated_at: string;
        client: { name: string } | { name: string }[] | null;
      }>>();

    if (error) throw error;

    return (data ?? []).map((payment) => ({
      id: payment.id,
      entityType: "payment" as const,
      title: payment.reference || "Client payment",
      description: new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: payment.currency,
        maximumFractionDigits: 0,
      }).format(payment.amount),
      status: payment.status,
      relatedLabel: Array.isArray(payment.client) ? payment.client[0]?.name ?? null : payment.client?.name ?? null,
      updatedAt: payment.updated_at,
      href: `/finance/payments?payment=${payment.id}`,
    }));
  });
}

export async function searchTeamMembers(query: string, limit = RESULT_LIMIT) {
  return safeSearch(async () => {
    const supabase = await createClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, role, job_title, department, availability_status, updated_at")
      .or(`full_name.ilike.${withWildcards(query)},email.ilike.${withWildcards(query)},job_title.ilike.${withWildcards(query)}`)
      .order("full_name", { ascending: true })
      .limit(limit)
      .returns<Array<{
        id: string;
        full_name: string;
        email: string;
        role: string;
        job_title: string | null;
        department: string | null;
        availability_status: string | null;
        updated_at: string;
      }>>();

    if (error) throw error;

    return (data ?? []).map((member) => ({
      id: member.id,
      entityType: "team_member" as const,
      title: member.full_name,
      description: member.job_title || member.email,
      status: member.availability_status,
      relatedLabel: member.department || member.role,
      updatedAt: member.updated_at,
      href: `/team/${member.id}`,
    }));
  });
}

export async function globalSearch(query: string, user: SearchViewer, options?: { perEntityLimit?: number }) {
  const normalizedQuery = query.trim();
  const perEntityLimit = options?.perEntityLimit ?? RESULT_LIMIT;

  if (normalizedQuery.length < 2) {
    return [];
  }

  const searchTasks: Array<Promise<GlobalSearchResult[]>> = [
    canSearchEntity(user, "project") ? searchProjects(normalizedQuery, perEntityLimit) : Promise.resolve([]),
    canSearchEntity(user, "client") ? searchClients(normalizedQuery, perEntityLimit) : Promise.resolve([]),
    canSearchEntity(user, "contract") ? searchContracts(normalizedQuery, perEntityLimit) : Promise.resolve([]),
    canSearchEntity(user, "document") ? searchDocuments(normalizedQuery, perEntityLimit, user.role) : Promise.resolve([]),
    canSearchEntity(user, "team_member") ? searchTeamMembers(normalizedQuery, perEntityLimit) : Promise.resolve([]),
  ];

  if (canSearchEntity(user, "ticket") && canViewInternalTickets(user.role)) {
    searchTasks.push(searchTickets(normalizedQuery, perEntityLimit));
  }

  if (canSearchEntity(user, "invoice") && canViewSensitiveFinance(user.role)) {
    searchTasks.push(searchInvoices(normalizedQuery, perEntityLimit));
  }

  if (canSearchEntity(user, "payment") && canViewSensitiveFinance(user.role)) {
    searchTasks.push(searchPayments(normalizedQuery, perEntityLimit));
  }

  const results = (await Promise.all(searchTasks)).flat();

  const visibleResults = results
    .filter((result) => canViewSearchResult(user, result))
    .map((result) => sanitizeSearchResultForRole(result, user.role));

  return Object.values(
    visibleResults.reduce<Record<GlobalSearchEntityType, GlobalSearchResult[]>>((groups, result) => {
      groups[result.entityType] ??= [];
      groups[result.entityType].push(result);
      return groups;
    }, {} as Record<GlobalSearchEntityType, GlobalSearchResult[]>),
  )
    .flat()
    .sort((left, right) => entityLabel(left.entityType).localeCompare(entityLabel(right.entityType)));
}
