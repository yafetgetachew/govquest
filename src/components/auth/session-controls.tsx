"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, User } from "lucide-react";

import { TransitionLink } from "@/components/ui/transition-link";
import { Button } from "@/components/ui/button";
import { authClient, useSession } from "@/lib/auth-client";

export function SessionControls() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  if (isPending) {
    return <div className="h-7 w-28 border border-border/60 sm:h-9 sm:w-32" />;
  }

  if (!session?.user) {
    return (
      <>
        <div className="flex items-center gap-1 sm:hidden">
          <Button asChild variant="outline" size="sm" className="h-7 px-2 text-xs">
            <TransitionLink href="/sign-in">Sign in</TransitionLink>
          </Button>
          <Button asChild size="sm" className="h-7 px-2 text-xs">
            <TransitionLink href="/sign-up">Join</TransitionLink>
          </Button>
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <Button asChild variant="outline" size="sm">
            <TransitionLink href="/sign-in">Sign in</TransitionLink>
          </Button>
          <Button asChild size="sm">
            <TransitionLink href="/sign-up">Create account</TransitionLink>
          </Button>
        </div>
      </>
    );
  }

  const username = session.user.name?.trim() || session.user.email.split("@")[0];

  return (
    <>
      <div className="flex items-center justify-end gap-1 sm:hidden">
        <Button asChild variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label="Profile" title="Profile">
          <TransitionLink href="/profile">
            <User className="h-3.5 w-3.5" />
          </TransitionLink>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          aria-label="Sign out"
          title="Sign out"
          onClick={async () => {
            await authClient.signOut({
              fetchOptions: {
                onSuccess: () => {
                  router.push("/");
                  router.refresh();
                },
              },
            });
          }}
        >
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="hidden items-center justify-end gap-2 sm:flex">
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
                  router.push("/");
                  router.refresh();
                },
              },
            });
          }}
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </>
  );
}
