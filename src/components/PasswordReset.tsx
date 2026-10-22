"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Wordmark } from "./Wordmark";

/**
 * A forgotten password: ask for a link by email ("request"), then choose a new password from the link ("reset"). The
 * answer to a request is the same whether or not the email has an account, so the form can't be used to find accounts.
 */
export function PasswordReset({ mode, token, canEmail }: { mode: "request" | "reset"; token?: string; canEmail: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(form: FormData) {
    setBusy(true);
    setError(null);
    const res = await fetch(mode === "request" ? "/api/auth/forgot" : "/api/auth/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...Object.fromEntries(form), ...(token ? { token } : {}) }),
    }).catch(() => undefined);
    setBusy(false);
    if (!res?.ok) return setError(((await res?.json().catch(() => ({}))) as { error?: string } | undefined)?.error ?? "Something went wrong. Please try again.");
    if (mode === "request") return setSent(true);
    router.push("/app");
    router.refresh();
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Wordmark />
          <h1 className="mt-6 text-2xl font-semibold tracking-[-0.02em]">{mode === "request" ? "Forgot your password?" : "Choose a new password"}</h1>
          <p className="mt-2 text-sm text-muted">{mode === "request" ? "We'll email you a link to choose a new one." : "Then you're signed in straight away."}</p>
        </div>
        {mode === "request" && !canEmail ? (
          <div className="card p-6 text-sm text-muted">
            This Keel server can&apos;t send email yet. Ask the person who runs it to reset your password (<code>npm run reset-password -- you@company.com</code>), or to set up email (SMTP_URL).
          </div>
        ) : sent ? (
          <div className="card p-6 text-sm">
            If there&apos;s an account for that email, a link is on its way. It works once, for an hour. Check your spam folder if it doesn&apos;t arrive in a few minutes.
          </div>
        ) : (
          <form action={submit} className="card space-y-4 p-6">
            {mode === "request" ? (
              <label className="block">
                <span className="label">Email</span>
                <input name="email" type="email" required className="field" autoComplete="email" placeholder="you@company.com" />
              </label>
            ) : (
              <label className="block">
                <span className="label">New password</span>
                <input name="password" type="password" required minLength={8} className="field" autoComplete="new-password" />
                <span className="hint">At least 8 characters.</span>
              </label>
            )}
            {error && <p className="rounded-lg bg-bad-tint px-3 py-2 text-sm text-bad">{error}</p>}
            <button type="submit" disabled={busy} className="btn btn-primary w-full">
              {busy ? "One moment…" : mode === "request" ? "Email me a link" : "Save and sign in"}
            </button>
          </form>
        )}
        <p className="mt-6 text-center text-sm text-muted">
          <Link href="/login" className="link">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
