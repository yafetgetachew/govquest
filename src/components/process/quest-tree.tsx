"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, FileText, MapPin } from "lucide-react";

import {
  createTipAction,
  syncQuestProgressAction,
  voteTipAction,
  type VoteActionResult,
  type VoteDirection,
} from "@/app/actions";
import { emitQuestProgressChanged, toUserScope } from "@/components/process/quest-storage";
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
import type { ManualTaskStateByKey, TaskNode, TaskState, TipsByTask, TipView } from "@/lib/types";
import { cn } from "@/lib/utils";

interface QuestTreeProps {
  processKey: string;
  tasks: TaskNode[];
  tipsByTask: TipsByTask;
  isAuthenticated: boolean;
  userId?: string | null;
  readOnly?: boolean;
  animateIn?: boolean;
  initialManualTaskStateByKey?: ManualTaskStateByKey;
}

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
  userId,
  readOnly = false,
  animateIn = false,
  initialManualTaskStateByKey = {},
}: QuestTreeProps) {
  const allTaskKeys = useMemo(() => collectUniqueTaskKeys(tasks), [tasks]);
  const userScope = useMemo(
    () => toUserScope(userId),
    [userId],
  );
  const normalizedInitialManualTaskStateByKey = useMemo(
    () => filterManualTaskStateByKnownKeys(initialManualTaskStateByKey, allTaskKeys),
    [allTaskKeys, initialManualTaskStateByKey],
  );
  const [manualTaskStateByKey, setManualTaskStateByKey] = useState<Record<string, TaskState>>(
    normalizedInitialManualTaskStateByKey,
  );
  const completedAtRef = useRef<string | undefined>(undefined);
  const syncStateFingerprintRef = useRef<string>("");
  const syncInFlightFingerprintRef = useRef<string | null>(null);
  const [syncRetryTick, setSyncRetryTick] = useState(0);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const taskStateByKey = useMemo(
    () => computeEffectiveTaskStateByKey(tasks, manualTaskStateByKey),
    [tasks, manualTaskStateByKey],
  );

  useEffect(() => {
    if (readOnly) {
      setManualTaskStateByKey({});
      return;
    }

    setManualTaskStateByKey(normalizedInitialManualTaskStateByKey);
  }, [normalizedInitialManualTaskStateByKey, readOnly]);

  useEffect(() => {
    syncStateFingerprintRef.current = "";
    syncInFlightFingerprintRef.current = null;
    setSyncRetryTick(0);
    setSyncWarning(null);
  }, [processKey, userScope]);

  const resolvedCount = useMemo(
    () =>
      allTaskKeys.filter((taskKey) => {
        const state = taskStateByKey[taskKey];
        return state === "done" || state === "not_necessary" || state === "denied";
      }).length,
    [allTaskKeys, taskStateByKey],
  );
  const completedCount = useMemo(
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
  const isProcessCompleted = totalCount > 0 && completedCount === totalCount;
  const completionText =
    completionPoints % 1 === 0 ? completionPoints.toFixed(0) : completionPoints.toFixed(1);
  const orderedTaskKeys = useMemo(() => collectOrderedTaskKeys(tasks), [tasks]);
  const activeTaskKey = useMemo(() => {
    const inProgressTaskKey = orderedTaskKeys.find(
      (taskKey) => taskStateByKey[taskKey] === "half",
    );

    if (inProgressTaskKey) {
      return inProgressTaskKey;
    }

    const nextNotStartedTaskKey = orderedTaskKeys.find(
      (taskKey) => (taskStateByKey[taskKey] ?? "none") === "none",
    );
    return nextNotStartedTaskKey ?? null;
  }, [orderedTaskKeys, taskStateByKey]);

  useEffect(() => {
    if (!isProcessCompleted) {
      completedAtRef.current = undefined;
      return;
    }

    if (!completedAtRef.current) {
      completedAtRef.current = new Date().toISOString();
    }
  }, [
    isProcessCompleted,
  ]);

  useEffect(() => {
    if (readOnly) {
      return;
    }

    const updatedAt = new Date().toISOString();
    emitQuestProgressChanged({
      processKey,
      userScope,
      progressPercent,
      resolvedCount,
      completedCount,
      totalCount,
      completionPoints,
      completed: isProcessCompleted,
      completedAt: completedAtRef.current,
      updatedAt,
    });
  }, [
    completedCount,
    completionPoints,
    isProcessCompleted,
    processKey,
    progressPercent,
    readOnly,
    resolvedCount,
    totalCount,
    userScope,
  ]);

  useEffect(() => {
    if (readOnly || !isAuthenticated || !userId) {
      syncInFlightFingerprintRef.current = null;
      return;
    }

    const syncPayload = {
      processKey,
      manualTaskStateByKey: filterNonDefaultManualTaskStates(manualTaskStateByKey),
      progressPercent,
      resolvedCount,
      completedCount,
      totalCount,
      completionPoints,
      completed: isProcessCompleted,
      completedAt: completedAtRef.current,
    };
    const fingerprint = JSON.stringify(syncPayload);

    if (
      syncStateFingerprintRef.current === fingerprint ||
      syncInFlightFingerprintRef.current === fingerprint
    ) {
      return;
    }

    let isCancelled = false;
    let retryTimeout: number | undefined;
    const timeout = window.setTimeout(() => {
      syncInFlightFingerprintRef.current = fingerprint;
      void syncQuestProgressAction(syncPayload)
        .then((result) => {
          if (isCancelled) {
            return;
          }

          syncInFlightFingerprintRef.current = null;

          if (!result.ok) {
            syncStateFingerprintRef.current = "";
            if (result.status === "unauthenticated") {
              setSyncWarning("Session expired. Sign in again to sync progress.");
              return;
            }

            setSyncWarning("Could not sync progress yet. Retrying...");
            retryTimeout = window.setTimeout(() => {
              setSyncRetryTick((previous) => previous + 1);
            }, 1500);
            return;
          }

          syncStateFingerprintRef.current = fingerprint;
          setSyncWarning(null);
          if (result.completedAt) {
            completedAtRef.current = result.completedAt;
          }
        })
        .catch(() => {
          if (isCancelled) {
            return;
          }

          syncInFlightFingerprintRef.current = null;
          syncStateFingerprintRef.current = "";
          setSyncWarning("Could not sync progress yet. Retrying...");
          retryTimeout = window.setTimeout(() => {
            setSyncRetryTick((previous) => previous + 1);
          }, 1500);
        });
    }, 300);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeout);
      if (retryTimeout !== undefined) {
        window.clearTimeout(retryTimeout);
      }
    };
  }, [
    completedCount,
    completionPoints,
    isAuthenticated,
    isProcessCompleted,
    manualTaskStateByKey,
    processKey,
    progressPercent,
    readOnly,
    resolvedCount,
    syncRetryTick,
    totalCount,
    userId,
  ]);

  const setTaskState = (taskKey: string, state: TaskState) => {
    setManualTaskStateByKey((previous) => {
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
        {syncWarning ? <p className="text-xs text-destructive">{syncWarning}</p> : null}
      </div>

      <TaskAccordion
        tasks={tasks}
        tipsByTask={tipsByTask}
        isAuthenticated={isAuthenticated}
        readOnly={false}
        level={0}
        sequenceOffset={0}
        animateIn={animateIn}
        taskStateByKey={taskStateByKey}
        onTaskStateChange={setTaskState}
        activeTaskKey={activeTaskKey}
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
          <TaskContextSummary task={task} className="mt-2" includeDescription={false} />
          {getTaskTimeEstimate(task) ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Time estimate: {getTaskTimeEstimate(task)}
            </p>
          ) : null}
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
  sequenceOffset,
  animateIn,
  taskStateByKey,
  onTaskStateChange,
  activeTaskKey,
}: {
  tasks: TaskNode[];
  tipsByTask: TipsByTask;
  isAuthenticated: boolean;
  readOnly: boolean;
  level: number;
  sequenceOffset: number;
  animateIn: boolean;
  taskStateByKey: Record<string, TaskState>;
  onTaskStateChange: (taskKey: string, state: TaskState) => void;
  activeTaskKey: string | null;
}) {
  let runningSequence = sequenceOffset;
  const accordionItems = tasks.map((task, index) => {
    const itemSequence = runningSequence;
    runningSequence += 1 + countTaskNodes(task.children);
    const tips = tipsByTask[task.key] ?? [];
    const taskState = taskStateByKey[task.key] ?? "none";
    const isDone = !readOnly && taskState === "done";
    const isActiveTask = !readOnly && activeTaskKey === task.key;
    const canPostTip =
      taskState === "done" || taskState === "not_necessary" || taskState === "denied";
    const timeEstimate = getTaskTimeEstimate(task);

    return (
      <AccordionItem
        key={task.id}
        value={`${task.id}-${level}`}
        className={cn(
          "relative ml-6 overflow-visible border border-border/70 bg-card/90 data-[state=open]:z-20",
          isActiveTask && "border-primary/45 bg-primary/[0.05]",
          animateIn && "opacity-0 animate-[gvt-task-reveal_360ms_ease-out_forwards]",
        )}
        style={animateIn ? { animationDelay: `${itemSequence * 120}ms` } : undefined}
      >
        <ChecklistConnector
          isFirst={index === 0}
          isLast={index === tasks.length - 1}
          tone={readOnly ? "default" : toLineageTone(taskState)}
          className="-left-6"
        />
        <AccordionTrigger
          className={cn(
            "group",
            isActiveTask && "gvt-task-sheen",
          )}
        >
          <div className="relative z-10 pr-2">
            <p
              className={cn(
                "font-semibold text-foreground",
                isDone && "text-muted-foreground line-through",
              )}
            >
              {task.title}
            </p>
            {timeEstimate ? (
              <p className="mt-1 text-xs text-muted-foreground">Time estimate: {timeEstimate}</p>
            ) : null}
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4">
            <div className={cn("flex gap-3", !readOnly && "items-start justify-between")}>
              <TaskContextSummary
                task={task}
                includeDescription
                className={cn(!readOnly && "min-w-0 flex-1")}
              />
              {!readOnly ? (
                <div className="shrink-0">
                  <TaskStateSelector
                    value={taskState}
                    onChange={(state) => onTaskStateChange(task.key, state)}
                  />
                </div>
              ) : null}
            </div>
            {!readOnly ? (
              <>
                <section className="space-y-3 border-t border-border/70 pt-3">
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
                      No tips yet for this step. Finish the process and help others by sharing your experience
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
                  sequenceOffset={itemSequence + 1}
                  animateIn={animateIn}
                  taskStateByKey={taskStateByKey}
                  onTaskStateChange={onTaskStateChange}
                  activeTaskKey={activeTaskKey}
                />
              </section>
            ) : null}
          </div>
        </AccordionContent>
      </AccordionItem>
    );
  });

  return (
    <Accordion type="single" collapsible className={cn("space-y-3", level > 0 && "ml-4")}>
      {accordionItems}
    </Accordion>
  );
}

function TaskContextSummary({
  task,
  includeDescription,
  className,
}: {
  task: TaskNode;
  includeDescription: boolean;
  className?: string;
}) {
  const hasMeta = task.location || task.links.length > 0 || task.requiredDocuments.length > 0;

  if (!includeDescription && !hasMeta) {
    return null;
  }

  return (
    <section className={cn("space-y-2", className)}>
      {includeDescription ? (
        <p className="text-sm text-muted-foreground">{task.description}</p>
      ) : null}
      {task.location ? (
        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" />
          {task.location}
        </p>
      ) : null}
      {task.links.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {task.links.map((link) => (
            <a
              key={`${task.key}-${link.url}`}
              href={link.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 text-foreground underline underline-offset-4"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {link.label}
            </a>
          ))}
        </div>
      ) : null}
      {task.requiredDocuments.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            {task.requiredDocumentsMode === "one_of"
              ? "Requires one of these documents"
              : "Requires all of these documents"}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {task.requiredDocuments.map((document, index) =>
              document.processKey ? (
                <Link
                  key={`${task.key}-${document.name}-${index}`}
                  href={`/process/${document.processKey}`}
                  className="inline-flex items-center gap-1.5 border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/15"
                >
                  <FileText className="h-3.5 w-3.5" />
                  {document.name}
                </Link>
              ) : (
                <span
                  key={`${task.key}-${document.name}-${index}`}
                  className="inline-flex items-center gap-1.5 border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
                >
                  <FileText className="h-3.5 w-3.5" />
                  {document.name}
                </span>
              ),
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function TipCarousel({
  tips,
  isAuthenticated,
}: {
  tips: TipView[];
  isAuthenticated: boolean;
}) {
  const [localTips, setLocalTips] = useState<TipView[]>(tips);
  const [activeTipIndex, setActiveTipIndex] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalHighlightedTipId, setModalHighlightedTipId] = useState<string | null>(null);
  const [voteFeedback, setVoteFeedback] = useState<{
    message: string;
    tone: "success" | "info" | "error";
  } | null>(null);
  const [votePulse, setVotePulse] = useState<{ tipKey: string; direction: VoteDirection } | null>(
    null,
  );

  const rankedTips = useMemo(() => localTips, [localTips]);

  useEffect(() => {
    setLocalTips(tips);
    setVoteFeedback(null);
    setVotePulse(null);
  }, [tips]);

  useEffect(() => {
    setActiveTipIndex(0);
  }, [rankedTips.length]);

  useEffect(() => {
    if (rankedTips.length < 2) {
      return;
    }

    const interval = window.setInterval(() => {
      setActiveTipIndex((previous) => (previous + 1) % rankedTips.length);
    }, 15000);

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

  const applyVoteResult = (result: VoteActionResult) => {
    if (
      result.ok &&
      result.tipKey &&
      typeof result.currentVote !== "undefined" &&
      typeof result.upvotes === "number" &&
      typeof result.downvotes === "number"
    ) {
      setLocalTips((previous) =>
        previous.map((tip) =>
          tip.key === result.tipKey
            ? {
                ...tip,
                upvotes: result.upvotes as number,
                downvotes: result.downvotes as number,
                score: (result.upvotes as number) - (result.downvotes as number),
                viewerVote: result.currentVote ?? null,
              }
            : tip,
        ),
      );
    }

    if (result.ok && result.tipKey && result.direction) {
      setVotePulse({
        tipKey: result.tipKey,
        direction: result.direction,
      });

      window.setTimeout(() => {
        setVotePulse((current) =>
          current &&
          current.tipKey === result.tipKey &&
          current.direction === result.direction
            ? null
            : current,
        );
      }, 260);
    }

    setVoteFeedback({
      message: result.message,
      tone: !result.ok ? "error" : result.status === "removed" ? "info" : "success",
    });
  };

  const submitVote = async (formData: FormData) => {
    const result = await voteTipAction(formData);
    applyVoteResult(result);
  };

  useEffect(() => {
    if (!voteFeedback) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setVoteFeedback(null);
    }, 3200);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [voteFeedback]);

  const openTipsModal = () => {
    if (!activeTip) {
      return;
    }

    setModalHighlightedTipId(activeTip.id);
    setModalOpen(true);
  };

  const voteButtonClassName = (tip: TipView, direction: VoteDirection) =>
    cn(
      "h-8 px-2",
      direction === "upvote" &&
        tip.viewerVote === "upvote" &&
        "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
      direction === "downvote" &&
        tip.viewerVote === "downvote" &&
        "bg-red-500/12 text-red-700 dark:text-red-300",
      votePulse?.tipKey === tip.key &&
        votePulse.direction === direction &&
        "animate-[gvt-vote-pop_220ms_ease-out]",
    );

  if (!activeTip) {
    return null;
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={openTipsModal}
        className="block w-full border border-border/80 bg-background/40 p-3 text-left transition-colors hover:bg-muted/20"
        title="Open tips"
      >
        <div key={activeTip.id} className="animate-[gvt-tip-slide_380ms_ease-out] space-y-2">
          <p className="text-sm leading-relaxed">{activeTip.content}</p>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Top by upvotes · {activeTipIndex + 1}/{rankedTips.length}
            </p>
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
              <form action={submitVote}>
                <input type="hidden" name="tipId" value={activeTip.key} />
                <input type="hidden" name="direction" value="upvote" />
                <Button
                  type="submit"
                  size="sm"
                  variant="ghost"
                  className={voteButtonClassName(activeTip, "upvote")}
                >
                  ↑ {activeTip.upvotes}
                </Button>
              </form>
              <form action={submitVote}>
                <input type="hidden" name="tipId" value={activeTip.key} />
                <input type="hidden" name="direction" value="downvote" />
                <Button
                  type="submit"
                  size="sm"
                  variant="ghost"
                  className={voteButtonClassName(activeTip, "downvote")}
                >
                  ↓ {activeTip.downvotes}
                </Button>
              </form>
            </>
          ) : null}
        </div>
      </div>
      <VoteToast feedback={voteFeedback} />

      <Dialog
        open={modalOpen}
        onOpenChange={(open) => {
          if (open) {
            setModalHighlightedTipId(activeTip.id);
          }

          setModalOpen(open);
        }}
      >
        <DialogContent className="max-h-[80vh] max-w-2xl p-0">
          <DialogHeader className="border-b border-border p-4">
            <DialogTitle>Tips</DialogTitle>
            <DialogDescription>Ranked by upvotes and recency.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[65vh] overflow-y-auto p-4">
            <div className="space-y-2">
              {rankedTips.map((tip) => (
                <div
                  key={tip.id}
                  className={cn(
                    "w-full border p-3 text-left",
                    tip.id === modalHighlightedTipId
                      ? "border-primary/35 bg-primary/5"
                      : "border-border/70 bg-background/30",
                  )}
                >
                  <div>
                    <p className="text-sm leading-relaxed">{tip.content}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {tip.upvotes} upvotes · Score {tip.score} · {formatDate(tip.createdAt)}
                    </p>
                  </div>
                  {isAuthenticated ? (
                    <div className="mt-2 flex items-center gap-1">
                      <form action={submitVote}>
                        <input type="hidden" name="tipId" value={tip.key} />
                        <input type="hidden" name="direction" value="upvote" />
                        <Button
                          type="submit"
                          size="sm"
                          variant="ghost"
                          className={voteButtonClassName(tip, "upvote")}
                        >
                          ↑ {tip.upvotes}
                        </Button>
                      </form>
                      <form action={submitVote}>
                        <input type="hidden" name="tipId" value={tip.key} />
                        <input type="hidden" name="direction" value="downvote" />
                        <Button
                          type="submit"
                          size="sm"
                          variant="ghost"
                          className={voteButtonClassName(tip, "downvote")}
                        >
                          ↓ {tip.downvotes}
                        </Button>
                      </form>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VoteToast({
  feedback,
}: {
  feedback: { message: string; tone: "success" | "info" | "error" } | null;
}) {
  if (!feedback) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[80]">
      <div
        role="status"
        className={cn(
          "min-w-[180px] border bg-card/95 px-3 py-2 text-xs shadow-sm backdrop-blur-sm",
          feedback.tone === "success" && "border-emerald-500/45 text-emerald-700 dark:text-emerald-300",
          feedback.tone === "info" && "border-border text-foreground",
          feedback.tone === "error" && "border-red-500/45 text-red-700 dark:text-red-300",
          "animate-[gvt-toast-in_160ms_ease-out]",
        )}
      >
        {feedback.message}
      </div>
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
    <div ref={rootRef} className={cn("relative", open && "z-[90]")}>
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
          className="absolute right-0 z-[95] mt-2 w-44 rounded-none border border-border bg-card p-1"
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

function isDocumentPreparationTask(task: TaskNode): boolean {
  const normalizedTitle = task.title.toLowerCase().trim();
  return /\bprepare\b.*\bdocuments?\b/.test(normalizedTitle);
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

function getTaskTimeEstimate(task: TaskNode): string | null {
  if (isDocumentPreparationTask(task)) {
    return null;
  }

  return estimateTaskTime(task);
}

function collectOrderedTaskKeys(tasks: TaskNode[]): string[] {
  const keys: string[] = [];

  const visit = (input: TaskNode[]) => {
    for (const task of input) {
      if (task.key) {
        keys.push(task.key);
      }

      if (task.children.length > 0) {
        visit(task.children);
      }
    }
  };

  visit(tasks);

  return keys;
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

function countTaskNodes(tasks: TaskNode[]): number {
  let total = 0;

  for (const task of tasks) {
    total += 1 + countTaskNodes(task.children);
  }

  return total;
}

function computeEffectiveTaskStateByKey(
  tasks: TaskNode[],
  manualTaskStateByKey: Record<string, TaskState>,
): Record<string, TaskState> {
  const effectiveTaskStateByKey: Record<string, TaskState> = {};

  const applyInheritance = (nodes: TaskNode[], inheritedState?: TaskState) => {
    for (const node of nodes) {
      if (!node.key) {
        applyInheritance(node.children, inheritedState);
        continue;
      }

      const manualState = manualTaskStateByKey[node.key];
      const hasManualState = isTaskState(manualState) && manualState !== "none";
      const nextState = hasManualState ? manualState : inheritedState ?? "none";
      effectiveTaskStateByKey[node.key] = nextState;

      const inheritedForChildren = hasManualState
        ? isTerminalTaskState(manualState)
          ? manualState
          : undefined
        : inheritedState;

      applyInheritance(node.children, inheritedForChildren);
    }
  };

  const applyAggregation = (nodes: TaskNode[]) => {
    for (const node of nodes) {
      applyAggregation(node.children);

      if (!node.key) {
        continue;
      }

      const manualState = manualTaskStateByKey[node.key];
      if (isTaskState(manualState) && manualState !== "none") {
        effectiveTaskStateByKey[node.key] = manualState;
        continue;
      }

      if (node.children.length === 0) {
        continue;
      }

      const childStates = node.children
        .map((child) => (child.key ? effectiveTaskStateByKey[child.key] : null))
        .filter((state): state is TaskState => state !== null);

      if (childStates.length === 0) {
        continue;
      }

      effectiveTaskStateByKey[node.key] = aggregateTaskStateFromChildren(childStates);
    }
  };

  applyInheritance(tasks);
  applyAggregation(tasks);

  return effectiveTaskStateByKey;
}

function aggregateTaskStateFromChildren(childStates: TaskState[]): TaskState {
  const hasHalf = childStates.includes("half");
  const hasNone = childStates.includes("none");
  const terminalStates = childStates.filter(isTerminalTaskState);
  const areAllTerminal = terminalStates.length === childStates.length;

  if (areAllTerminal) {
    const hasDenied = terminalStates.includes("denied");

    if (hasDenied) {
      const uniqueTerminalStates = new Set(terminalStates);
      return uniqueTerminalStates.size === 1 ? "denied" : "half";
    }

    const uniqueTerminalStates = new Set(terminalStates);

    if (uniqueTerminalStates.size === 1) {
      return terminalStates[0];
    }

    return "done";
  }

  if (hasHalf || (hasNone && terminalStates.length > 0)) {
    return "half";
  }

  if (hasNone) {
    return "none";
  }

  return "half";
}

function filterManualTaskStateByKnownKeys(
  taskStateByKey: Record<string, TaskState>,
  knownTaskKeys: string[],
): Record<string, TaskState> {
  if (!taskStateByKey || typeof taskStateByKey !== "object") {
    return {};
  }

  const known = new Set(knownTaskKeys);
  const filtered: Record<string, TaskState> = {};

  for (const [taskKey, state] of Object.entries(taskStateByKey)) {
    if (!known.has(taskKey) || !isTaskState(state) || state === "none") {
      continue;
    }

    filtered[taskKey] = state;
  }

  return filtered;
}

function filterNonDefaultManualTaskStates(
  taskStateByKey: Record<string, TaskState>,
): Record<string, TaskState> {
  const filtered: Record<string, TaskState> = {};

  for (const [taskKey, state] of Object.entries(taskStateByKey)) {
    if (isTaskState(state) && state !== "none") {
      filtered[taskKey] = state;
    }
  }

  return filtered;
}

function isTerminalTaskState(state: TaskState): state is "done" | "not_necessary" | "denied" {
  return state === "done" || state === "not_necessary" || state === "denied";
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
