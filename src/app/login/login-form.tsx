"use client";

/**
 * Client-side login form.
 *
 * Posts JSON to `/api/auth/login`. On success, navigates to the
 * `from` prop (or `/` by default). On failure, surfaces the
 * generic error from the server — the server is the source of
 * truth, so we never branch on the *reason* of the failure.
 *
 * While the request is in flight, the submit button is disabled
 * to prevent a double-submit (and the rate limiter from charging
 * the user twice for one form attempt).
 */

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface LoginFormProps {
  /** Where to navigate on a successful login. Must be a same-origin
   *  path (validated by the server-rendered page). */
  from: string;
}

export function LoginForm({ from }: LoginFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        credentials: "same-origin",
        redirect: "manual",
      });
      if (res.status === 429) {
        const retry = res.headers.get("Retry-After") ?? "60";
        setError(`Too many attempts. Try again in ${retry}s.`);
        return;
      }
      if (res.status === 200) {
        // Use a hard navigation so the new session cookie is
        // included on the next request and the proxy sees
        // the user as authenticated.
        window.location.assign(from || "/");
        return;
      }
      // Anything else is a generic auth failure.
      setError("Invalid credentials");
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
      <label className="flex flex-col gap-2">
        <span className="text-muted-foreground font-sans text-xs font-medium tracking-[0.12em] uppercase">
          Username
        </span>
        <Input
          name="username"
          type="text"
          autoComplete="username"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={submitting}
          className="h-10"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-muted-foreground font-sans text-xs font-medium tracking-[0.12em] uppercase">
          Password
        </span>
        <Input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={submitting}
          className="h-10"
        />
      </label>

      {error ? (
        <p
          role="alert"
          aria-live="polite"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-sm border px-3 py-2 font-sans text-sm"
        >
          {error}
        </p>
      ) : null}

      <Button variant="inverted" type="submit" disabled={submitting} mono>
        {submitting ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
