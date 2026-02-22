"use client";

import { useEffect, useMemo, useState } from "react";

import {
  clearQuestProcessState,
  getQuestModeStorageKey,
} from "@/components/process/quest-storage";

const QUEST_MODE_EVENT = "govquest:quest-mode-changed";

interface QuestModeEventDetail {
  processKey: string;
  started: boolean;
  userScope: string;
}

function readQuestMode(processKey: string, userId?: string | null): boolean {
  try {
    return window.localStorage.getItem(getQuestModeStorageKey(processKey, userId)) === "true";
  } catch {
    return false;
  }
}

function writeQuestMode(processKey: string, started: boolean, userId?: string | null) {
  try {
    window.localStorage.setItem(getQuestModeStorageKey(processKey, userId), started ? "true" : "false");
  } catch {}

  window.dispatchEvent(
    new CustomEvent<QuestModeEventDetail>(QUEST_MODE_EVENT, {
      detail: {
        processKey,
        started,
        userScope: getQuestModeStorageKey(processKey, userId).split(":")[1] ?? "guest",
      },
    }),
  );
}

export function useQuestMode(processKey: string, userId?: string | null) {
  const [started, setStarted] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const storageKey = useMemo(() => getQuestModeStorageKey(processKey, userId), [processKey, userId]);

  useEffect(() => {
    setStarted(readQuestMode(processKey, userId));
    setHydrated(true);
  }, [processKey, userId]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey) {
        setStarted(event.newValue === "true");
      }
    };

    const onQuestModeChanged = (event: Event) => {
      const customEvent = event as CustomEvent<QuestModeEventDetail>;
      if (
        customEvent.detail?.processKey === processKey &&
        customEvent.detail?.userScope === (storageKey.split(":")[1] ?? "guest")
      ) {
        setStarted(customEvent.detail.started);
      }
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(QUEST_MODE_EVENT, onQuestModeChanged as EventListener);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(QUEST_MODE_EVENT, onQuestModeChanged as EventListener);
    };
  }, [hydrated, processKey, storageKey]);

  const setQuestMode = (nextStarted: boolean) => {
    setStarted(nextStarted);

    if (!nextStarted) {
      clearQuestProcessState(processKey, userId);
      window.dispatchEvent(
        new CustomEvent("govquest:quest-progress-changed", {
          detail: { processKey, progressPercent: 0 },
        }),
      );
    }

    writeQuestMode(processKey, nextStarted, userId);
  };

  const resetQuestProgress = () => {
    clearQuestProcessState(processKey, userId);
    window.dispatchEvent(
      new CustomEvent("govquest:quest-progress-changed", {
        detail: { processKey, progressPercent: 0 },
      }),
    );
  };

  const reinitiateQuestMode = () => {
    setStarted(false);
    writeQuestMode(processKey, false, userId);
    clearQuestProcessState(processKey, userId);

    window.setTimeout(() => {
      setStarted(true);
      writeQuestMode(processKey, true, userId);
    }, 16);
  };

  return {
    hydrated,
    started,
    setQuestMode,
    reinitiateQuestMode,
    resetQuestProgress,
  };
}
