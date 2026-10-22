"use client";

import { FlaskConical } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { AgentConfigChange } from "@/core/agents";
import type { Improvement } from "@/platform/improve";
import { Notice, Spinner } from "../ui";

const pct = (m: { passes: number; runs: number }) => (m.runs ? Math.round((m.passes / m.runs) * 100) : 0);

/**
 * "Test this change": the agent's tests run on the saved version and on the unsaved change, side by side, so a builder
 * sees what the change fixes and what it breaks before saving it.
 */
export function TestChange({ agentId, change, disabled }: { agentId: string; change: AgentConfigChange; disabled?: boolean }) {
  const [session, setSession] = useState<Improvement | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const running = session?.status === "running";

  useEffect(() => {
    if (!running || !session) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/agents/${agentId}/improve/${session.id}`);
      const body = (await res.json().catch(() => ({}))) as { session?: Improvement; names?: Record<string, string> };
      if (body.session) setSession(body.session);
      if (body.names) setNames(body.names);
    }, 2000);
    return () => clearInterval(timer);
  }, [running, session, agentId]);

  async function start() {
    setError(null);
    const res = await fetch(`/api/agents/${agentId}/improve/check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ change }) });
    const body = (await res.json().catch(() => ({}))) as { session?: Improvement; error?: string };
    if (!res.ok || !body.session) return setError(body.error ?? "It couldn't start.");
    setSession(body.session);
  }

  const check = session?.state.check;
  const name = (id: string) => names[id] ?? "a test";
  return (
    <div className="space-y-2">
      <button type="button" onClick={() => void start()} disabled={disabled || running} className="btn btn-secondary" title="Run your tests on the saved version and on this change">
        {running ? <Spinner /> : <FlaskConical className="size-4" />} {running ? `Testing… ${session!.state.progress.done}/${session!.state.progress.total}` : "Test this change"}
      </button>
      {error && (
        <Notice>
          {error}{" "}
          {/Add tests first/.test(error) && (
            <Link href={`/app/agents/${agentId}/tests`} className="font-medium underline">
              Open Tests
            </Link>
          )}
        </Notice>
      )}
      {check && session?.status === "done" && (
        <div className="rounded-xl border border-line bg-panel p-3 text-sm">
          <p>
            Saved version: <span className="font-semibold tabular-nums">{pct(check.saved)}%</span> of runs pass · With your change: <span className="font-semibold tabular-nums">{pct(check.draft)}%</span>
          </p>
          {check.fixed.length > 0 && <p className="mt-1 text-good">Fixes: {check.fixed.map(name).join(", ")}</p>}
          {check.broke.length > 0 && <p className="mt-1 text-bad">Breaks: {check.broke.map(name).join(", ")}</p>}
          {!check.fixed.length && !check.broke.length && <p className="mt-1 text-muted">No test changed clearly either way.</p>}
          {check.broke.length > 0 && (
            <p className="mt-1 text-xs text-muted">
              Save it anyway, or let{" "}
              <Link href={`/app/agents/${agentId}/improve`} className="font-medium underline">
                Improve
              </Link>{" "}
              find a fix that doesn&apos;t break them.
            </p>
          )}
        </div>
      )}
      {session?.status === "failed" && <Notice>{session.state.error ?? "The check couldn't finish."}</Notice>}
    </div>
  );
}
