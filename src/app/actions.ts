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

const TIP_MAX_LENGTH = 1200;
const FEEDBACK_MAX_LENGTH = 2000;

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
            SELECT id, direction
            FROM voted
            WHERE in = ${userRecordId}
              AND out = ${tipRecordId}
            LIMIT 1;
          `,
        ),
        0,
      ),
    );

    const existingVote = existingVoteRows[0];
    const existingDirection = String(existingVote?.direction ?? "");
    const existingVoteId = toRecordId(existingVote?.id);
    const existingVoteKey = stripTablePrefix(existingVoteId, "voted");
    const voteRecordId =
      existingVoteKey && isSafeRecordKey(existingVoteKey) ? `voted:${existingVoteKey}` : null;

    if (!existingVote) {
      if (direction === "upvote") {
        await db.query(`UPDATE ${tipRecordId} SET upvotes += 1;`);
      } else {
        await db.query(`UPDATE ${tipRecordId} SET downvotes += 1;`);
      }

      await db.query(
        `
          RELATE ${userRecordId}->voted->${tipRecordId}
          SET direction = $direction,
              created_at = time::now(),
              updated_at = time::now();
        `,
        { direction },
      );
    } else if (existingDirection === direction) {
      if (direction === "upvote") {
        await db.query(`UPDATE ${tipRecordId} SET upvotes -= 1;`);
      } else {
        await db.query(`UPDATE ${tipRecordId} SET downvotes -= 1;`);
      }

      if (voteRecordId) {
        await db.query(`DELETE ${voteRecordId};`);
      }
    } else {
      if (existingDirection === "upvote") {
        await db.query(`UPDATE ${tipRecordId} SET upvotes -= 1;`);
      } else if (existingDirection === "downvote") {
        await db.query(`UPDATE ${tipRecordId} SET downvotes -= 1;`);
      }

      if (direction === "upvote") {
        await db.query(`UPDATE ${tipRecordId} SET upvotes += 1;`);
      } else {
        await db.query(`UPDATE ${tipRecordId} SET downvotes += 1;`);
      }

      if (voteRecordId) {
        await db.query(
          `
            UPDATE ${voteRecordId}
            SET direction = $direction,
                updated_at = time::now();
          `,
          { direction },
        );
      } else {
        await db.query(
          `
            RELATE ${userRecordId}->voted->${tipRecordId}
            SET direction = $direction,
                created_at = time::now(),
                updated_at = time::now();
          `,
          { direction },
        );
      }
    }

    const tipRows = asArray<Record<string, unknown>>(
      queryResult<unknown>(await db.query(`SELECT upvotes, downvotes FROM ${tipRecordId};`), 0),
    );
    const tipRow = tipRows[0] ?? {};

    return {
      ok: true,
      status:
        !existingVote
          ? "applied"
          : existingDirection === direction
          ? "removed"
          : "switched",
      message:
        !existingVote
          ? "Vote recorded."
          : existingDirection === direction
          ? "Vote removed."
          : "Vote updated.",
      tipKey,
      direction,
      currentVote: !existingVote ? direction : existingDirection === direction ? null : direction,
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
