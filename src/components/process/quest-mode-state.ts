"use client";

import { useEffect, useMemo, useState } from "react";

import {
  emitQuestModeChanged,
  emitQuestProgressChanged,
  getQuestModeEventName,
  type QuestModeEventDetail,
  toUserScope,
} from "@/components/process/quest-storage";

export function useQuestMode(
  processKey: string,
  userId?: string | null,
  initialStarted = false,
) {
  const userScope = useMemo(() => toUserScope(userId), [userId]);
  const [started, setStarted] = useState(initialStarted);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setStarted(initialStarted);
    setHydrated(true);
  }, [initialStarted, processKey, userScope]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    const onQuestModeChanged = (event: Event) => {
      const customEvent = event as CustomEvent<QuestModeEventDetail>;
      if (
        customEvent.detail?.processKey !== processKey ||
        customEvent.detail?.userScope !== userScope
      ) {
        return;
      }

      setStarted(customEvent.detail.started);
    };

    window.addEventListener(getQuestModeEventName(), onQuestModeChanged as EventListener);

    return () => {
      window.removeEventListener(getQuestModeEventName(), onQuestModeChanged as EventListener);
    };
  }, [hydrated, processKey, userScope]);

  const setQuestMode = (nextStarted: boolean) => {
    setStarted(nextStarted);
    emitQuestModeChanged({
      processKey,
      started: nextStarted,
      userScope,
    });

    if (!nextStarted) {
      emitQuestProgressChanged({
        processKey,
        userScope,
        progressPercent: 0,
        resolvedCount: 0,
        completedCount: 0,
        totalCount: 0,
        completionPoints: 0,
        completed: false,
        updatedAt: new Date().toISOString(),
      });
    }
  };

  const reinitiateQuestMode = () => {
    setQuestMode(false);
    window.setTimeout(() => {
      setQuestMode(true);
    }, 16);
  };

  return {
    hydrated,
    started,
    setQuestMode,
    reinitiateQuestMode,
  };
}
