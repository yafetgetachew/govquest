"use client";

import { useEffect, useRef, useState } from "react";

import { useQuestMode } from "@/components/process/quest-mode-state";
import { QuestTree } from "@/components/process/quest-tree";
import type { TaskNode, TipsByTask } from "@/lib/types";

interface ProcessQuestModeProps {
  processKey: string;
  tasks: TaskNode[];
  tipsByTask: TipsByTask;
  isAuthenticated: boolean;
  userId?: string | null;
}

export function ProcessQuestMode({
  processKey,
  tasks,
  tipsByTask,
  isAuthenticated,
  userId,
}: ProcessQuestModeProps) {
  if (!isAuthenticated) {
    return (
      <section>
        <QuestTree
          processKey={processKey}
          tasks={tasks}
          tipsByTask={tipsByTask}
          isAuthenticated={false}
          readOnly
          userId={null}
        />
      </section>
    );
  }

  const { hydrated, started } = useQuestMode(processKey, userId);
  const [isStarting, setIsStarting] = useState(false);
  const [revealSequence, setRevealSequence] = useState(0);
  const hasInitialized = useRef(false);
  const previousStartedRef = useRef(false);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (!hasInitialized.current) {
      hasInitialized.current = true;
      previousStartedRef.current = started;
      return;
    }

    if (started && !previousStartedRef.current) {
      setIsStarting(true);

      const timeout = window.setTimeout(() => {
        setIsStarting(false);
        setRevealSequence((previous) => previous + 1);
      }, 1300);

      previousStartedRef.current = started;
      return () => window.clearTimeout(timeout);
    }

    if (!started) {
      setIsStarting(false);
    }

    previousStartedRef.current = started;
  }, [hydrated, started]);

  if (!hydrated) {
    return null;
  }

  if (!started) {
    return (
      <section className="py-2">
        <p className="text-sm text-muted-foreground">Start process to track progress and update task status.</p>
      </section>
    );
  }

  if (isStarting) {
    return (
      <section className="flex min-h-20 items-center justify-center py-3">
        <span className="inline-block h-7 w-7 animate-spin rounded-full border-[3px] border-border border-t-primary" />
      </section>
    );
  }

  return (
    <section>
      <QuestTree
        key={revealSequence}
        processKey={processKey}
        tasks={tasks}
        tipsByTask={tipsByTask}
        isAuthenticated
        animateIn={revealSequence > 0}
        userId={userId}
      />
    </section>
  );
}
