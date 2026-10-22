"use client";

import { BadgeCheck, ChevronDown, CircleCheck, CircleX, MessageSquareText, Scale, TestTubes } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { GradedAnswer, QualityCheck, QuestionKind } from "@/platform/quality";
import { EmptyState, Notice, Pill, Spinner, Stat, timeAgo } from "../ui";

const KIND_LABEL: Record<QuestionKind, string> = {
  simple: "Simple",
  several: "Several at once",
  "follow-up": "Follow-up",
  reworded: "In other words",
  "not covered": "Not in its knowledge",
};

/** An answer as the report shows it: the chat's source chips aren't text. */
const plain = (text: string) => text.replace(/\s*\[\d{1,2}\]/g, "");

const tone = (score: number) => (score >= 8 ? "good" : score >= 6 ? "warn" : "bad");
const number = (n: number) => n.toLocaleString("en-GB");

/**
 * Quality: how good the agent's answers are, graded blind by Nemotron 3 Ultra next to the best answer Keel can give;
 * whether its tests match what it knows; and whether the judges catch planted mistakes. One button, one report.
 */
export function QualityPanel({ agentId, initial, hasKnowledge }: { agentId: string; initial: QualityCheck[]; hasKnowledge: boolean }) {
  const [checks, setChecks] = useState(initial);
  const [viewing, setViewing] = useState(initial[0]?.id);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const running = checks.some((c) => c.status === "running");
  const check = checks.find((c) => c.id === viewing) ?? checks[0];

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(async () => {
      const body = (await fetch(`/api/agents/${agentId}/quality`).then((r) => r.json()).catch(() => ({}))) as { checks?: QualityCheck[] };
      if (body.checks) setChecks(body.checks);
    }, 2000);
    return () => clearInterval(timer);
  }, [running, agentId]);

  async function start() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/agents/${agentId}/quality`, { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { check?: QualityCheck; error?: string };
    setBusy(false);
    if (!res.ok || !body.check) return setError(body.error ?? "The check couldn't start.");
    setChecks((c) => [body.check!, ...c]);
    setViewing(body.check.id);
  }

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <h2 className="text-[15px] font-semibold">How good is your agent?</h2>
            <p className="mt-1 text-sm text-muted">
              Keel asks your agent questions written from what it knows: simple ones, several at once, follow-ups, questions in other words, and ones its knowledge doesn&apos;t cover. NVIDIA Nemotron 3 Ultra grades every answer blind against your information, next to the best answer Keel can give. Keel also checks your tests against your information, and checks the judges with planted mistakes. Your agent doesn&apos;t change.
            </p>
          </div>
          <button type="button" onClick={() => void start()} disabled={busy || running || !hasKnowledge} className="btn btn-primary">
            {busy || running ? <Spinner /> : <BadgeCheck className="size-4" />} Check quality
          </button>
        </div>
        {!hasKnowledge && (
          <p className="mt-3 text-sm">
            Add what your agent knows first, in{" "}
            <Link href={`/app/agents/${agentId}/sources`} className="font-medium underline underline-offset-2">
              Knowledge
            </Link>
            : the check asks it questions about that.
          </p>
        )}
        {error && (
          <div className="mt-3">
            <Notice>{error}</Notice>
          </div>
        )}
      </section>

      {!check ? (
        <EmptyState icon={<BadgeCheck className="size-5" />} title="No quality check yet" text="Run one to see how well your agent answers, graded blind. It takes a few minutes." />
      ) : check.status === "running" ? (
        <section className="card flex items-center gap-3 p-5 text-sm">
          <Spinner />
          <span className="font-medium">{check.stage}…</span>
          <span className="text-muted">This takes a few minutes; you can leave this page.</span>
        </section>
      ) : check.status === "failed" || !check.report ? (
        <section className="card p-5">
          <p className="text-[15px] font-semibold">The check stopped</p>
          {check.error && <p className="mt-1 text-sm text-bad">{check.error}</p>}
        </section>
      ) : (
        <Report check={check} agentId={agentId} />
      )}

      {checks.length > 1 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Earlier checks</h3>
          <ul className="card divide-y divide-line overflow-hidden">
            {checks.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setViewing(c.id)} className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-panel-2/60 ${c.id === check?.id ? "bg-panel-2/60" : ""}`}>
                  <span className="w-28 shrink-0 text-muted">{timeAgo(c.createdAt)}</span>
                  <span className="flex-1">{c.status === "running" ? c.stage : c.status === "failed" ? "Stopped" : `Answers ${c.report?.score ?? "–"} / 10`}</span>
                  {c.status === "done" && <span className="text-muted">{number(c.tokens)} tokens</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Report({ check, agentId }: { check: QualityCheck; agentId: string }) {
  const r = check.report!;
  const gap = Math.round((r.bestScore - r.score) * 10) / 10;
  const sound = r.tests.filter((t) => t.sound).length;
  const caught = r.judges.filter((j) => j.caught).length;
  const unsound = r.tests.filter((t) => !t.sound);
  return (
    <div className="space-y-5">
      <p className="text-xs text-muted">
        Checked {timeAgo(check.finishedAt ?? check.createdAt)} · {r.answers.length} questions · {number(check.tokens)} tokens
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Answers"
          icon={<MessageSquareText className="size-4" />}
          value={`${r.score} / 10`}
          note={gap >= 0.5 ? `The best answer Keel can give scores ${r.bestScore}: your settings cost some quality.` : `As good as the best answer Keel can give (${r.bestScore}).`}
        />
        <Stat
          label="Tests"
          icon={<TestTubes className="size-4" />}
          value={r.tests.length ? `${sound} of ${r.tests.length}` : "–"}
          note={r.tests.length ? "match what your agent knows" : "No tests yet"}
        />
        <Stat
          label="Judges"
          icon={<Scale className="size-4" />}
          value={r.judges.length ? `${caught} of ${r.judges.length}` : "–"}
          note={r.judges.length ? "planted mistakes caught" : "Run your tests first"}
        />
      </div>

      {r.notes.map((n) => (
        <Notice key={n} tone="brand">
          {n}
        </Notice>
      ))}

      <section>
        <h3 className="mb-2 text-sm font-semibold">The answers</h3>
        <ul className="card divide-y divide-line overflow-hidden">
          {[...r.answers]
            .sort((a, b) => a.score - b.score)
            .map((a, i) => (
              <AnswerRow key={i} a={a} />
            ))}
        </ul>
      </section>

      {r.tests.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Your tests</h3>
          <div className="card p-4 text-sm">
            {unsound.length ? (
              <ul className="space-y-3">
                {unsound.map((t) => (
                  <li key={t.testId} className="flex gap-2">
                    <CircleX className="mt-0.5 size-4 shrink-0 text-warn" />
                    <span>
                      <span className="font-medium">{t.name}</span>: {t.why}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-2">
                <CircleCheck className="size-4 text-good" /> Every test matches what your agent knows.
              </p>
            )}
            {unsound.length > 0 && (
              <p className="mt-3 text-xs text-muted">
                {sound} other test{sound === 1 ? "" : "s"} match what your agent knows. Fix the ones above in{" "}
                <Link href={`/app/agents/${agentId}/tests`} className="underline">
                  Tests
                </Link>
                , or a right answer can fail them.
              </p>
            )}
          </div>
        </section>
      )}

      {r.judges.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">The judges</h3>
          <div className="card p-4 text-sm">
            <p className="mb-3 text-muted">Conversations that passed their tests, judged again with one fact in your agent&apos;s replies made wrong. Each one should fail.</p>
            <ul className="space-y-2">
              {r.judges.map((j) => (
                <li key={j.testId} className="flex items-center gap-2">
                  {j.caught ? <CircleCheck className="size-4 shrink-0 text-good" /> : <CircleX className="size-4 shrink-0 text-bad" />}
                  <span className="flex-1">{j.name}</span>
                  <span className="font-mono text-xs text-muted">{j.change}</span>
                  <span className={j.caught ? "text-good" : "font-medium text-bad"}>{j.caught ? "Caught" : "Missed"}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}

function AnswerRow({ a }: { a: GradedAnswer }) {
  const [open, setOpen] = useState(a.score < 9 || a.wrongFacts.length > 0);
  return (
    <li>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-panel-2/60">
        <Pill tone={tone(a.score)}>{a.score} / 10</Pill>
        <span className="min-w-0 flex-1 truncate font-medium">{a.question}</span>
        <span className="hidden shrink-0 text-xs text-muted sm:inline">{KIND_LABEL[a.kind]}</span>
        <ChevronDown className={`size-4 shrink-0 text-muted transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-3 px-4 pb-4 text-sm">
          {a.history.length > 0 && (
            <div className="space-y-1 rounded-lg bg-panel-2/50 p-3 text-xs text-muted">
              {a.history.map((t, i) => (
                <p key={i}>
                  <span className="font-medium">{t.role === "user" ? "Customer" : "Agent"}:</span> {t.content}
                </p>
              ))}
            </div>
          )}
          <div>
            <p className="mb-1 text-xs text-muted">Your agent&apos;s answer</p>
            <p className="whitespace-pre-wrap rounded-lg border border-line p-3">{plain(a.answer)}</p>
          </div>
          <p>
            <span className="font-medium">Grade:</span> {a.why}
          </p>
          {a.wrongFacts.length > 0 && (
            <Notice>
              <span className="block font-medium">Not what your information says</span>
              {a.wrongFacts.map((f, i) => (
                <span key={i} className="mt-1 block">
                  {f}
                </span>
              ))}
            </Notice>
          )}
          <details className="text-muted">
            <summary className="cursor-pointer text-xs">The best answer Keel can give ({a.bestScore} / 10)</summary>
            <p className="mt-2 whitespace-pre-wrap rounded-lg bg-panel-2/50 p-3 text-text">{plain(a.best)}</p>
          </details>
        </div>
      )}
    </li>
  );
}
