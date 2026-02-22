"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Play, RotateCcw, X } from "lucide-react";

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

  const action = started
    ? isCompleted
      ? "reinitialize"
      : "cancel"
    : "start";
  const label =
    action === "start"
      ? "Start process"
      : action === "cancel"
      ? "Cancel process"
      : "Reinitialize process";
  const title =
    action === "start"
      ? "Start process"
      : action === "cancel"
      ? "Cancel this process and reset task statuses"
      : "Reset all task statuses and start this process again";

  return (
    <Button
      type="button"
      size="sm"
      variant={started ? "ghost" : "default"}
      disabled={isPending}
      onClick={() => {
        if (action === "start") {
          setQuestMode(true);
          startTransition(async () => {
            await recordQuestStartAction(processKey);
          });
          return;
        }

        if (action === "cancel") {
          setQuestMode(false);
          return;
        }

        if (action === "reinitialize") {
          reinitiateQuestMode();
          startTransition(async () => {
            await recordQuestStartAction(processKey);
          });
        }
      }}
      title={title}
    >
      {action === "start" ? <Play className="h-4 w-4" /> : null}
      {action === "cancel" ? <X className="h-4 w-4" /> : null}
      {action === "reinitialize" ? <RotateCcw className="h-4 w-4" /> : null}
      {label}
    </Button>
  );
}
