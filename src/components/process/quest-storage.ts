"use client";

export interface QuestProgressMeta {
  processKey: string;
  progressPercent: number;
  resolvedCount: number;
  completedCount: number;
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

export interface QuestModeEventDetail {
  processKey: string;
  started: boolean;
  userScope: string;
}

export interface QuestProgressEventDetail extends QuestProgressMeta {
  userScope: string;
}

const GUEST_SCOPE = "guest";
const QUEST_MODE_EVENT = "govquest:quest-mode-changed";
const QUEST_PROGRESS_EVENT = "govquest:quest-progress-changed";

export function toUserScope(userId?: string | null): string {
  if (!userId) {
    return GUEST_SCOPE;
  }

  return userId
    .replace(/^user:/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function getQuestModeEventName(): string {
  return QUEST_MODE_EVENT;
}

export function getQuestProgressEventName(): string {
  return QUEST_PROGRESS_EVENT;
}

export function emitQuestModeChanged(detail: QuestModeEventDetail) {
  window.dispatchEvent(new CustomEvent<QuestModeEventDetail>(QUEST_MODE_EVENT, { detail }));
}

export function emitQuestProgressChanged(detail: QuestProgressEventDetail) {
  window.dispatchEvent(new CustomEvent<QuestProgressEventDetail>(QUEST_PROGRESS_EVENT, { detail }));
}
