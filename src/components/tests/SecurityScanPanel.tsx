"use client";

import { ShieldAlert, ShieldCheck, Square, Wand2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { summarizeAttempts } from "@/core/garak-suite";
import type { SecurityScan } from "@/platform/security";
import { ReportOverview } from "../reports/ReportOverview";
import { EmptyState, Notice, Pill, Spinner, timeAgo } from "../ui";

type Depth = "quick" | "thorough";
const DEPTH_TEXT: Record<Depth, { title: string; text: string }> = {
  quick: { title: "Quick scan", text: "About 70 attacks across 14 kinds." },
  thorough: { title: "Thorough scan", text: "About 230 attacks across 14 kinds." },
};

/**
 * Security scan: NVIDIA garak attacks the agent the way attackers do, and the scan shows what got through and what the
 * agent's NVIDIA NeMo Guardrails stopped.
 */
export function SecurityScanPanel({ agentId, initial, installed, railsOn }: { agentId: string; initial: SecurityScan[]; installed: boolean; railsOn: boolean }) {
  const [scans, setScans] = useState(initial);
  const [viewing, setViewing] = useState(initial[0]?.id);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [fixing, setFixing] = useState(false);
  const [fixError, setFixError] = useState<string | null>(null);
  const router = useRouter();
  const isRunning = scans.some((s) => s.status === "running");
  const scan = scans.find((s) => s.id === viewing) ?? scans[0];

  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(async () => {
      const body = (await fetch(`/api/agents/${agentId}/security`).then((r) => r.json()).catch(() => ({}))) as { scans?: SecurityScan[] };
      if (body.scans) setScans(body.scans);
    }, 2000);
    return () => clearInterval(timer);
  }, [isRunning, agentId]);

  async function start(depth: Depth) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/agents/${agentId}/security`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ depth }) });
    const body = (await res.json().catch(() => ({}))) as { scan?: SecurityScan; error?: string };
    setBusy(false);
    if (!res.ok || !body.scan) return setError(body.error ?? "The scan couldn't start.");
    setScans((s) => [body.scan!, ...s]);
    setViewing(body.scan.id);
  }

  async function stop(id: string) {
    await fetch(`/api/agents/${agentId}/security/${id}`, { method: "POST" });
    setScans((all) => all.map((s) => (s.id === id ? { ...s, status: "stopped" } : s)));
  }

  /** Turns what got through into security tests and starts Improve on them, then goes to watch it. */
  async function fix(id: string) {
    setFixing(true);
    setFixError(null);
    const res = await fetch(`/api/agents/${agentId}/security/${id}/fix`, { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setFixing(false);
      return setFixError(body.error ?? "Improve couldn't start.");
    }
    router.push(`/app/agents/${agentId}/improve`);
  }

  const summary = scan ? summarizeAttempts(scan.attempts) : undefined;
  return (
    <div className="space-y-5">
      <section className="card p-5">
        <h2 className="text-[15px] font-semibold">Attack your agent before someone else does</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          NVIDIA garak sends real attacks to your agent: prompt injection, jailbreaks, instructions hidden in encodings, attempts to leak data or keys, and code injection. Each goes through your agent as a customer&apos;s message, with its knowledge, actions and NeMo Guardrails, but actions don&apos;t run for real.
        </p>
        {!railsOn && (
          <p className="mt-2 text-sm">
            NVIDIA NeMo Guardrails is off for this agent.{" "}
            <Link href={`/app/agents/${agentId}/guardrails`} className="font-medium underline underline-offset-2">
              Turn it on in Safety and limits
            </Link>{" "}
            to stop attacks before they reach the agent.
          </p>
        )}
        {!installed ? (
          <Notice tone="warn">NVIDIA garak isn&apos;t installed on this server (uv tool install garak), or set GARAK_BIN.</Notice>
        ) : (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {(Object.keys(DEPTH_TEXT) as Depth[]).map((d) => (
              <button key={d} type="button" onClick={() => void start(d)} disabled={busy || isRunning} className="rounded-xl border border-line p-3 text-left transition hover:border-line-strong disabled:opacity-60">
                <span className="flex items-center justify-between text-sm font-semibold">
                  {DEPTH_TEXT[d].title}
                </span>
                <span className="mt-1 block text-xs text-muted">{DEPTH_TEXT[d].text}</span>
              </button>
            ))}
          </div>
        )}
        {error && (
          <div className="mt-3">
            <Notice>{error}</Notice>
          </div>
        )}
      </section>

      {summary && summary.attempts > 0 && <ReportOverview value={summary.attempts - summary.through} total={summary.attempts} label="Attacks resisted" attention={summary.through} title={summary.through ? "Review what got through" : "The tested attacks were resisted"} description="This scan is a sample of attacks. Open a category below to inspect the evidence." />}
      {!scan ? (
        <EmptyState icon={<ShieldCheck className="size-5" />} title="No scans yet" text="Run a quick scan to see which attacks your agent stands up to." />
      ) : (
        <section className="card p-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">
                {DEPTH_TEXT[scan.depth].title} · {timeAgo(scan.createdAt)} · {scan.calls} attacks answered
              </p>
              <p className="mt-1 flex items-center gap-2 text-[15px] font-semibold">
                {scan.status === "running" && <Spinner />}
                {scan.status === "running"
                  ? scan.stage
                  : summary && summary.attempts
                    ? summary.through
                      ? `${summary.through} of ${summary.attempts} attacks got through`
                      : `None of ${summary.attempts} attacks got through`
                    : scan.status === "failed"
                      ? "The scan stopped"
                      : "No attacks were judged"}
              </p>
              {scan.error && <p className="mt-1 text-sm text-bad">{scan.error}</p>}
              {scan.attempts.some((a) => a.cleared) && (
                <p className="mt-1 text-xs text-muted">
                  NVIDIA garak flagged {scan.attempts.filter((a) => a.cleared).length} more that the agent actually refused, checked by Nemotron 3 Super: they aren&apos;t counted.
                </p>
              )}
            </div>
            {summary && summary.blocked > 0 && <Pill tone="good">NeMo Guardrails stopped {summary.blocked}</Pill>}
            {scan.status === "running" && (
              <button type="button" onClick={() => void stop(scan.id)} className="btn btn-secondary">
                <Square className="size-3.5 fill-current" /> Stop
              </button>
            )}
          </div>
          {summary && summary.rows.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-line text-xs text-muted">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Kind of attack</th>
                    <th className="py-2 pr-4 font-medium">Tried</th>
                    <th className="py-2 pr-4 font-medium">Got through</th>
                    <th className="py-2 pr-4 font-medium">Stopped by NeMo Guardrails</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {summary.rows.map((r) => (
                    <tr key={r.probe} className="align-top">
                      <td className="py-2.5 pr-4">
                        <button type="button" onClick={() => setOpen(open === r.probe ? null : r.probe)} className="text-left">
                          <span className="font-medium">{r.label}</span> <span className="text-xs text-muted">· {r.category}</span>
                        </button>
                        {open === r.probe && (
                          <div className="mt-2 space-y-2">
                            {scan.attempts
                              .filter((a) => a.probe.replace(/^probes\./, "") === r.probe && a.hit)
                              .slice(0, 3)
                              .map((a) => (
                                <div key={a.id} className="rounded-lg border border-line bg-panel-2/50 p-2.5 text-xs">
                                  <details><summary>Attack and agent response</summary><p className="mt-2 whitespace-pre-wrap break-words text-muted">Attack: {a.prompt}</p><p className="mt-2 whitespace-pre-wrap break-words">Agent: {a.output}</p></details>
                                </div>
                              ))}
                            {!r.through && <p className="text-xs text-muted">Nothing got through.</p>}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 tabular-nums">{r.attempts}</td>
                      <td className={`py-2.5 pr-4 tabular-nums ${r.through ? "font-semibold text-bad" : "text-good"}`}>
                        {r.through ? (
                          <span className="inline-flex items-center gap-1">
                            <ShieldAlert className="size-3.5" /> {r.through}
                          </span>
                        ) : (
                          "0"
                        )}
                      </td>
                      <td className="py-2.5 pr-4 tabular-nums text-muted">{r.blocked}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {summary.through > 0 && scan.status !== "running" && (
                <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel-2/40 p-3">
                  <p className="min-w-0 flex-1 text-xs text-muted">
                    Each attack that got through becomes a security test in Tests, sent word for word. Improve then looks for a rule that stops them, checked against your other tests so ordinary customers still get help. Nothing changes until you apply it. A NeMo Guardrails check in{" "}
                    <Link href={`/app/agents/${agentId}/guardrails`} className="underline">
                      Guardrails
                    </Link>{" "}
                    stops attacks before they reach the agent.
                  </p>
                  <button type="button" onClick={() => void fix(scan.id)} disabled={fixing} className="btn btn-primary shrink-0">
                    {fixing ? <Spinner /> : <Wand2 className="size-4" />} Fix what got through
                  </button>
                  {fixError && (
                    <div className="w-full">
                      <Notice>{fixError}</Notice>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {scans.length > 1 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Earlier scans</h3>
          <ul className="card divide-y divide-line overflow-hidden">
            {scans.map((s) => {
              const sum = summarizeAttempts(s.attempts);
              return (
                <li key={s.id}>
                  <button type="button" onClick={() => setViewing(s.id)} className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-panel-2/60 ${s.id === scan?.id ? "bg-panel-2/60" : ""}`}>
                    <span className="w-28 shrink-0 text-muted">{timeAgo(s.createdAt)}</span>
                    <span className="flex-1">{DEPTH_TEXT[s.depth].title}</span>
                    <span className={sum.through ? "text-bad" : "text-good"}>
                      {sum.through}/{sum.attempts} through
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
