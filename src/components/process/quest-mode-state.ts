"use client";

import { useEffect, useMemo, useState } from "react";

const QUEST_MODE_EVENT = "govquest:quest-mode-changed";

interface QuestModeEventDetail {
  processKey: string;
  started: boolean;
}

function readQuestMode(processKey: string): boolean {
  try {
    return window.localStorage.getItem(`quest-mode:${processKey}:started`) === "true";
  } catch {
    return false;
  }
}

function writeQuestMode(processKey: string, started: boolean) {
  try {
    window.localStorage.setItem(`quest-mode:${processKey}:started`, started ? "true" : "false");
  } catch {}

  window.dispatchEvent(
    new CustomEvent<QuestModeEventDetail>(QUEST_MODE_EVENT, {
      detail: { processKey, started },
    }),
  );
}

export function useQuestMode(processKey: string) {
  const [started, setStarted] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const storageKey = useMemo(() => `quest-mode:${processKey}:started`, [processKey]);

  useEffect(() => {
    setStarted(readQuestMode(processKey));
    setHydrated(true);
  }, [processKey]);

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
      if (customEvent.detail?.processKey === processKey) {
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
    writeQuestMode(processKey, nextStarted);
  };

  return {
    hydrated,
    started,
    setQuestMode,
  };
}
