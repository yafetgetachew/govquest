import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { ProcessQuestMode } from "@/components/process/process-quest-mode";
import { QuestModeToggleButton } from "@/components/process/quest-mode-toggle-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getProcessTaskTree, getTipsByTask } from "@/lib/process-data";
import { getServerSession } from "@/lib/session";
import type { TaskNode } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ProcessPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const [{ process, tasks, taskKeys, connectionError }, session] = await Promise.all([
    getProcessTaskTree(key),
    getServerSession(),
  ]);
  const isAuthenticated = Boolean(session?.user);

  if (connectionError) {
    return (
      <main className="space-y-6 pb-10">
        <Card className="dashboard-card">
          <CardHeader>
            <CardTitle>SurrealDB is not reachable</CardTitle>
            <CardDescription>Start the local database, then refresh this page.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Run:
              {" "}
              <code className="rounded-none bg-muted px-2 py-1 text-foreground">
                docker compose up -d surrealdb surreal-seed
              </code>
            </p>
            <p>
              Current error:
              {" "}
              <code className="rounded-none bg-muted px-2 py-1 text-foreground">{connectionError}</code>
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!process) {
    return (
      <main className="space-y-6 pb-10">
        <Card className="dashboard-card">
          <CardHeader>
            <CardTitle>Process not found</CardTitle>
            <CardDescription>Select a process from the GovQuest catalog.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-medium text-foreground underline underline-offset-4"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to processes
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  const tipsByTask = isAuthenticated ? await getTipsByTask(taskKeys) : {};

  return (
    <main className="space-y-6 pb-10">
      <section className="space-y-3 border-b border-border/80 pb-5">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-foreground underline underline-offset-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to processes
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground">{process.title}</h2>
            <p className="max-w-3xl text-sm text-muted-foreground">{process.summary}</p>
            <p className="max-w-4xl text-xs text-muted-foreground">{summarizeTaskFlow(tasks)}</p>
          </div>
          {isAuthenticated ? <QuestModeToggleButton processKey={process.key} /> : null}
        </div>
      </section>

      <ProcessQuestMode
        processKey={process.key}
        tasks={tasks}
        tipsByTask={tipsByTask}
        isAuthenticated={isAuthenticated}
      />
    </main>
  );
}

function summarizeTaskFlow(tasks: TaskNode[]): string {
  const titles = tasks
    .map((task) => task.title.trim())
    .filter((title) => title.length > 0);

  if (titles.length === 0) {
    return "No task summary available yet.";
  }

  const visibleTitles = titles.slice(0, 8);
  const summary = visibleTitles.join(" -> ");

  if (titles.length > visibleTitles.length) {
    return `${summary} -> ...`;
  }

  return summary;
}
