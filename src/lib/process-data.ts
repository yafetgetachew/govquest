import "server-only";

import type { Surreal } from "surrealdb";

import { getSurrealClient } from "@/lib/surreal";
import {
  asArray,
  isSafeRecordKey,
  queryResult,
  stripTablePrefix,
  toRecordId,
  toRecordKey,
  toSafeInt,
} from "@/lib/surreal-utils";
import type { ProcessNode, TaskNode, TipsByTask, TipView } from "@/lib/types";

const MAX_TASK_DEPTH = 8;

interface ProcessTreePayload {
  process: ProcessNode | null;
  tasks: TaskNode[];
  taskKeys: string[];
  connectionError: string | null;
}

interface ProcessCatalogPayload {
  processes: ProcessNode[];
  connectionError: string | null;
}

export async function getProcessCatalog(): Promise<ProcessCatalogPayload> {
  try {
    const db = await getSurrealClient();

    const processRows = asArray<Record<string, unknown>>(
      queryResult<unknown>(
        await db.query("SELECT * FROM process ORDER BY title ASC;"),
        0,
      ),
    );

    const processes: ProcessNode[] = processRows.map((processRow) => {
      const processId = toRecordId(processRow.id);

      return {
        id: processId,
        key: toRecordKey(processId),
        title: String(processRow.title ?? "Untitled Process"),
        summary: String(processRow.summary ?? ""),
      };
    });

    return {
      processes,
      connectionError: null,
    };
  } catch (error) {
    return {
      processes: [],
      connectionError: getConnectionErrorMessage(error),
    };
  }
}

export async function getProcessTaskTree(processKey: string): Promise<ProcessTreePayload> {
  try {
    const db = await getSurrealClient();

    const processRows = asArray<Record<string, unknown>>(
      queryResult<unknown>(
        await db.query(`SELECT * FROM process:${processKey};`),
        0,
      ),
    );

    const processRow = processRows[0];

    if (!processRow) {
      return { process: null, tasks: [], taskKeys: [], connectionError: null };
    }

    const process: ProcessNode = {
      id: toRecordId(processRow.id),
      key: toRecordKey(toRecordId(processRow.id)),
      title: String(processRow.title ?? "Untitled Process"),
      summary: String(processRow.summary ?? ""),
    };

    const topLevelRows = asArray<Record<string, unknown>>(
      queryResult<unknown>(
        await db.query(`SELECT ->requires->task AS linked_tasks FROM process:${process.key};`),
        0,
      ),
    );

    const topLevelTasks = asArray<unknown>(topLevelRows[0]?.linked_tasks);
    const visited = new Set<string>();

    const tasks = await Promise.all(
      topLevelTasks.map((taskRow) => buildTaskNode(db, taskRow, 0, visited)),
    );

    return {
      process,
      tasks,
      taskKeys: collectTaskKeys(tasks),
      connectionError: null,
    };
  } catch (error) {
    return {
      process: null,
      tasks: [],
      taskKeys: [],
      connectionError: getConnectionErrorMessage(error),
    };
  }
}

async function buildTaskNode(
  db: Surreal,
  rawTask: unknown,
  depth: number,
  visited: Set<string>,
): Promise<TaskNode> {
  let taskId = "";
  let taskTitle = "Untitled Task";
  let taskDescription = "";

  if (typeof rawTask === "string") {
    taskId = toRecordId(rawTask);
  } else if (rawTask && typeof rawTask === "object") {
    const record = rawTask as Record<string, unknown>;

    taskId = toRecordId(rawTask);
    if (!taskId) {
      taskId = toRecordId(record.id);
    }

    const tableFromRecord = typeof record.tb === "string"
      ? record.tb
      : typeof record.table === "string"
      ? record.table
      : null;
    if (tableFromRecord && taskId && !taskId.includes(":")) {
      taskId = `${tableFromRecord}:${taskId}`;
    }

    taskTitle = String(record.title ?? taskTitle);
    taskDescription = String(record.description ?? taskDescription);
  }

  taskId = normalizeTaskRecordId(taskId);
  const taskKey = toRecordKey(taskId);

  if (!taskId) {
    return {
      id: "",
      key: "",
      title: taskTitle,
      description: taskDescription,
      children: [],
    };
  }

  if (taskTitle === "Untitled Task" && taskDescription === "") {
    const taskRows = asArray<Record<string, unknown>>(
      queryResult<unknown>(await db.query(`SELECT * FROM ${taskId};`), 0),
    );
    const taskRow = taskRows[0];

    if (taskRow) {
      taskTitle = String(taskRow.title ?? taskTitle);
      taskDescription = String(taskRow.description ?? taskDescription);
    }
  }

  if (!taskId || visited.has(taskId) || depth >= MAX_TASK_DEPTH) {
    return {
      id: taskId,
      key: taskKey,
      title: taskTitle,
      description: taskDescription,
      children: [],
    };
  }

  visited.add(taskId);

  const childRows = asArray<Record<string, unknown>>(
    queryResult<unknown>(
      await db.query(`SELECT ->requires->task AS linked_tasks FROM ${taskId};`),
      0,
    ),
  );

  const childTaskRows = asArray<unknown>(childRows[0]?.linked_tasks);

  const children = await Promise.all(
    childTaskRows.map((childTaskRow) => buildTaskNode(db, childTaskRow, depth + 1, visited)),
  );

  return {
    id: taskId,
    key: taskKey,
    title: taskTitle,
    description: taskDescription,
    children,
  };
}

export async function getTipsByTask(
  taskKeys: string[],
  viewerUserId?: string | null,
): Promise<TipsByTask> {
  try {
    const db = await getSurrealClient();
    const viewerUserKey = viewerUserId ? stripTablePrefix(viewerUserId, "user") : null;
    const hasSafeViewer =
      typeof viewerUserKey === "string" && viewerUserKey.length > 0 && isSafeRecordKey(viewerUserKey);

    if (taskKeys.length === 0) {
      return {};
    }

    const entries = await Promise.all(
      taskKeys.map(async (taskKey) => {
        const tipsRows = asArray<Record<string, unknown>>(
          queryResult<unknown>(
            await db.query(
              `
                SELECT *, (upvotes - downvotes) AS score
                FROM tip
                WHERE id IN (
                  SELECT VALUE out
                  FROM posted
                  WHERE task_id = type::thing("task", $task_id)
                )
                ORDER BY score DESC, created_at DESC;
              `,
              { task_id: taskKey },
            ),
            0,
          ),
        );

        const viewerVoteByTipKey = new Map<string, "upvote" | "downvote">();

        if (hasSafeViewer) {
          const voteRows = asArray<Record<string, unknown>>(
            queryResult<unknown>(
              await db.query(
                `
                  SELECT out, direction
                  FROM voted
                  WHERE in = user:${viewerUserKey}
                    AND out IN (
                      SELECT VALUE out
                      FROM posted
                      WHERE task_id = type::thing("task", $task_id)
                    );
                `,
                { task_id: taskKey },
              ),
              0,
            ),
          );

          for (const voteRow of voteRows) {
            const votedTipId = toRecordId(voteRow.out);
            const votedTipKey = toRecordKey(votedTipId);
            const direction = String(voteRow.direction ?? "");

            if (
              votedTipKey &&
              (direction === "upvote" || direction === "downvote")
            ) {
              viewerVoteByTipKey.set(votedTipKey, direction);
            }
          }
        }

        const tips: TipView[] = tipsRows.map((tipRow) => {
          const id = toRecordId(tipRow.id);
          const tipKey = toRecordKey(id);

          return {
            id,
            key: tipKey,
            content: String(tipRow.content ?? ""),
            upvotes: toSafeInt(tipRow.upvotes),
            downvotes: toSafeInt(tipRow.downvotes),
            score: toSafeInt(tipRow.score),
            createdAt: String(tipRow.created_at ?? ""),
            viewerVote: viewerVoteByTipKey.get(tipKey) ?? null,
          };
        });

        return [taskKey, tips] as const;
      }),
    );

    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

function collectTaskKeys(tasks: TaskNode[]): string[] {
  const keys: string[] = [];

  for (const task of tasks) {
    keys.push(task.key);
    keys.push(...collectTaskKeys(task.children));
  }

  return keys;
}

function getConnectionErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to connect to SurrealDB.";
}

function normalizeTaskRecordId(value: string): string {
  if (!value) {
    return "";
  }

  return value.includes(":") ? value : `task:${value}`;
}
