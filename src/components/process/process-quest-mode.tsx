"use client";

import { useQuestMode } from "@/components/process/quest-mode-state";
import { QuestTree } from "@/components/process/quest-tree";
import type { TaskNode, TipsByTask } from "@/lib/types";

interface ProcessQuestModeProps {
  processKey: string;
  tasks: TaskNode[];
  tipsByTask: TipsByTask;
  isAuthenticated: boolean;
}

export function ProcessQuestMode({
  processKey,
  tasks,
  tipsByTask,
  isAuthenticated,
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
        />
      </section>
    );
  }

  const { hydrated, started } = useQuestMode(processKey);

  if (!hydrated) {
    return null;
  }

  if (!started) {
    return (
      <section className="py-2">
        <p className="text-sm text-muted-foreground">Start quest mode to track progress and update task status.</p>
      </section>
    );
  }

  return (
    <section>
      <QuestTree
        processKey={processKey}
        tasks={tasks}
        tipsByTask={tipsByTask}
        isAuthenticated
      />
    </section>
  );
}
