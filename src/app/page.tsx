import { ProcessCatalog } from "@/components/process/process-catalog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getProcessCatalog, getUserStartedProcessProgress } from "@/lib/process-data";
import { getServerSession } from "@/lib/session";

export const dynamic = "force-dynamic";
const isProductionRuntime = process.env.NODE_ENV === "production";

export default async function HomePage() {
  const [{ processes, connectionError }, session] = await Promise.all([
    getProcessCatalog(),
    getServerSession(),
  ]);
  const startedProgress = await getUserStartedProcessProgress(session?.user?.id ?? null);
  const startedProgressByProcessKey = Object.fromEntries(
    startedProgress.map((entry) => [entry.processKey, entry.progressPercent]),
  );

  if (connectionError) {
    return (
      <main className="space-y-6">
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

  return (
    <main className="space-y-6 pb-10">
      {processes.length === 0 ? (
        <section className="space-y-2">
          <h3 className="text-lg font-semibold text-foreground">No processes found</h3>
          <p className="text-sm text-muted-foreground">
            Import `surreal/schema-and-seed.surql` to seed the{" "}
            <span className="gvt-wordmark inline-block align-middle font-black">GovQuest</span>{" "}
            process catalog.
          </p>
        </section>
      ) : (
        <ProcessCatalog
          processes={processes}
          userId={session?.user?.id ?? null}
          startedProgressByProcessKey={startedProgressByProcessKey}
        />
      )}
    </main>
  );
}
