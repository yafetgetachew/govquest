import "server-only";

import { Surreal } from "surrealdb";

const isProduction = process.env.NODE_ENV === "production";
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
const isStrictProductionRuntime = isProduction && !isBuildPhase;
const TOKEN_EXPIRED_PATTERN = /token has expired/i;
const DEFAULT_CLIENT_MAX_AGE_SECONDS = 45 * 60;
const CLIENT_MAX_AGE_MS = toPositiveInt(
  process.env.SURREALDB_CLIENT_MAX_AGE_SECONDS,
  DEFAULT_CLIENT_MAX_AGE_SECONDS,
) * 1000;
const RETRIABLE_METHODS = new Set<PropertyKey>([
  "query",
  "create",
  "update",
  "merge",
  "delete",
  "select",
  "insert",
  "relate",
]);

interface SurrealConnectionConfig {
  url: string;
  user: string;
  pass: string;
  namespace: string;
  database: string;
}

declare global {
  var surrealClientSingleton: Promise<Surreal> | undefined;
  var surrealClientCreatedAt: number | undefined;
}

async function createClient(): Promise<Surreal> {
  const db = new Surreal();
  const connectionConfig: SurrealConnectionConfig = {
    url: process.env.SURREALDB_URL ?? "http://127.0.0.1:8000/rpc",
    user: resolveRequiredEnv("SURREALDB_USER", isStrictProductionRuntime ? undefined : "root"),
    pass: resolveRequiredEnv("SURREALDB_PASS", isStrictProductionRuntime ? undefined : "root"),
    namespace: process.env.SURREALDB_NS ?? "govquest",
    database: process.env.SURREALDB_DB ?? "app",
  };

  await db.connect(connectionConfig.url);
  await authenticate(db, connectionConfig);

  return createResilientClient(db, connectionConfig);
}

export async function getSurrealClient(): Promise<Surreal> {
  const now = Date.now();
  const shouldRotate =
    typeof global.surrealClientCreatedAt === "number" &&
    now - global.surrealClientCreatedAt >= CLIENT_MAX_AGE_MS;

  if (!global.surrealClientSingleton || shouldRotate) {
    global.surrealClientCreatedAt = now;
    global.surrealClientSingleton = createClient().catch((error: unknown) => {
      global.surrealClientSingleton = undefined;
      global.surrealClientCreatedAt = undefined;
      throw error;
    });
  }

  return global.surrealClientSingleton;
}

function createResilientClient(db: Surreal, connectionConfig: SurrealConnectionConfig): Surreal {
  return new Proxy(db, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") {
        return value;
      }

      const method = value.bind(target) as (...args: unknown[]) => Promise<unknown>;
      if (!RETRIABLE_METHODS.has(property)) {
        return method;
      }

      return async (...args: unknown[]) => {
        try {
          return await method(...args);
        } catch (error) {
          if (!isTokenExpiredError(error)) {
            throw error;
          }

          global.surrealClientSingleton = undefined;
          global.surrealClientCreatedAt = undefined;
          const refreshedClient = await getSurrealClient();
          const refreshedMethod = Reflect.get(refreshedClient, property);

          if (typeof refreshedMethod !== "function") {
            throw error;
          }

          return refreshedMethod.apply(refreshedClient, args);
        }
      };
    },
  }) as Surreal;
}

async function authenticate(db: Surreal, connectionConfig: SurrealConnectionConfig): Promise<void> {
  await db.signin({
    username: connectionConfig.user,
    password: connectionConfig.pass,
  });

  await db.use({
    namespace: connectionConfig.namespace,
    database: connectionConfig.database,
  });
}

function isTokenExpiredError(error: unknown): boolean {
  return TOKEN_EXPIRED_PATTERN.test(getErrorMessage(error));
}

function resolveRequiredEnv(name: string, fallback?: string): string {
  const configured = process.env[name]?.trim();

  if (configured && configured.length > 0) {
    return configured;
  }

  if (fallback && fallback.length > 0) {
    return fallback;
  }

  throw new Error(`${name} must be set${isStrictProductionRuntime ? " in production" : ""}.`);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : "";
  }

  return "";
}

function toPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}
