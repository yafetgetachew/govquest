import "server-only";

import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { surrealAdapter } from "@/lib/surreal-auth-adapter";

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

export const auth = betterAuth({
  database: surrealAdapter({
    address: process.env.SURREALDB_URL ?? "http://127.0.0.1:8000/rpc",
    username: process.env.SURREALDB_USER ?? "root",
    password: process.env.SURREALDB_PASS ?? "root",
    ns: process.env.SURREALDB_NS ?? "govquest",
    db: process.env.SURREALDB_DB ?? "app",
  }),
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret:
    process.env.BETTER_AUTH_SECRET ??
    "8fH6Qz3mVv2pL1rNs9xYt4cKb7dW5eUa0JmR2nT8sP6qX1vB",
  emailAndPassword: {
    enabled: true,
  },
  socialProviders:
    googleClientId && googleClientSecret
      ? {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          },
        }
      : {},
  plugins: [nextCookies()],
});
