"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Wordmark } from "./Wordmark";

/**
 * Sign in or create an account: a short form, errors in plain words, then straight to the agents. With an
 * invitation, the new account joins that workspace; `next` is where to go after signing in.
 */
export function AuthForm({ mode, invite, next, closed }: { mode: "login" | "signup"; invite?: { token: string; workspaceName: string }; next?: string; closed?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(form: FormData) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...Object.fromEntries(form), ...(invite ? { invite: invite.token } : {}) }),
    });
    if (res.ok) {
      router.push(next ?? (invite ? "/app" : mode === "signup" ? "/app/agents/new" : "/app"));
      router.refresh();
      return;
    }
    setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Something went wrong. Please try again.");
    setBusy(false);
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Wordmark />
          <h1 className="mt-6 text-2xl font-semibold tracking-[-0.02em]">{invite ? `Join ${invite.workspaceName}` : mode === "signup" ? "Create your account" : "Welcome back"}</h1>
          <p className="mt-2 text-sm text-muted">
            {invite ? "Create your account to join the team." : mode === "signup" ? "Your first AI agent is a few minutes away." : closed ? "Sign in with the login you were given." : "Sign in to your agents."}
          </p>
        </div>
        <form action={submit} className="card space-y-4 p-6">
          {mode === "signup" && (
            <label className="block">
              <span className="label">Your name</span>
              <input name="name" className="field" autoComplete="name" placeholder="Your name" />
            </label>
          )}
          <label className="block">
            <span className="label">Email</span>
            <input name="email" type="email" required className="field" autoComplete="email" placeholder="you@company.com" />
          </label>
          <label className="block">
            <span className="label">Password</span>
            <input name="password" type="password" required minLength={8} className="field" autoComplete={mode === "signup" ? "new-password" : "current-password"} />
            {mode === "signup" && <span className="hint">At least 8 characters.</span>}
            {mode === "login" && (
              <Link href="/forgot" className="hint link">
                Forgot your password?
              </Link>
            )}
          </label>
          {error && <p className="rounded-lg bg-bad-tint px-3 py-2 text-sm text-bad">{error}</p>}
          <button type="submit" disabled={busy} className="btn btn-primary w-full">
            {busy ? "One moment…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-muted">
          {mode === "signup" ? (
            <>
              Already have an account? <Link href={invite ? `/login?next=${encodeURIComponent(`/invite/${invite.token}`)}` : "/login"} className="link">Sign in</Link>
            </>
          ) : closed ? null : (
            <>
              New here? <Link href="/signup" className="link">Create an account</Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
