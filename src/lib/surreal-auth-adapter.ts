// @ts-nocheck
import { createAdapterFactory, type DBAdapterDebugLogOption } from "better-auth/adapters";
import { jsonify, StringRecordId } from "surrealdb";
import { Surreal } from "surrealdb";

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

export const surrealAdapter = (config: SurrealAdapterConfig) => {
  const connectionStates = getConnectionStates();
  const connectionKey = getConnectionKey(config);
  const existingState = connectionStates.get(connectionKey);

  if (!existingState) {
    connectionStates.set(connectionKey, {
      db: null,
      connecting: null,
    });
  }

  const state = connectionStates.get(connectionKey)!;

  const ensureConnection = async (): Promise<Surreal> => {
    if (state.db) {
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

      state.db = nextDb;
      state.connecting = null;
      return nextDb;
    })().catch((error) => {
      state.connecting = null;
      throw error;
    });

    return state.connecting;
  };

    const isRecordIdString = (value: string): boolean => {
        const recordIdPattern = /^[a-zA-Z_][a-zA-Z0-9_]*:[a-zA-Z0-9_\-⟨⟩]+$/;
        return recordIdPattern.test(value);
    };

    const nonRecordIdFields = new Set(["accountId", "providerId"]);

    const createSerializationFunctions = (recordIdFieldsMap: Map<string, Set<string>>) => {
        const isRecordIdField = (field: string, model?: string): boolean => {
            if (field === "id") return true;
            if (nonRecordIdFields.has(field)) return false;
            if (model && recordIdFieldsMap.has(model)) {
                return recordIdFieldsMap.get(model)!.has(field);
            }
            return field.endsWith("Id");
        };

        const serializeValue = (value: unknown, field?: string, model?: string): string => {
            if (value === undefined || value === null) {
                return "NONE";
            }
            if (typeof value === "string") {
                if (field && isRecordIdField(field, model) && isRecordIdString(value)) {
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
                return `[${value.map(v => serializeValue(v, field, model)).join(", ")}]`;
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
            model?: string
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
                            return `${field} = ${serializeValue(value, field, model)}`;
                        case "ne":
                            return `${field} != ${serializeValue(value, field, model)}`;
                        case "gt":
                            return `${field} > ${serializeValue(value, field, model)}`;
                        case "gte":
                            return `${field} >= ${serializeValue(value, field, model)}`;
                        case "lt":
                            return `${field} < ${serializeValue(value, field, model)}`;
                        case "lte":
                            return `${field} <= ${serializeValue(value, field, model)}`;
                        case "in":
                            return `${field} IN ${serializeValue(value, field, model)}`;
                        case "contains":
                            return `${field} CONTAINS ${serializeValue(value, field, model)}`;
                        case "starts_with":
                            return `string::starts_with(${field}, ${serializeValue(value, field, model)})`;
                        case "ends_with":
                            return `string::ends_with(${field}, ${serializeValue(value, field, model)})`;
                        default:
                            return `${field} = ${serializeValue(value, field, model)}`;
                    }
                })
                .join(" AND ");
        };

        return { isRecordIdField, serializeValue, buildWhereClause };
    };

    const createTransformValueForDB = (isRecordIdField: (field: string, model?: string) => boolean) => {
        return (field: string, value: unknown, model?: string): unknown => {
            if (value === undefined || value === null) {
                return value;
            }

            if (typeof value === "string" && isRecordIdField(field, model) && field !== "id") {
                const refModel = field.slice(0, -2);
                if (!value.includes(":")) {
                    return new StringRecordId(`${refModel}:${value}`);
                }
                return new StringRecordId(value);
            }

            return value;
        };
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
        adapter: (({ debugLog, schema }) => {
            const recordIdFieldsMap = new Map<string, Set<string>>();

            if (schema) {
                for (const [modelName, modelDef] of Object.entries(schema)) {
                    const recordIdFields = new Set<string>(["id"]);
                    const fields = (modelDef as { fields?: Record<string, { references?: { model: string } }> }).fields;
                    if (fields) {
                        for (const [fieldName, fieldDef] of Object.entries(fields)) {
                            if (fieldDef.references?.model) {
                                recordIdFields.add(fieldName);
                            }
                        }
                    }
                    recordIdFieldsMap.set(modelName, recordIdFields);
                }
            }

            const { isRecordIdField, buildWhereClause } = createSerializationFunctions(recordIdFieldsMap);
            const transformValueForDB = createTransformValueForDB(isRecordIdField);

            return {
                create: async ({ model, data }) => {
                    const conn = await ensureConnection();

                    const transformedData: Record<string, unknown> = {};
                    for (const [key, value] of Object.entries(data)) {
                        transformedData[key] = transformValueForDB(key, value, model);
                    }

                    debugLog?.("create", { model, data: transformedData });

                    const [result] = await conn.create(model, transformedData);

                    if (!result) {
                        throw new SurrealDBError("Failed to create record");
                    }

                    const output: Record<string, unknown> = {};
                    for (const [key, value] of Object.entries(result)) {
                        output[key] = jsonify(value);
                    }

                    return output;
                },

                findOne: async ({ model, where }) => {
                    const conn = await ensureConnection();
                    const whereClause = buildWhereClause(where, model);

                    const query = `SELECT * FROM ${model} WHERE ${whereClause} LIMIT 1`;
                    debugLog?.("findOne", { model, query });

                    const [results] = await conn.query<[Record<string, unknown>[]]>(query);
                    const record = results?.[0];

                    if (!record) {
                        return null;
                    }

                    const output: Record<string, unknown> = {};
                    for (const [key, value] of Object.entries(record)) {
                        output[key] = jsonify(value);
                    }

                    return output;
                },

                findMany: async ({ model, where, limit, offset, sortBy }) => {
                    const conn = await ensureConnection();

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

                    const [results] = await conn.query<[Record<string, unknown>[]]>(query);

                    return (results || []).map((record) => {
                        const output: Record<string, unknown> = {};
                        for (const [key, value] of Object.entries(record)) {
                            output[key] = jsonify(value);
                        }
                        return output;
                    });
                },

                update: async ({ model, where, update }) => {
                    const conn = await ensureConnection();
                    const whereClause = buildWhereClause(where, model);

                    const transformedUpdate: Record<string, unknown> = {};
                    for (const [key, value] of Object.entries(update as Record<string, unknown>)) {
                        transformedUpdate[key] = transformValueForDB(key, value, model);
                    }

                    const query = `UPDATE ${model} MERGE $data WHERE ${whereClause}`;
                    debugLog?.("update", { model, query, data: transformedUpdate });

                    const [results] = await conn.query<[Record<string, unknown>[]]>(query, {
                        data: transformedUpdate,
                    });

                    const record = results?.[0];

                    if (!record) {
                        throw new SurrealDBError("Failed to update record");
                    }

                    const output: Record<string, unknown> = {};
                    for (const [key, value] of Object.entries(record)) {
                        output[key] = jsonify(value);
                    }

                    return output;
                },

                updateMany: async ({ model, where, update }) => {
                    const conn = await ensureConnection();
                    const whereClause = buildWhereClause(where, model);

                    const transformedUpdate: Record<string, unknown> = {};
                    for (const [key, value] of Object.entries(update)) {
                        transformedUpdate[key] = transformValueForDB(key, value, model);
                    }

                    const query = `UPDATE ${model} MERGE $data WHERE ${whereClause}`;
                    debugLog?.("updateMany", { model, query, data: transformedUpdate });

                    const [results] = await conn.query<[Record<string, unknown>[]]>(query, {
                        data: transformedUpdate,
                    });

                    return results?.length || 0;
                },

                delete: async ({ model, where }) => {
                    const conn = await ensureConnection();
                    const whereClause = buildWhereClause(where, model);

                    const query = `DELETE FROM ${model} WHERE ${whereClause}`;
                    debugLog?.("delete", { model, query });

                    await conn.query(query);
                },

                deleteMany: async ({ model, where }) => {
                    const conn = await ensureConnection();
                    const whereClause = buildWhereClause(where, model);

                    const query = `DELETE FROM ${model} WHERE ${whereClause}`;
                    debugLog?.("deleteMany", { model, query });

                    const [results] = await conn.query<[Record<string, unknown>[]]>(query);
                    return results?.length || 0;
                },

                count: async ({ model, where }) => {
                    const conn = await ensureConnection();

                    let query: string;
                    if (where && where.length > 0) {
                        const whereClause = buildWhereClause(where, model);
                        query = `SELECT count() FROM ${model} WHERE ${whereClause} GROUP ALL`;
                    } else {
                        query = `SELECT count() FROM ${model} GROUP ALL`;
                    }

                    debugLog?.("count", { model, query });

                    const [results] = await conn.query<[Array<{ count: number }>]>(query);
                    return results?.[0]?.count || 0;
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
