// Tests: an AI customer talks to the agent the way a real one would, and a judge decides whether the agent did
// what it should. A test describes the customer (who they are, what they want, how they behave), what success means,
// the actions the agent must call, and what those actions return (nothing real ever runs in a test). Runs happen in
// batches, in the background, a few at a time; each keeps its whole conversation and the judge's reasons.
//
// The AI customer is Nemotron 3 Super; it writes the customer's side of the whole conversation. The judge is a
// cascade: Nemotron 3 Super first, Nemotron 3 Ultra (careful reading) when Super's verdict isn't clear or says the
// agent got a fact wrong; a run that called the wrong actions fails without a judge. The judges and the test writer
// read the business's own information (src/platform/knowledge/information.ts): a test is written from the real
// facts, the judge lists every fact the agent got wrong (any one fails the run), and a test that contradicts the
// information is flagged instead of failing a right answer.

import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";
import type { Agent } from "@/core/agents";
import { db, system } from "@/lib/db";
import { withTenant } from "@/lib/tenant";
import { chat, chatJson, stripReasoning } from "@/lib/llm";
import { ROLE_MODEL, modelFor, type ModelKey } from "@/lib/models";
import { json, newId, now } from "@/lib/rows";
import { DATA_RULE, REFERENCE_RULE, UNTRUSTED_RULE, reference, untrusted } from "@/lib/untrusted";
import type { AgentDraft } from "./chat/answer";
import { converse } from "./chat/converse";
import { businessText, inventedIn, inventedReason } from "./contact-check";
import { businessInformation } from "./knowledge/information";
import { inBackground } from "./knowledge/jobs";
import { getAgent } from "./store";
import { agentFingerprint } from "./versions";
import { metered } from "./usage";
import { dispatchWebhook } from "./webhooks";

export interface TestCase {
  id: string;
  agentId: string;
  name: string;
  /** Who the customer is, what they want and how they behave. */
  persona: string;
  /** What the agent must achieve, in a sentence or two. */
  criterion: string;
  /** Actions the agent must call; any other action fails the run. Empty: not checked. */
  expectedActions: string[];
  /** What each action returns in this test, by action name. */
  actionResponses: Record<string, unknown>;
  maxTurns: number;
  /** The customer's first message, sent word for word instead of one the AI customer writes (a security test's attack). */
  opening?: string;
  /** "security": an attack that got through a security scan, replayed to check the agent no longer goes along with it. */
  origin: "manual" | "generated" | "security";
  createdAt: string;
  updatedAt: string;
}

export interface TranscriptTurn {
  role: "customer" | "agent";
  content: string;
  actions?: { name: string; arguments: string }[];
}

export interface Verdict {
  passed: boolean;
  /** 0 to 100. */
  score: number;
  reasons: string[];
  missingActions: string[];
  unexpectedActions: string[];
  /** The judge found the test itself wrong: its criterion asks for something the business's information contradicts. */
  testProblem?: string;
}

export interface TestRun {
  id: string;
  testId: string;
  agentId: string;
  batchId: string;
  status: "queued" | "running" | "passed" | "failed" | "error";
  verdict?: Verdict;
  transcript: TranscriptTurn[];
  costUsd: number;
  createdAt: string;
  finishedAt?: string;
}

type TestRow = { id: string; agent_id: string; name: string; persona: string; criterion: string; expected_actions: string; action_responses: string; max_turns: number; opening: string | null; origin: TestCase["origin"]; created_at: string; updated_at: string };
type RunRow = { id: string; test_id: string; agent_id: string; batch_id: string; status: TestRun["status"]; verdict: string; transcript: string; cost_usd: number; created_at: string; finished_at: string | null };

const toTest = (r: TestRow): TestCase => ({
  id: r.id,
  agentId: r.agent_id,
  name: r.name,
  persona: r.persona,
  criterion: r.criterion,
  expectedActions: json(r.expected_actions, []),
  actionResponses: json(r.action_responses, {}),
  maxTurns: r.max_turns,
  ...(r.opening ? { opening: r.opening } : {}),
  origin: r.origin,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toRun = (r: RunRow): TestRun => {
  const verdict = json<Verdict | null>(r.verdict, null);
  return {
    id: r.id,
    testId: r.test_id,
    agentId: r.agent_id,
    batchId: r.batch_id,
    status: r.status,
    ...(verdict && "passed" in verdict ? { verdict } : {}),
    transcript: json(r.transcript, []),
    costUsd: r.cost_usd,
    createdAt: r.created_at,
    ...(r.finished_at ? { finishedAt: r.finished_at } : {}),
  };
};

export async function listTests(agentId: string): Promise<TestCase[]> {
  return ((await db().prepare("SELECT * FROM tests WHERE agent_id = ? ORDER BY created_at").all(agentId)) as TestRow[]).map(toTest);
}

export async function getTest(id: string): Promise<TestCase | undefined> {
  const row = (await db().prepare("SELECT * FROM tests WHERE id = ?").get(id)) as TestRow | undefined;
  return row ? toTest(row) : undefined;
}

export async function saveTest(
  agentId: string,
  input: { id?: string; name: string; persona: string; criterion: string; expectedActions?: string[]; actionResponses?: Record<string, unknown>; maxTurns?: number; opening?: string; origin?: TestCase["origin"] },
): Promise<TestCase> {
  const at = now();
  const values = [input.name, input.persona, input.criterion, JSON.stringify(input.expectedActions ?? []), JSON.stringify(input.actionResponses ?? {}), Math.min(20, Math.max(1, input.maxTurns ?? 6)), input.opening?.trim() || null];
  if (input.id && (await getTest(input.id))?.agentId === agentId) {
    await db().prepare("UPDATE tests SET name = ?, persona = ?, criterion = ?, expected_actions = ?, action_responses = ?, max_turns = ?, opening = ?, updated_at = ? WHERE id = ?").run(...values, at, input.id);
    return (await getTest(input.id))!;
  }
  const id = newId("tst");
  await db()
    .prepare("INSERT INTO tests (id, agent_id, name, persona, criterion, expected_actions, action_responses, max_turns, opening, origin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, agentId, ...values, input.origin ?? "manual", at, at);
  return (await getTest(id))!;
}

export async function deleteTest(agentId: string, id: string): Promise<void> {
  await db().prepare("DELETE FROM tests WHERE id = ? AND agent_id = ?").run(id, agentId);
}

export async function listRuns(agentId: string, options: { testId?: string; batchId?: string; experiment?: string; limit?: number } = {}): Promise<TestRun[]> {
  // The improvement agent's trial runs are kept for its report, apart from the agent's own results.
  const where = [options.testId ? "AND test_id = ?" : "", options.batchId ? "AND batch_id = ?" : "", options.experiment ? "AND experiment = ?" : "AND experiment IS NULL"].join(" ");
  const args = [agentId, ...(options.testId ? [options.testId] : []), ...(options.batchId ? [options.batchId] : []), ...(options.experiment ? [options.experiment] : []), options.limit ?? 200];
  return (await db().prepare(`SELECT * FROM test_runs WHERE agent_id = ? ${where} ORDER BY created_at DESC LIMIT ?`).all<RunRow>(...args)).map(toRun);
}

export async function getRun(id: string): Promise<TestRun | undefined> {
  const row = (await db().prepare("SELECT * FROM test_runs WHERE id = ?").get(id)) as RunRow | undefined;
  return row ? toRun(row) : undefined;
}

/** Each test's latest run, for the list. */
export async function latestRuns(agentId: string): Promise<Map<string, TestRun>> {
  const runs = await listRuns(agentId, { limit: 2000 });
  const latest = new Map<string, TestRun>();
  for (const r of runs) if (!latest.has(r.testId)) latest.set(r.testId, r);
  return latest;
}

export interface BatchSummary {
  batchId: string;
  createdAt: string;
  total: number;
  passed: number;
  failed: number;
  pending: number;
}

export async function batches(agentId: string, limit = 20): Promise<BatchSummary[]> {
  return (await db()
    .prepare(
      `SELECT batch_id AS "batchId", MIN(created_at) AS "createdAt", COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status = 'passed') AS passed, COUNT(*) FILTER (WHERE status IN ('failed', 'error')) AS failed, COUNT(*) FILTER (WHERE status IN ('queued', 'running')) AS pending
       FROM test_runs WHERE agent_id = ? AND experiment IS NULL GROUP BY batch_id ORDER BY "createdAt" DESC LIMIT ?`,
    )
    .all<BatchSummary>(agentId, limit)).map((b) => ({ ...b, total: Number(b.total), passed: Number(b.passed), failed: Number(b.failed), pending: Number(b.pending) }));
}

// ── The AI customer and the judge ────────────────────────────────────────────────────────────────────────

// The fields in the order the judge works: the facts first, then the test, then the verdict.
const Judgement = z.object({
  wrongFacts: z.array(z.string().max(300)).max(8),
  testProblem: z.string().max(300).nullable(),
  reasons: z.array(z.string().max(300)).max(5),
  score: z.number().min(0).max(100),
  passed: z.boolean(),
});
const JUDGE_SCHEMA = "test_judgement";

/** How much of the business's information a judge reads (about 4,000 tokens): all of it, for most businesses. */
const JUDGE_INFORMATION = 16_000;
/** How much the test writer reads. */
const WRITER_INFORMATION = 24_000;

const transcriptText = (t: TranscriptTurn[]) =>
  t.map((x) => `${x.role === "customer" ? "Customer" : "Agent"}: ${x.content}${x.actions?.length ? `\n(Actions called: ${x.actions.map((a) => `${a.name} ${a.arguments}`).join("; ")})` : ""}`).join("\n");

/** What the AI customer writes when it has nothing more to say. */
const FINISHED = "FINISHED";

/**
 * The AI customer's next message. The model writes the customer's side of the conversation, shown to it as a script,
 * rather than taking the assistant's seat in a chat: a model trained as an assistant, seated there, slips back into
 * helping (seen on the real models: a "customer" offering to look up an order). Writing one side of a script keeps it
 * the customer, with the whole conversation in view.
 */
export async function customerTurn(test: TestCase, transcript: TranscriptTurn[], agent: Agent, model: ModelKey = ROLE_MODEL.testCustomer): Promise<{ message: string; done: boolean; costUsd: number }> {
  const assistant = `${agent.name}'s assistant`;
  const opening = agent.config.appearance.welcome.filter((w) => w.trim()).join("\n");
  // The agent's citation marks are chips in the chat, not text a customer reads.
  const lines = [
    ...(opening ? [`${assistant}: ${opening}`] : []),
    ...transcript.map((t) => (t.role === "customer" ? `Customer: ${t.content}` : `${assistant}: ${t.content.replace(/\s*\[\d{1,2}\]/g, "")}`)),
  ];
  const result = await chat(
    model,
    [
      {
        role: "system",
        content: [
          `You write the messages of one customer of ${agent.name}, chatting with ${assistant} to test it. Write only the customer's side: what this customer would type, one short message at a time, in plain words. The customer is the one who needs something; the assistant is the one who helps. The customer never offers help, never answers for the business, and never says this is a test.`,
          "The customer pursues the goal in their description, reacts to what the assistant actually said (answering its questions with plausible details when asked), doesn't repeat a question the assistant has answered, and doesn't start over.",
          `When the customer's goal is met, when the assistant has clearly failed them twice, or when the conversation has come to a natural end, write exactly ${FINISHED} and nothing else.`,
          DATA_RULE,
          reference("the customer", test.persona),
          reference("the conversation so far", lines.join("\n\n") || "(The chat has just opened.)"),
        ].join("\n"),
      },
      { role: "user", content: transcript.length ? "Write the customer's next message." : "Write the customer's first message." },
    ],
    { temperature: 0.7, maxTokens: 300, ...(modelFor(model).reasoning ? { reasoning: modelFor(model).reasoning } : {}), task: "test_customer_turn" },
  );
  return { ...customerMessage(result.text), costUsd: result.costUsd };
}

/** The AI customer's reply read: its message, and whether it's done (the end marker, alone or after a last word, sometimes with a full stop or bold). */
export function customerMessage(reply: string): { message: string; done: boolean } {
  const text = stripReasoning(reply);
  const end = text.match(new RegExp(`[*_]*\\b${FINISHED}\\b[*_.!\\s]*$`));
  return { message: end ? text.slice(0, end.index).trim() : text, done: Boolean(end) };
}

/**
 * Whether a first judgement is clear enough to keep: a pass scored 80 or more, or a fail scored 35 or less. Anything
 * between (or a verdict its own score contradicts) goes to the careful judge.
 */
export const isClear = (j: { passed: boolean; score: number }) => (j.passed ? j.score >= 80 : j.score <= 35);

/** Whether the first judge's verdict stands: it's clear, and it accuses the agent of no wrong fact (the careful judge confirms those). */
const stands = (j: { passed: boolean; score: number; wrongFacts?: string[] }) => isClear(j) && !j.wrongFacts?.length;

/** The answers the agent's actions got in this run (the test's stand-ins for the business's systems), for the judges. */
function systemAnswers(test: TestCase, transcript: TranscriptTurn[]): string[] {
  const called = [...new Set(transcript.flatMap((t) => t.actions?.map((a) => a.name) ?? []))].filter((name) => name in test.actionResponses);
  if (!called.length) return [];
  return [reference("what the business's systems answered the agent's actions", called.map((name) => `${name}: ${JSON.stringify(test.actionResponses[name]).slice(0, 3000)}`).join("\n"))];
}

async function judgeWith(model: ModelKey, test: TestCase, transcript: TranscriptTurn[], information: string, agent: Agent): Promise<Judgement & { costUsd: number }> {
  const general = agent.config.knowledgeOnly ? "" : ` The assistant may also answer from general knowledge when it says that it isn't from ${agent.name}'s own information.`;
  const result = await chatJson(
    model,
    [
      {
        role: "system",
        content: [
          "You judge a customer-service conversation for a test: did the assistant meet the success criterion? Work in this order.",
          `1. wrongFacts: go through every message the assistant wrote, whatever the test is about, and list each specific fact it stated (a price, amount, time, date, number of days, policy, condition, link or contact detail) that the business's information contradicts or doesn't support, and each promise the business didn't make, quoting the assistant. Restating the information in other words, ordinary courtesy and common-sense next steps are not wrong facts. Empty when there are none.${general}`,
          `2. testProblem: if the criterion expects something the business's information contradicts or doesn't support, expects the assistant to say it doesn't know something the information does answer, or demands exact wording or a quotation instead of the right facts${test.origin === "generated" ? ", or demands facts the customer never asked about (this test was written by Keel, which writes criteria only for what the customer asks)" : ""}, the test is wrong, not the assistant: say what is wrong with it (else null), and judge the assistant by the information and the meaning of its answer${test.origin === "generated" ? " to what the customer asked" : ""}.`,
          "3. reasons, score (0 to 100) and passed: did the assistant meet the criterion? Any wrong fact fails the test. Be fair about wording. Up to three short reasons a business owner would understand; when it failed, say what it should have done.",
          REFERENCE_RULE,
          UNTRUSTED_RULE,
          reference("business information", information),
          // What the business's own systems answered (an order lookup, say) is the business's information too.
          ...systemAnswers(test, transcript),
          reference("success criterion", test.criterion),
          untrusted("conversation", transcriptText(transcript)),
        ].join("\n"),
      },
      { role: "user", content: "Your judgement." },
    ],
    Judgement,
    JUDGE_SCHEMA,
    // Generous: Ultra thinks at length, and a cut-off verdict can't be read.
    { temperature: 0, maxTokens: 3000 },
  );
  const j = result.data;
  // A wrong fact fails the run whatever else the verdict says: it's what a test is for.
  if (!j.wrongFacts.length) return { ...j, costUsd: result.costUsd };
  return { ...j, passed: false, score: Math.min(j.score, 30), reasons: [...j.wrongFacts.map((f) => `Not what the business's information says: ${f}`), ...j.reasons].slice(0, 5), costUsd: result.costUsd };
}

/**
 * What a judge's reading of the business's information centres on: the criterion and the whole conversation, the
 * agent's replies included, so every fact it stated can be checked against what the business says.
 */
const focusOf = (test: TestCase, transcript: TranscriptTurn[]) => [test.criterion, ...transcript.map((t) => t.content)].join("\n");

/** A finished conversation judged the way a test run judges it (Super, then Ultra when unclear): to check the judges themselves. */
export async function judgeConversation(test: TestCase, transcript: TranscriptTurn[], agent: Agent): Promise<Judgement & { costUsd: number }> {
  const information = await businessInformation(agent, JUDGE_INFORMATION, { focus: focusOf(test, transcript) });
  const first = await judgeWith(ROLE_MODEL.firstJudge, test, transcript, information, agent);
  if (stands(first)) return first;
  const careful = await judgeWith(ROLE_MODEL.judge, test, transcript, information, agent);
  return { ...careful, costUsd: first.costUsd + careful.costUsd };
}

export interface TestOutcome {
  status: "passed" | "failed" | "error";
  verdict: Verdict;
  transcript: TranscriptTurn[];
  costUsd: number;
}

/** Runs one test once and keeps the result in the agent's test history. */
async function runOnce(runId: string, test: TestCase, agent: Agent): Promise<void> {
  await db().prepare("UPDATE test_runs SET status = 'running' WHERE id = ?").run(runId);
  const result = await playTest(test, agent);
  await db()
    .prepare("UPDATE test_runs SET status = ?, verdict = ?, transcript = ?, cost_usd = ?, finished_at = ? WHERE id = ?")
    .run(result.status, JSON.stringify(result.verdict), JSON.stringify(result.transcript), result.costUsd, now(), runId);
}

/**
 * Keeps one of the improvement agent's trial runs, for its report. A run of the saved agent (not a draft) carries the
 * agent's fingerprint, so later sessions can reuse it while the agent is unchanged.
 */
export async function saveExperimentRun(experiment: string, test: TestCase, result: TestOutcome, fingerprint?: string): Promise<string> {
  const id = newId("run");
  await db()
    .prepare("INSERT INTO test_runs (id, test_id, agent_id, batch_id, status, verdict, transcript, cost_usd, created_at, finished_at, experiment, fingerprint) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, test.id, test.agentId, experiment, result.status, JSON.stringify(result.verdict), JSON.stringify(result.transcript), result.costUsd, now(), now(), experiment, fingerprint ?? null);
  return id;
}

/** How long a test result stays good for an unchanged agent. */
export const RESULTS_KEEP_HOURS = 24;

/**
 * Recent finished runs of these tests on the agent exactly as it is now (same fingerprint, each test unchanged since),
 * at most `max` each, newest first: they can stand in for new runs.
 */
export async function recentResults(agentId: string, fingerprint: string, tests: TestCase[], max: number): Promise<Map<string, { passed: boolean; runId: string; reasons: string[] }[]>> {
  const since = new Date(Date.now() - RESULTS_KEEP_HOURS * 3_600_000).toISOString();
  const out = new Map<string, { passed: boolean; runId: string; reasons: string[] }[]>();
  for (const test of tests) {
    const rows = (await db()
      .prepare("SELECT id, status, verdict FROM test_runs WHERE agent_id = ? AND test_id = ? AND fingerprint = ? AND status IN ('passed', 'failed') AND created_at >= ? AND created_at >= ? ORDER BY created_at DESC LIMIT ?")
      .all(agentId, test.id, fingerprint, since, test.updatedAt, max)) as { id: string; status: string; verdict: string }[];
    if (rows.length) out.set(test.id, rows.map((r) => ({ passed: r.status === "passed", runId: r.id, reasons: json<Verdict | null>(r.verdict, null)?.reasons ?? [] })));
  }
  return out;
}

/**
 * One test, once: the AI customer and the agent (or a draft of it) talk until it's done or the turns run out,
 * then the judge decides. Nothing is stored here except the conversation itself (in the "test" channel).
 */
export function playTest(test: TestCase, agent: Agent, options: { draft?: AgentDraft } = {}): Promise<TestOutcome> {
  return metered({ workspaceId: agent.workspaceId, agentId: agent.id, kind: options.draft ? "improve" : "test" }, () => play(test, agent, options));
}

const replace = <T>(fallback: () => T) => Annotation<T>({ reducer: (_old: T, next: T) => next, default: fallback });
const append = <T>() => Annotation<T[]>({ reducer: (old: T[], next: T[]) => [...old, ...next], default: () => [] });

type Judgement = { passed: boolean; score: number; reasons: string[]; testProblem?: string | null; wrongFacts?: string[] };

/** What a test run carries from step to step. */
const RunState = Annotation.Root({
  transcript: append<TranscriptTurn>(),
  called: append<string>(),
  conversationId: replace<string | undefined>(() => undefined),
  turns: replace<number>(() => 0),
  /** The customer wrote a message this step (else the conversation is over). */
  asked: replace<boolean>(() => false),
  /** The customer is done, or the agent stopped answering (a person took over, or a rail blocked it). */
  over: replace<boolean>(() => false),
  missingActions: replace<string[]>(() => []),
  unexpectedActions: replace<string[]>(() => []),
  /** The business's information, as the judges read it. */
  information: replace<string>(() => ""),
  first: replace<Judgement | undefined>(() => undefined),
  judgement: replace<Judgement | undefined>(() => undefined),
  costUsd: Annotation<number>({ reducer: (a: number, b: number) => a + b, default: () => 0 }),
});
type RunFlow = typeof RunState.State;

/**
 * A test run as a LangGraph graph: the AI customer and the agent talk in turns (customer ⇄ agent) until the
 * customer is done or the turns run out; then the run is judged. The actions come first: calling the wrong ones fails
 * the run with no judge needed. Otherwise Nemotron 3 Super judges, and a verdict that isn't clear (isClear) goes to
 * Nemotron 3 Ultra, whose verdict stands; most conversations clearly pass or fail, so most never need Ultra.
 */
async function play(test: TestCase, agent: Agent, options: { draft?: AgentDraft }): Promise<TestOutcome> {
  /** The conversation as it goes, kept apart from the graph's state so a run that stops still shows it. */
  const log: TranscriptTurn[] = [];
  let spent = 0;
  const customer = async (state: RunFlow): Promise<Partial<RunFlow>> => {
    // A test that opens with exact words sends them as they are: no AI customer is needed to write them.
    if (!state.transcript.length && test.opening) {
      const turn: TranscriptTurn = { role: "customer", content: test.opening };
      log.push(turn);
      return { transcript: [turn], asked: true };
    }
    const next = await customerTurn(test, state.transcript, agent);
    spent += next.costUsd;
    if ((next.done && state.turns > 0) || !next.message.trim()) return { asked: false, over: true, costUsd: next.costUsd };
    const turn: TranscriptTurn = { role: "customer", content: next.message };
    log.push(turn);
    return { transcript: [turn], asked: true, over: next.done, costUsd: next.costUsd };
  };

  const agentTurn = async (state: RunFlow): Promise<Partial<RunFlow>> => {
    const message = state.transcript.at(-1)!.content;
    const result = await converse({ agent, channel: "test", conversationId: state.conversationId, message, test: { responses: test.actionResponses }, draft: options.draft });
    const actions = result.reply.actions;
    const turn: TranscriptTurn = { role: "agent", content: result.reply.text, ...(actions.length ? { actions: actions.map((a) => ({ name: a.name, arguments: a.arguments })) } : {}) };
    log.push(turn);
    spent += result.reply.costUsd;
    return {
      conversationId: result.conversationId,
      turns: state.turns + 1,
      called: actions.map((a) => a.name),
      transcript: [turn],
      // A person from the team takes over a handed-over chat: the agent's part ends there, as in a real one.
      over: state.over || result.status !== "answered" || result.reply.handedOver,
      costUsd: result.reply.costUsd,
    };
  };

  const checkActions = (state: RunFlow): Partial<RunFlow> => {
    const missingActions = test.expectedActions.filter((a) => !state.called.includes(a));
    const unexpectedActions = test.expectedActions.length ? [...new Set(state.called.filter((a) => !test.expectedActions.includes(a)))] : [];
    // The wrong actions fail a test whatever was said: no judge is needed to know it.
    return { missingActions, unexpectedActions, ...(missingActions.length || unexpectedActions.length ? { judgement: { passed: false, score: 20, reasons: [] } } : {}) };
  };

  const firstJudge = async (state: RunFlow): Promise<Partial<RunFlow>> => {
    const information = await businessInformation(agent, JUDGE_INFORMATION, { focus: focusOf(test, state.transcript), extra: options.draft?.extraChunks });
    const { costUsd, ...first } = await judgeWith(ROLE_MODEL.firstJudge, test, state.transcript, information, agent);
    spent += costUsd;
    return { information, first, ...(stands(first) ? { judgement: first } : {}), costUsd };
  };

  const carefulJudge = async (state: RunFlow): Promise<Partial<RunFlow>> => {
    const { costUsd, ...judgement } = await judgeWith(ROLE_MODEL.judge, test, state.transcript, state.information, agent);
    spent += costUsd;
    return { judgement, costUsd };
  };

  const graph = new StateGraph(RunState)
    .addNode("customer", customer)
    .addNode("agent", agentTurn)
    .addNode("check_actions", checkActions)
    .addNode("first_judge", firstJudge)
    .addNode("careful_judge", carefulJudge)
    .addEdge(START, "customer")
    .addConditionalEdges("customer", (state) => (state.asked ? "agent" : "check_actions"), ["agent", "check_actions"])
    .addConditionalEdges("agent", (state) => (state.over || state.turns >= test.maxTurns ? "check_actions" : "customer"), ["customer", "check_actions"])
    .addConditionalEdges("check_actions", (state) => (state.judgement ? END : "first_judge"), ["first_judge", END])
    .addConditionalEdges("first_judge", (state) => (state.judgement ? END : "careful_judge"), ["careful_judge", END])
    .addEdge("careful_judge", END)
    .compile();

  try {
    const state = await graph.invoke({}, { recursionLimit: test.maxTurns * 2 + 10 });
    const judged = state.judgement!;
    const { missingActions, unexpectedActions } = state;
    // Web addresses, emails and phone numbers are checked word for word: a judge can miss an invented one.
    const said = (role: TranscriptTurn["role"]) => state.transcript.filter((t) => t.role === role).map((t) => t.content);
    const business = await businessText(agent, { chunks: options.draft?.extraChunks, actions: options.draft?.actions });
    const invented = inventedIn(said("agent").join("\n"), business, [...said("customer"), JSON.stringify(test.actionResponses)]);
    const verdict: Verdict = {
      passed: judged.passed && !missingActions.length && !unexpectedActions.length && !invented.length,
      score: invented.length ? Math.min(judged.score, 30) : judged.score,
      reasons: [
        ...invented.map(inventedReason),
        ...judged.reasons,
        ...(missingActions.length ? [`It didn't call ${missingActions.join(", ")}.`] : []),
        ...(unexpectedActions.length ? [`It called ${unexpectedActions.join(", ")}, which this test doesn't expect.`] : []),
      ],
      missingActions,
      unexpectedActions,
      // A security test asks only that the agent doesn't go along with an attack: that is never unfair.
      ...(judged.testProblem && test.origin !== "security" ? { testProblem: judged.testProblem } : {}),
    };
    return { status: verdict.passed ? "passed" : "failed", verdict, transcript: state.transcript, costUsd: state.costUsd };
  } catch (error) {
    const verdict: Verdict = { passed: false, score: 0, reasons: [`The run stopped: ${(error as Error).message.slice(0, 200)}`], missingActions: [], unexpectedActions: [] };
    return { status: "error", verdict, transcript: log, costUsd: spent };
  }
}

/** Tests run at the same time. */
const PARALLEL = 6;

/** Queues `times` runs of each test as one batch and starts them in the background. Returns the batch id. */
export async function runTests(agentId: string, testIds: string[], times = 1): Promise<string> {
  const agent = await getAgent(agentId);
  const tests = (await Promise.all(testIds.map(getTest))).filter((t): t is TestCase => Boolean(t && t.agentId === agentId));
  const batchId = newId("bat");
  if (!agent || !tests.length) return batchId;
  const fingerprint = (await agentFingerprint(agentId)) ?? null;
  const queue: { runId: string; test: TestCase }[] = [];
  for (const test of tests)
    for (let i = 0; i < Math.min(20, Math.max(1, times)); i++) {
      const runId = newId("run");
      await db().prepare("INSERT INTO test_runs (id, test_id, agent_id, batch_id, status, created_at, fingerprint) VALUES (?, ?, ?, ?, 'queued', ?, ?)").run(runId, test.id, agentId, batchId, now(), fingerprint);
      queue.push({ runId, test });
    }
  work(agent, batchId, queue);
  return batchId;
}

/**
 * Runs a batch's queued runs in the background, a few at a time, for the agent's business, and tells the agent's
 * webhooks when it's done.
 */
function work(agent: Agent, batchId: string, queue: { runId: string; test: TestCase }[]): void {
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) await runOnce(next.runId, next.test, agent);
  };
  void inBackground(
    withTenant(agent.workspaceId, async () => {
      await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, worker));
      const summary = (await batches(agent.id, 50)).find((b) => b.batchId === batchId);
      await dispatchWebhook(agent.id, "test.finished", { batch: summary });
    }),
  );
}

/**
 * Test runs a restart interrupted (queued or running) run again, once: a run interrupted a second time is marked as
 * failed with the reason, so a crash can't loop. Returns how many were picked up and how many were stopped.
 */
export async function resumeTestRuns(): Promise<{ resumed: number; stopped: number }> {
  // At startup, across every business: each run is then picked up for its own.
  const rows = await system().prepare("SELECT id, workspace_id, test_id, agent_id, batch_id, verdict FROM test_runs WHERE status IN ('queued', 'running') AND experiment IS NULL ORDER BY created_at").all<{ id: string; workspace_id: string; test_id: string; agent_id: string; batch_id: string; verdict: string }>();
  const stoppedVerdict = JSON.stringify({ passed: false, score: 0, reasons: ["The run was interrupted twice by server restarts. Run it again."], missingActions: [], unexpectedActions: [] });
  const batches_ = new Map<string, { agent: Agent; queue: { runId: string; test: TestCase }[] }>();
  let stopped = 0;
  for (const r of rows) {
    await withTenant(r.workspace_id, async () => {
      const agent = await getAgent(r.agent_id);
      const test = await getTest(r.test_id);
      if (!agent || !test || json<{ resumed?: boolean }>(r.verdict, {}).resumed) {
        await db().prepare("UPDATE test_runs SET status = 'error', verdict = ?, finished_at = ? WHERE id = ?").run(stoppedVerdict, now(), r.id);
        stopped++;
        return;
      }
      await db().prepare("UPDATE test_runs SET status = 'queued', verdict = ?, fingerprint = ? WHERE id = ?").run(JSON.stringify({ resumed: true }), (await agentFingerprint(agent.id)) ?? null, r.id);
      const batch = batches_.get(r.batch_id) ?? { agent, queue: [] };
      batch.queue.push({ runId: r.id, test });
      batches_.set(r.batch_id, batch);
    });
  }
  for (const [batchId, b] of batches_) work(b.agent, batchId, b.queue);
  return { resumed: rows.length - stopped, stopped };
}

// ── Generating a crowd ───────────────────────────────────────────────────────────────────────────────────────────

const Crowd = z.object({ tests: z.array(z.object({ name: z.string().max(80), persona: z.string().max(600), criterion: z.string().max(400) })).max(20) });
const CROWD_SCHEMA = "generated_tests";
const Trimmed = z.object({ tests: z.array(z.object({ n: z.number().int(), criterion: z.string().max(400) })).max(20) });

/**
 * The writer's second look at its own tests: each criterion cut to what that customer's own questions need. Written in
 * one go, a criterion often asks for facts the customer never asked about ("and can't be exchanged for cash"), which
 * fails a right answer; judges and the test check are told to spot that, and still miss it, so it's fixed at the start.
 * A criterion that comes back empty, or longer, is kept as it was.
 */
async function trimCriteria(tests: z.infer<typeof Crowd>["tests"]): Promise<z.infer<typeof Crowd>["tests"]> {
  if (!tests.length) return tests;
  try {
    const result = await chatJson(
      ROLE_MODEL.writer,
      [
        {
          role: "system",
          content: [
            "Each test below has an AI customer (what they want and ask) and a criterion (what the assistant must do to pass). Rewrite each criterion so it asks only for what this customer's own questions need: remove every fact or step the customer doesn't ask about. Keep every fact that answers what they ask exactly as written, keep any action the criterion requires, and add nothing. A criterion that already fits stays the same.",
            UNTRUSTED_RULE,
            untrusted("tests", tests.map((t, i) => `Test ${i + 1}: ${t.name}\nCustomer: ${t.persona}\nCriterion: ${t.criterion}`).join("\n\n")),
          ].join("\n"),
        },
        { role: "user", content: "The criteria." },
      ],
      Trimmed,
      "test_criteria",
      { temperature: 0, maxTokens: 1500 + tests.length * 300 },
    );
    const trimmed = new Map(result.data.tests.map((t) => [t.n, t.criterion.trim()]));
    return tests.map((t, i) => {
      const c = trimmed.get(i + 1);
      return c && c.length <= t.criterion.length ? { ...t, criterion: c } : t;
    });
  } catch {
    return tests;
  }
}

/** Writes `count` tests from what the agent knows: everyday questions, edge cases, and customers who push back. */
export function generateTests(agent: Agent, count: number): Promise<TestCase[]> {
  return metered({ workspaceId: agent.workspaceId, agentId: agent.id, kind: "test" }, () => writeTests(agent, count));
}

async function writeTests(agent: Agent, count: number): Promise<TestCase[]> {
  const information = await businessInformation(agent, WRITER_INFORMATION);
  const write = async (n: number, avoid: string[]) => {
    const result = await chatJson(
      ROLE_MODEL.writer,
      [
        {
          role: "system",
          content: [
            `Write ${n} tests for ${agent.name}'s customer assistant. Each is an AI customer: who they are, what they want, how they behave (some polite, some in a hurry, some upset, some asking about something the information doesn't cover), and what the assistant must do for the test to pass.`,
            "Base every test on the business's information below: cover its main topics, and their edges (conditions, exceptions, limits and costs).",
            "The criterion must be checkable from the conversation alone. Every fact in it must come from the information, exactly as the information says it (numbers, prices, times, conditions): never one the information contradicts, and no step, process or detail the information doesn't state, even one that seems obvious. When a customer asks about something the information doesn't cover, the criterion is that the assistant says plainly it doesn't know or isn't sure and offers the team, without inventing anything or claiming the business doesn't offer it. Check first that it really isn't covered: a limit the information states (\"we only deliver to the UK and the EU\") answers the question, and then the criterion is that answer.",
            "The criterion asks only for what a good answer to this customer's own questions needs, never facts they didn't ask about: for a customer asking the price of a sofa, \"states that the sofa costs £450\", not \"states £450 and that it comes in three colours\". The criterion checks facts, never wording: it never asks the assistant to quote the information or use its exact phrasing. The criterion lists what the answer must contain and must not get wrong; it never forbids helpful extra detail (no “and nothing else”, “no other details”): a good assistant adds useful context. The persona is the customer's situation, goal and manner, with the questions they'll ask; never put the expected answer in it.",
            ...(avoid.length ? [`These tests exist already; write different ones: ${avoid.join("; ")}.`] : []),
            REFERENCE_RULE,
            reference("business information", information),
            reference("the assistant's role", agent.config.instructions),
          ].join("\n"),
        },
        { role: "user", content: `The ${n} tests.` },
      ],
      Crowd,
      CROWD_SCHEMA,
      // Room for the model's thinking and every test written in full.
      { temperature: 0.6, maxTokens: 2000 + n * 700 },
    );
    return result.data.tests.slice(0, n);
  };
  const tests = await write(count, []);
  // A model sometimes stops short of the number asked: it's asked once for the rest.
  if (tests.length < count) tests.push(...(await write(count - tests.length, tests.map((t) => t.name))));
  const saved: TestCase[] = [];
  for (const t of await trimCriteria(tests.slice(0, count))) saved.push(await saveTest(agent.id, { ...t, origin: "generated", maxTurns: 6 }));
  return saved;
}
