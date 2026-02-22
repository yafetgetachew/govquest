"use server";

import nodemailer from "nodemailer";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { getProcessTaskTree } from "@/lib/process-data";
import { getSurrealClient } from "@/lib/surreal";
import {
  asArray,
  isSafeRecordKey,
  queryResult,
  stripTablePrefix,
  toRecordId,
  toSafeInt,
} from "@/lib/surreal-utils";
import type { TaskNode, TaskState } from "@/lib/types";

const TIP_MAX_LENGTH = 1200;
const FEEDBACK_MAX_LENGTH = 2000;
const ALLOWED_TASK_STATES = new Set<TaskState>([
  "none",
  "half",
  "done",
  "not_necessary",
  "denied",
]);
const TASK_STATE_WEIGHT: Record<TaskState, number> = {
  none: 0,
  half: 0.5,
  done: 1,
  not_necessary: 1,
  denied: 0,
};

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

interface QuestProgressSnapshot {
  manualTaskStateByKey: Record<string, TaskState>;
  progressPercent: number;
  resolvedCount: number;
  completedCount: number;
  totalCount: number;
  completionPoints: number;
  completed: boolean;
}

function collectUniqueTaskKeys(tasks: TaskNode[]): string[] {
  const keys = new Set<string>();

  const visit = (input: TaskNode[]) => {
    for (const task of input) {
      if (task.key) {
        keys.add(task.key);
      }

      if (task.children.length > 0) {
        visit(task.children);
      }
    }
  };

  visit(tasks);

  return Array.from(keys);
}

function filterManualTaskStateByKnownKeys(
  taskStateByKey: Record<string, TaskState>,
  knownTaskKeys: string[],
): Record<string, TaskState> {
  if (!taskStateByKey || typeof taskStateByKey !== "object") {
    return {};
  }

  const known = new Set(knownTaskKeys);
  const filtered: Record<string, TaskState> = {};

  for (const [taskKey, state] of Object.entries(taskStateByKey)) {
    if (!known.has(taskKey) || !isTaskState(state) || state === "none") {
      continue;
    }

    filtered[taskKey] = state;
  }

  return filtered;
}

function computeEffectiveTaskStateByKey(
  tasks: TaskNode[],
  manualTaskStateByKey: Record<string, TaskState>,
): Record<string, TaskState> {
  const effectiveTaskStateByKey: Record<string, TaskState> = {};

  const applyInheritance = (nodes: TaskNode[], inheritedState?: TaskState) => {
    for (const node of nodes) {
      if (!node.key) {
        applyInheritance(node.children, inheritedState);
        continue;
      }

      const manualState = manualTaskStateByKey[node.key];
      const hasManualState = isTaskState(manualState) && manualState !== "none";
      const nextState = hasManualState ? manualState : inheritedState ?? "none";
      effectiveTaskStateByKey[node.key] = nextState;

      const inheritedForChildren = hasManualState
        ? isTerminalTaskState(manualState)
          ? manualState
          : undefined
        : inheritedState;

      applyInheritance(node.children, inheritedForChildren);
    }
  };

  const applyAggregation = (nodes: TaskNode[]) => {
    for (const node of nodes) {
      applyAggregation(node.children);

      if (!node.key) {
        continue;
      }

      const manualState = manualTaskStateByKey[node.key];
      if (isTaskState(manualState) && manualState !== "none") {
        effectiveTaskStateByKey[node.key] = manualState;
        continue;
      }

      if (node.children.length === 0) {
        continue;
      }

      const childStates = node.children
        .map((child) => (child.key ? effectiveTaskStateByKey[child.key] : null))
        .filter((state): state is TaskState => state !== null);

      if (childStates.length === 0) {
        continue;
      }

      effectiveTaskStateByKey[node.key] = aggregateTaskStateFromChildren(childStates);
    }
  };

  applyInheritance(tasks);
  applyAggregation(tasks);

  return effectiveTaskStateByKey;
}

function aggregateTaskStateFromChildren(childStates: TaskState[]): TaskState {
  const hasHalf = childStates.includes("half");
  const hasNone = childStates.includes("none");
  const terminalStates = childStates.filter(isTerminalTaskState);
  const areAllTerminal = terminalStates.length === childStates.length;

  if (areAllTerminal) {
    const hasDenied = terminalStates.includes("denied");

    if (hasDenied) {
      const uniqueTerminalStates = new Set(terminalStates);
      return uniqueTerminalStates.size === 1 ? "denied" : "half";
    }

    const uniqueTerminalStates = new Set(terminalStates);

    if (uniqueTerminalStates.size === 1) {
      return terminalStates[0];
    }

    return "done";
  }

  if (hasHalf || (hasNone && terminalStates.length > 0)) {
    return "half";
  }

  if (hasNone) {
    return "none";
  }

  return "half";
}

function isTerminalTaskState(state: TaskState): state is "done" | "not_necessary" | "denied" {
  return state === "done" || state === "not_necessary" || state === "denied";
}

function isTaskState(value: unknown): value is TaskState {
  return (
    value === "none" ||
    value === "half" ||
    value === "done" ||
    value === "not_necessary" ||
    value === "denied"
  );
}

function computeQuestProgressFromManualOnly(
  manualTaskStateByKey: Record<string, TaskState>,
): QuestProgressSnapshot {
  const keys = Object.keys(manualTaskStateByKey);
  const totalCount = keys.length;
  const completionPoints = keys.reduce(
    (total, key) => total + TASK_STATE_WEIGHT[manualTaskStateByKey[key] ?? "none"],
    0,
  );
  const resolvedCount = keys.filter((key) => {
    const state = manualTaskStateByKey[key];
    return state === "done" || state === "not_necessary" || state === "denied";
  }).length;
  const completedCount = keys.filter((key) => {
    const state = manualTaskStateByKey[key];
    return state === "done" || state === "not_necessary";
  }).length;
  const progressPercent = totalCount === 0 ? 0 : Math.round((completionPoints / totalCount) * 100);

  return {
    manualTaskStateByKey,
    progressPercent,
    resolvedCount,
    completedCount,
    totalCount,
    completionPoints,
    completed: totalCount > 0 && completedCount === totalCount,
  };
}

async function computeQuestProgressFromProcessGraph(
  processKey: string,
  manualTaskStateByKey: Record<string, TaskState>,
): Promise<QuestProgressSnapshot> {
  const processTree = await getProcessTaskTree(processKey);
  if (processTree.connectionError || !processTree.process) {
    return computeQuestProgressFromManualOnly(manualTaskStateByKey);
  }

  const allTaskKeys = collectUniqueTaskKeys(processTree.tasks);
  if (allTaskKeys.length === 0) {
    return {
      manualTaskStateByKey: {},
      progressPercent: 0,
      resolvedCount: 0,
      completedCount: 0,
      totalCount: 0,
      completionPoints: 0,
      completed: false,
    };
  }

  const filteredManualTaskStateByKey = filterManualTaskStateByKnownKeys(
    manualTaskStateByKey,
    allTaskKeys,
  );
  const taskStateByKey = computeEffectiveTaskStateByKey(
    processTree.tasks,
    filteredManualTaskStateByKey,
  );
  const resolvedCount = allTaskKeys.filter((taskKey) => {
    const state = taskStateByKey[taskKey];
    return state === "done" || state === "not_necessary" || state === "denied";
  }).length;
  const completedCount = allTaskKeys.filter((taskKey) => {
    const state = taskStateByKey[taskKey];
    return state === "done" || state === "not_necessary";
  }).length;
  const completionPoints = allTaskKeys.reduce(
    (total, taskKey) => total + TASK_STATE_WEIGHT[taskStateByKey[taskKey] ?? "none"],
    0,
  );
  const totalCount = allTaskKeys.length;
  const progressPercent = totalCount === 0 ? 0 : Math.round((completionPoints / totalCount) * 100);

  return {
    manualTaskStateByKey: filteredManualTaskStateByKey,
    progressPercent,
    resolvedCount,
    completedCount,
    totalCount,
    completionPoints,
    completed: totalCount > 0 && completedCount === totalCount,
  };
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
    const progressSnapshot = await computeQuestProgressFromProcessGraph(
      processKey,
      sanitizedManualTaskState,
    );
    const progressPercent = progressSnapshot.progressPercent;
    const resolvedCount = progressSnapshot.resolvedCount;
    const completedCount = progressSnapshot.completedCount;
    const totalCount = progressSnapshot.totalCount;
    const completionPoints = progressSnapshot.completionPoints;
    const completed = progressSnapshot.completed;

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
          manualTaskState: progressSnapshot.manualTaskStateByKey,
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
          manualTaskState: progressSnapshot.manualTaskStateByKey,
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
