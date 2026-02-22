"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

function getCallbackUrl(): string {
  if (typeof window === "undefined") {
    return "http://localhost:3000/";
  }

  return `${window.location.origin}/`;
}

export function SignInForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    void fetch("/api/auth/sign-in/email", {
      method: "OPTIONS",
      cache: "no-store",
      signal: controller.signal,
    }).catch(() => undefined);

    return () => {
      controller.abort();
    };
  }, []);

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Continue your process quests and post community updates.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setPending(true);
            setError(null);

            const formData = new FormData(event.currentTarget);
            const email = String(formData.get("email") ?? "").trim();
            const password = String(formData.get("password") ?? "");
            const callbackURL = getCallbackUrl();

            const result = await authClient.signIn.email({
              email,
              password,
              callbackURL,
            });

            setPending(false);

            if (result.error) {
              setError(result.error.message ?? "Unable to sign in. Please try again.");
              return;
            }

            router.push("/");
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required minLength={10} />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button className="w-full" type="submit" disabled={pending}>
            {pending ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <Button
          className="w-full"
          variant="outline"
          disabled={googlePending}
          onClick={async () => {
            setGooglePending(true);
            const callbackURL = getCallbackUrl();
            await authClient.signIn.social({
              provider: "google",
              callbackURL,
            });
            setGooglePending(false);
          }}
        >
          {googlePending ? "Redirecting..." : "Sign in with Google"}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          No account yet?{" "}
          <Link className="font-medium text-foreground underline" href="/sign-up">
            Create one
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
