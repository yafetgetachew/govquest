import { ProcessCatalog } from "@/components/process/process-catalog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getProcessCatalog } from "@/lib/process-data";

export const revalidate = 120;

export default async function HomePage() {
  const { processes, connectionError } = await getProcessCatalog();

  if (connectionError) {
    return (
      <main className="space-y-6">
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
        <ProcessCatalog processes={processes} />
      )}
    </main>
  );
}
