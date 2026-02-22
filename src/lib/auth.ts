import "server-only";

import { randomBytes } from "node:crypto";
import nodemailer from "nodemailer";

import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";

import { surrealAdapter } from "@/lib/surreal-auth-adapter";

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const isProduction = process.env.NODE_ENV === "production";
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
const isStrictProductionRuntime = isProduction && !isBuildPhase;
const surrealAddress = process.env.SURREALDB_URL ?? "http://127.0.0.1:8000/rpc";
const surrealNamespace = process.env.SURREALDB_NS ?? "govquest";
const surrealDatabase = process.env.SURREALDB_DB ?? "app";
const surrealUsername = resolveRequiredEnv("SURREALDB_USER", isStrictProductionRuntime ? undefined : "root");
const surrealPassword = resolveRequiredEnv("SURREALDB_PASS", isStrictProductionRuntime ? undefined : "root");

declare global {
  var govquestDevAuthSecret: string | undefined;
}

const authSecret = resolveAuthSecret();
const betterAuthBaseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const trustedOrigins = resolveTrustedOrigins();
const requireEmailVerification =
  parseBoolean(process.env.BETTER_AUTH_REQUIRE_EMAIL_VERIFICATION) ?? isStrictProductionRuntime;
const rateLimitWindow = toPositiveInt(process.env.BETTER_AUTH_RATE_LIMIT_WINDOW, 60);
const rateLimitMax = toPositiveInt(process.env.BETTER_AUTH_RATE_LIMIT_MAX, 100);

if (isStrictProductionRuntime && requireEmailVerification && !process.env.SMTP_HOST) {
  throw new Error(
    "SMTP_HOST is required when BETTER_AUTH_REQUIRE_EMAIL_VERIFICATION is enabled.",
  );
}

export const auth = betterAuth({
  database: surrealAdapter({
    address: surrealAddress,
    username: surrealUsername,
    password: surrealPassword,
    ns: surrealNamespace,
    db: surrealDatabase,
  }),
  baseURL: betterAuthBaseUrl,
  secret: authSecret,
  trustedOrigins,
  rateLimit: {
    enabled: true,
    window: rateLimitWindow,
    max: rateLimitMax,
    storage: "database",
  },
  advanced: {
    useSecureCookies: isProduction,
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendAuthEmail({
        to: user.email,
        subject: "Verify your GovQuest email",
        text: [
          "Welcome to GovQuest.",
          "",
          "Verify your email to secure your account:",
          url,
        ].join("\n"),
      });
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendAuthEmail({
        to: user.email,
        subject: "Reset your GovQuest password",
        text: [
          "We received a request to reset your password.",
          "",
          "Reset link:",
          url,
        ].join("\n"),
      });
    },
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

function resolveAuthSecret(): string {
  const configuredSecret = process.env.BETTER_AUTH_SECRET?.trim();

  if (configuredSecret && configuredSecret.length >= 32) {
    return configuredSecret;
  }

  if (isStrictProductionRuntime) {
    throw new Error(
      "BETTER_AUTH_SECRET must be set to a random 32+ character value in production.",
    );
  }

  if (!global.govquestDevAuthSecret) {
    global.govquestDevAuthSecret = randomBytes(32).toString("hex");
  }

  return global.govquestDevAuthSecret;
}

function resolveTrustedOrigins(): string[] {
  const configuredOrigins = (process.env.TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  const defaults = [
    process.env.BETTER_AUTH_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    !isProduction ? "http://localhost:3000" : undefined,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value && value.length > 0));

  return Array.from(new Set([...configuredOrigins, ...defaults]));
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

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return undefined;
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

async function sendAuthEmail({
  to,
  subject,
  text,
}: {
  to: string;
  subject: string;
  text: string;
}) {
  const host = process.env.SMTP_HOST;

  if (!host) {
    if (isStrictProductionRuntime) {
      throw new Error("SMTP_HOST is required for Better Auth email flows in production.");
    }

    return;
  }

  const port = toPositiveInt(process.env.SMTP_PORT, 587);
  const secure = process.env.SMTP_SECURE === "true";
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: smtpUser
      ? {
          user: smtpUser,
          pass: smtpPass,
        }
      : undefined,
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? "GovQuest <no-reply@example.com>",
    to,
    subject,
    text,
  });
}
