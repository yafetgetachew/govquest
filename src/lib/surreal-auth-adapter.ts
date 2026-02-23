// @ts-nocheck
import { createAdapterFactory, type DBAdapterDebugLogOption } from "better-auth/adapters";
import { jsonify } from "surrealdb";
import { Surreal } from "surrealdb";

const TOKEN_EXPIRED_PATTERN = /token has expired/i;

export interface SurrealAdapterConfig {
  address: string;
  username: string;
  password: string;
  ns: string;
  db: string;
  debugLogs?: DBAdapterDebugLogOption;
  usePlural?: boolean;
}

interface ConnectionState {
  db: Surreal | null;
  connecting: Promise<Surreal> | null;
  normalized: boolean;
}

declare global {
  var govquestAuthConnectionStates: Map<string, ConnectionState> | undefined;
}

function getConnectionStates(): Map<string, ConnectionState> {
  if (!global.govquestAuthConnectionStates) {
    global.govquestAuthConnectionStates = new Map<string, ConnectionState>();
  }

  return global.govquestAuthConnectionStates;
}

function getConnectionKey(config: SurrealAdapterConfig): string {
  return `${config.address}|${config.ns}|${config.db}|${config.username}`;
}

function normalizeJsonValue(value: unknown): unknown {
  const normalized = jsonify(value);

  if (
    normalized &&
    typeof normalized === "object" &&
    "rid" in normalized &&
    typeof (normalized as { rid?: unknown }).rid === "string"
  ) {
    return (normalized as { rid: string }).rid;
  }

  return normalized;
}

function isTokenExpiredError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return TOKEN_EXPIRED_PATTERN.test(error.message);
}

async function normalizeAuthReferenceRows(db: Surreal): Promise<void> {
  await db.query(`
    UPDATE account
      SET userId = userId.rid
      WHERE userId != NONE
        AND userId.rid != NONE;

    UPDATE session
      SET userId = userId.rid
      WHERE userId != NONE
        AND userId.rid != NONE;

    UPDATE account
      SET userId = string::concat('', userId)
      WHERE userId != NONE
        AND userId.rid = NONE;

    UPDATE session
      SET userId = string::concat('', userId)
      WHERE userId != NONE
        AND userId.rid = NONE;
  `);
}

export const surrealAdapter = (config: SurrealAdapterConfig) => {
  const connectionStates = getConnectionStates();
  const connectionKey = getConnectionKey(config);
  const existingState = connectionStates.get(connectionKey);

  if (!existingState) {
    connectionStates.set(connectionKey, {
      db: null,
      connecting: null,
      normalized: false,
    });
  }

  const state = connectionStates.get(connectionKey)!;

  const resetConnectionState = async (): Promise<void> => {
    if (state.db) {
      try {
        await state.db.close();
      } catch {
      }
    }

    state.db = null;
    state.connecting = null;
    state.normalized = false;
  };

  const ensureConnection = async (): Promise<Surreal> => {
    if (state.db) {
      if (!state.normalized) {
        try {
          await normalizeAuthReferenceRows(state.db);
        } catch {
        } finally {
          state.normalized = true;
        }
      }
      return state.db;
    }

    if (state.connecting) {
      return state.connecting;
    }

    state.connecting = (async () => {
      const nextDb = new Surreal();
      await nextDb.connect(config.address, {
        namespace: config.ns,
        database: config.db,
        auth: {
          username: config.username,
          password: config.password,
        },
      });

      try {
        await normalizeAuthReferenceRows(nextDb);
      } catch {
      } finally {
        state.normalized = true;
      }

      state.db = nextDb;
      state.connecting = null;
      return nextDb;
    })().catch((error) => {
      state.connecting = null;
      throw error;
    });

    return state.connecting;
  };

  const executeWithConnectionRetry = async <T>(
    operation: (connection: Surreal) => Promise<T>,
  ): Promise<T> => {
    const connection = await ensureConnection();

    try {
      return await operation(connection);
    } catch (error) {
      if (!isTokenExpiredError(error)) {
        throw error;
      }

      await resetConnectionState();
      const refreshedConnection = await ensureConnection();
      return operation(refreshedConnection);
    }
  };

    const isRecordIdString = (value: string): boolean => {
        const recordIdPattern = /^[a-zA-Z_][a-zA-Z0-9_]*:[a-zA-Z0-9_\-⟨⟩]+$/;
        return recordIdPattern.test(value);
    };

    const createSerializationFunctions = () => {
        const isRecordIdField = (field: string): boolean => field === "id";

        const serializeValue = (value: unknown, field?: string): string => {
            if (value === undefined || value === null) {
                return "NONE";
            }
            if (typeof value === "string") {
                if (field && isRecordIdField(field) && isRecordIdString(value)) {
                    return value;
                }
                return JSON.stringify(value);
            }
            if (typeof value === "number" || typeof value === "boolean") {
                return String(value);
            }
            if (value instanceof Date) {
                return `d"${value.toISOString()}"`;
            }
            if (Array.isArray(value)) {
                return `[${value.map(v => serializeValue(v, field)).join(", ")}]`;
            }
            if (typeof value === "object" && value !== null) {
                if ("tb" in value) {
                    return jsonify(value as Record<string, unknown>);
                }
                return JSON.stringify(value);
            }
            return JSON.stringify(value);
        };

        const buildWhereClause = (
            where: Array<{ field: string; value: unknown; operator?: string }>,
            _model?: string
        ): string => {
            if (!where || where.length === 0) return "";

            return where
                .map((clause) => {
                    const field = clause.field;
                    const value = clause.value;
                    const operator = clause.operator || "eq";

                    if (value === undefined || value === null) {
                        return `${field} = NONE`;
                    }

                    switch (operator) {
                        case "eq":
                            return `${field} = ${serializeValue(value, field)}`;
                        case "ne":
                            return `${field} != ${serializeValue(value, field)}`;
                        case "gt":
                            return `${field} > ${serializeValue(value, field)}`;
                        case "gte":
                            return `${field} >= ${serializeValue(value, field)}`;
                        case "lt":
                            return `${field} < ${serializeValue(value, field)}`;
                        case "lte":
                            return `${field} <= ${serializeValue(value, field)}`;
                        case "in":
                            return `${field} IN ${serializeValue(value, field)}`;
                        case "contains":
                            return `${field} CONTAINS ${serializeValue(value, field)}`;
                        case "starts_with":
                            return `string::starts_with(${field}, ${serializeValue(value, field)})`;
                        case "ends_with":
                            return `string::ends_with(${field}, ${serializeValue(value, field)})`;
                        default:
                            return `${field} = ${serializeValue(value, field)}`;
                    }
                })
                .join(" AND ");
        };

        return { buildWhereClause };
    };

    const createTransformValueForDB = () => {
        return (_field: string, value: unknown): unknown => value;
    };

    return createAdapterFactory({
        config: {
            adapterId: "surrealdb",
            adapterName: "SurrealDB",
            debugLogs: config.debugLogs ?? false,
            usePlural: config.usePlural ?? false,
            supportsJSON: true,
            supportsDates: true,
            supportsBooleans: true,
            supportsNumericIds: false,
        },
        adapter: (({ debugLog }) => {
            const { buildWhereClause } = createSerializationFunctions();
            const transformValueForDB = createTransformValueForDB();

            return {
                create: async ({ model, data }) => {
                    const transformedData: Record<string, unknown> = {};
                    for (const [key, value] of Object.entries(data)) {
                        transformedData[key] = transformValueForDB(key, value, model);
                    }

                    debugLog?.("create", { model, data: transformedData });

                    return executeWithConnectionRetry(async (conn) => {
                        const [result] = await conn.create(model, transformedData);

                        if (!result) {
                            throw new SurrealDBError("Failed to create record");
                        }

                        const output: Record<string, unknown> = {};
                        for (const [key, value] of Object.entries(result)) {
                            output[key] = normalizeJsonValue(value);
                        }

                        return output;
                    });
                },

                findOne: async ({ model, where }) => {
                    const whereClause = buildWhereClause(where, model);

                    const query = `SELECT * FROM ${model} WHERE ${whereClause} LIMIT 1`;
                    debugLog?.("findOne", { model, query });

                    return executeWithConnectionRetry(async (conn) => {
                        const [results] = await conn.query<[Record<string, unknown>[]]>(query);
                        const record = results?.[0];

                        if (!record) {
                            return null;
                        }

                        const output: Record<string, unknown> = {};
                        for (const [key, value] of Object.entries(record)) {
                            output[key] = normalizeJsonValue(value);
                        }

                        return output;
                    });
                },

                findMany: async ({ model, where, limit, offset, sortBy }) => {
                    let query = `SELECT * FROM ${model}`;

                    if (where && where.length > 0) {
                        const whereClause = buildWhereClause(where, model);
                        query += ` WHERE ${whereClause}`;
                    }

                    if (sortBy) {
                        query += ` ORDER BY ${sortBy.field} ${sortBy.direction.toUpperCase()}`;
                    }

                    if (limit !== undefined) {
                        query += ` LIMIT ${limit}`;
                    }

                    if (offset !== undefined) {
                        query += ` START ${offset}`;
                    }

                    debugLog?.("findMany", { model, query });

                    return executeWithConnectionRetry(async (conn) => {
                        const [results] = await conn.query<[Record<string, unknown>[]]>(query);

                        return (results || []).map((record) => {
                            const output: Record<string, unknown> = {};
                            for (const [key, value] of Object.entries(record)) {
                                output[key] = normalizeJsonValue(value);
                            }
                            return output;
                        });
                    });
                },

                update: async ({ model, where, update }) => {
                    const whereClause = buildWhereClause(where, model);

                    const transformedUpdate: Record<string, unknown> = {};
                    for (const [key, value] of Object.entries(update as Record<string, unknown>)) {
                        transformedUpdate[key] = transformValueForDB(key, value, model);
                    }

                    const query = `UPDATE ${model} MERGE $data WHERE ${whereClause}`;
                    debugLog?.("update", { model, query, data: transformedUpdate });

                    return executeWithConnectionRetry(async (conn) => {
                        const [results] = await conn.query<[Record<string, unknown>[]]>(query, {
                            data: transformedUpdate,
                        });

                        const record = results?.[0];

                        if (!record) {
                            throw new SurrealDBError("Failed to update record");
                        }

                        const output: Record<string, unknown> = {};
                        for (const [key, value] of Object.entries(record)) {
                            output[key] = normalizeJsonValue(value);
                        }

                        return output;
                    });
                },

                updateMany: async ({ model, where, update }) => {
                    const whereClause = buildWhereClause(where, model);

                    const transformedUpdate: Record<string, unknown> = {};
                    for (const [key, value] of Object.entries(update)) {
                        transformedUpdate[key] = transformValueForDB(key, value, model);
                    }

                    const query = `UPDATE ${model} MERGE $data WHERE ${whereClause}`;
                    debugLog?.("updateMany", { model, query, data: transformedUpdate });

                    return executeWithConnectionRetry(async (conn) => {
                        const [results] = await conn.query<[Record<string, unknown>[]]>(query, {
                            data: transformedUpdate,
                        });

                        return results?.length || 0;
                    });
                },

                delete: async ({ model, where }) => {
                    const whereClause = buildWhereClause(where, model);

                    const query = `DELETE FROM ${model} WHERE ${whereClause}`;
                    debugLog?.("delete", { model, query });

                    await executeWithConnectionRetry(async (conn) => {
                        await conn.query(query);
                    });
                },

                deleteMany: async ({ model, where }) => {
                    const whereClause = buildWhereClause(where, model);

                    const query = `DELETE FROM ${model} WHERE ${whereClause}`;
                    debugLog?.("deleteMany", { model, query });

                    return executeWithConnectionRetry(async (conn) => {
                        const [results] = await conn.query<[Record<string, unknown>[]]>(query);
                        return results?.length || 0;
                    });
                },

                count: async ({ model, where }) => {
                    let query: string;
                    if (where && where.length > 0) {
                        const whereClause = buildWhereClause(where, model);
                        query = `SELECT count() FROM ${model} WHERE ${whereClause} GROUP ALL`;
                    } else {
                        query = `SELECT count() FROM ${model} GROUP ALL`;
                    }

                    debugLog?.("count", { model, query });

                    return executeWithConnectionRetry(async (conn) => {
                        const [results] = await conn.query<[Array<{ count: number }>]>(query);
                        return results?.[0]?.count || 0;
                    });
                },

                options: config,
            };
        }) as any,
    });
};

export class SurrealDBError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SurrealDBError";
    }
}

export { SurrealDBError as SurrealDBQueryError };
