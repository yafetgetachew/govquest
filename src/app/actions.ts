"use server";

import nodemailer from "nodemailer";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { getSurrealClient } from "@/lib/surreal";
import {
  asArray,
  isSafeRecordKey,
  queryResult,
  stripTablePrefix,
  toRecordId,
  toSafeInt,
} from "@/lib/surreal-utils";
import type { TaskState } from "@/lib/types";

const TIP_MAX_LENGTH = 1200;
const FEEDBACK_MAX_LENGTH = 2000;
const ALLOWED_TASK_STATES = new Set<TaskState>([
  "none",
  "half",
  "done",
  "not_necessary",
  "denied",
]);

export type VoteDirection = "upvote" | "downvote";

export interface VoteActionResult {
  ok: boolean;
  status: "applied" | "removed" | "switched" | "invalid" | "unauthenticated" | "error";
  message: string;
  tipKey?: string;
  direction?: VoteDirection;
  currentVote?: VoteDirection | null;
  upvotes?: number;
  downvotes?: number;
}

async function getCurrentUserId(): Promise<string | null> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

async function ensureStartedRelation(
  userRecordId: string,
  processRecordId: string,
): Promise<{ db: Awaited<ReturnType<typeof getSurrealClient>>; startedRecordId: string }> {
  const db = await getSurrealClient();

  const existingRows = asArray<Record<string, unknown>>(
    queryResult<unknown>(
      await db.query(
        `
          SELECT id
          FROM started
          WHERE in = ${userRecordId}
            AND out = ${processRecordId}
          LIMIT 1;
        `,
      ),
      0,
    ),
  );

  const existingRecordId = toRecordId(existingRows[0]?.id);
  if (existingRecordId) {
    return { db, startedRecordId: existingRecordId };
  }

  const relatedRows = asArray<Record<string, unknown>>(
    queryResult<unknown>(
      await db.query(
        `
          RELATE ${userRecordId}->started->${processRecordId}
          SET created_at = time::now(),
              active = true,
              manual_task_state = {},
              progress_percent = 0,
              resolved_count = 0,
              completed_count = 0,
              total_count = 0,
              completion_points = 0,
              completed = false,
              completed_at = NONE,
              updated_at = time::now();
        `,
      ),
      0,
    ),
  );

  const startedRecordId = toRecordId(relatedRows[0]?.id);
  if (!startedRecordId) {
    throw new Error("Unable to create started tracking relation.");
  }

  return { db, startedRecordId };
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toValidDate(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function sanitizeTaskStateMap(value: unknown): Record<string, TaskState> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const input = value as Record<string, unknown>;
  const output: Record<string, TaskState> = {};

  for (const [taskKey, taskState] of Object.entries(input)) {
    if (!isSafeRecordKey(taskKey) || typeof taskState !== "string") {
      continue;
    }

    if (!ALLOWED_TASK_STATES.has(taskState as TaskState)) {
      continue;
    }

    if (taskState === "none") {
      continue;
    }

    output[taskKey] = taskState as TaskState;
  }

  return output;
}

interface SetQuestModeResult {
  ok: boolean;
  status: "applied" | "unauthenticated" | "invalid" | "error";
  message?: string;
}

export async function setQuestModeAction(
  processKeyInput: string,
  options: {
    started: boolean;
    resetProgress?: boolean;
  },
): Promise<SetQuestModeResult> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return {
        ok: false,
        status: "unauthenticated",
        message: "Sign in to track process progress.",
      };
    }

    const userKey = stripTablePrefix(userId, "user");
    const processKey = stripTablePrefix(String(processKeyInput).trim(), "process");

    if (
      !userKey ||
      !processKey ||
      !isSafeRecordKey(userKey) ||
      !isSafeRecordKey(processKey)
    ) {
      return {
        ok: false,
        status: "invalid",
        message: "Invalid process or user identity.",
      };
    }

    const userRecordId = `user:${userKey}`;
    const processRecordId = `process:${processKey}`;
    const { db, startedRecordId } = await ensureStartedRelation(userRecordId, processRecordId);
    const shouldReset = Boolean(options.resetProgress) || !options.started;

    if (shouldReset) {
      await db.query(
        `
          UPDATE ${startedRecordId}
          SET active = $active,
              updated_at = time::now(),
              manual_task_state = {},
              progress_percent = 0,
              resolved_count = 0,
              completed_count = 0,
              total_count = 0,
              completion_points = 0,
              completed = false,
              completed_at = NONE;
        `,
        { active: options.started },
      );
    } else {
      await db.query(
        `
          UPDATE ${startedRecordId}
          SET active = $active,
              updated_at = time::now();
        `,
        { active: options.started },
      );
    }

    revalidatePath("/");
    revalidatePath(`/process/${processKey}`);
    revalidatePath("/profile");
    return { ok: true, status: "applied" };
  } catch (error) {
    console.error("setQuestModeAction failed", error);
    return {
      ok: false,
      status: "error",
      message: "Unable to update process state right now.",
    };
  }
}

interface SyncQuestProgressInput {
  processKey: string;
  manualTaskStateByKey: Record<string, TaskState>;
  progressPercent: number;
  resolvedCount: number;
  completedCount: number;
  totalCount: number;
  completionPoints: number;
  completed: boolean;
  completedAt?: string;
}

interface SyncQuestProgressResult {
  ok: boolean;
  status: "synced" | "unauthenticated" | "invalid" | "error";
  completedAt?: string;
}

export async function syncQuestProgressAction(
  input: SyncQuestProgressInput,
): Promise<SyncQuestProgressResult> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { ok: false, status: "unauthenticated" };
    }

    const userKey = stripTablePrefix(userId, "user");
    const processKey = stripTablePrefix(String(input.processKey ?? "").trim(), "process");

    if (
      !userKey ||
      !processKey ||
      !isSafeRecordKey(userKey) ||
      !isSafeRecordKey(processKey)
    ) {
      return { ok: false, status: "invalid" };
    }

    const userRecordId = `user:${userKey}`;
    const processRecordId = `process:${processKey}`;
    const { db, startedRecordId } = await ensureStartedRelation(userRecordId, processRecordId);
    const sanitizedManualTaskState = sanitizeTaskStateMap(input.manualTaskStateByKey);
    const progressPercent = clampPercent(toFiniteNumber(input.progressPercent, 0));
    const resolvedCount = Math.max(0, Math.round(toFiniteNumber(input.resolvedCount, 0)));
    const completedCount = Math.max(0, Math.round(toFiniteNumber(input.completedCount, 0)));
    const totalCount = Math.max(0, Math.round(toFiniteNumber(input.totalCount, 0)));
    const completionPoints = Math.max(0, toFiniteNumber(input.completionPoints, 0));
    const completed = Boolean(input.completed);

    let existingCompletedAtDate: Date | null = null;
    try {
      const existingRows = asArray<Record<string, unknown>>(
        queryResult<unknown>(await db.query(`SELECT completed_at FROM ${startedRecordId};`), 0),
      );
      existingCompletedAtDate = toValidDate(existingRows[0]?.completed_at);
    } catch (readError) {
      // Continue with update to recover records that contain a legacy invalid completed_at value.
      console.warn("syncQuestProgressAction completed_at read failed", readError);
    }
    const requestedCompletedAtDate = toValidDate(input.completedAt);
    const persistedCompletedAt =
      completed ? (existingCompletedAtDate ?? requestedCompletedAtDate ?? new Date()) : null;

    if (persistedCompletedAt) {
      await db.query(
        `
          UPDATE ${startedRecordId}
          SET active = true,
              manual_task_state = $manualTaskState,
              progress_percent = $progressPercent,
              resolved_count = $resolvedCount,
              completed_count = $completedCount,
              total_count = $totalCount,
              completion_points = $completionPoints,
              completed = $completed,
              completed_at = $completedAt,
              updated_at = time::now();
        `,
        {
          manualTaskState: sanitizedManualTaskState,
          progressPercent,
          resolvedCount,
          completedCount,
          totalCount,
          completionPoints,
          completed,
          completedAt: persistedCompletedAt,
        },
      );
    } else {
      await db.query(
        `
          UPDATE ${startedRecordId}
          SET active = true,
              manual_task_state = $manualTaskState,
              progress_percent = $progressPercent,
              resolved_count = $resolvedCount,
              completed_count = $completedCount,
              total_count = $totalCount,
              completion_points = $completionPoints,
              completed = $completed,
              completed_at = NONE,
              updated_at = time::now();
        `,
        {
          manualTaskState: sanitizedManualTaskState,
          progressPercent,
          resolvedCount,
          completedCount,
          totalCount,
          completionPoints,
          completed,
        },
      );
    }

    revalidatePath("/");
    revalidatePath(`/process/${processKey}`);
    revalidatePath("/profile");

    return {
      ok: true,
      status: "synced",
      completedAt: persistedCompletedAt?.toISOString(),
    };
  } catch (error) {
    console.error("syncQuestProgressAction failed", error);
    return { ok: false, status: "error" };
  }
}

export async function recordQuestStartAction(processKeyInput: string) {
  try {
    const userId = await getCurrentUserId();

    if (!userId) {
      return;
    }

    const userKey = stripTablePrefix(userId, "user");
    const processKey = stripTablePrefix(String(processKeyInput).trim(), "process");

    if (
      !userKey ||
      !processKey ||
      !isSafeRecordKey(userKey) ||
      !isSafeRecordKey(processKey)
    ) {
      return;
    }

    const userRecordId = `user:${userKey}`;
    const processRecordId = `process:${processKey}`;
    const { db, startedRecordId } = await ensureStartedRelation(userRecordId, processRecordId);

    await db.query(
      `
        UPDATE ${startedRecordId}
        SET active = true,
            updated_at = time::now();
      `,
    );
    revalidatePath("/");
    revalidatePath(`/process/${processKey}`);
  } catch (error) {
    console.error("recordQuestStartAction failed", error);
  }
}

export async function createTipAction(formData: FormData) {
  try {
    const userId = await getCurrentUserId();

    if (!userId) {
      return;
    }

    const taskId = String(formData.get("taskId") ?? "").trim();
    const content = String(formData.get("content") ?? "").trim();

    if (!taskId || !content || content.length > TIP_MAX_LENGTH) {
      return;
    }

    const db = await getSurrealClient();
    const userKey = stripTablePrefix(userId, "user");
    const taskKey = stripTablePrefix(taskId, "task");

    if (!userKey || !taskKey || !isSafeRecordKey(userKey) || !isSafeRecordKey(taskKey)) {
      return;
    }

    const userRecordId = `user:${userKey}`;

    const tipRows = asArray<Record<string, unknown>>(
      queryResult<unknown>(
        await db.query(
          `
            CREATE tip CONTENT {
              content: $content,
              upvotes: 0,
              downvotes: 0,
              created_at: time::now()
            };
          `,
          { content },
        ),
        0,
      ),
    );

    const tipRecordId = toRecordId(tipRows[0]?.id);
    const tipKey = stripTablePrefix(tipRecordId, "tip");

    if (!tipKey || !isSafeRecordKey(tipKey)) {
      return;
    }

    const tipRecordSafeId = `tip:${tipKey}`;
    const taskRecordId = `task:${taskKey}`;

    await db.query(
      `
        RELATE ${userRecordId}->posted->${tipRecordSafeId}
        SET task_id = ${taskRecordId},
            created_at = time::now();
      `
    );

    revalidatePath("/");
  } catch (error) {
    console.error("createTipAction failed", error);
  }
}

export async function voteTipAction(formData: FormData): Promise<VoteActionResult> {
  try {
    const userId = await getCurrentUserId();

    if (!userId) {
      return {
        ok: false,
        status: "unauthenticated",
        message: "Sign in to vote on tips.",
      };
    }

    const tipId = String(formData.get("tipId") ?? "").trim();
    const direction = String(formData.get("direction") ?? "").trim();

    if (!tipId || (direction !== "upvote" && direction !== "downvote")) {
      return {
        ok: false,
        status: "invalid",
        message: "Invalid vote request.",
      };
    }

    const db = await getSurrealClient();
    const userKey = stripTablePrefix(userId, "user");
    const tipKey = stripTablePrefix(tipId, "tip");

    if (!userKey || !tipKey || !isSafeRecordKey(userKey) || !isSafeRecordKey(tipKey)) {
      return {
        ok: false,
        status: "invalid",
        message: "Invalid vote target.",
      };
    }

    const userRecordId = `user:${userKey}`;
    const tipRecordId = `tip:${tipKey}`;

    const existingVoteRows = asArray<Record<string, unknown>>(
      queryResult<unknown>(
        await db.query(
          `
            SELECT direction
            FROM voted
            WHERE in = ${userRecordId}
              AND out = ${tipRecordId}
            LIMIT 1;
          `,
        ),
        0,
      ),
    );

    const existingDirection = String(existingVoteRows[0]?.direction ?? "");

    await db.query(
      `
        BEGIN TRANSACTION;

        LET $existing = (
          SELECT id, direction
          FROM voted
          WHERE in = ${userRecordId}
            AND out = ${tipRecordId}
          LIMIT 1
        );

        IF array::len($existing) = 0 {
          RELATE ${userRecordId}->voted->${tipRecordId}
          SET direction = $direction,
              created_at = time::now(),
              updated_at = time::now();
        } ELSE IF $existing[0].direction = $direction {
          DELETE $existing[0].id;
        } ELSE {
          UPDATE $existing[0].id
          SET direction = $direction,
              updated_at = time::now();
        };

        LET $upvoteCount = (
          SELECT count() AS total
          FROM voted
          WHERE out = ${tipRecordId}
            AND direction = \"upvote\"
          GROUP ALL
        );

        LET $downvoteCount = (
          SELECT count() AS total
          FROM voted
          WHERE out = ${tipRecordId}
            AND direction = \"downvote\"
          GROUP ALL
        );

        UPDATE ${tipRecordId}
        SET upvotes = math::max(0, <int>$upvoteCount[0].total),
            downvotes = math::max(0, <int>$downvoteCount[0].total);

        COMMIT TRANSACTION;
      `,
      { direction },
    );

    const [tipRows, currentVoteRows] = await Promise.all([
      asArray<Record<string, unknown>>(
        queryResult<unknown>(await db.query(`SELECT upvotes, downvotes FROM ${tipRecordId};`), 0),
      ),
      asArray<unknown>(
        queryResult<unknown>(
          await db.query(
            `
              SELECT VALUE direction
              FROM voted
              WHERE in = ${userRecordId}
                AND out = ${tipRecordId}
              LIMIT 1;
            `,
          ),
          0,
        ),
      ),
    ]);
    const tipRow = tipRows[0] ?? {};
    const currentVote = currentVoteRows[0];
    const normalizedCurrentVote =
      currentVote === "upvote" || currentVote === "downvote"
        ? (currentVote as VoteDirection)
        : null;
    const didHaveVote = existingDirection === "upvote" || existingDirection === "downvote";
    const status: VoteActionResult["status"] =
      !didHaveVote
        ? "applied"
        : existingDirection === direction
          ? "removed"
          : "switched";
    const message =
      status === "applied"
        ? "Vote recorded."
        : status === "removed"
          ? "Vote removed."
          : "Vote updated.";

    return {
      ok: true,
      status,
      message,
      tipKey,
      direction,
      currentVote: normalizedCurrentVote,
      upvotes: toSafeInt(tipRow.upvotes),
      downvotes: toSafeInt(tipRow.downvotes),
    };
  } catch (error) {
    console.error("voteTipAction failed", error);
    return {
      ok: false,
      status: "error",
      message: "Could not save vote right now. Try again.",
    };
  }
}

interface FeedbackActionResult {
  ok: boolean;
  message: string;
}

export async function submitFeedbackAction(formData: FormData): Promise<FeedbackActionResult> {
  try {
    const message = String(formData.get("message") ?? "").trim();

    if (!message || message.length > FEEDBACK_MAX_LENGTH) {
      return {
        ok: false,
        message: "Feedback must be between 1 and 2000 characters.",
      };
    }

    const userId = await getCurrentUserId();
    const db = await getSurrealClient();

    if (userId) {
      const userKey = stripTablePrefix(userId, "user");

      if (!userKey || !isSafeRecordKey(userKey)) {
        return {
          ok: false,
          message: "Unable to link feedback to your account.",
        };
      }

      const userRecordId = `user:${userKey}`;

      await db.query(
        `
          CREATE feedback CONTENT {
            message: $message,
            user_id: ${userRecordId},
            created_at: time::now()
          };
        `,
        { message },
      );
    } else {
      await db.query(
        `
          CREATE feedback CONTENT {
            message: $message,
            created_at: time::now()
          };
        `,
        { message },
      );
    }

    await sendFeedbackEmail({
      message,
      userId,
    });

    revalidatePath("/");

    return {
      ok: true,
      message: "Feedback submitted. Thank you for helping improve the platform.",
    };
  } catch (error) {
    console.error("submitFeedbackAction failed", error);
    return {
      ok: false,
      message: "Unable to submit feedback right now. Please try again.",
    };
  }
}

async function sendFeedbackEmail({
  message,
  userId,
}: {
  message: string;
  userId: string | null;
}) {
  const host = process.env.SMTP_HOST;

  if (!host) {
    return;
  }

  const port = Number.parseInt(process.env.SMTP_PORT ?? "587", 10);
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
    to: process.env.FEEDBACK_ADMIN_EMAIL ?? "admin@example.com",
    subject: "[GovQuest] New platform feedback",
    text: [
      "A new feedback entry was submitted.",
      "",
      `User ID: ${userId ?? "Anonymous"}`,
      "",
      "Message:",
      message,
    ].join("\n"),
  });
}
