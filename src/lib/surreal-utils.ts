export function queryResult<T>(response: unknown, statementIndex = 0): T {
  if (!Array.isArray(response)) {
    return response as T;
  }

  const statement = response[statementIndex] as unknown;

  if (statement && typeof statement === "object" && "result" in statement) {
    return (statement as { result: T }).result;
  }

  return statement as T;
}

export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function toRecordId(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  const record = value as Record<string, unknown>;

  const table = pickString(record.tb) ?? pickString(record.table);

  if (table) {
    const key = normalizeRecordKey(record.id);
    return key ? `${table}:${key}` : table;
  }

  const nestedId = record.id;
  if (nestedId !== undefined) {
    const nestedRecordId = toRecordId(nestedId);
    if (nestedRecordId) {
      return nestedRecordId;
    }
  }

  const maybeString = safeToString(value);
  return maybeString ?? "";
}

export function toRecordKey(recordId: string): string {
  const separatorIndex = recordId.indexOf(":");

  if (separatorIndex === -1) {
    return recordId;
  }

  return recordId.slice(separatorIndex + 1);
}

export function stripTablePrefix(value: string, table: string): string {
  let normalized = value.trim();
  const prefix = `${table}:`;

  while (normalized.startsWith(prefix)) {
    normalized = normalized.slice(prefix.length);
  }

  return normalized;
}

export function isSafeRecordKey(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

export function toSafeInt(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  const parsed = Number.parseInt(String(value ?? 0), 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function pickString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function safeToString(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const toString = (value as { toString?: () => string }).toString;
  if (typeof toString !== "function") {
    return null;
  }

  const stringValue = toString.call(value);
  if (!stringValue || stringValue === "[object Object]") {
    return null;
  }

  return stringValue;
}

function normalizeRecordKey(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  const record = value as Record<string, unknown>;

  if ("value" in record) {
    return normalizeRecordKey(record.value);
  }

  if ("id" in record) {
    const fromId = normalizeRecordKey(record.id);
    if (fromId) {
      return fromId;
    }
  }

  return safeToString(value) ?? "";
}
