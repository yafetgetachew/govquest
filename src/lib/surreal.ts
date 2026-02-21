import "server-only";

import { Surreal } from "surrealdb";

declare global {
  var surrealClientSingleton: Promise<Surreal> | undefined;
}

async function createClient(): Promise<Surreal> {
  const db = new Surreal();

  await db.connect(process.env.SURREALDB_URL ?? "http://127.0.0.1:8000/rpc");

  await db.signin({
    username: process.env.SURREALDB_USER ?? "root",
    password: process.env.SURREALDB_PASS ?? "root",
  });

  await db.use({
    namespace: process.env.SURREALDB_NS ?? "govquest",
    database: process.env.SURREALDB_DB ?? "app",
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
