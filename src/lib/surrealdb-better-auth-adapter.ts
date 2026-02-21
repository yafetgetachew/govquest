import "server-only";

interface SurrealAdapterOptions {
  address: string;
  username: string;
  password: string;
  ns: string;
  db: string;
}

type SurrealAdapterFactory = (options: SurrealAdapterOptions) => unknown;

export function createSurrealAdapter(options: SurrealAdapterOptions): unknown {
  const runtime = require("surrealdb-better-auth") as {
    surrealAdapter?: SurrealAdapterFactory;
  };

  if (typeof runtime.surrealAdapter !== "function") {
    throw new Error("surrealdb-better-auth did not expose surrealAdapter");
  }

  return runtime.surrealAdapter(options);
}
