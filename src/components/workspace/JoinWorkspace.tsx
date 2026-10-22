"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Wordmark } from "../Wordmark";
import { Notice } from "../ui";

/** Joining a workspace from an invitation, signed in. */
export function JoinWorkspace({ token, workspaceName, role, email }: { token: string; workspaceName: string; role: string; email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setBusy(true);
    const res = await fetch("/api/invites/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setBusy(false);
      return setError(body.error ?? "You couldn't join just now.");
    }
    router.push("/app");
    router.refresh();
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm text-center">
        <Wordmark />
        <h1 className="mt-6 text-2xl font-semibold tracking-[-0.02em]">Join {workspaceName}</h1>
        <p className="mt-2 text-sm text-muted">
          You&apos;ll join as {role === "admin" ? "an admin" : "a member"}, signed in as {email}.
        </p>
        {error && (
          <div className="mt-4">
            <Notice>{error}</Notice>
          </div>
        )}
        <button type="button" onClick={() => void join()} disabled={busy} className="btn btn-primary mt-6 w-full">
          {busy ? "Joining…" : `Join ${workspaceName}`}
        </button>
      </div>
    </div>
  );
}
