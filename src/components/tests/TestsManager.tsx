"use client";

import { CheckCircle2, Pencil, Play, Plus, Sparkles, TestTubes, Trash2, Wand2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { BatchSummary, TestCase, TestRun } from "@/platform/tests";
import { Dialog } from "../Dialog";
import { EmptyState, Notice, Pill, Spinner, timeAgo } from "../ui";

type Row = TestCase & { latest: TestRun | null };
type Draft = { id?: string; name: string; persona: string; criterion: string; expectedActions: string[]; actionResponses: Record<string, string>; maxTurns: number; opening: string };

const EMPTY: Draft = { name: "", persona: "", criterion: "", expectedActions: [], actionResponses: {}, maxTurns: 6, opening: "" };

/** What "Fix" does, in the words the buttons explain it with. */
const FIX_TEXT = "Improve finds why each one fails, tries fixes on a copy of your agent, and keeps only fixes proven to work without breaking the tests that pass. Nothing changes until you apply it.";
const pending = (r?: TestRun | null) => r?.status === "queued" || r?.status === "running";

function Result({ run }: { run: TestRun | null }) {
  if (!run) return <span className="text-xs text-subtle">Not run yet</span>;
  if (pending(run))
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted">
        <Spinner className="size-3.5" /> {run.status === "queued" ? "Waiting" : "Running"}
      </span>
    );
  if (run.status === "error") return <Pill tone="warn">Didn&apos;t finish</Pill>;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${run.status === "passed" ? "text-good" : "text-bad"}`}>
      {run.status === "passed" ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
      {run.status === "passed" ? "Passed" : "Failed"} {run.verdict && <span className="font-normal text-muted">· {run.verdict.score}</span>}
    </span>
  );
}

/**
 * Tests: AI customers talk to the agent the way real ones would, and a judge decides whether it did what it
 * should. Write tests one by one or let Keel write a crowd from what the agent knows; run them as often as you like.
 */
export function TestsManager({ agentId, initialTests, initialBatches, actionNames }: { agentId: string; initialTests: Row[]; initialBatches: BatchSummary[]; actionNames: string[] }) {
  const [tests, setTests] = useState(initialTests);
  const [batchList, setBatchList] = useState(initialBatches);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [times, setTimes] = useState(1);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [viewing, setViewing] = useState<TestRun | null>(null);
  const [batchOpen, setBatchOpen] = useState<{ batch: BatchSummary; runs: TestRun[] } | null>(null);
  const [busy, setBusy] = useState<"run" | "generate" | "fix" | null>(null);
  const [count, setCount] = useState(8);
  const [error, setError] = useState<string | null>(null);
  const running = batchList.some((b) => b.pending > 0) || tests.some((t) => pending(t.latest));
  const router = useRouter();
  const wasRunning = useRef(running);
  const names = Object.fromEntries(tests.map((t) => [t.id, t.name]));

  async function reload(batchId?: string) {
    const res = await fetch(`/api/agents/${agentId}/tests${batchId ? `?batch=${batchId}` : ""}`);
    const body = (await res.json().catch(() => ({}))) as { tests?: Row[]; batches?: BatchSummary[]; runs?: TestRun[] };
    if (body.tests) setTests(body.tests);
    if (body.batches) setBatchList(body.batches);
    return body;
  }

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      void reload(batchOpen?.batch.batchId).then((body) => {
        const open = batchOpen && body.batches?.find((b) => b.batchId === batchOpen.batch.batchId);
        if (open && body.runs) setBatchOpen({ batch: open, runs: body.runs });
      });
    }, 2000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, batchOpen?.batch.batchId]);

  // When runs finish, the sidebar's setup progress catches up.
  useEffect(() => {
    if (wasRunning.current && !running) router.refresh();
    wasRunning.current = running;
  }, [running, router]);

  async function run(ids: string[]) {
    if (!ids.length) return;
    setBusy("run");
    setError(null);
    const res = await fetch(`/api/agents/${agentId}/tests/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ testIds: ids, times }) });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(null);
    if (!res.ok) return setError(body.error ?? "The tests couldn't start.");
    await reload();
  }

  async function generate() {
    setBusy("generate");
    setError(null);
    const res = await fetch(`/api/agents/${agentId}/tests/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ count }) });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(null);
    if (!res.ok) return setError(body.error ?? "The tests couldn't be written.");
    await reload();
  }

  /** Starts Improve on these failing tests, and goes to watch it. */
  async function fix(ids: string[]) {
    setBusy("fix");
    setError(null);
    const res = await fetch(`/api/agents/${agentId}/improve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ depth: "balanced", focus: ids }) });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setBusy(null);
      setBatchOpen(null);
      return setError(body.error ?? "Improve couldn't start.");
    }
    router.push(`/app/agents/${agentId}/improve`);
  }

  function edit(t: TestCase) {
    setEditing({
      id: t.id,
      name: t.name,
      persona: t.persona,
      criterion: t.criterion,
      expectedActions: t.expectedActions,
      actionResponses: Object.fromEntries(Object.entries(t.actionResponses).map(([k, v]) => [k, JSON.stringify(v, null, 2)])),
      maxTurns: t.maxTurns,
      opening: t.opening ?? "",
    });
  }

  async function remove(id: string) {
    setTests((t) => t.filter((x) => x.id !== id));
    setSelected((s) => new Set([...s].filter((x) => x !== id)));
    await fetch(`/api/agents/${agentId}/tests/${id}`, { method: "DELETE" });
  }

  async function openBatch(batch: BatchSummary) {
    const body = await reload(batch.batchId);
    setBatchOpen({ batch, runs: body.runs ?? [] });
  }

  const allChecked = tests.length > 0 && selected.size === tests.length;
  const passed = tests.filter((t) => t.latest?.status === "passed").length;
  const ranAny = tests.filter((t) => t.latest && !pending(t.latest)).length;
  const failing = tests.filter((t) => t.latest?.status === "failed").map((t) => t.id);
  const byId = new Map(tests.map((t) => [t.id, t]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setEditing(EMPTY)} className="btn btn-secondary">
          <Plus className="size-4" /> New test
        </button>
        <div className="flex items-center rounded-lg border border-line">
          <button type="button" onClick={() => void generate()} disabled={busy !== null} className="btn btn-ghost rounded-r-none border-0">
            {busy === "generate" ? <Spinner /> : <Sparkles className="size-4" />} Generate a crowd
          </button>
          <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="h-full rounded-r-lg border-l border-line bg-transparent px-2 py-2 text-sm" aria-label="How many">
            {[4, 8, 12, 20].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select value={times} onChange={(e) => setTimes(Number(e.target.value))} className="field w-auto py-2" aria-label="Times each">
            {[1, 3, 5, 10].map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "Once each" : `${n} times each`}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void run(selected.size ? [...selected] : tests.map((t) => t.id))} disabled={busy !== null || !tests.length} className="btn btn-primary">
            {busy === "run" ? <Spinner /> : <Play className="size-4 fill-current" />} {selected.size ? `Run ${selected.size} selected` : "Run all"}
          </button>
        </div>
      </div>
      {error && <Notice>{error}</Notice>}

      {tests.length === 0 ? (
        <EmptyState
          icon={<TestTubes className="size-5" />}
          title="No tests yet"
          text="Let Keel write a crowd of AI customers from what your agent knows, each with their own goal and mood. Or write one yourself."
          action={
            <button type="button" onClick={() => void generate()} disabled={busy !== null} className="btn btn-primary">
              {busy === "generate" ? <Spinner /> : <Sparkles className="size-4" />} Generate {count} tests
            </button>
          }
        />
      ) : (
        <div className="card overflow-x-auto">
          <div className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-xs text-muted">
            {ranAny > 0 && (
              <span>
                Latest results: <span className="font-semibold text-ink">{passed}</span> of {ranAny} passed
              </span>
            )}
            {running && (
              <span className="inline-flex items-center gap-1.5">
                <Spinner className="size-3.5" /> Tests running
              </span>
            )}
            {failing.length > 0 && !running && (
              <button type="button" onClick={() => void fix(failing)} disabled={busy !== null} title={FIX_TEXT} className="btn btn-secondary ml-auto py-1 text-xs">
                {busy === "fix" ? <Spinner className="size-3.5" /> : <Wand2 className="size-3.5" />} Fix {failing.length === 1 ? "the failing test" : `the ${failing.length} failing tests`}
              </button>
            )}
          </div>
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line text-xs text-muted">
              <tr>
                <th className="w-10 px-4 py-2.5">
                  <input type="checkbox" checked={allChecked} onChange={(e) => setSelected(e.target.checked ? new Set(tests.map((t) => t.id)) : new Set())} className="accent-[var(--ink)]" aria-label="Select all" />
                </th>
                <th className="px-2 py-2.5 font-medium">Test</th>
                <th className="px-4 py-2.5 font-medium">Must use</th>
                <th className="px-4 py-2.5 font-medium">Latest result</th>
                <th className="px-4 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tests.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(t.id)}
                      onChange={(e) => setSelected((s) => (e.target.checked ? new Set([...s, t.id]) : new Set([...s].filter((x) => x !== t.id))))}
                      className="accent-[var(--ink)]"
                      aria-label={`Select ${t.name}`}
                    />
                  </td>
                  <td className="max-w-[380px] px-2 py-3">
                    <p className="flex items-center gap-2 font-medium">
                      <button type="button" onClick={() => (t.latest && !pending(t.latest) ? setViewing(t.latest) : edit(t))} className="text-left hover:underline">
                        {t.name}
                      </button>
                      {t.origin === "generated" && <Pill>Generated</Pill>}
                      {t.origin === "security" && <Pill tone="warn">Security</Pill>}
                      {t.latest?.verdict?.testProblem && <Pill tone="warn">Check this test</Pill>}
                    </p>
                    <p className="truncate text-xs text-muted">{t.criterion}</p>
                  </td>
                  <td className="px-4 py-3">
                    {t.expectedActions.length ? (
                      <span className="flex flex-wrap gap-1">
                        {t.expectedActions.map((a) => (
                          <span key={a} className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[11px]">
                            @{a}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-xs text-subtle">–</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {t.latest && !pending(t.latest) ? (
                      <button type="button" onClick={() => setViewing(t.latest)} className="text-left hover:underline">
                        <Result run={t.latest} />
                        <span className="block text-[11px] text-subtle">{timeAgo(t.latest.finishedAt ?? t.latest.createdAt)}</span>
                      </button>
                    ) : (
                      <Result run={t.latest} />
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button type="button" onClick={() => void run([t.id])} disabled={busy !== null} className="rounded-md p-1.5 text-muted hover:bg-panel-2" title="Run">
                      <Play className="size-4" />
                    </button>
                    <button type="button" onClick={() => edit(t)} className="rounded-md p-1.5 text-muted hover:bg-panel-2" title="Edit">
                      <Pencil className="size-4" />
                    </button>
                    <button type="button" onClick={() => void remove(t.id)} className="rounded-md p-1.5 text-muted hover:bg-panel-2 hover:text-bad" title="Delete">
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {batchList.length > 0 && (
        <section>
          <h2 className="mb-3 text-[15px] font-semibold">Runs</h2>
          <ul className="card divide-y divide-line overflow-hidden">
            {batchList.map((b) => (
              <li key={b.batchId}>
                <button type="button" onClick={() => void openBatch(b)} className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-panel-2/60">
                  <span className="w-28 shrink-0 text-sm text-muted">{timeAgo(b.createdAt)}</span>
                  <span className="flex h-2 flex-1 overflow-hidden rounded-full bg-panel-2">
                    <span className="bg-good" style={{ width: `${(b.passed / b.total) * 100}%` }} />
                    <span className="bg-bad" style={{ width: `${(b.failed / b.total) * 100}%` }} />
                  </span>
                  <span className="w-48 shrink-0 text-right text-sm">
                    <span className="font-semibold">{b.passed}</span>/{b.total} passed{b.pending ? <span className="text-muted"> · {b.pending} to go</span> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {editing && (
        <TestEditor
          agentId={agentId}
          initial={editing}
          actionNames={actionNames}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}
      {viewing && (
        <RunDialog
          run={viewing}
          name={names[viewing.testId] ?? "Test"}
          security={byId.get(viewing.testId)?.origin === "security"}
          onClose={() => setViewing(null)}
          onEdit={(() => {
            const test = tests.find((t) => t.id === viewing.testId);
            return test
              ? () => {
                  setViewing(null);
                  setBatchOpen(null);
                  edit(test);
                }
              : undefined;
          })()}
        />
      )}
      {batchOpen && !viewing && (
        <Dialog
          title="Run results"
          subtitle={`${batchOpen.batch.passed} of ${batchOpen.batch.total} passed · ${new Date(batchOpen.batch.createdAt).toLocaleString("en-GB")}`}
          onClose={() => setBatchOpen(null)}
          wide
          footer={(() => {
            const failed = [...new Set(batchOpen.runs.filter((r) => r.status === "failed" && byId.has(r.testId)).map((r) => r.testId))];
            if (!failed.length || batchOpen.batch.pending) return undefined;
            return (
              <>
                <p className="mr-auto max-w-xl self-center text-xs text-muted">{FIX_TEXT}</p>
                <button type="button" onClick={() => void fix(failed)} disabled={busy !== null} className="btn btn-primary shrink-0 self-center">
                  {busy === "fix" ? <Spinner /> : <Wand2 className="size-4" />} Fix {failed.length === 1 ? "the failing test" : `the ${failed.length} failing tests`}
                </button>
              </>
            );
          })()}
        >
          <ul className="divide-y divide-line">
            {batchOpen.runs.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => !pending(r) && setViewing(r)} className="flex w-full items-center gap-3 py-2.5 text-left text-sm hover:bg-panel-2/60">
                  <span className="flex-1 truncate font-medium">{names[r.testId] ?? "Deleted test"}</span>
                  <Result run={r} />
                </button>
              </li>
            ))}
          </ul>
        </Dialog>
      )}
    </div>
  );
}

function RunDialog({ run, name, security, onClose, onEdit }: { run: TestRun; name: string; security?: boolean; onClose: () => void; onEdit?: () => void }) {
  const v = run.verdict;
  return (
    <Dialog title={name} subtitle={<Result run={run} />} onClose={onClose} wide>
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <ol className="space-y-3">
          {run.transcript.map((t, i) => (
            <li key={i} className={`flex flex-col ${t.role === "customer" ? "items-end" : "items-start"}`}>
              <span className="mb-1 text-[11px] font-medium text-subtle">{t.role === "agent" ? "Agent" : security ? "Attack from the security scan, word for word" : "AI customer"}</span>
              <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${t.role === "customer" ? "rounded-br-md bg-panel-2" : "rounded-bl-md border border-line"}`}>{t.content}</div>
              {t.actions?.map((a, j) => (
                <span key={j} className="mt-1 rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[11px] text-muted">
                  @{a.name} {a.arguments !== "{}" ? a.arguments : ""}
                </span>
              ))}
            </li>
          ))}
        </ol>
        <aside className="space-y-4 rounded-xl border border-line bg-panel-2/40 p-4 text-sm">
          {v ? (
            <>
              <div>
                <p className="text-xs text-muted">Score</p>
                <p className="text-2xl font-semibold tabular-nums">{v.score}</p>
              </div>
              <div>
                <p className="mb-1 text-xs text-muted">The judge&apos;s reasons</p>
                <ul className="list-disc space-y-1 pl-4">
                  {v.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
              {v.testProblem && (
                <Notice tone="warn">
                  <span className="block font-medium">This test may be wrong</span>
                  <span className="mt-1 block">{v.testProblem}</span>
                  {onEdit && (
                    <button type="button" onClick={onEdit} className="btn btn-secondary mt-2 block">
                      Edit the test
                    </button>
                  )}
                </Notice>
              )}
              {v.missingActions.length > 0 && <Notice>Didn&apos;t use: {v.missingActions.map((a) => `@${a}`).join(", ")}</Notice>}
              {v.unexpectedActions.length > 0 && <Notice tone="warn">Used without being asked to: {v.unexpectedActions.map((a) => `@${a}`).join(", ")}</Notice>}
            </>
          ) : (
            <p className="text-muted">No verdict: the run didn&apos;t finish.</p>
          )}
        </aside>
      </div>
    </Dialog>
  );
}

function TestEditor({ agentId, initial, actionNames, onClose, onSaved }: { agentId: string; initial: Draft; actionNames: string[]; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  async function save() {
    const actionResponses: Record<string, unknown> = {};
    for (const [name, text] of Object.entries(d.actionResponses)) {
      if (!d.expectedActions.includes(name) || !text.trim()) continue;
      try {
        actionResponses[name] = JSON.parse(text);
      } catch {
        return setError(`What @${name} returns isn't valid JSON.`);
      }
    }
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/agents/${agentId}/tests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: d.id, name: d.name, persona: d.persona, criterion: d.criterion, expectedActions: d.expectedActions, actionResponses, maxTurns: d.maxTurns, opening: d.opening }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setSaving(false);
    if (!res.ok) return setError(body.error ?? "It couldn't be saved.");
    onSaved();
  }

  return (
    <Dialog
      title={d.id ? "Edit test" : "New test"}
      subtitle="Describe a customer and what the agent must do for them. Nothing real runs in a test: actions return what you write here."
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button type="button" onClick={() => void save()} disabled={saving} className="btn btn-primary">{saving ? "Saving…" : "Save test"}</button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="label">Name</span>
          <input value={d.name} onChange={(e) => set({ name: e.target.value })} className="field" maxLength={120} placeholder="Late order, impatient customer" />
        </label>
        <label className="block">
          <span className="label">The AI customer</span>
          <textarea value={d.persona} onChange={(e) => set({ persona: e.target.value })} rows={4} className="field resize-y" maxLength={2000} placeholder="Sam ordered a mug a week ago (order HG-1043) and it hasn't arrived. They're polite but short on time, and want to know when it will come." />
          <span className="hint block">Who they are, what they want, what they know (like an order number), and how they behave.</span>
        </label>
        <label className="block">
          <span className="label">Their first message (optional)</span>
          <textarea value={d.opening} onChange={(e) => set({ opening: e.target.value })} rows={2} className="field resize-y" maxLength={20_000} placeholder="Hi, my order HG-1043 still hasn't arrived. When will it come?" />
          <span className="hint block">Sent word for word. Leave it empty and the AI customer writes it.</span>
        </label>
        <label className="block">
          <span className="label">It passes when</span>
          <textarea value={d.criterion} onChange={(e) => set({ criterion: e.target.value })} rows={2} className="field resize-y" maxLength={1000} placeholder="The agent looks up the order and tells Sam when it will arrive, without inventing a date." />
        </label>
        <div>
          <span className="label">Actions it must use</span>
          {actionNames.length ? (
            <div className="flex flex-wrap gap-2">
              {actionNames.map((n) => (
                <label key={n} className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-xs ${d.expectedActions.includes(n) ? "border-ink bg-panel-2" : "border-line"}`}>
                  <input type="checkbox" checked={d.expectedActions.includes(n)} onChange={(e) => set({ expectedActions: e.target.checked ? [...d.expectedActions, n] : d.expectedActions.filter((x) => x !== n) })} className="sr-only" />@{n}
                </label>
              ))}
            </div>
          ) : (
            <p className="hint">The agent has no actions yet.</p>
          )}
          <span className="hint mt-1 block">If any are chosen, the run fails when one isn&apos;t used, or when another action is.</span>
        </div>
        {d.expectedActions.map((n) => (
          <label key={n} className="block">
            <span className="label">What @{n} returns in this test</span>
            <textarea
              value={d.actionResponses[n] ?? ""}
              onChange={(e) => set({ actionResponses: { ...d.actionResponses, [n]: e.target.value } })}
              rows={3}
              spellCheck={false}
              className="field resize-y font-mono text-xs"
              placeholder={'{"status": "Shipped", "arrives": "Thursday"}'}
            />
          </label>
        ))}
        <label className="block">
          <span className="label">Most turns</span>
          <select value={d.maxTurns} onChange={(e) => set({ maxTurns: Number(e.target.value) })} className="field w-32">
            {[1, 2, 4, 6, 8, 10, 15, 20].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        {error && <Notice>{error}</Notice>}
      </div>
    </Dialog>
  );
}
