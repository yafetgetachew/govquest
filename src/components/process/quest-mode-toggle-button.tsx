"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Play, RotateCcw } from "lucide-react";

import { recordQuestStartAction } from "@/app/actions";
import {
  getQuestProgressMetaStorageKey,
  readQuestProgressMeta,
} from "@/components/process/quest-storage";
import { useQuestMode } from "@/components/process/quest-mode-state";
import { Button } from "@/components/ui/button";

interface QuestModeToggleButtonProps {
  processKey: string;
  userId?: string | null;
}

export function QuestModeToggleButton({ processKey, userId }: QuestModeToggleButtonProps) {
  const { hydrated, started, setQuestMode, reinitiateQuestMode } = useQuestMode(processKey, userId);
  const [isPending, startTransition] = useTransition();
  const [isCompleted, setIsCompleted] = useState(false);
  const progressMetaStorageKey = useMemo(
    () => getQuestProgressMetaStorageKey(processKey, userId),
    [processKey, userId],
  );

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    const readCompletion = () => {
      const meta = readQuestProgressMeta(processKey, userId);
      setIsCompleted(Boolean(meta?.completed));
    };

    readCompletion();

    const onStorage = (event: StorageEvent) => {
      if (event.key === progressMetaStorageKey || event.key === null) {
        readCompletion();
      }
    };

    const onProgressChanged = () => readCompletion();

    window.addEventListener("storage", onStorage);
    window.addEventListener("govquest:quest-progress-changed", onProgressChanged as EventListener);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("govquest:quest-progress-changed", onProgressChanged as EventListener);
    };
  }, [hydrated, processKey, progressMetaStorageKey, userId]);

  if (!hydrated) {
    return <div className="h-9 w-36" aria-hidden />;
  }

  return (
    <Button
      type="button"
      size="sm"
      variant={started ? "ghost" : "default"}
      disabled={isPending}
      onClick={() => {
        if (!started) {
          setQuestMode(true);
        } else {
          reinitiateQuestMode();
        }

        startTransition(async () => {
          await recordQuestStartAction(processKey);
        });
      }}
      title={started ? "Reset all task statuses and start this process again" : "Start process"}
    >
      {started ? <RotateCcw className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      {started || isCompleted ? "Reinitiate process" : "Start process"}
    </Button>
  );
}
