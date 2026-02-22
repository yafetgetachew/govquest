"use client";

export interface WordmarkTransitionSnapshot {
  left: number;
  top: number;
  width: number;
  height: number;
  at: number;
}

const WORDMARK_TRANSITION_STORAGE_KEY = "gvt:wordmark-transition";

export function writeWordmarkTransitionSnapshot(snapshot: WordmarkTransitionSnapshot) {
  try {
    window.sessionStorage.setItem(WORDMARK_TRANSITION_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {}
}

export function readWordmarkTransitionSnapshot(): WordmarkTransitionSnapshot | null {
  try {
    const raw = window.sessionStorage.getItem(WORDMARK_TRANSITION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<WordmarkTransitionSnapshot>;

    if (
      typeof parsed.left !== "number" ||
      typeof parsed.top !== "number" ||
      typeof parsed.width !== "number" ||
      typeof parsed.height !== "number" ||
      typeof parsed.at !== "number"
    ) {
      return null;
    }

    return {
      left: parsed.left,
      top: parsed.top,
      width: parsed.width,
      height: parsed.height,
      at: parsed.at,
    };
  } catch {
    return null;
  }
}

export function clearWordmarkTransitionSnapshot() {
  try {
    window.sessionStorage.removeItem(WORDMARK_TRANSITION_STORAGE_KEY);
  } catch {}
}
