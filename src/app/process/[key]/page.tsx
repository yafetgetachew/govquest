import Link from "next/link";
import { ArrowLeft, ExternalLink, MapPin, Monitor, PersonStanding } from "lucide-react";

import { ProcessQuestMode } from "@/components/process/process-quest-mode";
import { QuestModeToggleButton } from "@/components/process/quest-mode-toggle-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getProcessDependencyStats,
  getProcessTaskTree,
  getTipsByTask,
  getUserQuestState,
} from "@/lib/process-data";
import { getServerSession } from "@/lib/session";
import type { AttendanceMode, ProcessNode, TaskNode } from "@/lib/types";

export const dynamic = "force-dynamic";
const isProductionRuntime = process.env.NODE_ENV === "production";

export default async function ProcessPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const [{ process, tasks, taskKeys, connectionError }, session, dependencyStats] = await Promise.all([
    getProcessTaskTree(key),
    getServerSession(),
    getProcessDependencyStats(key),
  ]);
  const isAuthenticated = Boolean(session?.user);
  const questState = await getUserQuestState(key, session?.user?.id ?? null);

  if (connectionError) {
    return (
      <main className="space-y-6 pb-10">
        <Card className="dashboard-card">
          <CardHeader>
            <CardTitle>{isProductionRuntime ? "Database is temporarily unavailable" : "SurrealDB is not reachable"}</CardTitle>
            <CardDescription>
              {isProductionRuntime
                ? "Please refresh in a moment. If this persists, check the app and database containers."
                : "Start the local database, then refresh this page."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            {!isProductionRuntime ? (
              <p>
                Run:
                {" "}
                <code className="rounded-none bg-muted px-2 py-1 text-foreground">
                  docker compose -f docker-compose.dev.yml up -d surrealdb surreal-seed
                </code>
              </p>
            ) : null}
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
            <CardDescription>
              Select a process from the{" "}
              <span className="gvt-wordmark inline-block align-middle font-black">GovQuest</span>{" "}
              catalog.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/"
              className="inline-flex items-center justify-center text-foreground"
              aria-label="Back to processes"
            >
              <ArrowLeft className="h-6 w-6" />
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  const tipsByTask = isAuthenticated ? await getTipsByTask(taskKeys, session?.user?.id ?? null) : {};
  const taskFlow = summarizeTaskFlow(tasks);
  const attendanceModes = resolveAttendanceModes(process);
  const sourceLinks = collectProcessSources(process, tasks);

  return (
    <main className="space-y-6 pb-10">
      <section className="space-y-3 pb-5">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center text-foreground"
            aria-label="Back to processes"
          >
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <h2 className="text-3xl font-semibold tracking-tight text-foreground">{process.title}</h2>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-4xl space-y-3">
            <section className="space-y-2 border border-border/70 bg-card/70 p-3">
              <p className="text-sm font-semibold text-foreground">Process overview</p>
              <p className="text-sm text-muted-foreground">{process.summary}</p>
              {process.explanation ? (
                <p className="text-sm text-muted-foreground">{process.explanation}</p>
              ) : null}
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>
                  Required by
                  {" "}
                  <span className="font-semibold text-foreground">{dependencyStats.requiredByProcessCount}</span>
                  {" "}
                  processes
                </span>
                {process.output ? (
                  <span>
                    Output:
                    {" "}
                    <span className="font-medium text-foreground">{process.output}</span>
                  </span>
                ) : null}
              </div>
            </section>
            {taskFlow.titles.length === 0 ? (
              <p className="max-w-4xl text-xs text-muted-foreground">No task summary available yet.</p>
            ) : (
              <section className="space-y-2">
                <div className="flex max-w-4xl flex-wrap items-center gap-2 text-xs">
                  {taskFlow.titles.map((title, index) => (
                    <span key={`${title}-${index}`} className="inline-flex items-center gap-2">
                      <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-1 font-medium text-primary">
                        {title}
                      </span>
                      {index < taskFlow.titles.length - 1 || taskFlow.truncated ? (
                        <span className="text-muted-foreground">→</span>
                      ) : null}
                    </span>
                  ))}
                  {taskFlow.truncated ? <span className="text-muted-foreground">…</span> : null}
                </div>
              </section>
            )}
            {(process.location || process.links.length > 0) ? (
              <section className="space-y-2">
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {attendanceModes.length > 0 ? (
                    <span className="inline-flex items-center gap-1.5 text-foreground">
                      {attendanceModes.includes("in_person") ? (
                        <span title="In-person attendance required">
                          <PersonStanding className="h-3.5 w-3.5" />
                        </span>
                      ) : null}
                      {attendanceModes.includes("online") ? (
                        <span title="Online attendance required">
                          <Monitor className="h-3.5 w-3.5" />
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                  {process.location ? (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" />
                      {process.location}
                    </span>
                  ) : null}
                  {process.links.map((link) => (
                    <a
                      key={`${process.key}-${link.url}`}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1.5 font-medium text-foreground underline underline-offset-4"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {link.label}
                    </a>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
          {isAuthenticated ? (
            <QuestModeToggleButton
              processKey={process.key}
              userId={session?.user?.id ?? null}
              initialStarted={questState.started}
              initialCompleted={questState.completed}
            />
          ) : null}
        </div>
      </section>

      <ProcessQuestMode
        processKey={process.key}
        tasks={tasks}
        tipsByTask={tipsByTask}
        isAuthenticated={isAuthenticated}
        userId={session?.user?.id ?? null}
        initialStarted={questState.started}
        initialManualTaskStateByKey={questState.manualTaskStateByKey}
      />

      <section className="space-y-3 border-t border-border/70 pt-5">
        <h3 className="text-sm font-semibold text-foreground">Sources</h3>
        {sourceLinks.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {sourceLinks.map((link) => (
              <a
                key={`${process.key}-source-${link.url}`}
                href={link.url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 border border-border/70 bg-card/70 px-2.5 py-1.5 text-xs text-foreground hover:bg-muted/30"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {link.label}
              </a>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No source links listed for this process yet.</p>
        )}
      </section>
    </main>
  );
}

function summarizeTaskFlow(tasks: TaskNode[]): { titles: string[]; truncated: boolean } {
  const titles = tasks
    .map((task) => task.title.trim())
    .filter((title) => title.length > 0);

  if (titles.length === 0) {
    return { titles: [], truncated: false };
  }

  return {
    titles: titles.slice(0, 8),
    truncated: titles.length > 8,
  };
}

function resolveAttendanceModes(process: ProcessNode): AttendanceMode[] {
  if (process.attendanceModes.length > 0) {
    return process.attendanceModes;
  }

  const inferred = inferAttendanceModesFromProcessKey(process.key);
  return inferred.length > 0 ? inferred : ["in_person"];
}

function inferAttendanceModesFromProcessKey(processKey: string): AttendanceMode[] {
  if (
    processKey === "passport" ||
    processKey === "fayda_registration" ||
    processKey === "commercial_registration" ||
    processKey === "trade_license_new" ||
    processKey === "trade_license_renewal" ||
    processKey === "business_visa" ||
    processKey === "tin_registration" ||
    processKey === "police_clearance_certificate" ||
    processKey === "work_permit_foreign_employee" ||
    processKey === "electricity_new_connection"
  ) {
    return ["in_person", "online"];
  }

  if (
    processKey === "temporary_residence_marriage" ||
    processKey === "ethiopian_origin_id" ||
    processKey === "kebele_id_residency" ||
    processKey === "drivers_license_issue" ||
    processKey === "voter_registration" ||
    processKey === "student_id_card" ||
    processKey === "birth_certificate_issuance" ||
    processKey === "marriage_certificate_registration"
  ) {
    return ["in_person"];
  }

  return [];
}

function collectProcessSources(process: ProcessNode, tasks: TaskNode[]): Array<{ label: string; url: string }> {
  const byUrl = new Map<string, { label: string; url: string }>();

  for (const link of process.links) {
    byUrl.set(link.url, { label: link.label, url: link.url });
  }

  const visit = (nodes: TaskNode[]) => {
    for (const task of nodes) {
      for (const link of task.links) {
        if (!byUrl.has(link.url)) {
          byUrl.set(link.url, { label: link.label, url: link.url });
        }
      }

      if (task.children.length > 0) {
        visit(task.children);
      }
    }
  };

  visit(tasks);

  return Array.from(byUrl.values()).sort((left, right) => left.label.localeCompare(right.label));
}
