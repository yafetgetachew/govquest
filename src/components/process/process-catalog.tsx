"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";

import { Input } from "@/components/ui/input";
import type { ProcessNode } from "@/lib/types";

interface ProcessCatalogProps {
  processes: ProcessNode[];
}

interface StartedProcessSummary {
  process: ProcessNode;
  progressPercent: number;
}

export function ProcessCatalog({ processes }: ProcessCatalogProps) {
  const [query, setQuery] = useState("");
  const [startedSummaries, setStartedSummaries] = useState<StartedProcessSummary[]>([]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredProcesses = useMemo(() => {
    if (!normalizedQuery) {
      return processes;
    }

    return processes.filter((process) => {
      const title = process.title.toLowerCase();
      const summary = process.summary.toLowerCase();
      return title.includes(normalizedQuery) || summary.includes(normalizedQuery);
    });
  }, [normalizedQuery, processes]);

  useEffect(() => {
    const readStartedSummaries = () => {
      const summaries = processes.flatMap((process) => {
        try {
          const started = window.localStorage.getItem(`quest-mode:${process.key}:started`) === "true";
          if (!started) {
            return [];
          }

          const rawMeta = window.localStorage.getItem(`quest-progress-meta:${process.key}`);
          const parsed = parseProgressMeta(rawMeta);

          return [{
            process,
            progressPercent: clampPercent(parsed?.progressPercent ?? 0),
          }];
        } catch {
          return [];
        }
      });

      setStartedSummaries(summaries);
    };

    readStartedSummaries();

    const onStorage = () => readStartedSummaries();
    window.addEventListener("storage", onStorage);
    window.addEventListener("govquest:quest-mode-changed", onStorage as EventListener);
    window.addEventListener("govquest:quest-progress-changed", onStorage as EventListener);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("govquest:quest-mode-changed", onStorage as EventListener);
      window.removeEventListener("govquest:quest-progress-changed", onStorage as EventListener);
    };
  }, [processes]);

  return (
    <section className="space-y-6">
      {startedSummaries.length > 0 ? (
        <section className="space-y-3 border border-primary/25 bg-primary/5 p-4">
          <p className="text-sm font-semibold text-foreground">Continue the process</p>
          <div className="flex flex-wrap gap-2">
            {startedSummaries.map(({ process, progressPercent }) => (
              <Link
                key={process.id}
                href={`/process/${process.key}`}
                className="inline-flex min-w-[180px] items-center justify-between gap-3 border border-border/70 bg-background/50 px-3 py-2 text-sm transition-colors hover:bg-muted/30"
              >
                <p className="font-medium text-foreground">{process.title}</p>
                <p className="text-xs text-muted-foreground">{progressPercent}%</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <div className="mx-auto w-full max-w-xl">
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search processes..."
          aria-label="Search processes"
          className="h-11 bg-background/80 text-base"
        />
      </div>

      {filteredProcesses.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">
          No process matches your search.
        </p>
      ) : (
        <div className="space-y-3">
          {filteredProcesses.map((process) => (
            <Link
              key={process.id}
              href={`/process/${process.key}`}
              className="group block border border-border/70 bg-card px-4 py-5 transition-[background-color,border-color,transform] duration-200 ease-out hover:-translate-y-[1px] hover:border-foreground/25 hover:bg-card/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <p className="text-lg font-semibold text-foreground">{process.title}</p>
                  <p className="max-w-3xl text-sm text-muted-foreground">{process.summary}</p>
                </div>
                <span
                  className="inline-flex h-9 w-9 items-center justify-center text-muted-foreground transition-[color,transform] duration-200 group-hover:translate-x-0.5 group-hover:text-foreground"
                  aria-hidden
                >
                  <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function parseProgressMeta(raw: string | null): {
  progressPercent?: number;
} | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      progressPercent: typeof parsed.progressPercent === "number" ? parsed.progressPercent : 0,
    };
  } catch {
    return null;
  }
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}
