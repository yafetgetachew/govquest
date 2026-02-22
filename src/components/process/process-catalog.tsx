"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";

import {
  getQuestModeEventName,
  getQuestProgressEventName,
  type QuestModeEventDetail,
  type QuestProgressEventDetail,
  toUserScope,
} from "@/components/process/quest-storage";
import { Input } from "@/components/ui/input";
import { TransitionLink } from "@/components/ui/transition-link";
import type { ProcessNode } from "@/lib/types";

interface ProcessCatalogProps {
  processes: ProcessNode[];
  userId?: string | null;
  startedProgressByProcessKey?: Record<string, number>;
}

interface StartedProcessSummary {
  process: ProcessNode;
  progressPercent: number;
}

export function ProcessCatalog({
  processes,
  userId,
  startedProgressByProcessKey = {},
}: ProcessCatalogProps) {
  const [query, setQuery] = useState("");
  const [progressByProcessKey, setProgressByProcessKey] = useState<Record<string, number>>(
    startedProgressByProcessKey,
  );
  const [placeholder, setPlaceholder] = useState("");
  const [typingPhraseIndex, setTypingPhraseIndex] = useState(0);
  const [isDeletingPlaceholder, setIsDeletingPlaceholder] = useState(false);

  const normalizedQuery = query.trim().toLowerCase();
  const hasQuery = normalizedQuery.length > 0;
  const userScope = useMemo(() => toUserScope(userId), [userId]);
  const typingPhrases = useMemo(() => {
    const basePhrases = ["Birth certificate", "driver licence"];
    const processPhrases = processes.map((process) => process.title);
    const unique = new Set<string>();

    for (const phrase of [...basePhrases, ...processPhrases]) {
      const normalized = phrase.trim();
      if (normalized.length > 0) {
        unique.add(normalized);
      }
    }

    return Array.from(unique);
  }, [processes]);

  const matchedProcesses = useMemo(() => {
    if (!hasQuery) {
      return [];
    }

    const ranked = processes.flatMap((process) => {
      const score = scoreProcessMatch(process, normalizedQuery);
      if (score === null) {
        return [];
      }

      return [{ process, score }];
    });

    ranked.sort((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score;
      }

      return left.process.title.localeCompare(right.process.title);
    });

    return ranked.slice(0, 3).map((entry) => entry.process);
  }, [hasQuery, normalizedQuery, processes]);

  useEffect(() => {
    setProgressByProcessKey(startedProgressByProcessKey);
  }, [startedProgressByProcessKey]);

  const startedSummaries = useMemo<StartedProcessSummary[]>(
    () =>
      processes.flatMap((process) => {
        const progressPercent = progressByProcessKey[process.key];
        if (typeof progressPercent !== "number") {
          return [];
        }

        return [{
          process,
          progressPercent: clampPercent(progressPercent),
        }];
      }),
    [processes, progressByProcessKey],
  );

  useEffect(() => {
    if (!userId) {
      setProgressByProcessKey({});
      return;
    }

    const onQuestModeChanged = (event: Event) => {
      const customEvent = event as CustomEvent<QuestModeEventDetail>;
      if (customEvent.detail?.userScope !== userScope) {
        return;
      }

      const processKey = customEvent.detail?.processKey;
      if (!processKey) {
        return;
      }

      setProgressByProcessKey((previous) => {
        if (customEvent.detail.started) {
          return {
            ...previous,
            [processKey]: previous[processKey] ?? 0,
          };
        }

        const next = { ...previous };
        delete next[processKey];
        return next;
      });
    };

    const onQuestProgressChanged = (event: Event) => {
      const customEvent = event as CustomEvent<QuestProgressEventDetail>;
      if (customEvent.detail?.userScope !== userScope) {
        return;
      }

      const processKey = customEvent.detail?.processKey;
      if (!processKey) {
        return;
      }

      setProgressByProcessKey((previous) => {
        if (!(processKey in previous)) {
          return previous;
        }

        return {
          ...previous,
          [processKey]: clampPercent(customEvent.detail.progressPercent),
        };
      });
    };

    window.addEventListener(getQuestModeEventName(), onQuestModeChanged as EventListener);
    window.addEventListener(getQuestProgressEventName(), onQuestProgressChanged as EventListener);

    return () => {
      window.removeEventListener(getQuestModeEventName(), onQuestModeChanged as EventListener);
      window.removeEventListener(getQuestProgressEventName(), onQuestProgressChanged as EventListener);
    };
  }, [userId, userScope]);

  useEffect(() => {
    if (typingPhrases.length === 0) {
      setPlaceholder("");
      return;
    }

    const currentPhrase = typingPhrases[typingPhraseIndex % typingPhrases.length];
    let timeoutId: number;

    if (!isDeletingPlaceholder && placeholder.length < currentPhrase.length) {
      timeoutId = window.setTimeout(() => {
        setPlaceholder(currentPhrase.slice(0, placeholder.length + 1));
      }, 70);
    } else if (!isDeletingPlaceholder && placeholder.length === currentPhrase.length) {
      timeoutId = window.setTimeout(() => {
        setIsDeletingPlaceholder(true);
      }, 1200);
    } else if (isDeletingPlaceholder && placeholder.length > 0) {
      timeoutId = window.setTimeout(() => {
        setPlaceholder(currentPhrase.slice(0, placeholder.length - 1));
      }, 40);
    } else {
      timeoutId = window.setTimeout(() => {
        setIsDeletingPlaceholder(false);
        setTypingPhraseIndex((previous) => (previous + 1) % typingPhrases.length);
      }, 240);
    }

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isDeletingPlaceholder, placeholder, typingPhraseIndex, typingPhrases]);

  return (
    <section className="min-h-[calc(100vh-15rem)]">
      <div className="mx-auto flex min-h-[calc(100vh-15rem)] w-full max-w-xl flex-col justify-center">
        <Link
          href="/"
          data-gvt-wordmark-home="true"
          className="gvt-wordmark gvt-wordmark-anchor mb-10 text-center text-7xl font-black leading-[0.9] tracking-tight sm:mb-12 sm:text-8xl"
        >
          GovQuest
        </Link>
        <div className="gvt-search-sheen w-full">
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
            aria-label="Search processes"
            className="h-11 bg-background/80 text-base focus-visible:border-foreground/30 focus-visible:ring-1 focus-visible:ring-foreground/20"
          />
        </div>

        <div className="relative mt-4 min-h-[120px]">
          {!hasQuery && startedSummaries.length > 0 ? (
            <div className="absolute left-1/2 top-0 flex w-[min(100vw-2rem,64rem)] -translate-x-1/2 flex-wrap justify-center gap-2">
              {startedSummaries.map(({ process, progressPercent }) => (
                <TransitionLink
                  key={process.id}
                  href={`/process/${process.key}`}
                  className="inline-flex min-w-[180px] items-center justify-between gap-3 border border-border/70 bg-background/50 px-3 py-2 text-sm transition-[transform,border-color,background-color] duration-200 hover:-translate-y-0.5 hover:border-foreground/25 hover:bg-muted/30"
                >
                  <p className="font-medium text-foreground">{process.title}</p>
                  <p className="text-xs text-muted-foreground">{progressPercent}%</p>
                </TransitionLink>
              ))}
            </div>
          ) : null}

          {hasQuery && matchedProcesses.length === 0 ? (
            <p className="absolute inset-x-0 top-4 text-center text-sm text-muted-foreground">
              No process matches your search.
            </p>
          ) : null}

          {hasQuery && matchedProcesses.length > 0 ? (
            <div className="absolute inset-x-0 top-0 space-y-2">
              {matchedProcesses.map((process) => (
                <TransitionLink
                  key={process.id}
                  href={`/process/${process.key}`}
                  className="group block border border-border/70 bg-card px-4 py-5 transition-[background-color,border-color,transform] duration-200 ease-out hover:-translate-y-[1px] hover:border-foreground/25 hover:bg-card/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <p className="text-lg font-semibold text-foreground">{process.title}</p>
                      <p className="text-sm text-muted-foreground">{process.summary}</p>
                    </div>
                    <span
                      className="inline-flex h-9 w-9 items-center justify-center text-muted-foreground transition-[color,transform] duration-200 group-hover:translate-x-0.5 group-hover:text-foreground"
                      aria-hidden
                    >
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </div>
                </TransitionLink>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

function scoreProcessMatch(process: ProcessNode, query: string): number | null {
  const title = process.title.toLowerCase();
  const summary = process.summary.toLowerCase();

  if (title === query) {
    return 0;
  }

  const titleStarts = title.startsWith(query);
  if (titleStarts) {
    return 10;
  }

  const titleContainsIndex = title.indexOf(query);
  if (titleContainsIndex !== -1) {
    return 20 + titleContainsIndex;
  }

  const summaryContainsIndex = summary.indexOf(query);
  if (summaryContainsIndex !== -1) {
    return 200 + summaryContainsIndex;
  }

  const compactQuery = query.replace(/\s+/g, "");
  if (compactQuery.length === 0) {
    return null;
  }

  const titleFuzzyScore = scoreSubsequenceMatch(title, compactQuery);
  if (titleFuzzyScore !== null) {
    return 400 + titleFuzzyScore;
  }

  const summaryFuzzyScore = scoreSubsequenceMatch(summary, compactQuery);
  if (summaryFuzzyScore !== null) {
    return 700 + summaryFuzzyScore;
  }

  return null;
}

function scoreSubsequenceMatch(text: string, query: string): number | null {
  const compactText = text.replace(/\s+/g, "");
  let cursor = 0;
  let firstIndex = -1;
  let lastIndex = -1;

  for (const character of query) {
    const found = compactText.indexOf(character, cursor);
    if (found === -1) {
      return null;
    }

    if (firstIndex === -1) {
      firstIndex = found;
    }

    lastIndex = found;
    cursor = found + 1;
  }

  if (firstIndex === -1 || lastIndex === -1) {
    return null;
  }

  const span = lastIndex - firstIndex + 1;
  return span - query.length;
}
