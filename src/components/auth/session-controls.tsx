"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { authClient, useSession } from "@/lib/auth-client";

export function SessionControls() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return <div className="h-9 w-32 border border-border/60" />;
  }

  if (!session?.user) {
    return (
      <div className="flex items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/sign-in">Sign in</Link>
        </Button>
        <Button asChild size="sm">
          <Link href="/sign-up">Create account</Link>
        </Button>
      </div>
    );
  }

  const username = session.user.name?.trim() || session.user.email.split("@")[0];

  return (
    <div className="flex items-center justify-end gap-2">
      <p className="text-sm text-muted-foreground">{username}</p>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        aria-label="Sign out"
        title="Sign out"
        onClick={async () => {
          await authClient.signOut({
            fetchOptions: {
              onSuccess: () => {
                window.location.reload();
              },
            },
          });
        }}
      >
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );
}
