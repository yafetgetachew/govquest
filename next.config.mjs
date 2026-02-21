import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  output: "standalone",
  transpilePackages: ["surrealdb-better-auth"],
  outputFileTracingRoot: rootDir,
  turbopack: {
    root: rootDir,
  },
};

export default nextConfig;
