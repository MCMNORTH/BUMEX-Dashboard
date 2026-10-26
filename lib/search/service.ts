import "server-only";

import { canViewInternalTickets, canViewSensitiveFinance } from "@/lib/auth/permissions";
import {
  canSearchEntity,
  canViewSearchResult,
  sanitizeSearchResultForRole,
} from "@/lib/search/permissions";
import { matchesSearchTerms, normalizeSearchText, searchTerms } from "@/lib/search/text";
import { asPerson, select } from "@/lib/work/db";
import type { AppRole } from "@/types/auth";
import type { GlobalSearchEntityType, GlobalSearchResult } from "@/types/search";

const RESULT_LIMIT = 5;

type SearchViewer = {
  id: string;
  role: AppRole;
};

// Each entity returns its best matches, so fetch a wider pool by recency and rank it here.
function candidateLimit(limit: number) {
  return Math.max(limit * 5, 25);
}

function searchScore(result: GlobalSearchResult, query: string) {
  const normalizedQuery = normalizeSearchText(query);
  const terms = searchTerms(query);
  const title = normalizeSearchText(result.title);
  const titleWords = title.split(/[^a-z0-9]+/).filter(Boolean);
  const description = normalizeSearchText(result.description);
  const relatedLabel = normalizeSearchText(result.relatedLabel);
  const allText = `${title} ${description} ${relatedLabel}`;

  let score = 0;

  if (title === normalizedQuery) score += 1_000;
  else if (title.startsWith(normalizedQuery)) score += 600;
  else if (title.includes(normalizedQuery)) score += 350;
  else if (terms.every((term) => title.includes(term))) score += 250;
  else if (description.includes(normalizedQuery) || relatedLabel.includes(normalizedQuery)) score += 160;

  score += terms.reduce((total, term) => {
    if (titleWords.some((word) => word.startsWith(term))) return total + 80;
    if (title.includes(term)) return total + 60;
    return total + (allText.includes(term) ? 20 : 0);
  }, 0);

  if (result.updatedAt) {
    const ageInDays = (Date.now() - new Date(result.updatedAt).getTime()) / 86_400_000;
    if (ageInDays <= 7) score += 12;
    else if (ageInDays <= 30) score += 6;
  }

  return score;
}

function compareResults(left: GlobalSearchResult, right: GlobalSearchResult, query: string) {
  const scoreDifference = searchScore(right, query) - searchScore(left, query);
  if (scoreDifference !== 0) return scoreDifference;

  const leftUpdatedAt = left.updatedAt ? new Date(left.updatedAt).getTime() : 0;
  const rightUpdatedAt = right.updatedAt ? new Date(right.updatedAt).getTime() : 0;
  if (rightUpdatedAt !== leftUpdatedAt) return rightUpdatedAt - leftUpdatedAt;

  return entityLabel(left.entityType).localeCompare(entityLabel(right.entityType));
}

function topResults<T extends GlobalSearchResult>(results: T[], query: string, limit: number) {
  return [...results].sort((left, right) => compareResults(left, right, query)).slice(0, limit);
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

async function safeSearch<T extends GlobalSearchResult>(query: string, limit: number, callback: () => Promise<T[]>) {
  try {
    return topResults(await callback(), query, limit);
  } catch {
    return [];
  }
}

// The rows of one kind the person sees (the rules apply), most recent first, whose searched fields hold every word of
// the query (accents and case aside), as the lists' search does.
async function candidates<T>(sql: string, query: string, fields: (row: T) => Array<string | null | undefined>, limit: number) {
  const terms = searchTerms(query);
  const rows = await asPerson((tx) => select<T>(tx, sql));
  return rows.filter((row) => matchesSearchTerms(terms, fields(row))).slice(0, candidateLimit(limit));
}

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);

export async function searchProjects(query: string, limit = RESULT_LIMIT) {
  return safeSearch(query, limit, async () => {
    type Row = { id: string; name: string; status: string; description: string | null; created_at: string; client_name: string | null };
    const rows = await candidates<Row>(
      `select e.id, e.name, case when e.status = 'planned' then 'draft' else e.status::text end as status, e.description, e.created_at,
              (select c.name from work.client c where c.id = e.client_id) as client_name
         from erp.engagement e order by e.created_at desc`,
      query,
      (row) => [row.name, row.description],
      limit,
    );
    return rows.map((project) => ({
      id: project.id,
      entityType: "project" as const,
      title: project.name,
      description: project.description,
      status: project.status,
      relatedLabel: project.client_name,
      updatedAt: project.created_at,
      href: `/projects/${project.id}`,
    }));
  });
}

export async function searchTickets(query: string, limit = RESULT_LIMIT) {
  return safeSearch(query, limit, async () => {
    type Row = { id: string; title: string; description: string | null; status: string; priority: string | null; type: string; updated_at: string; project_name: string | null; client_name: string | null };
    const rows = await candidates<Row>(
      `select t.id, t.title, t.notes as description, t.status, case when t.priority = 'normal' then 'medium' else t.priority end as priority, t.type, t.updated_at,
              e.name as project_name, (select c.name from work.client c where c.id = e.client_id) as client_name
         from erp.task t left join erp.engagement e on e.id = t.engagement_id
        where t.engagement_id is not null order by t.updated_at desc`,
      query,
      (row) => [row.title, row.description, row.type],
      limit,
    );
    return rows.map((ticket) => ({
      id: ticket.id,
      entityType: "ticket" as const,
      title: ticket.title,
      // Intentionally omit internal ticket body text from global search results.
      description: [ticket.type.replaceAll("_", " "), ticket.priority].filter(Boolean).join(" / "),
      status: ticket.status,
      relatedLabel: ticket.project_name ?? ticket.client_name,
      updatedAt: ticket.updated_at,
      href: `/tickets/${ticket.id}`,
    }));
  });
}

export async function searchClients(query: string, limit = RESULT_LIMIT) {
  return safeSearch(query, limit, async () => {
    type Row = { id: string; name: string; legal_name: string | null; status: string; industry: string | null; contact_email: string | null; city: string | null; country: string | null; updated_at: string; manager: string | null };
    const rows = await candidates<Row>(
      `select c.id, c.name, c.legal_name, c.status, c.industry, c.contact_email, c.city, c.country, c.updated_at,
              (select p.full_name from work.person p where p.id = c.account_manager_id) as manager
         from work.client c order by c.updated_at desc`,
      query,
      (row) => [row.name, row.legal_name, row.industry, row.contact_email, row.city, row.country],
      limit,
    );
    return rows.map((client) => ({
      id: client.id,
      entityType: "client" as const,
      title: client.name,
      description: client.industry,
      status: client.status,
      relatedLabel: client.manager,
      updatedAt: client.updated_at,
      href: `/clients/${client.id}`,
    }));
  });
}

export async function searchContracts(query: string, limit = RESULT_LIMIT) {
  return safeSearch(query, limit, async () => {
    type Row = { id: string; title: string; contract_number: string | null; status: string; contract_type: string; updated_at: string; client_name: string | null };
    const rows = await candidates<Row>(
      `select k.id, k.title, k.contract_number, k.status, k.contract_type, k.updated_at, (select c.name from work.client c where c.id = k.client_id) as client_name
         from work.contract k order by k.updated_at desc`,
      query,
      (row) => [row.title, row.contract_number, row.contract_type],
      limit,
    );
    return rows.map((contract) => ({
      id: contract.id,
      entityType: "contract" as const,
      title: contract.title,
      description: contract.contract_type.replaceAll("_", " "),
      status: contract.status,
      relatedLabel: contract.client_name,
      updatedAt: contract.updated_at,
      href: `/contracts/${contract.id}`,
    }));
  });
}

export async function searchDocuments(query: string, limit = RESULT_LIMIT, role?: AppRole) {
  return safeSearch(query, limit, async () => {
    type Row = { id: string; title: string; file_name: string; description: string | null; document_type: string; related_type: string; visibility: string; is_archived: boolean; updated_at: string };
    const rows = await candidates<Row>(
      `select d.id, d.title, d.file_name, d.description, d.document_type, d.related_type, d.visibility, d.is_archived, d.updated_at
         from work.document d order by d.updated_at desc`,
      query,
      (row) => [row.title, row.file_name, row.description, row.document_type],
      limit * 4,
    );
    return rows
      .filter((document) => (role === "shareholder" ? document.visibility === "shareholders" : role === "employee" ? document.visibility !== "restricted" : true))
      .map((document) => ({
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
  return safeSearch(query, limit, async () => {
    type Row = { id: string; invoice_number: string; notes: string | null; status: string; amount_ttc: number; currency: string; updated_at: string; client_name: string | null };
    const rows = await candidates<Row>(
      `select i.id, i.invoice_number, i.notes, i.status, i.amount_ttc::float8 as amount_ttc, i.currency, i.updated_at,
              (select c.name from work.client c where c.id = i.client_id) as client_name
         from work.finance_invoice i order by i.updated_at desc`,
      query,
      (row) => [row.invoice_number, row.notes, row.status],
      limit,
    );
    return rows.map((invoice) => ({
      id: invoice.id,
      entityType: "invoice" as const,
      title: invoice.invoice_number,
      description: money(invoice.amount_ttc, invoice.currency),
      status: invoice.status,
      relatedLabel: invoice.client_name,
      updatedAt: invoice.updated_at,
      href: `/finance/invoices?invoice=${invoice.id}`,
    }));
  });
}

export async function searchPayments(query: string, limit = RESULT_LIMIT) {
  return safeSearch(query, limit, async () => {
    type Row = { id: string; status: string; amount: number; currency: string; reference: string | null; notes: string | null; updated_at: string; client_name: string | null };
    const rows = await candidates<Row>(
      `select x.id, x.status, x.amount::float8 as amount, x.currency, x.reference, x.notes, x.updated_at,
              (select c.name from work.client c where c.id = x.client_id) as client_name
         from work.finance_payment x order by x.updated_at desc`,
      query,
      (row) => [row.reference, row.notes, row.status],
      limit,
    );
    return rows.map((payment) => ({
      id: payment.id,
      entityType: "payment" as const,
      title: payment.reference || "Client payment",
      description: money(payment.amount, payment.currency),
      status: payment.status,
      relatedLabel: payment.client_name,
      updatedAt: payment.updated_at,
      href: `/finance/payments?payment=${payment.id}`,
    }));
  });
}

export async function searchTeamMembers(query: string, limit = RESULT_LIMIT) {
  return safeSearch(query, limit, async () => {
    type Row = { id: string; full_name: string; email: string; role: string; job_title: string | null; department: string | null; availability_status: string | null; updated_at: string };
    const rows = await candidates<Row>(
      `select p.id, p.full_name, p.email, work.person_role(p.id) as role, p.job_title, p.department, p.availability_status, p.updated_at
         from work.person p order by p.full_name`,
      query,
      (row) => [row.full_name, row.email, row.job_title, row.department],
      limit,
    );
    return rows.map((member) => ({
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

  return visibleResults.sort((left, right) => compareResults(left, right, normalizedQuery));
}
