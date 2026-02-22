import "server-only";

import { Surreal } from "surrealdb";

const isProduction = process.env.NODE_ENV === "production";
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
const isStrictProductionRuntime = isProduction && !isBuildPhase;

declare global {
  var surrealClientSingleton: Promise<Surreal> | undefined;
}

async function createClient(): Promise<Surreal> {
  const db = new Surreal();
  const surrealUrl = process.env.SURREALDB_URL ?? "http://127.0.0.1:8000/rpc";
  const surrealUser = resolveRequiredEnv("SURREALDB_USER", isStrictProductionRuntime ? undefined : "root");
  const surrealPass = resolveRequiredEnv("SURREALDB_PASS", isStrictProductionRuntime ? undefined : "root");
  const surrealNamespace = process.env.SURREALDB_NS ?? "govquest";
  const surrealDatabase = process.env.SURREALDB_DB ?? "app";

  await db.connect(surrealUrl);

  await db.signin({
    username: surrealUser,
    password: surrealPass,
  });

  await db.use({
    namespace: surrealNamespace,
    database: surrealDatabase,
  });

  return db;
}

export async function getSurrealClient(): Promise<Surreal> {
  if (!global.surrealClientSingleton) {
    global.surrealClientSingleton = createClient().catch((error: unknown) => {
      global.surrealClientSingleton = undefined;
      throw error;
    });
  }

  return global.surrealClientSingleton;
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
