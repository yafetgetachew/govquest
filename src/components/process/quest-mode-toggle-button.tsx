"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Play, RotateCcw, X } from "lucide-react";

import { setQuestModeAction } from "@/app/actions";
import {
  getQuestProgressEventName,
  type QuestProgressEventDetail,
  toUserScope,
} from "@/components/process/quest-storage";
import { useQuestMode } from "@/components/process/quest-mode-state";
import { Button } from "@/components/ui/button";

interface QuestModeToggleButtonProps {
  processKey: string;
  userId?: string | null;
  initialStarted?: boolean;
  initialCompleted?: boolean;
}

export function QuestModeToggleButton({
  processKey,
  userId,
  initialStarted = false,
  initialCompleted = false,
}: QuestModeToggleButtonProps) {
  const { hydrated, started, setQuestMode, reinitiateQuestMode } = useQuestMode(
    processKey,
    userId,
    initialStarted,
  );
  const [isPending, startTransition] = useTransition();
  const [isCompleted, setIsCompleted] = useState(initialCompleted);
  const [actionError, setActionError] = useState<string | null>(null);
  const userScope = useMemo(() => toUserScope(userId), [userId]);

  useEffect(() => {
    setIsCompleted(initialCompleted);
  }, [initialCompleted, processKey, userScope]);

  useEffect(() => {
    setActionError(null);
  }, [processKey, userScope]);

  useEffect(() => {
    const onProgressChanged = (event: Event) => {
      const customEvent = event as CustomEvent<QuestProgressEventDetail>;
      if (
        customEvent.detail?.processKey !== processKey ||
        customEvent.detail?.userScope !== userScope
      ) {
        return;
      }

      setIsCompleted(Boolean(customEvent.detail.completed));
    };

    window.addEventListener(getQuestProgressEventName(), onProgressChanged as EventListener);
    return () => {
      window.removeEventListener(getQuestProgressEventName(), onProgressChanged as EventListener);
    };
  }, [processKey, userScope]);

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
    <div className="space-y-2">
      <Button
        type="button"
        size="sm"
        variant={started ? "ghost" : "default"}
        disabled={isPending}
        onClick={() => {
          setActionError(null);

          if (action === "start") {
            startTransition(async () => {
              const result = await setQuestModeAction(processKey, {
                started: true,
                resetProgress: false,
              });

              if (result.ok) {
                setQuestMode(true);
                return;
              }

              setActionError(result.message ?? "Unable to start this process right now.");
            });
            return;
          }

          if (action === "cancel") {
            startTransition(async () => {
              const result = await setQuestModeAction(processKey, {
                started: false,
                resetProgress: true,
              });

              if (result.ok) {
                setQuestMode(false);
                setIsCompleted(false);
                return;
              }

              setActionError(result.message ?? "Unable to cancel this process right now.");
            });
            return;
          }

          if (action === "reinitialize") {
            startTransition(async () => {
              const result = await setQuestModeAction(processKey, {
                started: true,
                resetProgress: true,
              });

              if (result.ok) {
                reinitiateQuestMode();
                setIsCompleted(false);
                return;
              }

              setActionError(result.message ?? "Unable to reinitialize this process right now.");
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
      {actionError ? <p className="text-xs text-destructive">{actionError}</p> : null}
    </div>
  );
}
