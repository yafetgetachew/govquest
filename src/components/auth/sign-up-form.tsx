"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function SignUpForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Create account</CardTitle>
        <CardDescription>Register once to comment, upvote, and track your bureaucracy quest.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setPending(true);
            setError(null);

            const formData = new FormData(event.currentTarget);
            const name = String(formData.get("name") ?? "").trim();
            const email = String(formData.get("email") ?? "").trim();
            const password = String(formData.get("password") ?? "");

            const result = await authClient.signUp.email({
              name,
              email,
              password,
              callbackURL: "/",
            });

            setPending(false);

            if (result.error) {
              setError(result.error.message ?? "Unable to create account.");
              return;
            }

            router.push("/");
            router.refresh();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" name="name" required />
          </div>
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
            {pending ? "Creating account..." : "Create account"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link className="font-medium text-foreground underline" href="/sign-in">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
