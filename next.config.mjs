import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: rootDir,
  onDemandEntries: {
    maxInactiveAge: 60 * 60 * 1000,
    pagesBufferLength: 20,
  },
  turbopack: {
    root: rootDir,
  },
};

export default nextConfig;
