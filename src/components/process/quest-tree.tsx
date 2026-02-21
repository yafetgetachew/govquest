"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, MessageCircleMore, ScanSearch, ThumbsDown, ThumbsUp } from "lucide-react";

import { createTipAction, voteTipAction } from "@/app/actions";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { ChecklistConnector } from "@/components/ui/checklist-connector";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import type { TaskNode, TipsByTask, TipView } from "@/lib/types";
import { cn } from "@/lib/utils";

interface QuestTreeProps {
  processKey: string;
  tasks: TaskNode[];
  tipsByTask: TipsByTask;
  isAuthenticated: boolean;
  readOnly?: boolean;
}

type TaskState = "none" | "half" | "done" | "not_necessary" | "denied";

const TASK_STATE_WEIGHT: Record<TaskState, number> = {
  none: 0,
  half: 0.5,
  done: 1,
  not_necessary: 1,
  denied: 0,
};
const TASK_STATE_OPTIONS: Array<{ value: TaskState; label: string }> = [
  { value: "none", label: "Not started" },
  { value: "half", label: "Started" },
  { value: "done", label: "Done" },
  { value: "not_necessary", label: "Not necessary" },
  { value: "denied", label: "Denied" },
];

export function QuestTree({
  processKey,
  tasks,
  tipsByTask,
  isAuthenticated,
  readOnly = false,
}: QuestTreeProps) {
  const allTaskKeys = useMemo(() => collectUniqueTaskKeys(tasks), [tasks]);
  const storageKey = useMemo(() => `quest-progress:${processKey}`, [processKey]);
  const progressMetaKey = useMemo(() => `quest-progress-meta:${processKey}`, [processKey]);
  const [taskStateByKey, setTaskStateByKey] = useState<Record<string, TaskState>>({});

  useEffect(() => {
    if (readOnly) {
      setTaskStateByKey({});
      return;
    }

    try {
      const stored = parseStoredTaskState(window.localStorage.getItem(storageKey));
      const knownKeys = new Set(allTaskKeys);
      const filtered = Object.fromEntries(
        Object.entries(stored).filter(([taskKey]) => knownKeys.has(taskKey)),
      );
      setTaskStateByKey(filtered);
    } catch {
      setTaskStateByKey({});
    }
  }, [allTaskKeys, readOnly, storageKey]);

  useEffect(() => {
    if (readOnly) {
      return;
    }

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(taskStateByKey));
    } catch {}
  }, [readOnly, storageKey, taskStateByKey]);

  const resolvedCount = useMemo(
    () =>
      allTaskKeys.filter((taskKey) => {
        const state = taskStateByKey[taskKey];
        return state === "done" || state === "not_necessary";
      }).length,
    [allTaskKeys, taskStateByKey],
  );
  const completionPoints = useMemo(
    () =>
      allTaskKeys.reduce(
        (total, taskKey) => total + TASK_STATE_WEIGHT[taskStateByKey[taskKey] ?? "none"],
        0,
      ),
    [allTaskKeys, taskStateByKey],
  );

  const totalCount = allTaskKeys.length;
  const progressPercent = totalCount === 0 ? 0 : Math.round((completionPoints / totalCount) * 100);
  const completionText =
    completionPoints % 1 === 0 ? completionPoints.toFixed(0) : completionPoints.toFixed(1);

  useEffect(() => {
    if (readOnly) {
      return;
    }

    try {
      window.localStorage.setItem(
        progressMetaKey,
        JSON.stringify({
          processKey,
          progressPercent,
          resolvedCount,
          totalCount,
          completionPoints,
          updatedAt: new Date().toISOString(),
        }),
      );
      window.dispatchEvent(
        new CustomEvent("govquest:quest-progress-changed", {
          detail: { processKey, progressPercent },
        }),
      );
    } catch {}
  }, [completionPoints, processKey, progressMetaKey, progressPercent, readOnly, resolvedCount, totalCount]);

  const setTaskState = (taskKey: string, state: TaskState) => {
    setTaskStateByKey((previous) => {
      if (state === "none") {
        if (!(taskKey in previous)) {
          return previous;
        }

        const next = { ...previous };
        delete next[taskKey];
        return next;
      }

      if (previous[taskKey] === state) {
        return previous;
      }

      return {
        ...previous,
        [taskKey]: state,
      };
    });
  };

  if (tasks.length === 0) {
    return (
      <div className="border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
        No tasks are linked to this process yet.
      </div>
    );
  }

  if (readOnly) {
    return <ReadOnlyTaskList tasks={tasks} level={0} />;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 border-b border-border pb-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">Quest progress</p>
          <p className="text-sm text-muted-foreground">{progressPercent}%</p>
        </div>
        <Progress value={progressPercent} className="h-5" />
        <p className="text-xs text-muted-foreground">
          {resolvedCount}/{totalCount} resolved · {completionText}/{totalCount} completion points
        </p>
      </div>

      <TaskAccordion
        tasks={tasks}
        tipsByTask={tipsByTask}
        isAuthenticated={isAuthenticated}
        readOnly={false}
        level={0}
        taskStateByKey={taskStateByKey}
        onTaskStateChange={setTaskState}
      />
    </div>
  );
}

function ReadOnlyTaskList({ tasks, level }: { tasks: TaskNode[]; level: number }) {
  return (
    <div className={cn("space-y-3", level > 0 && "ml-4")}>
      {tasks.map((task) => (
        <div
          key={`${task.id}-readonly-${level}`}
          className="border border-border/70 bg-card/90 px-4 py-4"
        >
          <p className="font-semibold text-foreground">{task.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{task.description}</p>
          <p className="mt-1 text-xs text-muted-foreground">Time estimate: {estimateTaskTime(task)}</p>
          {task.children.length > 0 ? (
            <div className="mt-3 space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Sub-tasks</p>
              <ReadOnlyTaskList tasks={task.children} level={level + 1} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function TaskAccordion({
  tasks,
  tipsByTask,
  isAuthenticated,
  readOnly,
  level,
  taskStateByKey,
  onTaskStateChange,
}: {
  tasks: TaskNode[];
  tipsByTask: TipsByTask;
  isAuthenticated: boolean;
  readOnly: boolean;
  level: number;
  taskStateByKey: Record<string, TaskState>;
  onTaskStateChange: (taskKey: string, state: TaskState) => void;
}) {
  return (
    <Accordion type="multiple" className={cn("space-y-3", level > 0 && "ml-4")}>
      {tasks.map((task, index) => {
        const tips = tipsByTask[task.key] ?? [];
        const taskState = taskStateByKey[task.key] ?? "none";
        const isDone = !readOnly && taskState === "done";
        const canPostTip =
          taskState === "done" || taskState === "not_necessary" || taskState === "denied";
        const timeEstimate = estimateTaskTime(task);

        return (
          <AccordionItem
            key={task.id}
            value={`${task.id}-${level}`}
            className="relative ml-6 overflow-visible border border-border/70 bg-card/90"
          >
            <ChecklistConnector
              isFirst={index === 0}
              isLast={index === tasks.length - 1}
              tone={readOnly ? "default" : toLineageTone(taskState)}
              className="-left-6"
            />
            <AccordionTrigger className="group">
              <div className="pr-2">
                <p
                  className={cn(
                    "font-semibold text-foreground",
                    isDone && "text-muted-foreground line-through",
                  )}
                >
                  {task.title}
                </p>
                <p className="mt-1 text-xs text-muted-foreground group-data-[state=open]:hidden">
                  Time estimate: {timeEstimate}
                </p>
                <p className="mt-1 hidden text-xs text-muted-foreground group-data-[state=open]:block">
                  {task.description}
                </p>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                {!readOnly ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Status</p>
                      <TaskStateSelector
                        value={taskState}
                        onChange={(state) => onTaskStateChange(task.key, state)}
                      />
                    </div>

                    <section className="space-y-3 border-t border-border/70 pt-3">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <MessageCircleMore className="h-4 w-4 text-primary" />
                        Community Feed
                      </div>

                      {canPostTip ? (
                        isAuthenticated ? (
                          <form
                            action={createTipAction}
                            className="space-y-3"
                          >
                            <input type="hidden" name="taskId" value={task.key} />
                            <Textarea
                              name="content"
                              placeholder="Share what worked, what changed, and where delays happened..."
                              required
                              maxLength={1200}
                            />
                            <Button size="sm" type="submit">
                              Post tip
                            </Button>
                          </form>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            <Link className="font-medium text-foreground underline" href="/sign-in">
                              Sign in
                            </Link> to post updates and vote on tips.
                          </p>
                        )
                      ) : null}

                      {tips.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No reports yet for this step. Be the first to help someone.
                        </p>
                      ) : (
                        <TipCarousel tips={tips} isAuthenticated={isAuthenticated} />
                      )}
                    </section>
                  </>
                ) : null}

                {task.children.length > 0 ? (
                  <section className="space-y-3">
                    <p className="text-sm font-medium text-muted-foreground">Sub-tasks</p>
                    <TaskAccordion
                      tasks={task.children}
                      tipsByTask={tipsByTask}
                      isAuthenticated={isAuthenticated}
                      readOnly={readOnly}
                      level={level + 1}
                      taskStateByKey={taskStateByKey}
                      onTaskStateChange={onTaskStateChange}
                    />
                  </section>
                ) : null}
              </div>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}

function TipCarousel({
  tips,
  isAuthenticated,
}: {
  tips: TipView[];
  isAuthenticated: boolean;
}) {
  const rankedTips = useMemo(
    () =>
      [...tips].sort((a, b) => {
        if (b.upvotes !== a.upvotes) {
          return b.upvotes - a.upvotes;
        }

        if (b.score !== a.score) {
          return b.score - a.score;
        }

        return b.createdAt.localeCompare(a.createdAt);
      }),
    [tips],
  );
  const [activeTipIndex, setActiveTipIndex] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    setActiveTipIndex(0);
  }, [rankedTips.length]);

  useEffect(() => {
    if (rankedTips.length < 2) {
      return;
    }

    const interval = window.setInterval(() => {
      setActiveTipIndex((previous) => (previous + 1) % rankedTips.length);
    }, 5200);

    return () => {
      window.clearInterval(interval);
    };
  }, [rankedTips.length]);

  const activeTip = rankedTips[activeTipIndex];

  const showPreviousTip = () => {
    setActiveTipIndex((previous) => (previous - 1 + rankedTips.length) % rankedTips.length);
  };

  const showNextTip = () => {
    setActiveTipIndex((previous) => (previous + 1) % rankedTips.length);
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="block w-full border border-border/80 bg-background/40 p-3 text-left transition-colors hover:bg-muted/20"
        title="Open magnifier view"
      >
        <div key={activeTip.id} className="animate-[gvt-tip-slide_380ms_ease-out] space-y-2">
          <p className="text-sm leading-relaxed">{activeTip.content}</p>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Top by upvotes · {activeTipIndex + 1}/{rankedTips.length}
            </p>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <ScanSearch className="h-3.5 w-3.5" />
              Magnifier
            </span>
          </div>
        </div>
      </button>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Score: {activeTip.score} · {formatDate(activeTip.createdAt)}
        </p>
        <div className="flex items-center gap-1">
          {rankedTips.length > 1 ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={showPreviousTip}
                aria-label="Previous tip"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={showNextTip}
                aria-label="Next tip"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          ) : null}
          {isAuthenticated ? (
            <>
              <form action={voteTipAction}>
                <input type="hidden" name="tipId" value={activeTip.key} />
                <input type="hidden" name="direction" value="upvote" />
                <Button
                  type="submit"
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2"
                >
                  <ThumbsUp className="h-4 w-4" />
                  {activeTip.upvotes}
                </Button>
              </form>
              <form action={voteTipAction}>
                <input type="hidden" name="tipId" value={activeTip.key} />
                <input type="hidden" name="direction" value="downvote" />
                <Button
                  type="submit"
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2"
                >
                  <ThumbsDown className="h-4 w-4" />
                  {activeTip.downvotes}
                </Button>
              </form>
            </>
          ) : null}
        </div>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-h-[80vh] max-w-2xl p-0">
          <DialogHeader className="border-b border-border p-4">
            <DialogTitle>Community Feed Magnifier</DialogTitle>
            <DialogDescription>
              Browse all tips for this task in ranking order.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[65vh] overflow-y-auto p-4">
            <div className="space-y-2">
              {rankedTips.map((tip, index) => (
                <button
                  key={tip.id}
                  type="button"
                  onClick={() => setActiveTipIndex(index)}
                  className={cn(
                    "w-full border p-3 text-left transition-colors",
                    index === activeTipIndex
                      ? "border-primary/35 bg-primary/5"
                      : "border-border/70 bg-background/30 hover:bg-muted/25",
                  )}
                >
                  <p className="text-sm leading-relaxed">{tip.content}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {tip.upvotes} upvotes · Score {tip.score} · {formatDate(tip.createdAt)}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TaskStateSelector({
  value,
  onChange,
}: {
  value: TaskState;
  onChange: (state: TaskState) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onDocumentPointerDown = (event: MouseEvent) => {
      if (!rootRef.current) {
        return;
      }

      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", onDocumentPointerDown);
    window.addEventListener("keydown", onDocumentKeyDown);

    return () => {
      window.removeEventListener("mousedown", onDocumentPointerDown);
      window.removeEventListener("keydown", onDocumentKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 w-8 p-0"
        onClick={() => setOpen((previous) => !previous)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Task status: ${taskStateLabel(value)}`}
        title={`Task status: ${taskStateLabel(value)}`}
      >
        <TaskStateGlyph state={value} active />
      </Button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-44 rounded-none border border-border bg-card p-1"
        >
          {TASK_STATE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={option.value === value}
              className={cn(
                "flex w-full items-center gap-2 rounded-none px-2 py-1.5 text-left text-sm",
                option.value === value ? "bg-muted/70 text-foreground" : "text-muted-foreground hover:bg-muted/40",
              )}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <TaskStateGlyph state={option.value} active={option.value === value} />
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TaskStateGlyph({ state, active }: { state: TaskState; active: boolean }) {
  if (state === "none") {
    return (
      <span
        className={cn("block h-4 w-4 rounded-full border-2", active ? "border-primary" : "border-muted-foreground")}
      />
    );
  }

  if (state === "half") {
    return (
      <span
        className={cn(
          "relative block h-4 w-4 rounded-full border-2",
          active ? "border-amber-500" : "border-amber-400/70",
        )}
      >
        <span
          className="absolute inset-[2px] overflow-hidden rounded-full"
        >
          <span
            className={cn(
              "absolute inset-y-0 left-0 w-1/2 rounded-l-full",
              active ? "bg-amber-500" : "bg-amber-400/80",
            )}
          />
        </span>
      </span>
    );
  }

  if (state === "not_necessary") {
    return (
      <span
        className={cn(
          "block h-4 w-4 rounded-full border-2",
          active ? "border-slate-400 bg-slate-400" : "border-slate-300 bg-slate-300",
        )}
      />
    );
  }

  if (state === "denied") {
    return (
      <span
        className={cn(
          "relative block h-4 w-4 rounded-full border-2",
          active ? "border-red-500" : "border-red-400/70",
        )}
      >
        <span
          className={cn(
            "absolute inset-x-[2px] top-1/2 h-[2px] -translate-y-1/2 rounded-full",
            active ? "bg-red-500" : "bg-red-400/80",
          )}
        />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "relative block h-4 w-4 rounded-full border-2",
        active ? "border-green-500" : "border-green-400",
      )}
    >
      <span
        className={cn(
          "absolute inset-[2px] rounded-full",
          active ? "bg-green-500" : "bg-green-400",
        )}
      />
    </span>
  );
}

function formatDate(rawDate: string): string {
  const date = new Date(rawDate);

  if (Number.isNaN(date.getTime())) {
    return "just now";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function estimateTaskTime(task: TaskNode): string {
  const descriptionWords = task.description.split(/\s+/).filter(Boolean).length;
  const complexityScore = descriptionWords + task.children.length * 18;
  const minutes = Math.max(8, Math.round(complexityScore / 3));

  if (minutes <= 10) {
    return "5-10 min";
  }

  if (minutes <= 20) {
    return "10-20 min";
  }

  if (minutes <= 35) {
    return "20-35 min";
  }

  if (minutes <= 50) {
    return "35-50 min";
  }

  return "50+ min";
}

function collectUniqueTaskKeys(tasks: TaskNode[]): string[] {
  const keys = new Set<string>();

  const visit = (input: TaskNode[]) => {
    for (const task of input) {
      if (task.key) {
        keys.add(task.key);
      }

      if (task.children.length > 0) {
        visit(task.children);
      }
    }
  };

  visit(tasks);

  return Array.from(keys);
}

function parseStoredTaskState(raw: string | null): Record<string, TaskState> {
  if (!raw) {
    return {};
  }

  const parsed: unknown = JSON.parse(raw);

  if (Array.isArray(parsed)) {
    const taskStateByKey: Record<string, TaskState> = {};

    for (const taskKey of parsed) {
      if (typeof taskKey === "string") {
        taskStateByKey[taskKey] = "done";
      }
    }

    return taskStateByKey;
  }

  if (!parsed || typeof parsed !== "object") {
    return {};
  }

  const taskStateByKey: Record<string, TaskState> = {};

  for (const [taskKey, state] of Object.entries(parsed)) {
    if (typeof taskKey !== "string" || !isTaskState(state)) {
      continue;
    }

    taskStateByKey[taskKey] = state;
  }

  return taskStateByKey;
}

function isTaskState(value: unknown): value is TaskState {
  return (
    value === "none" ||
    value === "half" ||
    value === "done" ||
    value === "not_necessary" ||
    value === "denied"
  );
}

function taskStateLabel(state: TaskState): string {
  if (state === "none") {
    return "Not started";
  }

  if (state === "half") {
    return "Started";
  }

  if (state === "not_necessary") {
    return "Not necessary";
  }

  if (state === "denied") {
    return "Denied";
  }

  return "Done";
}

function toLineageTone(taskState: TaskState): "default" | "in_progress" | "completed" | "optional" | "blocked" {
  if (taskState === "half") {
    return "in_progress";
  }

  if (taskState === "done") {
    return "completed";
  }

  if (taskState === "not_necessary") {
    return "optional";
  }

  if (taskState === "denied") {
    return "blocked";
  }

  return "default";
}
