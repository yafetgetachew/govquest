"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";

import { TransitionLink } from "@/components/ui/transition-link";
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
          <TransitionLink href="/sign-in">Sign in</TransitionLink>
        </Button>
        <Button asChild size="sm">
          <TransitionLink href="/sign-up">Create account</TransitionLink>
        </Button>
      </div>
    );
  }

  const username = session.user.name?.trim() || session.user.email.split("@")[0];

  return (
    <div className="flex items-center justify-end gap-2">
      <TransitionLink
        href="/profile"
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        {username}
      </TransitionLink>
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
