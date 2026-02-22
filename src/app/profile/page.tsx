import { redirect } from "next/navigation";

import { ProfileSummary } from "@/components/profile/profile-summary";
import { getProcessCatalog } from "@/lib/process-data";
import { getServerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const [session, { processes }] = await Promise.all([getServerSession(), getProcessCatalog()]);

  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  const username = session.user.name?.trim() || session.user.email.split("@")[0];
  const processTitles = processes.map((process) => ({
    key: process.key,
    title: process.title,
  }));

  return (
    <main className="mx-auto w-full max-w-3xl pb-10">
      <ProfileSummary userId={session.user.id} username={username} processTitles={processTitles} />
    </main>
  );
}
