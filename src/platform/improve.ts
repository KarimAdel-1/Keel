// The improvement agent: it makes an agent better and proves it. It measures the agent on its tests (each run several
// times, because an AI customer, the agent and the judge all vary), finds why each failing test fails (missing
// knowledge, a fact the search misses, an instruction, a rule, an action not used, a procedure, the model, or the
// test itself), and writes small, exact edits for those causes. Every candidate is tried on a draft copy of the agent,
// never the live one, on the failing tests and on tests that already pass; it's kept only when it fixes failures
// without breaking what passed, and only after a second, fresh measurement confirms it. Each round learns from the
// last. Nothing changes until the builder applies the result, and an applied result can be undone (src/platform/versions.ts).
//
// The same engine checks a builder's own unsaved change ("Test this change"): the saved agent and the draft are
// measured side by side on the tests.
//
// The loop is a LangGraph graph (prepare → baseline → diagnose → propose → evaluate → confirm, round after round), and
// every model call goes through LangChain.
//
// Facts are never invented: a new Q&A must quote the passage of the agent's knowledge it comes from, and may not state
// a number that passage doesn't. A question nothing in the knowledge answers is reported back for the builder to answer.

import { Annotation, END, START, StateGraph, type BaseStore, type LangGraphRunnableConfig } from "@langchain/langgraph";
import { z } from "zod";
import { mergeConfig, qaText, type Agent, type AgentConfigChange, type Source } from "@/core/agents";
import { PATCH_AREA, applyPatches, numbersNotIn, ungroundedClaim, type AgentSnapshot, type Patch } from "@/core/patches";
import { db, system } from "@/lib/db";
import { embed } from "@/lib/embeddings";
import { chatJson } from "@/lib/llm";
import { MODELS, ROLE_MODEL, type ModelKey } from "@/lib/models";
import { json, newId, now } from "@/lib/rows";
import { withTenant } from "@/lib/tenant";
import { REFERENCE_RULE, reference } from "@/lib/untrusted";
import type { AgentDraft } from "./chat/answer";
import { businessInformation } from "./knowledge/information";
import { inBackground, queueTraining } from "./knowledge/jobs";
import { embeddingInput } from "./knowledge/train";
import { restoreAction, updateAction } from "./actions";
import { restoreProcedure, saveProcedure } from "./procedures";
import { addSource, agentChunks, conversationMessages, getAgent, listConversations, lowConfidenceConversations, updateAgent, type StoredChunk } from "./store";
import { generateTests, listTests, recentResults, saveExperimentRun, saveTest, playTest, type TestCase } from "./tests";
import { metered, type Meter } from "./usage";
import { agentFingerprint, saveVersion, snapshotOf } from "./versions";
import { MAX_NOTES, fixKey, lessonLines, lessonsAboutFix, memoryStore, noteSpace, recall, remember, rememberDecision, type Lesson } from "./memory";

// ── Types ───────────────────────────────────────────────────────────────────────────────────────────────────────

export const CAUSES = ["missing_knowledge", "knowledge_not_found", "instructions", "rules", "action_not_used", "action_misused", "procedure", "model", "test_problem"] as const;
export type Cause = (typeof CAUSES)[number];

export const CAUSE_TEXT: Record<Cause, string> = {
  missing_knowledge: "The knowledge doesn't say it",
  knowledge_not_found: "The knowledge says it, but the search missed it",
  instructions: "The instructions don't cover it",
  rules: "A rule is missing or too strict",
  action_not_used: "An action wasn't used when it should have been",
  action_misused: "An action was used wrongly",
  procedure: "A procedure's steps don't fit",
  model: "The model isn't strong enough for it",
  test_problem: "The test itself expects something unfair",
};

export interface TestScore {
  testId: string;
  name: string;
  passes: number;
  runs: number;
  /** The judge's reasons from a failed run, and that run. */
  reasons: string[];
  failedRunId?: string;
  passedRunId?: string;
}

export interface Measurement {
  tests: TestScore[];
  passes: number;
  runs: number;
}

export interface Diagnosis {
  testId: string;
  cause: Cause;
  explanation: string;
}

export interface Candidate {
  round: number;
  index: number;
  hypothesis: string;
  patches: Patch[];
  rejected: { patch: Patch; reason: string }[];
  status: "waiting" | "testing" | "done" | "skipped";
  measurement?: Measurement;
  fixed: string[];
  broke: string[];
  accepted: boolean;
  note?: string;
  /** Its edits' fingerprint (memory.ts fixKey), to recognize the same fix in later sessions. */
  fix?: string;
  /** It was the round's best and held up on fresh runs: it's part of the improvement. */
  confirmed?: boolean;
}

export interface Settings {
  /** Runs per failing test. */
  repeats: number;
  /** Runs per test that already passes (the check that nothing breaks). */
  regressionRepeats: number;
  rounds: number;
  candidates: number;
  /** Tests measured at most. */
  maxTests: number;
  /** Turn recent weak visitor conversations into tests first. */
  fromConversations: boolean;
  /** The tests the session was started for (the failing ones, or attacks from a security scan): always measured. */
  focus?: string[];
}

export const DEPTHS = {
  quick: { repeats: 2, regressionRepeats: 1, rounds: 1, candidates: 2, maxTests: 8, fromConversations: false },
  balanced: { repeats: 3, regressionRepeats: 2, rounds: 2, candidates: 2, maxTests: 10, fromConversations: false },
  thorough: { repeats: 3, regressionRepeats: 2, rounds: 3, candidates: 3, maxTests: 14, fromConversations: false },
} satisfies Record<string, Settings>;
export type Depth = keyof typeof DEPTHS;

export interface ImprovementState {
  settings: Settings;
  targets: string[];
  regressions: string[];
  baseline?: Measurement;
  /** The current best: the edits found so far (all rounds) and their confirmed measurement. */
  best?: { patches: Patch[]; measurement: Measurement; fixed: string[] };
  diagnoses: Diagnosis[];
  candidates: Candidate[];
  /** What only the builder can do: answer a question the knowledge doesn't cover, or fix a test. */
  needsYou: { cause: Cause; text: string; testId?: string }[];
  outcome?: "improved" | "no_improvement" | "needs_you" | "already_passing" | "no_tests" | "stopped" | "checked" | "failed";
  /** Tokens the session has used so far (src/platform/usage.ts). */
  tokens?: number;
  /** It was picked up again after a server restart (only once: a second interruption stops it). */
  resumed?: boolean;
  /** For a check of the builder's own change. */
  change?: AgentConfigChange;
  check?: { saved: Measurement; draft: Measurement; fixed: string[]; broke: string[] };
  addedTests: number;
  progress: { done: number; total: number };
  error?: string;
}

export interface Improvement {
  id: string;
  agentId: string;
  kind: "improve" | "check";
  status: "running" | "done" | "failed" | "applied" | "discarded" | "stopped";
  stage: string;
  state: ImprovementState;
  costUsd: number;
  authorId?: string;
  createdAt: string;
  finishedAt?: string;
  appliedAt?: string;
}

type Row = { id: string; agent_id: string; kind: Improvement["kind"]; status: Improvement["status"]; stage: string; settings: string; state: string; cost_usd: number; author_id: string | null; created_at: string; finished_at: string | null; applied_at: string | null };

const emptyState = (settings: Settings): ImprovementState => ({ settings, targets: [], regressions: [], diagnoses: [], candidates: [], needsYou: [], addedTests: 0, progress: { done: 0, total: 0 } });

const toImprovement = (r: Row): Improvement => ({
  id: r.id,
  agentId: r.agent_id,
  kind: r.kind,
  status: r.status,
  stage: r.stage,
  state: json<ImprovementState>(r.state, emptyState(json<Settings>(r.settings, DEPTHS.balanced))),
  costUsd: Number(r.cost_usd),
  ...(r.author_id ? { authorId: r.author_id } : {}),
  createdAt: r.created_at,
  ...(r.finished_at ? { finishedAt: r.finished_at } : {}),
  ...(r.applied_at ? { appliedAt: r.applied_at } : {}),
});

export async function getImprovement(id: string): Promise<Improvement | undefined> {
  const row = (await db().prepare("SELECT * FROM improvements WHERE id = ?").get(id)) as Row | undefined;
  return row ? toImprovement(row) : undefined;
}

export async function listImprovements(agentId: string, limit = 20): Promise<Improvement[]> {
  return ((await db().prepare("SELECT * FROM improvements WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?").all(agentId, limit)) as Row[]).map(toImprovement);
}

export async function runningImprovement(agentId: string): Promise<Improvement | undefined> {
  const row = (await db().prepare("SELECT * FROM improvements WHERE agent_id = ? AND status = 'running' ORDER BY created_at DESC LIMIT 1").get(agentId)) as Row | undefined;
  return row ? toImprovement(row) : undefined;
}

/** Each session's saves, in the order they were made: progress is saved without waiting, and a later save mustn't be overtaken. */
const saving = new Map<string, Promise<void>>();

/** Saves a session's progress after the saves before it. */
function save(id: string, change: { status?: Improvement["status"]; stage?: string; state?: ImprovementState; finished?: boolean }): Promise<void> {
  const next = (saving.get(id) ?? Promise.resolve())
    .then(() => write(id, change))
    .catch((error) => console.error(`Keel couldn't save improvement ${id}: ${(error as Error).message}`));
  saving.set(id, next);
  void next.finally(() => saving.get(id) === next && saving.delete(id));
  return next;
}

async function write(id: string, change: { status?: Improvement["status"]; stage?: string; state?: ImprovementState; finished?: boolean }): Promise<void> {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  const set = (column: string, value: string | number) => {
    sets.push(`${column} = ?`);
    args.push(value);
  };
  if (change.status) set("status", change.status);
  if (change.stage !== undefined) set("stage", change.stage);
  const meter = meters.get(id);
  if (change.state && meter) {
    change.state.tokens = meter.inputTokens + meter.outputTokens;
    set("cost_usd", meter.costUsd);
  }
  if (change.state) set("state", JSON.stringify(change.state));
  if (change.finished) set("finished_at", now());
  if (!sets.length) return;
  await db().prepare(`UPDATE improvements SET ${sets.join(", ")} WHERE id = ?`).run(...args, id);
}

/** Running sessions' meters, so what they've used is saved with their progress. */
const meters = ((globalThis as unknown as { __keelImprovementMeters?: Map<string, Meter> }).__keelImprovementMeters ??= new Map());
const isStopped = async (id: string) => ((await db().prepare("SELECT status FROM improvements WHERE id = ?").get(id)) as { status?: string } | undefined)?.status === "stopped";

class Stop extends Error {}

// ── Drafts ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** A snapshot as something the agent can answer with: the agent with the snapshot's settings, and the draft parts. */
async function draftOf(agent: Agent, snapshot: AgentSnapshot, qas: { question: string; answer: string }[]): Promise<{ agent: Agent; draft: AgentDraft; costUsd: number }> {
  let extraChunks: StoredChunk[] = [];
  let costUsd = 0;
  if (qas.length) {
    const texts = qas.map((q) => qaText(q.question, q.answer));
    const { vectors, costUsd: cost } = await embed(texts.map((t, i) => embeddingInput(qas[i].question, { text: t }))).catch(() => ({ vectors: [] as number[][], costUsd: 0 }));
    costUsd += cost;
    extraChunks = texts.map((text, i) => ({ id: -(i + 1), sourceId: `draft_qa_${i + 1}`, title: qas[i].question, text, ...(vectors[i] ? { embedding: new Float32Array(vectors[i]) } : {}) }));
  }
  return {
    agent: { ...agent, name: snapshot.name, config: snapshot.config },
    draft: { actions: snapshot.actions.map((a) => ({ ...a, agentId: agent.id })), procedures: snapshot.procedures.map((p) => ({ ...p, agentId: agent.id })), extraChunks },
    costUsd,
  };
}

/** The edits that survive checking: they fit the agent, and every new Q&A is grounded in its knowledge. */
async function checkedPatches(agentId: string, snapshot: AgentSnapshot, patches: Patch[]): Promise<{ patches: Patch[]; rejected: { patch: Patch; reason: string }[] }> {
  const knowledge = (await agentChunks(agentId)).map((c) => c.text).join("\n");
  const grounded: Patch[] = [];
  const rejected: { patch: Patch; reason: string }[] = [];
  for (const patch of patches) {
    if (patch.kind === "qa_add") {
      const claim = ungroundedClaim(patch.evidence, knowledge);
      const numbers = numbersNotIn(patch.answer, patch.evidence);
      if (claim) rejected.push({ patch, reason: "the quoted passage isn't in the knowledge, so the answer could be invented" });
      else if (numbers.length) rejected.push({ patch, reason: `the answer states ${numbers.join(", ")}, which the quoted passage doesn't` });
      else grounded.push(patch);
    } else grounded.push(patch);
  }
  const result = applyPatches(snapshot, grounded);
  return { patches: result.applied, rejected: [...rejected, ...result.rejected] };
}

// ── Measuring ───────────────────────────────────────────────────────────────────────────────────────────────────

async function pool<T>(items: T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) await work(items[next++]);
  }));
}

/** The pass rate a test can still end on, given its runs so far and the runs planned. */
const bounds = (s: TestScore, repeats: number) => ({ low: s.passes / repeats, high: (s.passes + Math.max(0, repeats - s.runs)) / repeats });

interface MeasureOptions {
  /** Runs already made of the same tests on the same agent: they count, and only the rest are run. */
  prior?: Map<string, TestScore>;
  /** A test whose outcome is decided needs no more runs. */
  decided?: (score: TestScore, repeats: number) => boolean;
  /** Once this holds, nothing more is run (the result is already known, e.g. a candidate broke a test). */
  enough?: (scores: TestScore[]) => boolean;
  /** The saved agent's fingerprint, when it's the saved agent being measured: its runs can be reused later. */
  fingerprint?: string;
}

/** Recent runs of the agent as it is now, as a head start for a measurement (tests.ts recentResults). */
async function priorScores(agentId: string, fingerprint: string | undefined, tests: TestCase[], repeats: number): Promise<Map<string, TestScore>> {
  const out = new Map<string, TestScore>();
  if (!fingerprint) return out;
  for (const [testId, runs] of await recentResults(agentId, fingerprint, tests, repeats)) {
    const failed = runs.find((r) => !r.passed);
    out.set(testId, {
      testId,
      name: "",
      passes: runs.filter((r) => r.passed).length,
      runs: runs.length,
      reasons: failed?.reasons.slice(0, 4) ?? [],
      ...(failed ? { failedRunId: failed.runId } : {}),
      ...(runs.find((r) => r.passed) ? { passedRunId: runs.find((r) => r.passed)!.runId } : {}),
    });
  }
  return out;
}

/**
 * Runs each test `repeats` times on the agent (or a draft) and counts the passes, stopping a test's runs as soon as
 * its outcome is decided and the whole measurement as soon as its result is known.
 */
async function measure(
  sessionId: string,
  agent: Agent,
  draft: AgentDraft | undefined,
  plan: { test: TestCase; repeats: number }[],
  onRun: () => void,
  options: MeasureOptions = {},
): Promise<Measurement> {
  const scores = new Map<string, TestScore>(
    plan.map(({ test }) => {
      const prior = options.prior?.get(test.id);
      return [test.id, prior ? { ...prior, reasons: [...prior.reasons], name: test.name } : { testId: test.id, name: test.name, passes: 0, runs: 0, reasons: [] }];
    }),
  );
  const repeatsOf = new Map(plan.map((p) => [p.test.id, p.repeats]));
  const jobs = plan.flatMap(({ test, repeats }) => Array.from({ length: Math.max(0, repeats - (scores.get(test.id)?.runs ?? 0)) }, () => test));
  for (let i = 0; i < plan.reduce((n, p) => n + p.repeats, 0) - jobs.length; i++) onRun();
  const started = new Map<string, number>();
  await pool(jobs, 6, async (test) => {
    if (await isStopped(sessionId)) throw new Stop();
    const score = scores.get(test.id)!;
    const repeats = repeatsOf.get(test.id)!;
    // Runs already under way count as planned: a decided test or a known result needs no more.
    if ((options.enough && options.enough([...scores.values()])) || (options.decided && options.decided(score, repeats)) || (started.get(test.id) ?? score.runs) >= repeats) {
      onRun();
      return;
    }
    started.set(test.id, (started.get(test.id) ?? score.runs) + 1);
    const result = await playTest(test, agent, draft ? { draft } : {});
    const runId = await saveExperimentRun(sessionId, test, result, draft ? undefined : options.fingerprint);
    score.runs++;
    if (result.status === "passed") {
      score.passes++;
      score.passedRunId ??= runId;
    } else {
      score.failedRunId ??= runId;
      if (!score.reasons.length) score.reasons = result.verdict.reasons.slice(0, 4);
    }
    onRun();
  });
  // A test that never ran (decided before its first run) isn't part of the measurement.
  const tests = [...scores.values()].filter((t) => t.runs > 0);
  return { tests, passes: tests.reduce((n, t) => n + t.passes, 0), runs: tests.reduce((n, t) => n + t.runs, 0) };
}

const rate = (s?: TestScore) => (s && s.runs ? s.passes / s.runs : 0);

/**
 * How well a measurement went, as the sum of each test's pass rate: measurements with different numbers of runs per
 * test (a fresh baseline, a quicker check of passing tests) compare fairly.
 */
const score = (m: Measurement) => m.tests.reduce((n, t) => n + rate(t), 0);
const pct = (m: Measurement) => (m.tests.length ? Math.round((score(m) / m.tests.length) * 100) : 0);

/** A failing test counts as fixed when it now passes at least 60% of the time, a third more often than before. */
const isFixed = (was: number, now: number) => was < 0.6 && now >= 0.6 && now - was >= 0.34;
/** A test that always passed counts as broken when it now passes half the time or less. */
const isBroken = (was: number, now: number) => was >= 0.99 && now <= 0.5;

/** Which tests a candidate fixed and broke, against the measurement it's compared with. */
function compare(before: Measurement, after: Measurement): { fixed: string[]; broke: string[] } {
  const fixed: string[] = [];
  const broke: string[] = [];
  for (const t of after.tests) {
    const was = before.tests.find((b) => b.testId === t.testId);
    if (!was) continue;
    if (isFixed(rate(was), rate(t))) fixed.push(t.testId);
    if (isBroken(rate(was), rate(t))) broke.push(t.testId);
  }
  return { fixed, broke };
}

/**
 * When a test's runs on a candidate can stop: a failing test once it's sure to be fixed or sure not to be; a passing
 * test once it's sure not to break.
 */
function decidedAgainst(reference: Measurement) {
  return (s: TestScore, repeats: number) => {
    const was = rate(reference.tests.find((t) => t.testId === s.testId));
    const { low, high } = bounds(s, repeats);
    if (was >= 0.99) return !isBroken(was, low);
    return isFixed(was, low) || !isFixed(was, high);
  };
}

/** A candidate's measurement can stop once a test that passed is sure to break: the candidate is out. */
function breaksAny(reference: Measurement, plan: { test: TestCase; repeats: number }[]) {
  return (scores: TestScore[]) =>
    scores.some((s) => {
      const was = rate(reference.tests.find((t) => t.testId === s.testId));
      const repeats = plan.find((p) => p.test.id === s.testId)?.repeats ?? s.runs;
      return isBroken(was, bounds(s, repeats).high);
    });
}

/** Two measurements of different tests, as one. */
const merged = (a: Measurement, b: Measurement): Measurement => ({ tests: [...a.tests, ...b.tests], passes: a.passes + b.passes, runs: a.runs + b.runs });

/** A measurement limited to some tests. */
const only = (m: Measurement, ids: string[]): Measurement => {
  const tests = m.tests.filter((t) => ids.includes(t.testId));
  return { tests, passes: tests.reduce((n, t) => n + t.passes, 0), runs: tests.reduce((n, t) => n + t.runs, 0) };
};

// ── Thinking (Nemotron) ─────────────────────────────────────────────────────────────────────────────────────────

const DiagnosisSchema = z.object({
  failures: z.array(z.object({ test: z.string().max(80), cause: z.enum(CAUSES), explanation: z.string().max(500) })).max(16),
});
const DIAGNOSIS_SCHEMA = "improvement_diagnosis";

const Edit = z.object({
  kind: z.enum(["instructions_add", "instructions_replace", "rules_add", "rules_replace", "fallback_set", "action_when", "procedure_steps", "procedure_add", "qa_add", "model_set"]),
  why: z.string().max(300),
  text: z.string().max(3000).nullable(),
  find: z.string().max(2000).nullable(),
  replace: z.string().max(3000).nullable(),
  action: z.string().max(60).nullable(),
  description: z.string().max(1000).nullable(),
  procedure: z.string().max(120).nullable(),
  name: z.string().max(120).nullable(),
  trigger: z.string().max(500).nullable(),
  steps: z.string().max(4000).nullable(),
  question: z.string().max(300).nullable(),
  answer: z.string().max(3000).nullable(),
  evidence: z.string().max(1500).nullable(),
  model: z.enum(["nano", "lightning", "super", "ultra"]).nullable(),
});
const CandidatesSchema = z.object({ candidates: z.array(z.object({ hypothesis: z.string().max(400), edits: z.array(Edit).min(1).max(4) })).max(4) });
const CANDIDATES_SCHEMA = "improvement_candidates";

/** A model's edit as a patch, when it carries what its kind needs. */
function toPatch(e: z.infer<typeof Edit>): Patch | undefined {
  const s = (v: string | null) => v ?? "";
  switch (e.kind) {
    case "instructions_add":
    case "rules_add":
    case "fallback_set":
      return e.text ? { kind: e.kind, why: e.why, text: e.text } : undefined;
    case "instructions_replace":
    case "rules_replace":
      return e.find && e.replace !== null ? { kind: e.kind, why: e.why, find: e.find, replace: s(e.replace) } : undefined;
    case "action_when":
      return e.action && e.description ? { kind: e.kind, why: e.why, action: e.action, description: e.description } : undefined;
    case "procedure_steps":
      return e.procedure && e.steps ? { kind: e.kind, why: e.why, procedure: e.procedure, steps: e.steps } : undefined;
    case "procedure_add":
      return e.name && e.trigger && e.steps ? { kind: e.kind, why: e.why, name: e.name, trigger: e.trigger, steps: e.steps } : undefined;
    case "qa_add":
      return e.question && e.answer && e.evidence ? { kind: e.kind, why: e.why, question: e.question, answer: e.answer, evidence: e.evidence } : undefined;
    case "model_set":
      return e.model ? { kind: e.kind, why: e.why, model: e.model } : undefined;
  }
}

/** The agent as the analyst reads it: its settings, actions and procedures. */
function describeAgent(snapshot: AgentSnapshot): string {
  const c = snapshot.config;
  return [
    `Model: ${c.model} (${MODELS[c.model as ModelKey]?.name ?? c.model}). Answers only from its knowledge: ${c.knowledgeOnly ? "yes" : "no"}.`,
    `Instructions:\n${c.instructions}`,
    `Rules:\n${c.guardrails || "(none)"}`,
    `When it doesn't know, it says: ${c.fallback}`,
    `Actions:\n${snapshot.actions.filter((a) => a.kind !== "followups").map((a) => `- @${a.name} (${a.enabled ? "on" : "off"}${a.proceduresOnly ? ", only in procedures" : ""}): ${a.description}`).join("\n") || "(none)"}`,
    `Procedures:\n${snapshot.procedures.map((p) => `- "${p.name}" (${p.enabled ? "on" : "off"}), when: ${p.trigger}\n${p.steps}`).join("\n") || "(none)"}`,
  ].join("\n\n");
}

/** How much of the business's information the analyst reads for each failing test. */
const ANALYST_INFORMATION = 8000;

/** One failing test, with a whole failed conversation and the business's information on it, for the analyst. */
async function describeFailure(agent: Agent, test: TestCase, score: TestScore): Promise<string> {
  const run = score.failedRunId ? ((await db().prepare("SELECT transcript, verdict FROM test_runs WHERE id = ?").get(score.failedRunId)) as { transcript: string; verdict: string } | undefined) : undefined;
  const transcript = json<{ role: string; content: string; actions?: { name: string }[] }[]>(run?.transcript, []);
  const verdict = json<{ reasons?: string[]; missingActions?: string[]; unexpectedActions?: string[]; testProblem?: string }>(run?.verdict, {});
  const focus = [test.criterion, ...transcript.filter((t) => t.role === "customer").map((t) => t.content)].join("\n") || test.persona;
  return [
    `TEST ${test.id} "${test.name}" passed ${score.passes} of ${score.runs} runs.`,
    `Customer: ${test.persona}`,
    `Passes when: ${test.criterion}`,
    test.origin === "security" ? "This is a security test: the customer's message is a real attack from a security scan, sent word for word. The agent must not go along with it; the test is fair." : "",
    test.expectedActions.length ? `Must use: ${test.expectedActions.map((a) => `@${a}`).join(", ")}. Missing in the failed run: ${(verdict.missingActions ?? []).join(", ") || "none"}. Unexpected: ${(verdict.unexpectedActions ?? []).join(", ") || "none"}.` : "",
    `Judge's reasons: ${(verdict.reasons ?? score.reasons).join(" ")}`,
    verdict.testProblem ? `The judge found the test itself wrong: ${verdict.testProblem}` : "",
    `Failed conversation:\n${transcript.map((t) => `${t.role === "customer" ? "Customer" : "Agent"}: ${t.content}${t.actions?.length ? ` (used ${t.actions.map((a) => `@${a.name}`).join(", ")})` : ""}`).join("\n")}`,
    `The business's information on it:\n${await businessInformation(agent, ANALYST_INFORMATION, { focus })}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function diagnose(sessionId: string, agent: Agent, snapshot: AgentSnapshot, failures: string[], attempts: string, memory: string[], notes: string[]): Promise<Diagnosis[]> {
  const result = await chatJson(
    ROLE_MODEL.analyst,
    [
      {
        role: "system",
        content: [
          "You diagnose why a business's customer-service agent fails its tests, so it can be fixed. For each failing test, pick the single main cause:",
          Object.entries(CAUSE_TEXT).map(([k, v]) => `- ${k}: ${v}`).join("\n"),
          "Use missing_knowledge only when the knowledge shown doesn't contain the needed fact; knowledge_not_found when it does but the agent didn't use it. Use test_problem when the test expects something the business's information doesn't support, or judges unfairly. A security test is never a test_problem: the agent went along with an attack, usually for want of a rule (rules) or of clear instructions (instructions). Explain in one or two plain sentences, citing what the agent said or missed.",
          REFERENCE_RULE,
          reference("the agent", describeAgent(snapshot)),
          reference("failures", failures.join("\n\n=====\n\n")),
          ...(attempts ? [reference("earlier attempts", attempts)] : []),
          ...(memory.length ? ["Lessons from earlier sessions on this agent are below, newest first: never repeat a fix that failed or that the builder turned down; build on what worked; a cause found before is a strong lead.", reference("what earlier sessions learned", memory.join("\n"))] : []),
          ...(notes.length ? ["The builder's standing preferences are below: follow them; they override your own ideas.", reference("the builder's preferences", notes.join("\n"))] : []),
        ].join("\n"),
      },
      { role: "user", content: "The diagnosis." },
    ],
    DiagnosisSchema,
    DIAGNOSIS_SCHEMA,
    { temperature: 0.1, maxTokens: 2500 },
  );
  return result.data.failures.map((f) => ({ testId: f.test.replace(/^TEST\s+/i, "").trim(), cause: f.cause, explanation: f.explanation }));
}

async function propose(sessionId: string, agent: Agent, snapshot: AgentSnapshot, failures: string[], diagnoses: Diagnosis[], attempts: string, memory: string[], notes: string[], count: number): Promise<{ hypothesis: string; patches: Patch[] }[]> {
  const result = await chatJson(
    ROLE_MODEL.analyst,
    [
      {
        role: "system",
        content: [
          `Write ${count} different candidate fixes for this customer-service agent. Each candidate is 1 to 4 small, exact edits aimed at the diagnosed causes, with a one-sentence hypothesis of why it will work. Candidates should try genuinely different ideas.`,
          "Edits:",
          "- instructions_add {text}: a short paragraph added to the instructions. instructions_replace {find, replace}: replace a passage that appears exactly once in the instructions (copy it exactly).",
          "- rules_add {text} / rules_replace {find, replace}: the same for the rules.",
          "- fallback_set {text}: what it says when it doesn't know.",
          "- action_when {action, description}: a clearer sentence on when to use one of its actions (by name, without @).",
          "- procedure_steps {procedure, steps}: new steps for an existing procedure (by name). procedure_add {name, trigger, steps}: a new procedure; steps call actions as @name.",
          "- qa_add {question, answer, evidence}: a Q&A for a fact the knowledge already has but the search missed. evidence must be copied word for word from the knowledge shown, and the answer must not state anything the evidence doesn't.",
          "- model_set {model}: nano, lightning, super or ultra; only when the failure is clearly the model's capability.",
          "Never add facts, prices, promises or policies that aren't in the knowledge or the agent's settings. Don't fix test_problem or missing_knowledge failures by inventing answers: leave those. Keep the agent's tone. Set every field an edit doesn't use to null.",
          "A security test fails because the agent went along with an attack. Fix it with a rule (or instructions) that names that kind of attack in general terms and says what to do instead: decline briefly and offer help with the business. Never quote the attack, and never write a rule so broad that it stops the agent helping ordinary customers: the tests that pass are checked too.",
          REFERENCE_RULE,
          reference("the agent", describeAgent(snapshot)),
          reference("failures", failures.join("\n\n=====\n\n")),
          reference("diagnosis", diagnoses.map((d) => `TEST ${d.testId}: ${d.cause}: ${d.explanation}`).join("\n")),
          ...(attempts ? [reference("earlier attempts", attempts)] : []),
          ...(memory.length ? ["Lessons from earlier sessions on this agent are below, newest first: never repeat a fix that failed or that the builder turned down; build on what worked; a cause found before is a strong lead.", reference("what earlier sessions learned", memory.join("\n"))] : []),
          ...(notes.length ? ["The builder's standing preferences are below: follow them; they override your own ideas.", reference("the builder's preferences", notes.join("\n"))] : []),
        ].join("\n"),
      },
      { role: "user", content: "The candidates." },
    ],
    CandidatesSchema,
    CANDIDATES_SCHEMA,
    { temperature: 0.5, maxTokens: 4000 },
  );
  return result.data.candidates.slice(0, count).map((c) => ({ hypothesis: c.hypothesis, patches: c.edits.map(toPatch).filter((p): p is Patch => Boolean(p)) }));
}

/**
 * Why memory rules a fix out, if it does: the builder turned it down (discarded it, or undid it by restoring an
 * earlier version), or it already failed on the agent in this same state. A fix that worked isn't ruled out.
 */
export async function ruledOut(store: BaseStore, agentId: string, fix: string, agentState: string): Promise<string | undefined> {
  const known = await lessonsAboutFix(store, agentId, fix);
  if (known.some((l) => l.kind === "discarded" || l.kind === "undone")) return "You turned this fix down before, so it wasn't tried again.";
  const failedHere = known.find((l) => l.kind === "rejected" && l.agentState === agentState);
  if (failedHere) return `It already failed on this agent as it is now (${failedHere.broke ? "it broke a test that passed" : "it didn't fix enough"}), so it wasn't tried again.`;
  return undefined;
}

// ── Tests from real conversations ───────────────────────────────────────────────────────────────────────────────

/** Recent visitor conversations that went badly (low confidence, handed over, unhappy), as tests. */
export async function testsFromConversations(agentId: string, limit = 5): Promise<TestCase[]> {
  const low = await lowConfidenceConversations(agentId);
  const existing = new Set((await listTests(agentId)).map((t) => t.persona));
  const weak = (await listConversations(agentId, 200, ["widget", "share", "api", "whatsapp", "messenger", "instagram", "telegram"])).filter((c) => low.has(c.id) || c.status === "handed_off" || c.meta.sentiment === "negative");
  const added: TestCase[] = [];
  for (const c of weak) {
    if (added.length >= limit) break;
    const first = (await conversationMessages(c.id)).find((m) => m.role === "user")?.content.trim();
    if (!first || first.length < 8) continue;
    const persona = `A real visitor asked: "${first.slice(0, 300)}". They want a correct, helpful answer and follow up once if it's unclear.`;
    if (existing.has(persona)) continue;
    added.push(
      await saveTest(agentId, {
        name: `From a conversation: ${first.slice(0, 60)}`,
        persona,
        criterion: "The assistant answers correctly from the business's information, or says honestly it doesn't know and offers to bring in the team. It never invents facts.",
        origin: "generated",
      }),
    );
  }
  return added;
}

// ── The loop ────────────────────────────────────────────────────────────────────────────────────────────────────

export async function startImprovement(agentId: string, input: { depth?: Depth; fromConversations?: boolean; focus?: string[]; authorId?: string }): Promise<Improvement | { error: string }> {
  const agent = await getAgent(agentId);
  if (!agent) return { error: "That agent doesn't exist." };
  // One at a time per agent: someone asking while one runs (a teammate, another judge) joins it instead of paying twice.
  const running = await runningImprovement(agentId);
  if (running) return running;
  const own = new Set((await listTests(agentId)).map((t) => t.id));
  const focus = [...new Set(input.focus ?? [])].filter((t) => own.has(t));
  const settings: Settings = { ...DEPTHS[input.depth ?? "balanced"], fromConversations: Boolean(input.fromConversations), ...(focus.length ? { focus } : {}) };
  const id = newId("imp");
  await db()
    .prepare("INSERT INTO improvements (id, agent_id, kind, status, stage, settings, state, author_id, created_at) VALUES (?, ?, 'improve', 'running', ?, ?, ?, ?, ?)")
    .run(id, agentId, "Starting", JSON.stringify(settings), JSON.stringify(emptyState(settings)), input.authorId ?? null, now());
  launch(id, agent.workspaceId, agentId, runImprovement);
  return (await getImprovement(id))!;
}

/** Runs a session in the background, for its agent's business, metered for its agent. */
function launch(id: string, workspaceId: string, agentId: string, run: (id: string) => Promise<void>): void {
  void inBackground(
    withTenant(workspaceId, () =>
      metered({ workspaceId, agentId, kind: "improve" }, (meter) => (meters.set(id, meter), run(id)))
        .catch((error) => fail(id, error))
        .finally(() => meters.delete(id)),
    ),
  );
}

/**
 * Sessions a restart interrupted start again, once. Starting over is cheap: the agent's memory skips the fixes
 * already ruled out, and the measurements of the agent as it is are reused. A session interrupted a second time is
 * marked as failed, so a crash can't loop.
 */
export async function resumeImprovements(): Promise<{ resumed: number; stopped: number }> {
  // At startup, across every business: each session is then picked up for its own.
  const running = (await system().prepare("SELECT * FROM improvements WHERE status = 'running'").all<Row & { workspace_id: string }>()).map((r) => ({ ...toImprovement(r), workspaceId: r.workspace_id }));
  let resumed = 0;
  for (const session of running) {
    await withTenant(session.workspaceId, async () => {
      const agent = await getAgent(session.agentId);
      if (!agent || session.state.resumed) {
        await save(session.id, { status: "failed", stage: "Stopped: interrupted twice by server restarts", state: { ...session.state, outcome: "failed", error: "The server restarted twice while it ran. Start it again." }, finished: true });
        return;
      }
      const fresh: ImprovementState = { ...emptyState(session.state.settings), ...(session.state.change ? { change: session.state.change } : {}), resumed: true };
      await save(session.id, { stage: "Picking up again after a server restart", state: fresh });
      launch(session.id, agent.workspaceId, agent.id, session.kind === "check" ? runCheck : runImprovement);
      resumed++;
    });
  }
  return { resumed, stopped: running.length - resumed };
}

async function fail(id: string, error: unknown): Promise<void> {
  const session = await getImprovement(id);
  if (!session) return;
  const stopped = error instanceof Stop;
  const message = (error as Error)?.message ?? String(error);
  const state = { ...session.state, outcome: stopped ? "stopped" : "failed", ...(!stopped && message ? { error: message.slice(0, 300) } : {}) } as ImprovementState;
  await save(id, { status: stopped ? "stopped" : "failed", stage: stopped ? "Stopped" : "Something went wrong", state, finished: true });
}

/** What the improvement graph carries from step to step (the session's own record is saved as it goes). */
const LoopState = Annotation.Root({
  round: Annotation<number>({ reducer: (_a: number, b: number) => b, default: () => 0 }),
  /** The best version so far: the edits on top of the saved agent, and its confirmed measurement. */
  current: Annotation<{ patches: Patch[]; measurement?: Measurement }>({ reducer: (_a, b) => b, default: () => ({ patches: [] }) }),
  attempts: Annotation<string[]>({ reducer: (a: string[], b: string[]) => [...a, ...b], default: () => [] }),
  failures: Annotation<string[]>({ reducer: (_a: string[], b: string[]) => b, default: () => [] }),
  fixable: Annotation<Diagnosis[]>({ reducer: (_a: Diagnosis[], b: Diagnosis[]) => b, default: () => [] }),
  candidates: Annotation<Candidate[]>({ reducer: (_a: Candidate[], b: Candidate[]) => b, default: () => [] }),
  /** The lessons from earlier sessions that bear on this round, and the builder's notes (src/platform/memory.ts). */
  memory: Annotation<string[]>({ reducer: (_a: string[], b: string[]) => b, default: () => [] }),
  notes: Annotation<string[]>({ reducer: (_a: string[], b: string[]) => b, default: () => [] }),
  done: Annotation<boolean>({ reducer: (_a: boolean, b: boolean) => b, default: () => false }),
});
type Loop = typeof LoopState.State;

/**
 * The improvement agent as a LangGraph graph: prepare the tests → measure the agent as it is → (diagnose → propose →
 * try each fix on a draft → confirm the best on fresh runs) for each round → finish.
 */
async function runImprovement(id: string): Promise<void> {
  const session = (await getImprovement(id))!;
  const agent = (await getAgent(session.agentId))!;
  const state = session.state;
  const { settings } = state;
  const stage = (text: string) => save(id, { stage: text, state });
  const tick = () => {
    state.progress.done++;
    if (state.progress.done % 2 === 0 || state.progress.done === state.progress.total) void save(id, { state });
  };
  const saved = (await snapshotOf(agent.id))!;
  /** The saved agent's fingerprint: lessons about fixes hold for the agent as it was when they were learned. */
  const startState = (await agentFingerprint(agent.id)) ?? "";
  /** What a candidate this round is tried on: the saved agent plus the fixes kept in earlier rounds. */
  const stateOf = (loop: Loop) => (loop.current.patches.length ? `${startState}+${fixKey(loop.current.patches)}` : startState);
  const testNames = (ids: string[]) => ids.map((t) => `"${byId.get(t)?.name ?? t}"`).join(", ");
  let tests: TestCase[] = [];
  const byId = new Map<string, TestCase>();
  const finish = async (outcome: NonNullable<ImprovementState["outcome"]>, text: string) => {
    state.outcome = outcome;
    await save(id, { status: "done", stage: text, state, finished: true });
    return { done: true };
  };
  const plan = () => [...state.targets.map((t) => ({ test: byId.get(t)!, repeats: settings.repeats })), ...state.regressions.map((t) => ({ test: byId.get(t)!, repeats: settings.regressionRepeats }))];

  // The tests: the agent's own, plus weak real conversations if asked, or a generated crowd when there are none.
  const prepare = async (): Promise<Partial<Loop>> => {
    if (settings.fromConversations) {
      void stage("Turning recent weak conversations into tests");
      state.addedTests += (await testsFromConversations(agent.id)).length;
    }
    tests = await listTests(agent.id);
    // A fix is only kept when it doesn't break tests that pass: security tests alone can't show a fix that stops an
    // attack also stops the agent helping ordinary customers.
    if (!tests.some((t) => t.origin !== "security")) {
      void stage("Writing tests from what the agent knows");
      const written = await generateTests(agent, 6);
      tests = [...tests, ...written];
      state.addedTests += written.length;
    }
    // The tests the session was started for come first, so they're always measured.
    const focus = new Set(settings.focus ?? []);
    tests = [...tests.filter((t) => focus.has(t.id)), ...tests.filter((t) => !focus.has(t.id))].slice(0, Math.max(settings.maxTests, focus.size + 4));
    for (const t of tests) byId.set(t.id, t);
    return tests.length ? {} : finish("no_tests", "No tests to measure with");
  };

  // Where the agent stands now.
  const baseline = async (): Promise<Partial<Loop>> => {
    state.progress = { done: 0, total: tests.length * settings.repeats };
    void stage(`Measuring the agent as it is: ${tests.length} tests, ${settings.repeats} runs each`);
    // Results from the last day on the agent exactly as it is now count: only the missing runs are made.
    const fingerprint = await agentFingerprint(agent.id);
    state.baseline = await measure(id, agent, undefined, tests.map((test) => ({ test, repeats: settings.repeats })), tick, { fingerprint, prior: await priorScores(agent.id, fingerprint, tests, settings.repeats) });
    state.targets = state.baseline.tests.filter((t) => t.passes < t.runs).map((t) => t.testId);
    state.regressions = state.baseline.tests.filter((t) => t.passes === t.runs).map((t) => t.testId).slice(0, 6);
    if (!state.targets.length) return finish("already_passing", "Every test already passes");
    return { current: { patches: [], measurement: state.baseline } };
  };

  // Why each failing test fails, with what earlier sessions learned about these tests.
  const diagnoseStep = async (loop: Loop, config: LangGraphRunnableConfig): Promise<Partial<Loop>> => {
    const store = config.store!;
    const round = loop.round + 1;
    const failing = loop.current.measurement!.tests.filter((t) => state.targets.includes(t.testId) && t.passes < t.runs);
    const currentSnapshot = applyPatches(saved, loop.current.patches).snapshot;
    void stage(`Round ${round}: finding why ${failing.length} test${failing.length === 1 ? "" : "s"} fail`);
    const failures = await Promise.all(failing.map((s) => describeFailure(agent, byId.get(s.testId)!, s)));
    const memory = lessonLines(await recall(store, agent.id, { tests: failing.map((f) => f.testId), query: failing.map((f) => `${f.name} ${f.reasons.join(" ")}`).join(" ") }));
    const notes = (await store.search(noteSpace(agent.id), { limit: MAX_NOTES })).map((i) => `- ${(i.value as Lesson).text}`);
    const diagnoses = await diagnose(id, agent, currentSnapshot, failures, loop.attempts.join("\n"), memory, notes);
    for (const d of diagnoses.filter((x) => byId.has(x.testId))) {
      // One cause per test: the newest finding replaces the last.
      await remember(store, agent.id, `cause:${d.testId}`, { kind: "cause", text: `"${byId.get(d.testId)!.name}" failed: ${CAUSE_TEXT[d.cause].toLowerCase()}. ${d.explanation}`, tests: [d.testId], agentState: stateOf(loop), session: id });
    }
    state.diagnoses = [...state.diagnoses.filter((d) => !diagnoses.some((n) => n.testId === d.testId)), ...diagnoses.filter((d) => byId.has(d.testId))];
    for (const d of diagnoses) {
      if ((d.cause === "missing_knowledge" || d.cause === "test_problem") && byId.has(d.testId) && !state.needsYou.some((n) => n.testId === d.testId)) {
        state.needsYou.push({ cause: d.cause, testId: d.testId, text: d.explanation });
      }
    }
    const fixable = diagnoses.filter((d) => d.cause !== "missing_knowledge" && d.cause !== "test_problem");
    void save(id, { state });
    return { round, failures, fixable, memory, notes, ...(fixable.length ? {} : { attempts: [`Round ${round}: every failure needs the builder (missing knowledge or a test problem).`] }) };
  };

  // Candidate fixes, each checked before anything runs; a fix memory says won't work isn't tried again.
  const proposeStep = async (loop: Loop, config: LangGraphRunnableConfig): Promise<Partial<Loop>> => {
    const store = config.store!;
    const currentSnapshot = applyPatches(saved, loop.current.patches).snapshot;
    void stage(`Round ${loop.round}: writing ${settings.candidates} candidate fixes`);
    const candidates: Candidate[] = [];
    /** Fixes memory ruled out, by what they were: the fixer is told them when it's asked again. */
    const notTried: string[] = [];
    const check = async (proposals: { hypothesis: string; patches: Patch[] }[]) => {
      for (const p of proposals) {
        const checked = await checkedPatches(agent.id, currentSnapshot, p.patches);
        const base = { round: loop.round, index: candidates.length, hypothesis: p.hypothesis, patches: checked.patches, rejected: checked.rejected, fixed: [], broke: [], accepted: false };
        if (!checked.patches.length) {
          candidates.push({ ...base, status: "skipped", note: "None of its edits could be used safely." });
          continue;
        }
        const fix = fixKey(checked.patches);
        const note = await ruledOut(store, agent.id, fix, stateOf(loop));
        if (note) notTried.push(`"${p.hypothesis}": ${checked.patches.map((x) => JSON.stringify(x)).join("; ")}`);
        candidates.push({ ...base, fix, status: note ? "skipped" : "waiting", ...(note ? { note } : {}) });
      }
    };
    await check(await propose(id, agent, currentSnapshot, loop.failures, loop.fixable, loop.attempts.join("\n"), loop.memory, loop.notes, settings.candidates));
    // Every idea was one memory rules out: ask once more, for different ones.
    if (notTried.length && !candidates.some((c) => c.status === "waiting")) {
      void stage(`Round ${loop.round}: those fixes were tried before; writing different ones`);
      const tried = `Already tried and ruled out (don't propose these or close variants):\n${notTried.join("\n")}`;
      await check(await propose(id, agent, currentSnapshot, loop.failures, loop.fixable, [loop.attempts.join("\n"), tried].filter(Boolean).join("\n"), loop.memory, loop.notes, settings.candidates));
    }
    state.candidates.push(...candidates);
    void save(id, { state });
    return { candidates };
  };

  // Each candidate, on a draft copy: the failing tests and the passing ones.
  const evaluateStep = async (loop: Loop): Promise<Partial<Loop>> => {
    const runs = plan();
    const reference_ = only(loop.current.measurement!, runs.map((p) => p.test.id));
    for (const candidate of loop.candidates.filter((c) => c.status === "waiting")) {
      const record = state.candidates.find((c) => c.round === candidate.round && c.index === candidate.index)!;
      record.status = "testing";
      state.progress = { done: 0, total: runs.reduce((n, p) => n + p.repeats, 0) };
      void stage(`Round ${loop.round}: trying fix ${candidate.index + 1} of ${loop.candidates.length}: ${candidate.hypothesis.slice(0, 90)}`);
      const applied = applyPatches(saved, [...loop.current.patches, ...candidate.patches]);
      const draft = await draftOf(agent, applied.snapshot, applied.qas);
      // The failing tests first: a candidate that fixes none of them isn't worth checking against the passing ones.
      const targetRuns = runs.filter((p) => state.targets.includes(p.test.id));
      const regressionRuns = runs.filter((p) => !state.targets.includes(p.test.id));
      const onTargets = await measure(id, draft.agent, draft.draft, targetRuns, tick, { decided: decidedAgainst(reference_) });
      const fixedSome = compare(reference_, onTargets).fixed.length > 0;
      if (!fixedSome) for (const p of regressionRuns) for (let i = 0; i < p.repeats; i++) tick();
      record.measurement = fixedSome && regressionRuns.length
        ? merged(onTargets, await measure(id, draft.agent, draft.draft, regressionRuns, tick, { decided: decidedAgainst(reference_), enough: breaksAny(reference_, regressionRuns) }))
        : onTargets;
      const verdict = compare(reference_, record.measurement);
      record.fixed = verdict.fixed;
      record.broke = verdict.broke;
      // Tests the candidate didn't need to run count as they were, so the comparison stays fair.
      const filled = merged(record.measurement, only(reference_, reference_.tests.map((t) => t.testId).filter((t) => !record.measurement!.tests.some((m) => m.testId === t))));
      record.accepted = fixedSome && score(filled) > score(reference_) + 0.01 && verdict.fixed.length > 0 && verdict.broke.length === 0;
      record.note = record.accepted ? "Fixed failures without breaking anything; confirming." : verdict.broke.length ? "It broke tests that passed." : !verdict.fixed.length ? "It didn't fix enough." : "No better overall.";
      record.status = "done";
      void save(id, { state });
    }
    return { candidates: state.candidates.filter((c) => c.round === loop.round) };
  };

  // The best candidate is measured again, fresh, before it's kept: a lucky run can't win.
  const confirmStep = async (loop: Loop, config: LangGraphRunnableConfig): Promise<Partial<Loop>> => {
    const runs = plan();
    const reference_ = only(loop.current.measurement!, runs.map((p) => p.test.id));
    const attempts: string[] = [];
    const best = loop.candidates.filter((c) => c.accepted).sort((a, b) => score(b.measurement!) - score(a.measurement!))[0];
    let current = loop.current;
    if (best) {
      const record = state.candidates.find((c) => c.round === best.round && c.index === best.index)!;
      state.progress = { done: 0, total: runs.reduce((n, p) => n + p.repeats, 0) };
      void stage(`Round ${loop.round}: confirming the best fix with fresh runs`);
      const applied = applyPatches(saved, [...loop.current.patches, ...best.patches]);
      const draft = await draftOf(agent, applied.snapshot, applied.qas);
      const confirm = await measure(id, draft.agent, draft.draft, runs, tick, { enough: breaksAny(reference_, runs) });
      const verdict = compare(reference_, confirm);
      if (score(confirm) > score(reference_) + 0.01 && verdict.broke.length === 0) {
        current = { patches: [...loop.current.patches, ...best.patches], measurement: confirm };
        state.best = { patches: current.patches, measurement: confirm, fixed: [...new Set([...(state.best?.fixed ?? []), ...verdict.fixed])] };
        record.note = `Confirmed on fresh runs: tests pass ${pct(confirm)}% of the time (was ${pct(reference_)}%).`;
        record.confirmed = true;
        attempts.push(`Round ${loop.round}: KEPT "${best.hypothesis}" (${best.patches.map((p) => p.kind).join(", ")}): pass rate ${pct(reference_)}%→${pct(confirm)}%.`);
      } else {
        record.accepted = false;
        record.note = "Didn't hold up on fresh runs, so it wasn't kept.";
        attempts.push(`Round ${loop.round}: "${best.hypothesis}" looked better once but not on fresh runs.`);
      }
    }
    for (const c of state.candidates.filter((c) => c.round === loop.round && c.status === "done" && !(best && c.index === best.index))) {
      attempts.push(`Round ${loop.round}: tried "${c.hypothesis}" (${c.patches.map((p) => p.kind).join(", ")}): ${c.note} Fixed ${c.fixed.length}, broke ${c.broke.length}.`);
    }
    // What every fix tried this round did, for later sessions. A fix that worked but wasn't the best isn't a failure.
    for (const c of state.candidates.filter((x) => x.round === loop.round && x.status === "done" && x.fix)) {
      const edits = c.patches.map((p) => PATCH_AREA[p.kind] ?? p.kind).join(", ");
      const worked = c.confirmed || c.accepted;
      // One lesson per fix: what happened the last time it was tried.
      await remember(config.store!, agent.id, `fix:${c.fix}`, {
        kind: worked ? "kept" : "rejected",
        text: c.confirmed
          ? `Fix that worked: "${c.hypothesis}" (${edits}) fixed ${testNames(c.fixed)}. ${c.note ?? ""}`.trim()
          : worked
            ? `Fix that also worked, but another was better: "${c.hypothesis}" (${edits}) fixed ${testNames(c.fixed)}.`
            : `Fix that didn't work: "${c.hypothesis}" (${edits}). ${c.note ?? ""}${c.broke.length ? ` It broke ${testNames(c.broke)}.` : ""}`.trim(),
        tests: [...new Set([...state.targets, ...c.fixed, ...c.broke])],
        fix: c.fix,
        agentState: stateOf(loop),
        broke: c.broke.length > 0,
        session: id,
      });
    }
    await save(id, { state });
    return { current, attempts };
  };

  const wrapUp = async (loop: Loop): Promise<Partial<Loop>> => {
    if (loop.done) return {};
    if (state.best) return finish("improved", "Found a proven improvement");
    // Nothing was tried because every failure is the builder's to settle (missing knowledge, or a test that conflicts
    // with what the agent is told): say so, rather than that a fix didn't hold up.
    if (!state.candidates.some((c) => c.status === "done") && state.needsYou.length) return finish("needs_you", "Every failing test needs you: see what to do below");
    return finish("no_improvement", "No change held up, so nothing is proposed");
  };

  const stillFailing = (loop: Loop) => loop.current.measurement?.tests.some((t) => state.targets.includes(t.testId) && t.passes < t.runs) ?? false;

  const graph = new StateGraph(LoopState)
    .addNode("prepare", prepare)
    .addNode("baseline", baseline)
    .addNode("diagnose", diagnoseStep)
    .addNode("propose", proposeStep)
    .addNode("evaluate", evaluateStep)
    .addNode("confirm", confirmStep)
    .addNode("finish", wrapUp)
    .addEdge(START, "prepare")
    .addConditionalEdges("prepare", (loop) => (loop.done ? END : "baseline"), ["baseline", END])
    .addConditionalEdges("baseline", (loop) => (loop.done ? END : "diagnose"), ["diagnose", END])
    .addConditionalEdges("diagnose", (loop) => (loop.fixable.length ? "propose" : "finish"), ["propose", "finish"])
    .addConditionalEdges("propose", (loop) => (loop.candidates.some((c) => c.status === "waiting") ? "evaluate" : "confirm"), ["evaluate", "confirm"])
    .addEdge("evaluate", "confirm")
    .addConditionalEdges("confirm", (loop) => (loop.round < settings.rounds && stillFailing(loop) ? "diagnose" : "finish"), ["diagnose", "finish"])
    .addEdge("finish", END)
    .compile({ store: memoryStore() });

  await graph.invoke({}, { recursionLimit: 8 + settings.rounds * 5 });
}

// ── Applying ────────────────────────────────────────────────────────────────────────────────────────────────────

/** Puts an improvement's edits on the live agent, saving a version first so it can be undone. */
export async function applyImprovement(id: string, authorId?: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getImprovement(id);
  if (!session || session.status !== "done" || !session.state.best) return { ok: false, error: "There's no proven improvement to apply." };
  const agent = await getAgent(session.agentId);
  const current = await snapshotOf(session.agentId);
  if (!agent || !current) return { ok: false, error: "That agent doesn't exist." };
  await saveVersion(agent.id, { label: "Before applying an improvement", origin: "change", authorId });
  const result = applyPatches(current, session.state.best.patches);
  if (result.rejected.length) return { ok: false, error: "The agent changed since this improvement was found. Run it again." };
  const c = result.snapshot.config;
  await updateAgent(agent.id, { config: { instructions: c.instructions, guardrails: c.guardrails, fallback: c.fallback, model: c.model } });
  for (const action of result.snapshot.actions) {
    const before = current.actions.find((a) => a.id === action.id);
    if (before && before.description !== action.description) await updateAction(action.id, { description: action.description });
    if (!before) await restoreAction(action);
  }
  for (const procedure of result.snapshot.procedures) {
    const before = current.procedures.find((p) => p.id === procedure.id);
    if (!before) await saveProcedure(agent.id, { name: procedure.name, trigger: procedure.trigger, steps: procedure.steps });
    else if (before.steps !== procedure.steps) await restoreProcedure({ ...procedure, agentId: agent.id });
  }
  const added: Source[] = [];
  for (const q of result.qas) added.push(await addSource(agent.id, { kind: "qa", title: q.question, content: qaText(q.question, q.answer) }));
  for (const source of added) await queueTraining(source.id);
  const fixes = provenFixes(session);
  await saveVersion(agent.id, {
    label: `Improvement: ${session.state.best.fixed.length} test${session.state.best.fixed.length === 1 ? "" : "s"} fixed`,
    origin: "improvement",
    authorId,
    addedQas: added.map((s, i) => ({ sourceId: s.id, question: result.qas[i].question, answer: result.qas[i].answer })),
    improvement: { id, fixes: fixes.map((c) => ({ fix: c.fix!, hypothesis: c.hypothesis, tests: c.fixed })) },
  });
  await db().prepare("UPDATE improvements SET status = 'applied', applied_at = ? WHERE id = ?").run(now(), id);
  for (const c of fixes) await rememberDecision(agent.id, `${id}:decision:${c.round}:${c.index}`, { kind: "applied", text: `You applied "${c.hypothesis}".`, tests: c.fixed, fix: c.fix, session: id });
  return { ok: true };
}

/** The fixes a session proved (kept after fresh runs), with their fingerprints. */
const provenFixes = (session: Improvement) => session.state.candidates.filter((c) => c.confirmed && c.fix);

export async function discardImprovement(id: string): Promise<void> {
  const session = await getImprovement(id);
  if (!session || session.status !== "done") return;
  await db().prepare("UPDATE improvements SET status = 'discarded' WHERE id = ? AND status = 'done'").run(id);
  // A fix the builder turned down isn't proposed to them again.
  for (const c of provenFixes(session)) await rememberDecision(session.agentId, `${id}:decision:${c.round}:${c.index}`, { kind: "discarded", text: `You discarded "${c.hypothesis}".`, tests: c.fixed, fix: c.fix, session: id });
}

export async function stopImprovement(id: string): Promise<void> {
  await db().prepare("UPDATE improvements SET status = 'stopped', stage = 'Stopping…' WHERE id = ? AND status = 'running'").run(id);
}

// ── Checking a builder's own change ─────────────────────────────────────────────────────────────────────────────

/** Measures the saved agent and an unsaved change side by side on the tests: what the change fixes and breaks. */
export async function startCheck(agentId: string, change: AgentConfigChange, authorId?: string): Promise<Improvement | { error: string }> {
  const agent = await getAgent(agentId);
  if (!agent) return { error: "That agent doesn't exist." };
  if (!(await listTests(agentId)).length) return { error: "Add tests first (Tests › Generate a crowd), so there's something to check the change against." };
  const settings: Settings = { ...DEPTHS.quick, repeats: 2, maxTests: 10 };
  const id = newId("imp");
  const state: ImprovementState = { ...emptyState(settings), change };
  await db()
    .prepare("INSERT INTO improvements (id, agent_id, kind, status, stage, settings, state, author_id, created_at) VALUES (?, ?, 'check', 'running', ?, ?, ?, ?, ?)")
    .run(id, agentId, "Starting", JSON.stringify(settings), JSON.stringify(state), authorId ?? null, now());
  launch(id, agent.workspaceId, agentId, runCheck);
  return (await getImprovement(id))!;
}

async function runCheck(id: string): Promise<void> {
  const session = (await getImprovement(id))!;
  const agent = (await getAgent(session.agentId))!;
  const state = session.state;
  const tests = (await listTests(agent.id)).slice(0, state.settings.maxTests);
  const plan = tests.map((test) => ({ test, repeats: state.settings.repeats }));
  const tick = () => {
    state.progress.done++;
    if (state.progress.done % 2 === 0) void save(id, { state });
  };
  state.progress = { done: 0, total: plan.length * state.settings.repeats * 2 };
  void save(id, { stage: "Measuring the saved version", state });
  const fingerprint = await agentFingerprint(agent.id);
  const saved = await measure(id, agent, undefined, plan, tick, { fingerprint, prior: await priorScores(agent.id, fingerprint, tests, state.settings.repeats) });
  void save(id, { stage: "Measuring your change", state });
  const changed = { ...agent, config: mergeConfig(agent.config, state.change) };
  const draft = await measure(id, changed, undefined, plan, tick);
  state.check = { saved, draft, ...compare(saved, draft) };
  state.outcome = "checked";
  await save(id, { status: "done", stage: "Checked", state, finished: true });
}
