"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

const TEST_USER = {
  name: "Test Citizen",
  email: "test.citizen@govquest.local",
  password: "Test@123456",
};

export function SignInForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);
  const [testUserPending, setTestUserPending] = useState(false);

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

            const result = await authClient.signIn.email({
              email,
              password,
              callbackURL: "/",
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
            <Input id="password" name="password" type="password" required minLength={8} />
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
            await authClient.signIn.social({
              provider: "google",
              callbackURL: "/",
            });
            setGooglePending(false);
          }}
        >
          {googlePending ? "Redirecting..." : "Sign in with Google"}
        </Button>

        <Button
          className="w-full"
          variant="outline"
          disabled={testUserPending}
          onClick={async () => {
            setTestUserPending(true);
            setError(null);

            try {
              await authClient.signUp.email({
                name: TEST_USER.name,
                email: TEST_USER.email,
                password: TEST_USER.password,
                callbackURL: "/",
              });
            } catch {}

            try {
              const signInResult = await authClient.signIn.email({
                email: TEST_USER.email,
                password: TEST_USER.password,
                callbackURL: "/",
              });

              if (signInResult.error) {
                setError(signInResult.error.message ?? "Unable to sign in with test account.");
                setTestUserPending(false);
                return;
              }

              setTestUserPending(false);
              router.push("/");
            } catch (err) {
              const message =
                err instanceof Error ? err.message : "Unable to sign in with test account.";
              setError(message);
              setTestUserPending(false);
            }
          }}
        >
          {testUserPending ? "Preparing test user..." : "Use test account"}
        </Button>

        <div className="border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Test credentials</p>
          <p>Username: {TEST_USER.email}</p>
          <p>Email: {TEST_USER.email}</p>
          <p>Password: {TEST_USER.password}</p>
        </div>

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
