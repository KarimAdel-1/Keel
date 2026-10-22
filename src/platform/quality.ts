// Quality checks: how good are an agent's answers, and can its tests be trusted? Keel checks it the way a careful
// reviewer would, on the real models, when the builder asks (the Quality page, or the Copilot):
//
// 1. Answers. Keel writes questions from the business's own information, of the kinds customers ask: simple ones,
//    several at once, follow-ups, reworded ones, and ones the information doesn't cover. The agent answers each exactly
//    as a customer would get it, and so does the best answer Keel can give (more of the knowledge, Nemotron 3 Super
//    with its full thinking). Nemotron 3 Ultra grades both blind, in random order, against the information: correct,
//    complete, nothing invented. A setting that costs the agent quality (a cheaper model, say) shows up as a gap.
// 2. Tests. Ultra checks every test against the information, twice: a test that expects a wrong fact, or more than its
//    customer asks, would fail a right agent. A test is called wrong only when both readings agree.
// 3. Judges. Conversations that passed their tests are judged again with one fact in the agent's replies made wrong
//    (a price, a number of days, a time of day): each one must fail.
//
// The check is a LangGraph graph: write questions → ask → grade → check the tests → check the judges.

import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";
import type { Agent } from "@/core/agents";
import { searchQuery } from "@/core/context";
import { db } from "@/lib/db";
import { withTenant } from "@/lib/tenant";
import { lenientEnum } from "@/lib/lenient-enum";
import { chatJson, chatStream } from "@/lib/llm";
import { ROLE_MODEL } from "@/lib/models";
import { json, newId, now } from "@/lib/rows";
import { REFERENCE_RULE, UNTRUSTED_RULE, reference, untrusted } from "@/lib/untrusted";
import { REPLY_CEILING } from "./chat/agent-graph";
import { plainCitations, reply, systemPrompt, type Turn } from "./chat/answer";
import { listActions } from "./actions";
import { businessText, inventedIn, inventedReason } from "./contact-check";
import { findPassages } from "./chat/retrieve";
import { businessInformation } from "./knowledge/information";
import { inBackground } from "./knowledge/jobs";
import { agentChunks, getAgent } from "./store";
import { getTest, judgeConversation, latestRuns, listTests, type TestCase, type TranscriptTurn } from "./tests";
import { limitReached, metered } from "./usage";

export const QUESTION_KINDS = ["simple", "several", "follow-up", "reworded", "not covered"] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

export interface GradedAnswer {
  kind: QuestionKind;
  question: string;
  /** What was said before the question (a follow-up's earlier exchange). */
  history: Turn[];
  /** The agent's answer, as a customer gets it. */
  answer: string;
  /** The best answer Keel can give, for comparison. */
  best: string;
  /** 1 to 10. */
  score: number;
  bestScore: number;
  /** Why the agent's answer got its score, and what it left out. */
  why: string;
  /** Facts in the agent's answer that the business's information contradicts or doesn't support. */
  wrongFacts: string[];
}

export interface TestAudit {
  testId: string;
  name: string;
  sound: boolean;
  why: string;
}

export interface JudgeProbe {
  testId: string;
  name: string;
  /** The fact made wrong, as "right → wrong". */
  change: string;
  caught: boolean;
}

export interface QualityReport {
  answers: GradedAnswer[];
  /** The agent's answers and the best ones, on average, out of 10. */
  score: number;
  bestScore: number;
  tests: TestAudit[];
  judges: JudgeProbe[];
  /** Why a part couldn't be checked this time, and what to do about it. */
  notes: string[];
}

export interface QualityCheck {
  id: string;
  agentId: string;
  status: "running" | "done" | "failed";
  stage: string;
  report?: QualityReport;
  tokens: number;
  costUsd: number;
  error?: string;
  createdAt: string;
  finishedAt?: string;
}

type Row = { id: string; agent_id: string; status: QualityCheck["status"]; stage: string; report: string | null; tokens: number; cost_usd: number; error: string | null; created_at: string; finished_at: string | null };

const toCheck = (r: Row): QualityCheck => {
  const report = json<QualityReport | null>(r.report, null);
  return {
    id: r.id,
    agentId: r.agent_id,
    status: r.status,
    stage: r.stage,
    ...(report ? { report } : {}),
    tokens: Number(r.tokens),
    costUsd: Number(r.cost_usd),
    ...(r.error ? { error: r.error } : {}),
    createdAt: r.created_at,
    ...(r.finished_at ? { finishedAt: r.finished_at } : {}),
  };
};

export async function getQualityCheck(id: string): Promise<QualityCheck | undefined> {
  const row = (await db().prepare("SELECT * FROM quality_checks WHERE id = ?").get(id)) as Row | undefined;
  return row ? toCheck(row) : undefined;
}

export async function listQualityChecks(agentId: string, limit = 10): Promise<QualityCheck[]> {
  return ((await db().prepare("SELECT * FROM quality_checks WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?").all(agentId, limit)) as Row[]).map(toCheck);
}

/** How many questions a check asks. */
export const QUESTIONS = 10;
/** How much of the business's information a grading reads: all of it when it fits, else what bears on the answers. */
const GRADER_INFORMATION = 16_000;

/** Starts a quality check in the background. `questions` is for Keel's own tests. */
export async function startQualityCheck(agentId: string, authorId?: string, options: { questions?: number } = {}): Promise<QualityCheck | { error: string }> {
  const agent = await getAgent(agentId);
  if (!agent) return { error: "That agent doesn't exist." };
  // One at a time per agent: someone asking while one runs joins it.
  const latest = (await listQualityChecks(agentId, 1))[0];
  if (latest?.status === "running") return latest;
  if (!(await agentChunks(agentId)).length) return { error: "Add what your agent knows first (Teach it › What it knows): the check asks it questions about that." };
  const limit = await limitReached(agent.workspaceId);
  if (limit) return { error: limit };
  const id = newId("qc");
  await db().prepare("INSERT INTO quality_checks (id, agent_id, status, stage, author_id, created_at) VALUES (?, ?, 'running', 'Starting', ?, ?)").run(id, agentId, authorId ?? null, now());
  void inBackground(withTenant(agent.workspaceId, () => runCheck(id, agent, options.questions ?? QUESTIONS)));
  return (await getQualityCheck(id))!;
}

// ── The graph ─────────────────────────────────────────────────────────────────────────────────────────────────────

type Question = { kind: QuestionKind; question: string; history: Turn[] };
type Answered = Question & { answer: string; best: string };

const replace = <T>(fallback: () => T) => Annotation<T>({ reducer: (_old: T, next: T) => next, default: fallback });

const CheckState = Annotation.Root({
  information: replace<string>(() => ""),
  questions: replace<Question[]>(() => []),
  answered: replace<Answered[]>(() => []),
  answers: replace<GradedAnswer[]>(() => []),
  tests: replace<TestAudit[]>(() => []),
  judges: replace<JudgeProbe[]>(() => []),
  notes: Annotation<string[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
});
type CheckFlow = typeof CheckState.State;

/** Runs `work` on every item, a few at a time, keeping their order. */
async function inBatches<T, R>(items: T[], size: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(work))));
  return out;
}

const average = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);

async function runCheck(id: string, agent: Agent, count: number): Promise<void> {
  // Stages are saved without waiting, one after another, so a later one is never overtaken.
  let saving = Promise.resolve();
  const stage = (text: string) =>
    (saving = saving.then(() => db().prepare("UPDATE quality_checks SET stage = ? WHERE id = ? AND status = 'running'").run(text, id)).then(() => {}, () => {}));
  try {
    const { report, meter } = await metered({ workspaceId: agent.workspaceId, agentId: agent.id, kind: "quality" }, async (meter) => {
      const graph = new StateGraph(CheckState)
        .addNode("write_questions", async () => {
          void stage("Writing questions from what the agent knows");
          const information = await businessInformation(agent, 24_000);
          return { information, questions: await writeQuestions(agent, information, count) };
        })
        .addNode("ask", async (state: CheckFlow) => {
          void stage(`Asking the agent ${state.questions.length} questions`);
          const answered = await inBatches(state.questions, 3, async (q) => {
            const [answer, best] = await Promise.all([reply(agent, q.history, q.question, { test: { responses: {} } }), bestAnswer(agent, q.history, q.question)]);
            return { ...q, answer: answer.text, best };
          });
          return { answered };
        })
        .addNode("grade", async (state: CheckFlow) => {
          void stage("Grading the answers (Nemotron 3 Ultra, blind)");
          const business = await businessText(agent);
          // One answer that can't be graded doesn't sink the report: it's left out and said so.
          const graded = await inBatches(state.answered, 3, async (a) => {
            // What bears on this question and on every fact either answer states, so each claim can be checked.
            const focus = [...a.history.map((t) => t.content), a.question, a.answer, a.best].join("\n");
            const information = await businessInformation(agent, GRADER_INFORMATION, { focus });
            const graded = await grade(information, a).catch(() => undefined);
            // A contact detail the business never gave is a wrong fact, whatever the grader saw.
            const invented = graded ? inventedIn(a.answer, business, [a.question, ...a.history.map((t) => t.content)]) : [];
            return graded && invented.length ? { ...graded, score: Math.min(graded.score, 3), wrongFacts: [...invented.map(inventedReason), ...graded.wrongFacts] } : graded;
          });
          const answers = graded.filter((g): g is GradedAnswer => Boolean(g));
          const missed = graded.length - answers.length;
          return { answers, ...(missed ? { notes: [`${missed} answer${missed === 1 ? "" : "s"} couldn't be graded this time, and ${missed === 1 ? "isn't" : "aren't"} counted.`] } : {}) };
        })
        .addNode("check_tests", async () => {
          void stage("Checking the tests against what the agent knows");
          // Security tests replay attacks: they ask nothing of the business's information.
          const tests = (await listTests(agent.id)).filter((t) => t.origin !== "security").slice(0, 20);
          if (!tests.length) return { notes: ["There are no tests yet. Generate a crowd in Tests, and the next check looks at them too."] };
          try {
            const focus = tests.map((t) => `${t.persona}\n${t.criterion}`).join("\n");
            const actions = (await listActions(agent.id)).filter((x) => x.enabled).map((x) => `${x.title} (@${x.name})`);
            return { tests: await auditTests(await businessInformation(agent, GRADER_INFORMATION, { focus }), tests, actions) };
          } catch {
            return { notes: ["The tests couldn't be checked this time. Run the check again to include them."] };
          }
        })
        .addNode("check_judges", async () => {
          void stage("Checking the judges with planted mistakes");
          const probes = await probeJudges(agent).catch(() => undefined);
          if (!probes) return { notes: ["The judges couldn't be checked this time. Run the check again to include them."] };
          return probes.length ? { judges: probes } : { notes: ["The judges are checked on conversations that passed their tests and give a price, a number or a time. Run your tests, and the next check includes them."] };
        })
        .addEdge(START, "write_questions")
        .addEdge("write_questions", "ask")
        .addEdge("ask", "grade")
        .addEdge("grade", "check_tests")
        .addEdge("check_tests", "check_judges")
        .addEdge("check_judges", END)
        .compile();
      const done = await graph.invoke({});
      if (!done.answers.length) throw new Error("None of the answers could be graded this time. Run the check again.");
      const report: QualityReport = {
        answers: done.answers,
        score: average(done.answers.map((a) => a.score)),
        bestScore: average(done.answers.map((a) => a.bestScore)),
        tests: done.tests,
        judges: done.judges,
        notes: done.notes,
      };
      return { report, meter };
    });
    await saving;
    await db()
      .prepare("UPDATE quality_checks SET status = 'done', stage = 'Done', report = ?, tokens = ?, cost_usd = ?, finished_at = ? WHERE id = ? AND status = 'running'")
      .run(JSON.stringify(report), meter.inputTokens + meter.outputTokens, meter.costUsd, now(), id);
  } catch (error) {
    await saving;
    await db()
      .prepare("UPDATE quality_checks SET status = 'failed', stage = 'Stopped', error = ?, finished_at = ? WHERE id = ? AND status = 'running'")
      .run((error as Error).message.slice(0, 500), now(), id);
  }
}

// ── 1. Answers ────────────────────────────────────────────────────────────────────────────────────────────────────

/** How many questions of each kind, for `count` questions: every kind at least once from five. */
export function questionPlan(count: number): Record<QuestionKind, number> {
  const plan: Record<QuestionKind, number> = { simple: 0, several: 0, "follow-up": 0, reworded: 0, "not covered": 0 };
  const order: QuestionKind[] = ["simple", "reworded", "several", "follow-up", "not covered", "simple", "several", "follow-up", "reworded", "simple"];
  for (let i = 0; i < count; i++) plan[order[i % order.length]]++;
  return plan;
}

const Questions = z.object({
  questions: z
    .array(
      z.object({
        kind: lenientEnum(QUESTION_KINDS, { followup: "follow-up", follow_up: "follow-up", not_covered: "not covered", uncovered: "not covered", multiple: "several" }),
        question: z.string().min(3).max(500),
        history: z.array(z.object({ role: lenientEnum(["customer", "assistant"] as const, { user: "customer" }), content: z.string().max(800) })).max(4),
      }),
    )
    .max(20),
});

async function writeQuestions(agent: Agent, information: string, count: number): Promise<Question[]> {
  const plan = questionPlan(count);
  const result = await chatJson(
    ROLE_MODEL.writer,
    [
      {
        role: "system",
        content: [
          `Write ${count} questions real customers of ${agent.name} would ask its assistant, to check how well it answers. Base them on the business's information below, covering its main topics. The kinds, and how many of each:`,
          `- simple (${plan.simple}): one thing the information answers;`,
          `- several (${plan.several}): two or three things in one message, all answered by the information;`,
          `- follow-up (${plan["follow-up"]}): a short question that only makes sense after an earlier exchange, like "and how much is that?". Give that exchange in history: the customer's message, then the assistant's correct reply from the information;`,
          `- reworded (${plan.reworded}): a question the information answers, in the customer's own everyday words rather than the information's;`,
          `- not covered (${plan["not covered"]}): something a customer could well ask that the information doesn't answer.`,
          "Write each question as the customer would type it. History is empty except for follow-ups.",
          REFERENCE_RULE,
          reference("business information", information),
        ].join("\n"),
      },
      { role: "user", content: `The ${count} questions.` },
    ],
    Questions,
    "quality_questions",
    // Generous: only what's written is paid for, and a cut-off list can't be read.
    { temperature: 0.7, maxTokens: 2000 + count * 500 },
  );
  return result.data.questions.slice(0, count).map((q) => ({
    kind: q.kind,
    question: q.question,
    history: q.kind === "follow-up" ? q.history.map((t) => ({ role: t.role === "customer" ? ("user" as const) : ("assistant" as const), content: t.content })) : [],
  }));
}

/** The best answer Keel can give: more of the knowledge than a reply reads, whole, and Nemotron 3 Super thinking fully. */
async function bestAnswer(agent: Agent, history: Turn[], question: string): Promise<string> {
  const found = await findPassages(agent.id, searchQuery(question, history), { limit: 12, budget: 20_000 });
  const result = await chatStream("super", [{ role: "system", content: systemPrompt(agent, found.passages) }, ...history, { role: "user", content: question }], {
    temperature: agent.config.temperature,
    maxTokens: REPLY_CEILING,
    task: "quality_best_answer",
    onText: () => {},
  });
  return plainCitations(result.text);
}

const Graded = z.object({ wrongFacts: z.array(z.string().max(300)).max(6), score: z.number().min(1).max(10), why: z.string().max(400) });
const Grades = z.object({ first: Graded, second: Graded });

/** Ultra grades the agent's answer and the best one blind, in random order, against the business's information. */
async function grade(information: string, a: Answered): Promise<GradedAnswer> {
  const agentFirst = Math.random() < 0.5;
  const [first, second] = agentFirst ? [a.answer, a.best] : [a.best, a.answer];
  const result = await chatJson(
    ROLE_MODEL.judge,
    [
      {
        role: "system",
        content: [
          "You grade two answers a business's customer assistant could give. Judge each against the business's information: correct (no fact it doesn't support), complete for what was asked (the conditions, limits and costs that apply), clear and helpful. Length is not a merit: a short complete answer is as good as a long one. When the information doesn't cover the question, the best answer says so plainly and offers help; an answer that invents is worst.",
          "For each answer: list the specific facts it states that the information contradicts or doesn't support, quoting it (empty when none); score it from 1 to 10; and say why in one sentence a business owner understands, naming anything it left out.",
          REFERENCE_RULE,
          UNTRUSTED_RULE,
          reference("business information", information),
          ...(a.history.length ? [untrusted("conversation so far", a.history.map((t) => `${t.role === "user" ? "Customer" : "Assistant"}: ${t.content}`).join("\n"))] : []),
          untrusted("customer's question", a.question),
          untrusted("first answer", first),
          untrusted("second answer", second),
        ].join("\n"),
      },
      { role: "user", content: "Your grades." },
    ],
    Grades,
    "quality_grade",
    { temperature: 0, maxTokens: 4000 },
  );
  const [mine, best] = agentFirst ? [result.data.first, result.data.second] : [result.data.second, result.data.first];
  return { kind: a.kind, question: a.question, history: a.history, answer: a.answer, best: a.best, score: mine.score, bestScore: best.score, why: mine.why, wrongFacts: mine.wrongFacts };
}

// ── 2. Tests ──────────────────────────────────────────────────────────────────────────────────────────────────────

const Audits = z.object({ tests: z.array(z.object({ n: z.number().int(), sound: z.boolean(), why: z.string().max(400) })).max(20) });

/** Ultra reads every test against the business's information and what the assistant can do, in one pass. */
async function auditTests(information: string, tests: TestCase[], actions: string[]): Promise<TestAudit[]> {
  const read = async () => {
    const result = await chatJson(
      ROLE_MODEL.judge,
      [
        {
          role: "system",
          content: [
            "You check the tests written for a business's customer assistant. A test is sound when every fact its criterion expects is what the business's information says, it asks only for what a good answer to its customer's questions needs, and it asks the assistant to do what a correct, honest assistant should (for something the information doesn't cover: say so and offer help, without inventing). It is unsound when it expects a fact the information contradicts or doesn't contain, expects \"I don't know\" for something the information answers, requires facts its customer's questions don't call for, forbids helpful extra detail, or asks the assistant to do something wrong.",
            "What the assistant can do (its actions, such as bringing in a person from the team) isn't business information: a test that asks it to use one of its actions is sound on that count.",
            "For each test, by its number, say whether it's sound, and why in one sentence a business owner understands (for an unsound one: what to change).",
            REFERENCE_RULE,
            UNTRUSTED_RULE,
            reference("business information", information),
            reference("what the assistant can do", actions.length ? actions.join("\n") : "(No actions: it can only answer.)"),
            untrusted("tests", tests.map((t, i) => `Test ${i + 1}: ${t.name}\nCustomer: ${t.persona}\nPasses when: ${t.criterion}`).join("\n\n")),
          ].join("\n"),
        },
        { role: "user", content: "Your check of each test." },
      ],
      Audits,
      "test_audit",
      { temperature: 0, maxTokens: 2000 + tests.length * 400 },
    );
    return new Map(result.data.tests.map((t) => [t.n, t]));
  };
  // Two readings, side by side: a test is called wrong only when both say so, so a borderline one isn't flagged in one
  // check and passed in the next.
  const [first, second] = await Promise.all([read(), read().catch(() => undefined)]);
  return tests.flatMap((t, i) => {
    const a = first.get(i + 1);
    if (!a) return [];
    const b = second?.get(i + 1);
    const sound = a.sound || (b ? b.sound : false);
    const why = sound ? (a.sound ? a.why : b!.why) : a.why;
    return [{ testId: t.id, name: t.name, sound, why }];
  });
}

// ── 3. Judges ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** A different amount: about 40% less, or a few more when it's small. The decimals are kept. */
function otherAmount(text: string): string {
  const n = Number(text.replace(/,/g, ""));
  const decimals = text.includes(".") ? text.split(".")[1].length : 0;
  const changed = n >= 2 ? n * 0.6 : n + 3;
  return changed.toFixed(decimals);
}

/** A different count: about half, or a few more when it's small. */
const otherCount = (n: number) => (n >= 4 ? Math.round(n / 2) : n + 5);

/** The facts a judge must not let through when they're wrong, and how each is made wrong. */
const PLANTS: { pattern: RegExp; wrong: (m: RegExpMatchArray) => string }[] = [
  // An amount of money.
  { pattern: /([£$€])\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/, wrong: (m) => `${m[1]}${otherAmount(m[2])}` },
  // A number of days, hours, weeks…
  {
    pattern: /\b(\d{1,3})(\s|-)(working days?|business days?|days?|hours?|weeks?|months?|years?|minutes?)\b/i,
    wrong: (m) => {
      const n = otherCount(Number(m[1]));
      const unit = m[2] === " " && n !== 1 && !/s$/i.test(m[3]) ? `${m[3]}s` : m[3];
      return `${n}${m[2]}${unit}`;
    },
  },
  // A time of day.
  { pattern: /\b(\d{1,2})(:\d{2})?\s?(am|pm)\b/i, wrong: (m) => `${Number(m[1]) <= 8 ? Number(m[1]) + 4 : Number(m[1]) - 4}${m[2] ?? ""}${m[3]}` },
  // A percentage.
  { pattern: /\b(\d{1,3})\s?%/, wrong: (m) => `${otherCount(Number(m[1]))}%` },
];

/** The conversation with the first fact in the agent's replies made wrong, and what changed; nothing to change, none. */
export function plantWrongFact(transcript: TranscriptTurn[]): { transcript: TranscriptTurn[]; change: string } | undefined {
  for (let i = 0; i < transcript.length; i++) {
    const turn = transcript[i];
    if (turn.role !== "agent") continue;
    const found = PLANTS.map((p) => ({ p, m: turn.content.match(p.pattern) }))
      .filter((x): x is { p: (typeof PLANTS)[number]; m: RegExpMatchArray } => Boolean(x.m))
      .sort((a, b) => a.m.index! - b.m.index!)[0];
    if (!found) continue;
    const wrong = found.p.wrong(found.m);
    const changed = [...transcript];
    changed[i] = { ...turn, content: turn.content.slice(0, found.m.index) + wrong + turn.content.slice(found.m.index! + found.m[0].length) };
    return { transcript: changed, change: `${found.m[0]} → ${wrong}` };
  }
  return undefined;
}

/** How many passed conversations the judges are checked on. */
const PROBES = 5;

/** The latest passed conversation of each test, with one fact made wrong, judged again the way a run is judged. */
async function probeJudges(agent: Agent): Promise<JudgeProbe[]> {
  const planted: { test: TestCase; transcript: TranscriptTurn[]; change: string }[] = [];
  for (const r of (await latestRuns(agent.id)).values()) {
    if (r.status !== "passed" || planted.length >= PROBES) continue;
    const test = await getTest(r.testId);
    const changed = test ? plantWrongFact(r.transcript) : undefined;
    if (test && test.origin !== "security" && changed) planted.push({ test, ...changed });
  }
  return inBatches(planted, 3, async ({ test, transcript, change }) => {
    const verdict = await judgeConversation(test, transcript, agent);
    return { testId: test.id, name: test.name, change, caught: !verdict.passed };
  });
}

// ── For the Copilot ───────────────────────────────────────────────────────────────────────────────────────────────

/** The latest finished check in a sentence. */
export async function qualityLine(agentId: string): Promise<string> {
  const last = (await listQualityChecks(agentId, 5)).find((c) => c.status === "done" && c.report);
  if (!last?.report) return "No quality check yet.";
  const r = last.report;
  const sound = r.tests.filter((t) => t.sound).length;
  const caught = r.judges.filter((j) => j.caught).length;
  const wrong = r.answers.filter((a) => a.wrongFacts.length).length;
  return [
    `Latest quality check (${last.finishedAt?.slice(0, 10)}): answers ${r.score} out of 10, against ${r.bestScore} for the best answer Keel can give${wrong ? `; ${wrong} answer${wrong === 1 ? "" : "s"} stated something the information doesn't support` : ""}.`,
    r.tests.length ? `Tests: ${sound} of ${r.tests.length} sound.` : "",
    r.judges.length ? `Judges: caught ${caught} of ${r.judges.length} planted mistakes.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
