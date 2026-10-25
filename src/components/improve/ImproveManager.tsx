"use client";

import { Check, CircleAlert, History, RotateCcw, Square, Wand2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PATCH_AREA, type Patch } from "@/core/patches";
import { tokenCount } from "@/lib/models";
import type { Candidate, Improvement, Measurement } from "@/platform/improve";
import type { Lesson } from "@/platform/memory";
import { Dialog } from "../Dialog";
import { EmptyState, Notice, Pill, Spinner, timeAgo } from "../ui";

export interface VersionRow {
  id: string;
  label: string;
  origin: string;
  createdAt: string;
  author?: string;
}

type Depth = "quick" | "balanced" | "thorough";
const DEPTH_TEXT: Record<Depth, { title: string; text: string }> = {
  quick: { title: "Quick", text: "Each failing test twice, one round of two fixes." },
  balanced: { title: "Balanced", text: "Each test three times, two rounds of two fixes. Recommended." },
  thorough: { title: "Thorough", text: "Each test three times, three rounds of three fixes." },
};
const CAUSE_TEXT: Record<string, string> = {
  missing_knowledge: "The knowledge doesn't say it",
  knowledge_not_found: "The search missed what the knowledge says",
  instructions: "The instructions don't cover it",
  rules: "A rule is missing or too strict",
  action_not_used: "An action wasn't used",
  action_misused: "An action was used wrongly",
  procedure: "A procedure's steps don't fit",
  model: "The model isn't strong enough",
  test_problem: "The test expects something unfair",
};
const OUTCOME: Record<string, { tone: "good" | "warn" | "bad" | "brand"; text: string }> = {
  improved: { tone: "good", text: "Found a proven improvement." },
  no_improvement: { tone: "warn", text: "No fix held up on repeated runs, so nothing is proposed. Your agent is unchanged." },
  needs_you: { tone: "warn", text: "Every failing test needs you: knowledge only you can add, or a test that conflicts with what the agent is told. See below." },
  already_passing: { tone: "good", text: "Every test already passes on every run. Add harder tests to find more to improve." },
  no_tests: { tone: "warn", text: "There were no tests to measure with." },
  stopped: { tone: "warn", text: "You stopped it." },
  failed: { tone: "bad", text: "Something went wrong while it ran." },
};

const LESSON: Record<Lesson["kind"], { label: string; tone: "good" | "warn" | "bad" | "neutral" }> = {
  kept: { label: "Worked", tone: "good" },
  rejected: { label: "Didn't work", tone: "bad" },
  cause: { label: "Cause found", tone: "neutral" },
  applied: { label: "You applied", tone: "good" },
  discarded: { label: "You discarded", tone: "warn" },
  undone: { label: "You undid", tone: "warn" },
  note: { label: "Your preference", tone: "neutral" },
};

const pct = (m?: { passes: number; runs: number }) => (m && m.runs ? Math.round((m.passes / m.runs) * 100) : 0);

function Score({ m }: { m?: Measurement }) {
  if (!m) return <span className="text-muted">–</span>;
  return (
    <span className="tabular-nums">
      <span className="font-semibold">{pct(m)}%</span> <span className="text-xs text-muted">({m.passes}/{m.runs} runs)</span>
    </span>
  );
}

/** One edit as a before and after. */
function EditView({ patch, actions }: { patch: Patch; actions: Record<string, string> }) {
  const del = (t: string) => <p className="whitespace-pre-wrap rounded bg-[#fdecea] px-2 py-1 text-[#8a1c13] line-through decoration-[#c0261b]/40">{t}</p>;
  const add = (t: string) => <p className="whitespace-pre-wrap rounded bg-[#e7f6ee] px-2 py-1 text-[#05603a]">{t}</p>;
  let body: React.ReactNode;
  switch (patch.kind) {
    case "instructions_add":
    case "rules_add":
      body = add(patch.text);
      break;
    case "instructions_replace":
    case "rules_replace":
      body = (
        <>
          {del(patch.find)}
          {add(patch.replace)}
        </>
      );
      break;
    case "fallback_set":
      body = add(patch.text);
      break;
    case "action_when":
      body = (
        <>
          <p className="font-mono text-xs text-muted">@{patch.action}</p>
          {actions[patch.action] && del(actions[patch.action])}
          {add(patch.description)}
        </>
      );
      break;
    case "procedure_steps":
      body = (
        <>
          <p className="text-xs text-muted">{patch.procedure}</p>
          {add(patch.steps)}
        </>
      );
      break;
    case "procedure_add":
      body = add(`${patch.name}\nWhen: ${patch.trigger}\n${patch.steps}`);
      break;
    case "qa_add":
      body = (
        <>
          {add(`Q: ${patch.question}\nA: ${patch.answer}`)}
          <p className="text-xs text-muted">From your knowledge: &ldquo;{patch.evidence}&rdquo;</p>
        </>
      );
      break;
    case "model_set":
      body = add(`Use the ${patch.model} model`);
      break;
  }
  return (
    <div className="space-y-1.5 rounded-lg border border-line p-3 text-sm">
      <div className="flex items-center gap-2">
        <Pill>{PATCH_AREA[patch.kind]}</Pill>
        <span className="text-xs text-muted">{patch.why}</span>
      </div>
      {body}
    </div>
  );
}

/**
 * Improve: the improvement agent finds why tests fail, tries small fixes on a copy of the agent, and keeps only the fixes
 * proven on repeated, fresh runs without breaking what passed. The builder applies the result, and any version can be
 * restored.
 */
export function ImproveManager({
  agentId,
  initialSessions,
  testCount,
  names,
  actions,
  versions,
  lessons,
}: {
  agentId: string;
  initialSessions: Improvement[];
  testCount: number;
  names: Record<string, string>;
  actions: Record<string, string>;
  versions: VersionRow[];
  /** What the improvement agent remembers about this agent, newest first (src/platform/memory.ts). */
  lessons: Lesson[];
}) {
  const router = useRouter();
  const [sessions, setSessions] = useState(initialSessions.filter((s) => s.kind === "improve"));
  const [viewing, setViewing] = useState<string | null>(initialSessions.find((s) => s.kind === "improve")?.id ?? null);
  const [tab, setTab] = useState<"improve" | "history" | "versions" | "memory">("improve");
  const [forgetting, setForgetting] = useState(false);
  const [depth, setDepth] = useState<Depth>("balanced");
  const [fromConversations, setFromConversations] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState<VersionRow | null>(null);
  const running = sessions.find((s) => s.status === "running");
  const isRunning = Boolean(running);
  const session = sessions.find((s) => s.id === viewing) ?? sessions[0];

  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/agents/${agentId}/improve`);
      const body = (await res.json().catch(() => ({}))) as { sessions?: Improvement[] };
      if (body.sessions) {
        const list = body.sessions.filter((s) => s.kind === "improve");
        setSessions(list);
        if (!list.some((s) => s.status === "running")) router.refresh();
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [isRunning, agentId, router]);

  async function start() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/agents/${agentId}/improve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ depth, fromConversations }) });
    const body = (await res.json().catch(() => ({}))) as { session?: Improvement; error?: string };
    setBusy(false);
    if (!res.ok || !body.session) return setError(body.error ?? "It couldn't start.");
    setSessions((s) => [body.session!, ...s]);
    setViewing(body.session.id);
  }

  async function act(id: string, action: "apply" | "discard" | "stop") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/agents/${agentId}/improve/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const body = (await res.json().catch(() => ({}))) as { session?: Improvement; error?: string };
    setBusy(false);
    if (!res.ok || !body.session) return setError(body.error ?? "That didn't work.");
    setSessions((all) => all.map((s) => (s.id === id ? body.session! : s)));
    if (action === "apply") router.refresh();
  }

  async function forget() {
    setBusy(true);
    const res = await fetch(`/api/agents/${agentId}/improve/memory`, { method: "DELETE" });
    setBusy(false);
    setForgetting(false);
    if (!res.ok) return setError("Its memory couldn't be cleared.");
    router.refresh();
  }

  async function restore(v: VersionRow) {
    setBusy(true);
    const res = await fetch(`/api/agents/${agentId}/versions/${v.id}`, { method: "POST" });
    setBusy(false);
    setRestoring(null);
    if (!res.ok) return setError("That version couldn't be restored.");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b border-line">
        {(
          [
            ["improve", "Improve"],
            ["history", `Past sessions${sessions.length ? ` (${sessions.length})` : ""}`],
            ["versions", `Versions${versions.length ? ` (${versions.length})` : ""}`],
            ["memory", `Memory${lessons.length ? ` (${lessons.length})` : ""}`],
          ] as const
        ).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === key ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}>
            {label}
          </button>
        ))}
      </div>
      {error && <Notice>{error}</Notice>}

      {tab === "improve" && (
        <>
          {!running && (
            <section className="card p-5">
              <h2 className="text-[15px] font-semibold">Make the agent better, with proof</h2>
              <p className="mt-1 max-w-3xl text-sm text-muted">
                The improvement agent runs your tests several times, finds why the failing ones fail, and tries small, exact fixes on a copy of your agent. A fix is kept only when it fixes failures without breaking tests that pass, and holds up on a fresh set of runs. Nothing changes until you apply it.
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {(Object.keys(DEPTH_TEXT) as Depth[]).map((d) => (
                  <button key={d} type="button" onClick={() => setDepth(d)} className={`rounded-xl border p-3 text-left transition ${depth === d ? "border-ink bg-panel-2" : "border-line hover:border-line-strong"}`}>
                    <span className="flex items-center justify-between text-sm font-semibold">
                      {DEPTH_TEXT[d].title}
                    </span>
                    <span className="mt-1 block text-xs text-muted">{DEPTH_TEXT[d].text}</span>
                  </button>
                ))}
              </div>
              <label className="mt-4 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={fromConversations} onChange={(e) => setFromConversations(e.target.checked)} className="accent-[var(--ink)]" />
                Also turn recent conversations that went badly (low confidence, handed over, unhappy) into tests
              </label>
              {!testCount && <p className="hint mt-2">There are no tests yet: it will write a crowd of AI customers from what the agent knows first.</p>}
              <button type="button" onClick={() => void start()} disabled={busy} className="btn btn-primary mt-4">
                {busy ? <Spinner /> : <Wand2 className="size-4" />} Start improving
              </button>
            </section>
          )}

          {session ? (
            <SessionView agentId={agentId} session={session} names={names} actions={actions} busy={busy} onAct={(a) => void act(session.id, a)} />
          ) : (
            <EmptyState icon={<Wand2 className="size-5" />} title="No sessions yet" text="Start one above. You'll see each step as it works." />
          )}
        </>
      )}

      {tab === "history" &&
        (sessions.length ? (
          <ul className="card divide-y divide-line overflow-hidden">
            {sessions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    setViewing(s.id);
                    setTab("improve");
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-panel-2/60"
                >
                  <span className="w-28 shrink-0 text-sm text-muted">{timeAgo(s.createdAt)}</span>
                  <span className="flex-1 text-sm">{s.status === "running" ? s.stage : s.state.outcome ? OUTCOME[s.state.outcome]?.text : s.stage}</span>
                  {s.status === "applied" && <Pill tone="good">Applied</Pill>}
                  {s.status === "discarded" && <Pill>Discarded</Pill>}
                  {s.state.tokens ? <span className="text-xs text-muted">{tokenCount(s.state.tokens)}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<History className="size-5" />} title="No sessions yet" text="Past improvement sessions show here." />
        ))}

      {tab === "versions" &&
        (versions.length ? (
          <ul className="card divide-y divide-line overflow-hidden">
            {versions.map((v, i) => (
              <li key={v.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="w-28 shrink-0 text-muted">{timeAgo(v.createdAt)}</span>
                <span className="flex-1">
                  {v.label}
                  {v.author && <span className="text-muted"> · {v.author}</span>}
                </span>
                <Pill tone={v.origin === "improvement" ? "good" : v.origin === "restore" ? "warn" : "neutral"}>{v.origin === "change" ? "Your change" : v.origin[0].toUpperCase() + v.origin.slice(1)}</Pill>
                {i === 0 ? (
                  <span className="w-24 text-right text-xs text-muted">Current</span>
                ) : (
                  <button type="button" onClick={() => setRestoring(v)} className="btn btn-secondary w-24 px-2.5 py-1 text-xs">
                    <RotateCcw className="size-3.5" /> Restore
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<History className="size-5" />} title="No versions yet" text="Each time you save a change or apply an improvement, a version is kept here so you can go back." />
        ))}

      {tab === "memory" && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="max-w-3xl text-sm text-muted">
              What Keel&apos;s agents remember about this agent: your preferences (tell the Copilot, e.g. &ldquo;never change the tone&rdquo;), the fixes that worked and didn&apos;t, why tests failed, and what you applied, discarded or undid. The improvement agent reads it before every session: it follows your preferences, builds on what worked, and never tries again a fix you turned down or one that already failed on the agent as it is. The Copilot&apos;s Analyst reads it too.
            </p>
            {lessons.length > 0 && (
              <button type="button" onClick={() => setForgetting(true)} className="btn btn-secondary px-3 py-1.5 text-xs">
                Forget it all
              </button>
            )}
          </div>
          {lessons.length ? (
            <ul className="card divide-y divide-line overflow-hidden">
              {lessons.map((l, i) => (
                <li key={i} className="flex items-start gap-3 px-4 py-3 text-sm">
                  <span className="w-28 shrink-0 text-muted">{timeAgo(l.at)}</span>
                  <span className="flex-1">{l.text}</span>
                  <Pill tone={LESSON[l.kind].tone}>{LESSON[l.kind].label}</Pill>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<History className="size-5" />} title="Nothing learned yet" text="After its first session, the improvement agent keeps what it learned here." />
          )}
        </section>
      )}

      {forgetting && (
        <Dialog
          title="Forget what it learned?"
          onClose={() => setForgetting(false)}
          footer={
            <>
              <button type="button" onClick={() => setForgetting(false)} className="btn btn-secondary">Keep it</button>
              <button type="button" onClick={() => void forget()} disabled={busy} className="btn btn-primary">{busy ? "Forgetting…" : "Forget it all"}</button>
            </>
          }
        >
          <p className="text-sm text-muted">The next improvement starts fresh: it won&apos;t know what worked before, and may try again fixes you turned down.</p>
        </Dialog>
      )}

      {restoring && (
        <Dialog
          title="Restore this version?"
          subtitle={`"${restoring.label}", ${timeAgo(restoring.createdAt)}`}
          onClose={() => setRestoring(null)}
          footer={
            <>
              <button type="button" onClick={() => setRestoring(null)} className="btn btn-secondary">Cancel</button>
              <button type="button" onClick={() => void restore(restoring)} disabled={busy} className="btn btn-primary">{busy ? "Restoring…" : "Restore"}</button>
            </>
          }
        >
          <p className="text-sm text-muted">The agent&apos;s instructions, rules, settings, actions and procedures go back to how they were then. Q&As that improvements added since are removed. What it is now is kept as a version, so you can undo this.</p>
        </Dialog>
      )}
    </div>
  );
}

function SessionView({ agentId, session, names, actions, busy, onAct }: { agentId: string; session: Improvement; names: Record<string, string>; actions: Record<string, string>; busy: boolean; onAct: (a: "apply" | "discard" | "stop") => void }) {
  const s = session.state;
  const name = (id: string) => names[id] ?? "A deleted test";
  const running = session.status === "running";
  const after = s.best?.measurement;
  const rounds = [...new Set(s.candidates.map((c) => c.round))];

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">
              Started {timeAgo(session.createdAt)}
              {s.tokens ? ` · ${tokenCount(s.tokens)}` : ""}
              {s.addedTests ? ` · added ${s.addedTests} test${s.addedTests === 1 ? "" : "s"}` : ""}
            </p>
            <p className="mt-1 flex items-center gap-2 text-[15px] font-semibold">
              {running && <Spinner />} {running ? session.stage : s.outcome ? OUTCOME[s.outcome]?.text : session.stage}
            </p>
            {s.settings.focus?.length ? (
              <p className="mt-1 text-xs text-muted">
                Started for {s.settings.focus.slice(0, 3).map(name).join(", ")}
                {s.settings.focus.length > 3 ? ` and ${s.settings.focus.length - 3} more` : ""}
              </p>
            ) : null}
            {s.error && <p className="mt-1 text-sm text-bad">{s.error}</p>}
          </div>
          {running && (
            <button type="button" onClick={() => onAct("stop")} disabled={busy} className="btn btn-secondary">
              <Square className="size-3.5 fill-current" /> Stop
            </button>
          )}
          {session.status === "done" && s.best && (
            <>
              <button type="button" onClick={() => onAct("discard")} disabled={busy} className="btn btn-ghost">
                <X className="size-4" /> Discard
              </button>
              <button type="button" onClick={() => onAct("apply")} disabled={busy} className="btn btn-primary">
                <Check className="size-4" /> Apply to the live agent
              </button>
            </>
          )}
          {session.status === "applied" && <Pill tone="good">Applied {session.appliedAt ? timeAgo(session.appliedAt) : ""}</Pill>}
          {session.status === "discarded" && <Pill>Discarded</Pill>}
        </div>
        {running && s.progress.total > 0 && (
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-panel-2">
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${Math.min(100, (s.progress.done / s.progress.total) * 100)}%` }} />
          </div>
        )}
        {s.baseline && (
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted">Before</p>
              <p className="mt-1 text-lg">
                <Score m={s.baseline} />
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">After (confirmed on fresh runs)</p>
              <p className="mt-1 text-lg">{after ? <Score m={after} /> : <span className="text-muted">{running ? "Working…" : "–"}</span>}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Tests fixed</p>
              <p className="mt-1 text-lg font-semibold">{s.best?.fixed.length ?? 0}</p>
            </div>
          </div>
        )}
      </section>

      {s.best && (
        <section className="card p-5">
          <h3 className="text-[15px] font-semibold">Proposed changes</h3>
          <p className="mb-3 mt-0.5 text-sm text-muted">Only these change. Everything else stays exactly as it is.</p>
          <details className="report-detail"><summary>Review {s.best.patches.length} proposed edits</summary><div className="space-y-2">
            {s.best.patches.map((p, i) => (
              <EditView key={i} patch={p} actions={actions} />
            ))}
          </div></details>
        </section>
      )}

      {s.needsYou.length > 0 && (
        <section className="card p-5">
          <h3 className="flex items-center gap-2 text-[15px] font-semibold">
            <CircleAlert className="size-4 text-warn" /> Only you can fix these
          </h3>
          <p className="mb-3 mt-0.5 text-sm text-muted">The improvement agent never invents facts. These need your answer, or a fairer test.</p>
          <ul className="space-y-2">
            {s.needsYou.map((n, i) => (
              <li key={i} className="rounded-lg border border-line p-3 text-sm">
                <p className="font-medium">
                  {n.testId ? name(n.testId) : "A test"} <span className="font-normal text-muted">· {CAUSE_TEXT[n.cause]}</span>
                </p>
                <p className="mt-0.5 text-muted">{n.text}</p>
                <Link href={`/app/agents/${agentId}/${n.cause === "test_problem" ? "tests" : "suggestions"}`} className="mt-1 inline-block text-xs font-medium underline underline-offset-2">
                  {n.cause === "test_problem" ? "Edit the test" : "Write the answer in Answers to add"}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {s.baseline && (
        <section className="card overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-line text-xs text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Test</th>
                <th className="px-4 py-2.5 font-medium">Why it failed</th>
                <th className="px-4 py-2.5 font-medium">Before</th>
                <th className="px-4 py-2.5 font-medium">After</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {s.baseline.tests.map((t) => {
                const now = after?.tests.find((a) => a.testId === t.testId);
                const d = s.diagnoses.find((x) => x.testId === t.testId);
                return (
                  <tr key={t.testId} className="align-top">
                    <td className="px-4 py-3 font-medium">
                      {t.name} {s.regressions.includes(t.testId) && <span className="text-xs font-normal text-muted">· checked for breakage</span>}
                    </td>
                    <td className="max-w-[320px] px-4 py-3 text-xs text-muted">{d ? <details><summary>{CAUSE_TEXT[d.cause]}</summary><p className="mt-2 leading-relaxed">{d.explanation}</p></details> : t.passes === t.runs ? "Passes" : ""}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                      {t.passes}/{t.runs}
                    </td>
                    <td className={`whitespace-nowrap px-4 py-3 tabular-nums ${now && now.passes / now.runs > t.passes / t.runs ? "font-semibold text-good" : now && now.passes / now.runs < t.passes / t.runs ? "text-bad" : ""}`}>{now ? `${now.passes}/${now.runs}` : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {rounds.length > 0 && <details className="report-detail"><summary>How we checked this · {rounds.length} rounds of evidence</summary><div className="space-y-4">{rounds.map((round) => (
        <section key={round}>
          <h3 className="mb-2 text-sm font-semibold">Round {round}: fixes tried</h3>
          <div className="grid gap-3 lg:grid-cols-2">
            {s.candidates
              .filter((c) => c.round === round)
              .map((c) => (
                <CandidateCard key={`${c.round}-${c.index}`} candidate={c} name={name} actions={actions} />
              ))}
          </div>
        </section>
      ))}</div></details>}
    </div>
  );
}

function CandidateCard({ candidate: c, name, actions }: { candidate: Candidate; name: (id: string) => string; actions: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`card p-4 ${c.accepted ? "border-good/40" : ""}`}>
      <div className="flex items-start gap-2">
        <p className="flex-1 text-sm font-medium">{c.hypothesis}</p>
        {c.status === "testing" && <Spinner className="size-4" />}
        {c.status === "done" && (c.accepted ? <Pill tone="good">Kept</Pill> : <Pill>Not kept</Pill>)}
        {c.status === "skipped" && <Pill tone="warn">Skipped</Pill>}
      </div>
      {c.note && <p className="mt-1 text-xs text-muted">{c.note}</p>}
      {c.measurement && (
        <p className="mt-2 text-xs">
          <Score m={c.measurement} /> · fixed {c.fixed.length}
          {c.broke.length ? <span className="text-bad"> · broke {c.broke.map(name).join(", ")}</span> : ""}
        </p>
      )}
      <button type="button" onClick={() => setOpen(!open)} className="mt-2 text-xs font-medium underline underline-offset-2">
        {open ? "Hide" : "Show"} its {c.patches.length} edit{c.patches.length === 1 ? "" : "s"}
        {c.rejected.length ? ` (${c.rejected.length} refused)` : ""}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {c.patches.map((p, i) => (
            <EditView key={i} patch={p} actions={actions} />
          ))}
          {c.rejected.map((r, i) => (
            <p key={i} className="rounded-lg bg-panel-2 px-3 py-2 text-xs text-muted">
              Refused {r.patch.kind.replace("_", " ")}: {r.reason}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

