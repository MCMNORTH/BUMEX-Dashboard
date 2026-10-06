// In-memory evaluation of PostgREST-style filters (eq, ilike, or(...), ...)
// against plain Firestore rows.

type Row = Record<string, unknown>;

export type FilterOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "like" | "ilike" | "in" | "is";

export type Filter =
  | { kind: "condition"; column: string; operator: FilterOperator; value: unknown }
  | { kind: "or"; filters: Filter[] }
  | { kind: "and"; filters: Filter[] }
  | { kind: "not"; filter: Filter };

// Resolves plain columns and Postgres JSON paths such as `metadata->>kind`
// (`->>` yields text, `->` yields the raw JSON value).
export function readColumn(row: Row, column: string): unknown {
  if (!column.includes("->")) {
    return row[column];
  }

  const [base, ...rest] = column.split(/->>?/);
  const lastArrow = column.lastIndexOf("->");
  const asText = column[lastArrow + 2] === ">";
  let value: unknown = row[base.trim()];

  for (const key of rest) {
    if (value == null || typeof value !== "object") {
      return null;
    }

    value = (value as Record<string, unknown>)[key.trim().replace(/^'|'$/g, "")];
  }

  if (asText && value != null && typeof value === "object") {
    return JSON.stringify(value);
  }

  return asText && value != null ? String(value) : value ?? null;
}

function isNumericValue(value: unknown) {
  return typeof value === "number" || (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value)));
}

function compare(rowValue: unknown, filterValue: unknown) {
  if (typeof rowValue === "number" && isNumericValue(filterValue)) {
    return rowValue - Number(filterValue);
  }

  const left = String(rowValue);
  const right = String(filterValue);
  return left < right ? -1 : left > right ? 1 : 0;
}

function looselyEqual(rowValue: unknown, filterValue: unknown) {
  if (rowValue == null || filterValue == null) {
    return false;
  }

  if (typeof rowValue === "number" && isNumericValue(filterValue)) {
    return rowValue === Number(filterValue);
  }

  return String(rowValue) === String(filterValue);
}

const likePatternCache = new Map<string, RegExp>();

function likeToRegExp(pattern: string, caseInsensitive: boolean) {
  const key = `${caseInsensitive ? "i" : "s"}:${pattern}`;
  const cached = likePatternCache.get(key);

  if (cached) {
    return cached;
  }

  let source = "";

  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];

    if (char === "\\" && index + 1 < pattern.length) {
      source += pattern[index + 1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      index += 1;
    } else if (char === "%") {
      source += "[\\s\\S]*";
    } else if (char === "_") {
      source += "[\\s\\S]";
    } else {
      source += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }

  const regex = new RegExp(`^${source}$`, caseInsensitive ? "i" : "");
  likePatternCache.set(key, regex);
  return regex;
}

function matchesCondition(row: Row, column: string, operator: FilterOperator, value: unknown): boolean {
  const rowValue = readColumn(row, column);

  switch (operator) {
    case "eq":
      return looselyEqual(rowValue, value);
    case "neq":
      return rowValue != null && value != null && !looselyEqual(rowValue, value);
    case "gt":
      return rowValue != null && value != null && compare(rowValue, value) > 0;
    case "gte":
      return rowValue != null && value != null && compare(rowValue, value) >= 0;
    case "lt":
      return rowValue != null && value != null && compare(rowValue, value) < 0;
    case "lte":
      return rowValue != null && value != null && compare(rowValue, value) <= 0;
    case "like":
    case "ilike":
      return rowValue != null && likeToRegExp(String(value), operator === "ilike").test(String(rowValue));
    case "in":
      return Array.isArray(value) && value.some((candidate) => looselyEqual(rowValue, candidate));
    case "is":
      if (value === null || value === "null") return rowValue == null;
      if (value === true || value === "true") return rowValue === true;
      if (value === false || value === "false") return rowValue === false;
      return false;
  }
}

export function matchesFilter(row: Row, filter: Filter): boolean {
  switch (filter.kind) {
    case "condition":
      return matchesCondition(row, filter.column, filter.operator, filter.value);
    case "and":
      return filter.filters.every((child) => matchesFilter(row, child));
    case "or":
      return filter.filters.some((child) => matchesFilter(row, child));
    case "not":
      return !matchesFilter(row, filter.filter);
  }
}

// ---------------------------------------------------------------------------
// PostgREST logic-tree parser, e.g.
//   name.ilike.%acme%,and(entity_type.eq.task,entity_id.in.(a,b))
// ---------------------------------------------------------------------------

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

  if (current.trim()) {
    parts.push(current);
  }

  return parts.map((part) => part.trim()).filter(Boolean);
}

function stripQuotes(value: string) {
  return value.length >= 2 && value.startsWith("\"") && value.endsWith("\"") ? value.slice(1, -1) : value;
}

function parseCondition(expression: string): Filter {
  const groupMatch = /^(and|or)\(([\s\S]*)\)$/.exec(expression);

  if (groupMatch) {
    return {
      kind: groupMatch[1] as "and" | "or",
      filters: splitTopLevel(groupMatch[2]).map(parseCondition),
    };
  }

  const firstDot = expression.indexOf(".");
  const secondDot = expression.indexOf(".", firstDot + 1);

  if (firstDot < 0 || secondDot < 0) {
    throw new Error(`Unsupported filter expression "${expression}".`);
  }

  const column = expression.slice(0, firstDot);
  let operator = expression.slice(firstDot + 1, secondDot);
  let rawValue = expression.slice(secondDot + 1);
  let negate = false;

  if (operator === "not") {
    negate = true;
    const nextDot = rawValue.indexOf(".");
    operator = rawValue.slice(0, nextDot);
    rawValue = rawValue.slice(nextDot + 1);
  }

  let value: unknown = rawValue;

  if (operator === "in") {
    value = splitTopLevel(rawValue.replace(/^\(/, "").replace(/\)$/, "")).map(stripQuotes);
  } else if (operator === "like" || operator === "ilike") {
    // PostgREST accepts * as a URL-safe alias for %.
    value = rawValue.replace(/\*/g, "%");
  } else if (operator === "is") {
    value = rawValue === "null" ? null : rawValue === "true" ? true : rawValue === "false" ? false : rawValue;
  } else {
    value = stripQuotes(rawValue);
  }

  const condition: Filter = { kind: "condition", column, operator: operator as FilterOperator, value };

  return negate ? { kind: "not", filter: condition } : condition;
}

export function parseOrFilter(expression: string): Filter {
  return { kind: "or", filters: splitTopLevel(expression).map(parseCondition) };
}

// ---------------------------------------------------------------------------
// Ordering with Postgres null placement (nulls last ascending, first descending).
// ---------------------------------------------------------------------------

export type Ordering = { column: string; ascending: boolean; nullsFirst: boolean };

export function compareRows(left: Row, right: Row, orderings: Ordering[]) {
  for (const { column, ascending, nullsFirst } of orderings) {
    const a = readColumn(left, column);
    const b = readColumn(right, column);

    if (a == null && b == null) continue;
    if (a == null) return nullsFirst ? -1 : 1;
    if (b == null) return nullsFirst ? 1 : -1;

    let result: number;

    if (typeof a === "number" && typeof b === "number") {
      result = a - b;
    } else if (typeof a === "boolean" && typeof b === "boolean") {
      result = Number(a) - Number(b);
    } else {
      result = String(a).localeCompare(String(b));
    }

    if (result !== 0) {
      return ascending ? result : -result;
    }
  }

  return 0;
}
