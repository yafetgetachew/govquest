"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getCompletedHistoryEventName,
  readCompletedProcessHistory,
} from "@/components/process/quest-storage";

interface ProcessTitle {
  key: string;
  title: string;
}

interface ProfileSummaryProps {
  userId: string;
  username: string;
  processTitles: ProcessTitle[];
}

export function ProfileSummary({ userId, username, processTitles }: ProfileSummaryProps) {
  const [history, setHistory] = useState(() => readCompletedProcessHistory(userId));
  const titleByProcessKey = useMemo(
    () => new Map(processTitles.map((process) => [process.key, process.title])),
    [processTitles],
  );

  useEffect(() => {
    const refresh = () => {
      setHistory(readCompletedProcessHistory(userId));
    };

    refresh();

    const onStorage = () => refresh();
    const onHistoryChanged = () => refresh();

    window.addEventListener("storage", onStorage);
    window.addEventListener(getCompletedHistoryEventName(), onHistoryChanged as EventListener);
    window.addEventListener("govquest:quest-progress-changed", onHistoryChanged as EventListener);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(getCompletedHistoryEventName(), onHistoryChanged as EventListener);
      window.removeEventListener("govquest:quest-progress-changed", onHistoryChanged as EventListener);
    };
  }, [userId]);

  return (
    <section className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">{username}</h1>
        <p className="text-sm text-muted-foreground">Completed process history</p>
      </header>

      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">No completed processes yet.</p>
      ) : (
        <div className="space-y-2">
          {history.map((entry, index) => (
            <div
              key={`${entry.processKey}-${entry.completedAt}-${index}`}
              className="flex items-center justify-between gap-3 border border-border/70 bg-card/70 px-3 py-2"
            >
              <p className="text-sm font-medium text-foreground">
                {titleByProcessKey.get(entry.processKey) ?? entry.processKey}
              </p>
              <p className="text-xs text-muted-foreground">{formatDateTime(entry.completedAt)}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function formatDateTime(raw: string): string {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
