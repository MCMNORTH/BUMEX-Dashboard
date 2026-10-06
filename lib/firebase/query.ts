import "server-only";

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { DocumentSnapshot, Query, WriteBatch } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";
import { DbQueryError } from "@/lib/firebase/errors";
import {
  compareRows,
  matchesFilter,
  parseOrFilter,
  type Filter,
  type FilterOperator,
  type Ordering,
} from "@/lib/firebase/filters";
import type { AccessPolicy } from "@/lib/firebase/policies";
import { applyDefaults, documentIdFor, getTableSchema, INBOUND_REFERENCES } from "@/lib/firebase/schema";
import { afterWrite, beforeWrite, type WriteContext } from "@/lib/firebase/triggers";

export { DbQueryError } from "@/lib/firebase/errors";

// ---------------------------------------------------------------------------
// A small PostgREST-compatible query builder over Firestore.
//
// The services were written against supabase-js, so this keeps the same
// chainable surface (from/select/eq/or/order/limit/single/...) and the same
// `{ data, error }` results, including to-one embeds such as
// `project:projects(name)`. Only single-field equality filters are pushed
// down to Firestore (they never need composite indexes); every other filter,
// ordering and limit is applied in memory, which suits the dashboard's
// data volumes.
// ---------------------------------------------------------------------------

type Row = Record<string, any>;

export type DbError = {
  message: string;
  code: string;
  details: string | null;
  hint: string | null;
};

export type DbResult<T> = {
  data: T;
  error: DbError | null;
  count: number | null;
};

type Operation = "select" | "insert" | "update" | "upsert" | "delete";
type SingleMode = "single" | "maybeSingle" | null;

const WRITE_BATCH_LIMIT = 400;
const FIRESTORE_IN_LIMIT = 30;

// Read-only views from the former database (both were security_invoker).
const VIEWS = new Set(["timesheet_projects", "timesheet_missions"]);

function toDbError(error: unknown): DbError {
  if (error instanceof DbQueryError) {
    return { message: error.message, code: error.code, details: null, hint: null };
  }

  const message = error instanceof Error ? error.message : String(error);
  return { message, code: "FIRESTORE", details: null, hint: null };
}

function rlsViolation(table: string) {
  return new DbQueryError(`new row violates row-level security policy for table "${table}"`, "42501");
}

function hasIdColumn(table: string) {
  return !getTableSchema(table).primaryKey;
}

function fromSnapshot(table: string, doc: DocumentSnapshot): Row {
  return hasIdColumn(table) ? { ...doc.data(), id: doc.id } : { ...doc.data() };
}

function toDocument(table: string, row: Row) {
  const data = { ...row };

  if (hasIdColumn(table)) {
    delete data.id;
  }

  for (const key of Object.keys(data)) {
    if (data[key] === undefined) {
      delete data[key];
    }
  }

  return data;
}

// ---- select clause parsing -----------------------------------------------------

type Column = { alias: string; source: string };
type Embed = { alias: string; table: string; hint: string | null; select: SelectClause };
type SelectClause = { columns: Column[] | null; embeds: Embed[] };

function splitTopLevel(input: string) {
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  for (const char of input) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;

    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

function parseSelect(clause: string | undefined): SelectClause {
  const trimmed = clause?.trim() || "*";
  const columns: Column[] = [];
  const embeds: Embed[] = [];
  let wildcard = false;

  for (const part of splitTopLevel(trimmed)) {
    const embed = /^(?:(\w+)\s*:\s*)?(\w+)\s*(?:!\s*(\w+))?\s*\(([\s\S]*)\)$/.exec(part);

    if (embed) {
      const [, alias, table, hint, inner] = embed;
      embeds.push({ alias: alias ?? table, table, hint: hint ?? null, select: parseSelect(inner) });
    } else if (part === "*") {
      wildcard = true;
    } else {
      const [alias, source] = part.includes(":") ? part.split(":") : [part, part];
      columns.push({ alias: alias.trim(), source: source.trim() });
    }
  }

  return { columns: wildcard ? null : columns, embeds };
}

function project(row: Row, { columns, embeds }: SelectClause) {
  const projected: Row = columns ? {} : { ...row };

  for (const { alias, source } of columns ?? []) {
    projected[alias] = row[source] ?? null;
  }

  for (const embed of embeds) {
    projected[embed.alias] = row[`__embed_${embed.alias}`] ?? null;
  }

  for (const key of Object.keys(projected)) {
    if (key.startsWith("__embed_")) {
      delete projected[key];
    }
  }

  return projected;
}

function singularize(table: string) {
  return table.endsWith("ies") ? `${table.slice(0, -3)}y` : table.replace(/s$/, "");
}

type Relationship =
  // The source row holds the key: `task.project_id -> projects.id` (one row).
  | { kind: "to-one"; column: string }
  // The target rows hold the key: `projects.client_id -> clients.id` (a list).
  | { kind: "to-many"; column: string };

// Works out how `table` relates to `embed.table`, like PostgREST does from
// foreign keys. A `!constraint` hint names the key column explicitly.
function resolveRelationship(table: string, embed: Embed, rows: Row[]): Relationship {
  if (embed.hint) {
    const column = embed.hint.replace(/_fkey$/, "");

    if (column.startsWith(`${table}_`)) {
      return { kind: "to-one", column: column.slice(table.length + 1) };
    }

    if (column.startsWith(`${embed.table}_`)) {
      return { kind: "to-many", column: column.slice(embed.table.length + 1) };
    }
  }

  const toOneCandidates = [`${embed.alias}_id`, `${singularize(embed.table)}_id`];

  if (embed.table === "profiles") {
    toOneCandidates.push("user_id");
  }

  const toOne = toOneCandidates.find((candidate) => rows.some((row) => candidate in row));

  if (toOne) {
    return { kind: "to-one", column: toOne };
  }

  return { kind: "to-many", column: table === "profiles" ? "user_id" : `${singularize(table)}_id` };
}

async function fetchByColumn(table: string, column: string, values: string[]) {
  const collection = adminDb().collection(table);

  if (column === "id" && !getTableSchema(table).primaryKey) {
    const docs = await adminDb().getAll(...values.map((id) => collection.doc(id)));
    return docs.filter((doc) => doc.exists).map((doc) => fromSnapshot(table, doc));
  }

  const rows: Row[] = [];

  for (let index = 0; index < values.length; index += FIRESTORE_IN_LIMIT) {
    const snapshot = await collection.where(column, "in", values.slice(index, index + FIRESTORE_IN_LIMIT)).get();
    rows.push(...snapshot.docs.map((doc) => fromSnapshot(table, doc)));
  }

  return rows;
}

// ---- writes ------------------------------------------------------------------

async function commitInBatches(apply: (batch: WriteBatch) => number) {
  // `apply` is invoked repeatedly and returns how many operations remain.
  let remaining = Number.POSITIVE_INFINITY;

  while (remaining > 0) {
    const batch = adminDb().batch();
    remaining = apply(batch);
    await batch.commit();
  }
}

async function writeRows(table: string, rows: Row[], mode: "set" | "delete") {
  const collection = adminDb().collection(table);
  let offset = 0;

  if (!rows.length) {
    return;
  }

  await commitInBatches((batch) => {
    for (const row of rows.slice(offset, offset + WRITE_BATCH_LIMIT)) {
      const ref = collection.doc(documentIdFor(table, row));

      if (mode === "set") {
        batch.set(ref, toDocument(table, row));
      } else {
        batch.delete(ref);
      }
    }

    offset += WRITE_BATCH_LIMIT;
    return Math.max(rows.length - offset, 0);
  });
}

export class QueryBuilder<T = any[]> implements PromiseLike<DbResult<T>> {
  private filters: Filter[] = [];
  private orderings: Ordering[] = [];
  private limitCount: number | null = null;
  private rangeStart = 0;
  private singleMode: SingleMode = null;
  private selectClause: SelectClause = { columns: null, embeds: [] };
  private returning = false;
  private countMode: "exact" | null = null;
  private headOnly = false;
  private operation: Operation = "select";
  private payload: Row | Row[] | null = null;
  private conflictColumns = ["id"];
  private readonly isView: boolean;

  constructor(
    private readonly table: string,
    private readonly policy: AccessPolicy | null,
  ) {
    this.isView = VIEWS.has(table);

    if (!this.isView) {
      getTableSchema(table);
    }
  }

  // ---- operations ---------------------------------------------------------

  select(columns?: string, options?: { count?: "exact" | "planned" | "estimated"; head?: boolean }) {
    this.selectClause = parseSelect(columns);

    if (this.operation === "select") {
      this.countMode = options?.count ? "exact" : null;
      this.headOnly = Boolean(options?.head);
    } else {
      this.returning = true;
    }

    return this as QueryBuilder<any[]>;
  }

  insert(values: Row | Row[]) {
    this.operation = "insert";
    this.payload = values;
    return this;
  }

  upsert(values: Row | Row[], options?: { onConflict?: string }) {
    this.operation = "upsert";
    this.payload = values;
    this.conflictColumns = (options?.onConflict ?? getTableSchema(this.table).primaryKey?.join(",") ?? "id")
      .split(",")
      .map((column) => column.trim());
    return this;
  }

  update(values: Row) {
    this.operation = "update";
    this.payload = values;
    return this;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  // ---- filters ------------------------------------------------------------

  private where(column: string, operator: FilterOperator, value: unknown) {
    this.filters.push({ kind: "condition", column, operator, value });
    return this;
  }

  eq(column: string, value: unknown) {
    return this.where(column, "eq", value);
  }

  neq(column: string, value: unknown) {
    return this.where(column, "neq", value);
  }

  gt(column: string, value: unknown) {
    return this.where(column, "gt", value);
  }

  gte(column: string, value: unknown) {
    return this.where(column, "gte", value);
  }

  lt(column: string, value: unknown) {
    return this.where(column, "lt", value);
  }

  lte(column: string, value: unknown) {
    return this.where(column, "lte", value);
  }

  like(column: string, pattern: string) {
    return this.where(column, "like", pattern);
  }

  ilike(column: string, pattern: string) {
    return this.where(column, "ilike", pattern);
  }

  in(column: string, values: readonly unknown[]) {
    return this.where(column, "in", [...values]);
  }

  is(column: string, value: null | boolean) {
    return this.where(column, "is", value);
  }

  or(expression: string) {
    this.filters.push(parseOrFilter(expression));
    return this;
  }

  match(values: Row) {
    for (const [column, value] of Object.entries(values)) {
      this.eq(column, value);
    }

    return this;
  }

  // ---- modifiers ----------------------------------------------------------

  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
    const ascending = options?.ascending ?? true;
    this.orderings.push({ column, ascending, nullsFirst: options?.nullsFirst ?? !ascending });
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  range(from: number, to: number) {
    this.rangeStart = from;
    this.limitCount = to - from + 1;
    return this;
  }

  returns<R>() {
    return this as unknown as QueryBuilder<R>;
  }

  single<R = any>() {
    this.singleMode = "single";
    return this as unknown as QueryBuilder<R>;
  }

  maybeSingle<R = any>() {
    this.singleMode = "maybeSingle";
    return this as unknown as QueryBuilder<R | null>;
  }

  // ---- execution ----------------------------------------------------------

  then<TResult1 = DbResult<T>, TResult2 = never>(
    onfulfilled?: ((value: DbResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private get writeContext(): WriteContext {
    return { uid: this.policy?.uid || null, role: this.policy?.role ?? null };
  }

  private async execute(): Promise<DbResult<T>> {
    try {
      if (this.policy) {
        await this.policy.prepare(this.table);
      }

      if (this.isView && this.operation !== "select") {
        throw new DbQueryError(`cannot modify view "${this.table}"`, "55000");
      }

      let rows: Row[];

      switch (this.operation) {
        case "select":
          rows = await this.runSelect();
          break;
        case "insert":
          rows = await this.runInsert(this.payloadRows());
          break;
        case "upsert":
          rows = await this.runUpsert();
          break;
        case "update":
          rows = await this.runUpdate();
          break;
        case "delete":
          rows = await this.runDelete();
          break;
      }

      return await this.shape(rows);
    } catch (error) {
      return { data: null as T, error: toDbError(error), count: null };
    }
  }

  private async shape(rows: Row[]): Promise<DbResult<T>> {
    const count = this.countMode ? rows.length : null;

    if (this.operation === "select") {
      rows = rows.slice(this.rangeStart, this.limitCount == null ? undefined : this.rangeStart + this.limitCount);
    } else if (!this.returning) {
      return { data: null as T, error: null, count };
    }

    if (this.headOnly) {
      return { data: null as T, error: null, count };
    }

    const embedded = await this.resolveEmbeds(this.table, rows, this.selectClause);
    const projected = embedded.map((row) => project(row, this.selectClause));

    if (this.singleMode) {
      if (projected.length > 1 || (this.singleMode === "single" && projected.length === 0)) {
        return {
          data: null as T,
          error: {
            message: "JSON object requested, multiple (or no) rows returned",
            code: "PGRST116",
            details: `The result contains ${projected.length} rows`,
            hint: null,
          },
          count,
        };
      }

      return { data: (projected[0] ?? null) as T, error: null, count };
    }

    return { data: projected as T, error: null, count };
  }

  // Attaches embeds under `__embed_<alias>`: an object (or null) for to-one
  // relationships and an array for to-many ones. Embedded rows the caller may
  // not read are left out, like PostgREST with row level security.
  private async resolveEmbeds(table: string, rows: Row[], clause: SelectClause): Promise<Row[]> {
    if (!clause.embeds.length || !rows.length) {
      return rows;
    }

    const result = rows.map((row) => ({ ...row }));

    for (const embed of clause.embeds) {
      const relationship = resolveRelationship(table, embed, rows);
      const sourceColumn = relationship.kind === "to-one" ? relationship.column : "id";
      const targetColumn = relationship.kind === "to-one" ? "id" : relationship.column;
      const keys = [...new Set(rows.map((row) => row[sourceColumn]).filter((value) => value != null).map(String))];
      const targets = keys.length ? await fetchByColumn(embed.table, targetColumn, keys) : [];

      if (this.policy) {
        await this.policy.prepare(embed.table);
      }

      const visible = targets.filter((target) => !this.policy || this.policy.allows(embed.table, "select", target));
      const nested = await this.resolveEmbeds(embed.table, visible, embed.select);
      const grouped = new Map<string, Row[]>();

      for (const target of nested) {
        const key = String(target[targetColumn]);
        grouped.set(key, [...(grouped.get(key) ?? []), project(target, embed.select)]);
      }

      for (const row of result) {
        const matches = row[sourceColumn] == null ? [] : grouped.get(String(row[sourceColumn])) ?? [];
        row[`__embed_${embed.alias}`] = relationship.kind === "to-one" ? matches[0] ?? null : matches;
      }
    }

    return result;
  }

  private payloadRows() {
    const payload = this.payload ?? [];
    return (Array.isArray(payload) ? payload : [payload]).map((row) => ({ ...row }));
  }

  // Rows of a view, already limited to what the caller may see.
  private async viewRows(): Promise<Row[]> {
    if (!this.policy) {
      throw new DbQueryError(`view "${this.table}" requires a signed-in caller`, "42501");
    }

    if (this.table === "timesheet_projects") {
      return this.policy.timesheetProjects();
    }

    // timesheet_missions: select distinct project_id, entity_code, mission
    // from time_entries where mission <> '' (with time_entries policies).
    await this.policy.prepare("time_entries");
    const entries = await adminDb().collection("time_entries").get();
    const missions = new Map<string, Row>();

    for (const doc of entries.docs) {
      const entry = fromSnapshot("time_entries", doc);

      if (!entry.mission || !this.policy.allows("time_entries", "select", entry)) continue;

      const key = JSON.stringify([entry.project_id, entry.entity_code, entry.mission]);
      missions.set(key, { project_id: entry.project_id, entity_code: entry.entity_code ?? null, mission: entry.mission });
    }

    return [...missions.values()];
  }

  // Fetches candidate rows, pushing at most one equality filter to Firestore.
  private async fetchCandidates(): Promise<Row[]> {
    if (this.isView) {
      return this.viewRows();
    }

    const collection = adminDb().collection(this.table);
    const conditions = this.filters.filter(
      (filter): filter is Extract<Filter, { kind: "condition" }> => filter.kind === "condition",
    );

    if (hasIdColumn(this.table)) {
      const idEq = conditions.find((filter) => filter.column === "id" && filter.operator === "eq");

      if (idEq) {
        if (idEq.value == null) return [];
        const doc = await collection.doc(String(idEq.value)).get();
        return doc.exists ? [fromSnapshot(this.table, doc)] : [];
      }

      const idIn = conditions.find((filter) => filter.column === "id" && filter.operator === "in");

      if (idIn && Array.isArray(idIn.value)) {
        const ids = [...new Set(idIn.value.filter((value) => value != null).map(String))];

        if (!ids.length) return [];

        const docs = await adminDb().getAll(...ids.map((id) => collection.doc(id)));
        return docs.filter((doc) => doc.exists).map((doc) => fromSnapshot(this.table, doc));
      }
    }

    let query: Query = collection;
    const pushable = conditions.find(
      (filter) =>
        filter.operator === "eq"
        && !filter.column.includes("->")
        && (typeof filter.value === "string" || typeof filter.value === "boolean"),
    );

    if (pushable) {
      query = query.where(pushable.column, "==", pushable.value);
    } else {
      const pushableIn = conditions.find(
        (filter) =>
          filter.operator === "in"
          && !filter.column.includes("->")
          && Array.isArray(filter.value)
          && filter.value.length > 0
          && filter.value.length <= FIRESTORE_IN_LIMIT
          && filter.value.every((value) => typeof value === "string"),
      );

      if (pushableIn) {
        query = query.where(pushableIn.column, "in", pushableIn.value);
      } else if (conditions.some((filter) => filter.operator === "in" && Array.isArray(filter.value) && filter.value.length === 0)) {
        return [];
      }
    }

    const snapshot = await query.get();
    return snapshot.docs.map((doc) => fromSnapshot(this.table, doc));
  }

  private matches(row: Row) {
    return this.filters.every((filter) => matchesFilter(row, filter));
  }

  private async findRows(command: "select" | "update" | "delete") {
    const candidates = await this.fetchCandidates();

    return candidates.filter(
      (row) =>
        this.matches(row)
        && (this.isView || !this.policy || this.policy.allows(this.table, command, row)),
    );
  }

  private async runSelect() {
    const rows = await this.findRows("select");

    if (this.orderings.length) {
      rows.sort((left, right) => compareRows(left, right, this.orderings));
    }

    return rows;
  }

  private async findByColumns(columns: string[], row: Row) {
    if (columns.some((column) => row[column] == null)) {
      return [];
    }

    if (!hasIdColumn(this.table) && columns.join(",") === getTableSchema(this.table).primaryKey!.join(",")) {
      const doc = await adminDb().collection(this.table).doc(documentIdFor(this.table, row)).get();
      return doc.exists ? [fromSnapshot(this.table, doc)] : [];
    }

    const [first, ...rest] = columns;
    const snapshot = await adminDb().collection(this.table).where(first, "==", row[first]).get();

    return snapshot.docs
      .map((doc) => fromSnapshot(this.table, doc))
      .filter((candidate) => rest.every((column) => candidate[column] === row[column]));
  }

  private async assertUnique(rows: Row[], ignoreDocIds = new Set<string>()) {
    const { unique } = getTableSchema(this.table);

    if (!unique) {
      return;
    }

    for (const [constraint, columns] of Object.entries(unique)) {
      const seen = new Set<string>();

      for (const row of rows) {
        const values = columns.map((column) => row[column]);

        // Postgres treats NULLs as distinct in unique constraints.
        if (values.some((value) => value == null)) continue;

        const key = JSON.stringify(values);

        if (seen.has(key)) {
          throw new DbQueryError(`duplicate key value violates unique constraint "${constraint}"`, "23505");
        }

        seen.add(key);

        const rowDocId = documentIdFor(this.table, row);
        const existing = await this.findByColumns(columns, row);

        if (existing.some((candidate) => {
          const candidateId = documentIdFor(this.table, candidate);
          return candidateId !== rowDocId && !ignoreDocIds.has(candidateId);
        })) {
          throw new DbQueryError(`duplicate key value violates unique constraint "${constraint}"`, "23505");
        }
      }
    }
  }

  private assertAllowed(rows: Row[], command: "insert" | "update") {
    if (!this.policy) return;

    for (const row of rows) {
      if (!this.policy.allows(this.table, command, row, "check")) {
        throw rlsViolation(this.table);
      }
    }
  }

  private async runInsert(input: Row[]) {
    if (!input.length) {
      return [];
    }

    const rows = input.map((row) => applyDefaults(this.table, row));
    await beforeWrite(this.table, "insert", rows, rows.map(() => null), this.writeContext);
    this.assertAllowed(rows, "insert");

    const docIds = rows.map((row) => documentIdFor(this.table, row));

    if (new Set(docIds).size !== docIds.length) {
      throw new DbQueryError(`duplicate key value violates unique constraint "${this.table}_pkey"`, "23505");
    }

    const collection = adminDb().collection(this.table);
    const existing = await adminDb().getAll(...docIds.map((id) => collection.doc(id)));

    if (existing.some((doc) => doc.exists)) {
      throw new DbQueryError(`duplicate key value violates unique constraint "${this.table}_pkey"`, "23505");
    }

    await this.assertUnique(rows);
    await writeRows(this.table, rows, "set");
    this.policy?.invalidate(this.table);
    await afterWrite(this.table, "insert", rows, rows.map(() => null), this.writeContext);
    return rows;
  }

  private async runUpsert() {
    const inputs = this.payloadRows();
    const inserts: Row[] = [];
    const previous: Row[] = [];
    const updates: Row[] = [];

    for (const input of inputs) {
      let existing: Row | null = null;

      if (this.conflictColumns.length === 1 && this.conflictColumns[0] === "id" && hasIdColumn(this.table)) {
        if (input.id != null) {
          const doc = await adminDb().collection(this.table).doc(String(input.id)).get();
          existing = doc.exists ? fromSnapshot(this.table, doc) : null;
        }
      } else {
        existing = (await this.findByColumns(this.conflictColumns, input))[0] ?? null;
      }

      if (existing) {
        if (this.policy && !this.policy.allows(this.table, "update", existing)) {
          throw rlsViolation(this.table);
        }

        previous.push(existing);
        updates.push(this.applyPatch(existing, input));
      } else {
        inserts.push(input);
      }
    }

    await beforeWrite(this.table, "update", updates, previous, this.writeContext);
    this.assertAllowed(updates, "update");
    await this.assertUnique(updates, new Set(updates.map((row) => documentIdFor(this.table, row))));
    await writeRows(this.table, updates, "set");
    await afterWrite(this.table, "update", updates, previous, this.writeContext);
    const inserted = await this.runInsert(inserts);
    this.policy?.invalidate(this.table);
    return [...updates, ...inserted];
  }

  private applyPatch(row: Row, patch: Row) {
    const next: Row = { ...row };

    for (const [column, value] of Object.entries(patch)) {
      if (value !== undefined && column !== "id") {
        next[column] = value;
      }
    }

    if (getTableSchema(this.table).touchUpdatedAt) {
      next.updated_at = new Date().toISOString();
    }

    return next;
  }

  private async runUpdate() {
    const matched = await this.findRows("update");
    const patch = (this.payload ?? {}) as Row;
    const rows = matched.map((row) => this.applyPatch(row, patch));

    await beforeWrite(this.table, "update", rows, matched, this.writeContext);
    this.assertAllowed(rows, "update");

    const { unique, primaryKey } = getTableSchema(this.table);
    const touchesUnique = unique && Object.values(unique).flat().some((column) => column in patch);

    if (touchesUnique) {
      await this.assertUnique(rows, new Set(rows.map((row) => documentIdFor(this.table, row))));
    }

    // A changed composite key moves the row to a new document.
    if (primaryKey?.some((column) => column in patch)) {
      await writeRows(this.table, matched, "delete");
    }

    await writeRows(this.table, rows, "set");
    this.policy?.invalidate(this.table);
    await afterWrite(this.table, "update", rows, matched, this.writeContext);
    return rows;
  }

  private async runDelete() {
    const rows = await this.findRows("delete");

    for (const row of rows) {
      await applyReferentialActions(this.table, documentIdFor(this.table, row));
    }

    await writeRows(this.table, rows, "delete");
    this.policy?.invalidate(this.table);
    return rows;
  }
}

// Emulates `on delete cascade | set null | restrict`. Like Postgres, these
// actions run with the privileges of the table owner, not the caller.
async function applyReferentialActions(table: string, id: string, depth = 0): Promise<void> {
  if (depth > 5) {
    return;
  }

  const references = INBOUND_REFERENCES[table] ?? [];
  const referencing = await Promise.all(
    references.map((reference) =>
      adminDb().collection(reference.table).where(reference.column, "==", id).get(),
    ),
  );

  // Check every restrict reference before touching anything.
  references.forEach((reference, index) => {
    if (reference.onDelete === "restrict" && !referencing[index].empty) {
      throw new DbQueryError(
        `update or delete on table "${table}" violates foreign key constraint on table "${reference.table}"`,
        "23503",
      );
    }
  });

  for (const [index, reference] of references.entries()) {
    const snapshot = referencing[index];

    if (snapshot.empty || reference.onDelete === "restrict") {
      continue;
    }

    const rows = snapshot.docs.map((doc) => fromSnapshot(reference.table, doc));

    if (reference.onDelete === "set null") {
      await writeRows(reference.table, rows.map((row) => ({ ...row, [reference.column]: null })), "set");
      continue;
    }

    for (const row of rows) {
      await applyReferentialActions(reference.table, documentIdFor(reference.table, row), depth + 1);
    }

    await writeRows(reference.table, rows, "delete");
  }
}
