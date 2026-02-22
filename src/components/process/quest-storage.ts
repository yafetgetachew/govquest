"use client";

export interface QuestProgressMeta {
  processKey: string;
  progressPercent: number;
  resolvedCount: number;
  totalCount: number;
  completionPoints: number;
  completed: boolean;
  completedAt?: string;
  updatedAt: string;
}

export interface CompletedProcessHistoryEntry {
  processKey: string;
  completedAt: string;
  progressPercent: number;
}

const GUEST_SCOPE = "guest";
const COMPLETED_HISTORY_EVENT = "govquest:completed-history-changed";

export function getQuestModeStorageKey(processKey: string, userId?: string | null): string {
  return `quest-mode:${toUserScope(userId)}:${processKey}:started`;
}

export function getQuestProgressStorageKey(processKey: string, userId?: string | null): string {
  return `quest-progress:${toUserScope(userId)}:${processKey}`;
}

export function getQuestProgressMetaStorageKey(processKey: string, userId?: string | null): string {
  return `quest-progress-meta:${toUserScope(userId)}:${processKey}`;
}

export function getCompletedHistoryStorageKey(userId?: string | null): string {
  return `quest-history:${toUserScope(userId)}:completed`;
}

export function readQuestProgressMeta(processKey: string, userId?: string | null): QuestProgressMeta | null {
  try {
    const raw = window.localStorage.getItem(getQuestProgressMetaStorageKey(processKey, userId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;

    const progressPercent = Number(parsed.progressPercent);
    const resolvedCount = Number(parsed.resolvedCount);
    const totalCount = Number(parsed.totalCount);
    const completionPoints = Number(parsed.completionPoints);
    const updatedAt = typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString();
    const completed = Boolean(parsed.completed);
    const completedAt = typeof parsed.completedAt === "string" ? parsed.completedAt : undefined;

    return {
      processKey: typeof parsed.processKey === "string" ? parsed.processKey : processKey,
      progressPercent: Number.isFinite(progressPercent) ? progressPercent : 0,
      resolvedCount: Number.isFinite(resolvedCount) ? resolvedCount : 0,
      totalCount: Number.isFinite(totalCount) ? totalCount : 0,
      completionPoints: Number.isFinite(completionPoints) ? completionPoints : 0,
      completed,
      completedAt,
      updatedAt,
    };
  } catch {
    return null;
  }
}

export function clearQuestProcessState(processKey: string, userId?: string | null) {
  try {
    window.localStorage.removeItem(getQuestProgressStorageKey(processKey, userId));
    window.localStorage.removeItem(getQuestProgressMetaStorageKey(processKey, userId));
  } catch {}
}

export function readCompletedProcessHistory(userId?: string | null): CompletedProcessHistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(getCompletedHistoryStorageKey(userId));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object") {
        return [];
      }

      const candidate = entry as Record<string, unknown>;
      const processKey = typeof candidate.processKey === "string" ? candidate.processKey : null;
      const completedAt = typeof candidate.completedAt === "string" ? candidate.completedAt : null;
      const progressPercent = Number(candidate.progressPercent);

      if (!processKey || !completedAt) {
        return [];
      }

      return [{
        processKey,
        completedAt,
        progressPercent: Number.isFinite(progressPercent) ? progressPercent : 100,
      }];
    });
  } catch {
    return [];
  }
}

export function appendCompletedProcessHistory(
  entry: CompletedProcessHistoryEntry,
  userId?: string | null,
) {
  const current = readCompletedProcessHistory(userId);
  const next = [
    entry,
    ...current,
  ].slice(0, 200);

  try {
    window.localStorage.setItem(getCompletedHistoryStorageKey(userId), JSON.stringify(next));
  } catch {}

  window.dispatchEvent(
    new CustomEvent(COMPLETED_HISTORY_EVENT, {
      detail: {
        processKey: entry.processKey,
        completedAt: entry.completedAt,
        userScope: toUserScope(userId),
      },
    }),
  );
}

export function getCompletedHistoryEventName(): string {
  return COMPLETED_HISTORY_EVENT;
}

export function toUserScope(userId?: string | null): string {
  if (!userId) {
    return GUEST_SCOPE;
  }

  return userId
    .replace(/^user:/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_");
}
