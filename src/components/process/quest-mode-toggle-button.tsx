"use client";

import { Play, RotateCcw } from "lucide-react";

import { useQuestMode } from "@/components/process/quest-mode-state";
import { Button } from "@/components/ui/button";

interface QuestModeToggleButtonProps {
  processKey: string;
}

export function QuestModeToggleButton({ processKey }: QuestModeToggleButtonProps) {
  const { hydrated, started, setQuestMode } = useQuestMode(processKey);

  if (!hydrated) {
    return <div className="h-9 w-36" aria-hidden />;
  }

  return (
    <Button
      type="button"
      size="sm"
      variant={started ? "ghost" : "default"}
      onClick={() => setQuestMode(!started)}
      title={started ? "Exit quest mode (progress stays saved in this browser)" : "Start quest mode"}
    >
      {started ? <RotateCcw className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      {started ? "Exit quest mode" : "Start quest mode"}
    </Button>
  );
}
