"use server";

import { getActivityMetadataSummary } from "@/lib/activity/presentation";
import { canRoleAccessRoute } from "@/lib/auth/permissions";
import {
  getClientById,
  getClientLinkedContracts,
  getClientLinkedDocuments,
  getClientLinkedTickets,
  getClientRelationshipSummary,
  getClientsFilterData,
  getClientTimeline,
} from "@/lib/clients/service";
import { getCommentsForEntity } from "@/lib/comments/service";
import { getContractById, getContracts, getContractsFilterData } from "@/lib/contracts/service";
import { withErpSession } from "@/lib/erp/db";
import { requireErpAccess } from "@/lib/erp/server";
import { createClient } from "@/lib/firebase/server";
import { getNotesForEntity } from "@/lib/notes/service";
import { getMentionCandidates } from "@/lib/notifications/service";
import type { AppRole } from "@/types/auth";
import type { ClientLinkedContract, ClientLinkedDocument, ClientLinkedTicket, ClientRecord, ClientRelationshipSummary, ClientTimelineItem } from "@/types/client";
import { canViewComment, type CommentRecord } from "@/types/comment";
import type { ContractFiltersData, ContractRecord } from "@/types/contract";
import type { InternalNoteRecord } from "@/types/note";

// The relationship side of the clients for Vanguard's Clients room (vanguard/one/Clients.tsx): BUMEX One's clients
// the person sees, each with its customer accounts in the entities (clients.ts).

export type ClientRelation = Pick<ClientRecord, "id" | "name" | "status" | "prospect_stage" | "contact_email" | "contact_phone" | "city" | "country" | "tax_id"> & {
  manager: string | null;
  accounts: { entityId: string; customerId: string; code: string }[];
};

export async function clientRelationsAction(): Promise<ClientRelation[]> {
  const { auth } = await requireErpAccess();
  const db = await createClient();
  if (!db) return [];
  const [{ data: clients }, { data: people }] = await Promise.all([
    db
      .from("clients")
      .select("id, name, status, prospect_stage, contact_email, contact_phone, city, country, tax_id, account_manager_id")
      .order("name")
      .returns<(Omit<ClientRelation, "manager" | "accounts"> & { account_manager_id: string | null })[]>(),
    db.from("profiles").select("id, full_name").returns<{ id: string; full_name: string }[]>(),
  ]);
  const accounts = await withErpSession(auth.profile.id, (tx) =>
    tx.query<{ client: string; entityId: string; customerId: string; code: string }>(
      `select bumex_client_id as client, entity_id as "entityId", id as "customerId", code from erp.customer where bumex_client_id is not null`,
    ),
  );
  const names = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  return (clients ?? []).map(({ account_manager_id, ...c }) => ({
    ...c,
    manager: account_manager_id ? (names.get(account_manager_id) ?? null) : null,
    accounts: accounts.filter((a) => a.client === c.id).map((a) => ({ entityId: a.entityId, customerId: a.customerId, code: a.code })),
  }));
}

const CLIENT_FIELDS = [
  "id", "name", "legal_name", "type", "industry", "contact_email", "contact_phone", "address", "country", "city", "website", "tax_id",
  "status", "prospect_stage", "next_follow_up_at", "account_manager_id", "notes", "created_at", "updated_at", "linkedProjects", "activeProjectsCount",
] as const;
const CONTRACT_FIELDS = [
  "id", "title", "contract_number", "client_id", "project_id", "status", "contract_type", "start_date", "end_date", "signed_date", "renewal_date",
  "amount", "currency", "payment_terms", "responsible_user_id", "notes", "updated_at", "daysUntilRenewal", "renewalState",
] as const;
const pick = <T extends object, K extends keyof T>(row: T, keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, row[k]])) as Pick<T, K>;

// A client's page in the Clients room (vanguard/one/ClientPage.tsx), as BUMEX One's client page had it: the
// relationship (contact details, prospect stage, account manager), what it holds (missions, contracts, documents,
// tickets), its history, notes and conversation. Read with BUMEX One's rules for the person.
export type ClientView = {
  client: Pick<ClientRecord, (typeof CLIENT_FIELDS)[number]> & { managerName: string | null };
  summary: ClientRelationshipSummary;
  contracts: ClientLinkedContract[];
  documents: ClientLinkedDocument[];
  tickets: { id: string; title: string; status: string; priority: string; dueDate: string | null; projectName: string | null; assigneeName: string | null }[];
  timeline: ClientTimelineItem[];
  comments: CommentRecord[];
  notes: InternalNoteRecord[];
  managers: { id: string; name: string }[];
  people: { id: string; name: string }[];
  me: string;
  role: AppRole;
  canManage: boolean;
  canComment: boolean;
};

export async function clientViewAction(clientId: string): Promise<ClientView | null> {
  const { auth } = await requireErpAccess();
  const role = auth.role;
  const id = String(clientId);
  const [client, filterData, summary, contracts, documents, tickets, timeline, comments, notes, mentions] = await Promise.all([
    getClientById(id, role),
    getClientsFilterData(),
    getClientRelationshipSummary(id, role),
    getClientLinkedContracts(id, role),
    getClientLinkedDocuments(id, role),
    getClientLinkedTickets(id, role),
    getClientTimeline(id, role, "all"),
    getCommentsForEntity("client", id),
    getNotesForEntity("client", id),
    getMentionCandidates(),
  ]);
  if (!client) return null;
  return {
    client: { ...pick(client, CLIENT_FIELDS), managerName: client.accountManager?.full_name ?? null },
    summary,
    contracts,
    documents,
    tickets: (tickets as ClientLinkedTicket[]).map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, dueDate: t.due_date?.slice(0, 10) ?? null, projectName: t.project?.name ?? null, assigneeName: t.assignee?.full_name ?? null })),
    timeline,
    comments: comments.filter((c) => canViewComment(c, role)),
    notes,
    managers: filterData.accountManagers.map((m) => ({ id: m.id, name: m.full_name })),
    people: mentions.map((p) => ({ id: p.id, name: p.full_name })),
    me: auth.profile.id,
    role,
    // BUMEX One's rule: the administrator, and managers and employees for the clients they manage
    canManage: role === "admin" || ((role === "manager" || role === "employee") && client.account_manager_id === auth.profile.id),
    canComment: ["admin", "manager", "supervisor", "employee"].includes(role),
  };
}

// The Clients room's "Contrats" tab (vanguard/one/Contracts.tsx): BUMEX One's contracts, for the people its Contracts
// page was for, with what the contract form needs.
export type ContractRow = Pick<ContractRecord, (typeof CONTRACT_FIELDS)[number]> & { clientName: string | null; projectName: string | null; responsibleName: string | null };
export type ContractsData = { contracts: ContractRow[]; options: ContractFiltersData; canEdit: boolean; me: string } | null;

const contractRow = (c: ContractRecord): ContractRow => ({
  ...pick(c, CONTRACT_FIELDS),
  clientName: c.client?.name ?? null,
  projectName: c.project?.name ?? null,
  responsibleName: c.responsibleUser?.full_name ?? null,
});

export async function contractsAction(): Promise<ContractsData> {
  const { auth } = await requireErpAccess();
  if (!canRoleAccessRoute(auth.role, "contracts")) return null;
  const [contracts, options] = await Promise.all([getContracts(auth.role), getContractsFilterData()]);
  return { contracts: contracts.map(contractRow), options, canEdit: auth.role !== "shareholder" && auth.role !== "supervisor", me: auth.profile.id };
}

export type ContractView = {
  contract: ContractRow;
  history: { id: string; at: string; who: string; action: string; detail: string }[];
  comments: CommentRecord[];
  notes: InternalNoteRecord[];
  people: { id: string; name: string }[];
  me: string;
  role: AppRole;
  canComment: boolean;
};

export async function contractViewAction(contractId: string): Promise<ContractView | null> {
  const { auth } = await requireErpAccess();
  if (!canRoleAccessRoute(auth.role, "contracts")) return null;
  const id = String(contractId);
  const [contract, comments, notes, mentions] = await Promise.all([getContractById(id, auth.role), getCommentsForEntity("contract", id), getNotesForEntity("contract", id), getMentionCandidates()]);
  if (!contract) return null;
  return {
    contract: contractRow(contract),
    history: contract.recentActivity.map((a) => ({ id: a.id, at: a.created_at, who: a.user?.full_name ?? "", action: a.action, detail: getActivityMetadataSummary(a) ?? "" })),
    comments: comments.filter((c) => canViewComment(c, auth.role)),
    notes,
    people: mentions.map((p) => ({ id: p.id, name: p.full_name })),
    me: auth.profile.id,
    role: auth.role,
    canComment: ["admin", "manager", "supervisor", "employee"].includes(auth.role),
  };
}
