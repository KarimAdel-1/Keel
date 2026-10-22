// Keel's Copilot: the builder's main agent, built the way LangGraph's supervisor is. A supervisor (Nemotron 3 Super,
// thinking little) reads the builder's request with a one-line status of the agent, and hands it over with handoff
// tools, transfer_to_<specialist>(task), to one specialist or to several at once: each handoff becomes a LangGraph
// Send, and the specialists run in parallel. A request the supervisor can answer itself (a greeting, what it can do)
// it answers in a sentence or two.
//
// The specialists:
// - analyst: answers from a full report of the agent and proposes changes to approve (Nemotron 3 Super);
// - tester: writes a crowd of tests when there are none, then runs every test (in the background);
// - improver: starts the improvement agent (in the background);
// - security: starts an NVIDIA garak scan (in the background);
// - quality: starts a quality check of the agent's answers, tests and judges (in the background);
// - reader: reads finished conversations for topics and sentiment, and finds questions with no good answer.
//
// What the specialists report is the reply: the supervisor isn't asked again to restate it, so a request costs one
// small routing call plus the work itself. The report the Analyst reads is built only when the Analyst is chosen.
//
// When the builder states a lasting preference ("never change the tone", "prefer Q&As to rewrites"), the supervisor
// saves it with its save_note tool into the agent's shared memory (src/platform/memory.ts), where the improvement
// agent and the Analyst read it.

import { Annotation, END, START, Send, StateGraph, type LangGraphRunnableConfig } from "@langchain/langgraph";
import type { Agent } from "@/core/agents";
import type { ToolSpec } from "@/core/tools";
import { garakInstalled } from "@/lib/garak";
import { chatWithTools, type AgentMessage } from "@/lib/llm";
import { ROLE_MODEL } from "@/lib/models";
import { analyzeConversations, topicCounts } from "./analysis";
import { addBackstageMessage, analystAnswer, backstageMessages, type BackstageMessage, type Proposal } from "./backstage";
import { DEPTHS, runningImprovement, startImprovement, type Depth } from "./improve";
import { memoryStore, rememberNote } from "./memory";
import { listQualityChecks, startQualityCheck } from "./quality";
import { listScans, startScan } from "./security";
import { findGaps, listSuggestions } from "./suggestions";
import { generateTests, latestRuns, listTests, runTests } from "./tests";
import { metered } from "./usage";

export const SPECIALISTS = {
  analyst: { name: "Analyst", handoff: "Answer a question about how the agent is doing (its answers, knowledge, settings, tests, model use) or what to change, and propose changes to its instructions, rules, I-don't-know message or Q&As." },
  tester: { name: "Test runner", handoff: "Run the agent's tests with AI customers, writing a crowd of tests first when there are none." },
  improver: { name: "Improvement agent", handoff: "Improve or fix the agent: it finds why tests fail, tries exact fixes on a copy, and keeps only proven ones." },
  security: { name: "Security scan", handoff: "Run a security scan: NVIDIA garak attacks the agent (prompt injection, jailbreaks, data leaks) to find what gets through." },
  quality: { name: "Quality check", handoff: "Run a quality check: Keel asks the agent questions from its own information and grades the answers blind, checks its tests against that information, and checks the judges with planted mistakes." },
  reader: { name: "Conversation reader", handoff: "Read the agent's finished conversations: their topics, how customers felt, and questions it couldn't answer." },
} as const;
export type Specialist = keyof typeof SPECIALISTS;

interface Report {
  by: Specialist | "copilot";
  text: string;
  proposals?: Proposal[];
  links?: BackstageMessage["links"];
}

const HANDOFFS: ToolSpec[] = (Object.keys(SPECIALISTS) as Specialist[]).map((s) => ({
  name: `transfer_to_${s}`,
  description: SPECIALISTS[s].handoff,
  parameters: { type: "object", properties: { task: { type: "string", description: "What this specialist should do, in a sentence, with any detail the builder gave" } }, required: ["task"], additionalProperties: false },
}));

/** The supervisor's own tool: a lasting preference of the builder, into the agent's shared memory. */
const SAVE_NOTE: ToolSpec = {
  name: "save_note",
  description: "Save a lasting preference the builder states about how Keel should work on this agent (what to change or never change, what kind of fixes they prefer), so every specialist follows it from now on. Not for one-off questions.",
  parameters: {
    type: "object",
    properties: {
      subject: { type: "string", description: "What the preference is about, in two to four words (a newer note on the same subject replaces the old one)" },
      note: { type: "string", description: "The preference, in one sentence, in the builder's terms" },
    },
    required: ["subject", "note"],
    additionalProperties: false,
  },
};

const specialistOf = (tool: string) => tool.replace(/^transfer_to_/, "") as Specialist;

/**
 * Work that runs in the background and uses many model calls (tests, an improvement, a scan, a quality check) starts only
 * when the builder asks for it in so many words. A handoff to one of those without such words goes to the Analyst,
 * so a question like "What should I fix first?" never starts work nobody asked for.
 */
export const ASKS_FOR: Partial<Record<Specialist, RegExp>> = {
  tester: /\b(run|start|launch|re-?run|redo)\b[^.?!]{0,40}\btests?\b|\btest (it|the agent|my agent)\b|\b(write|generate|create)\b[^.?!]{0,20}\btests\b/i,
  improver: /\b(improve|fix|optimi[sz]e|tune)\s+(it|this|my|the|our)\b|\bmake (it|my agent|the agent) better\b|\bstart an improvement\b/i,
  security: /\b(run|start|launch|do)\b[^.?!]{0,30}\b(scan|security|attack|pen ?test)|\b(scan|attack|pen ?test) (it|my agent|the agent)\b/i,
  quality: /\b(run|start|launch|do|check|measure)\b[^.?!]{0,30}\bquality\b|\bquality check\b/i,
};
const askedFor = (to: Specialist, message: string) => !ASKS_FOR[to] || ASKS_FOR[to]!.test(message);

/**
 * What the builder asked for in so many words is handed over even when the supervisor's call missed it: on the real
 * models, a request next to a saved preference ("never change the tone. Also, read the conversations") was sometimes
 * dropped.
 */
const ASKED_PLAINLY: Partial<Record<Specialist, RegExp>> = {
  ...ASKS_FOR,
  reader: /\b(read|analy[sz]e|go through|look (at|through)|review)\b[^.?!]{0,30}\bconversations?\b/i,
};

const CopilotState = Annotation.Root({
  /** The handoffs the supervisor made. */
  handoffs: Annotation<{ to: Specialist; task: string }[]>({ reducer: (_a, b) => b, default: () => [] }),
  /** What each specialist (or the supervisor) reported, in the order they finished. */
  reports: Annotation<Report[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
});
type CopilotFlow = typeof CopilotState.State;

/** The agent's state in one line, for the supervisor: enough to route, far less than the Analyst's report. */
async function status(agent: Agent): Promise<string> {
  const tests = (await listTests(agent.id)).length;
  const latest = [...(await latestRuns(agent.id)).values()].filter((r) => r.status === "passed" || r.status === "failed");
  const scan = (await listScans(agent.id, 1))[0];
  const check = (await listQualityChecks(agent.id, 1))[0];
  return [
    `Agent "${agent.name}", ${agent.enabled ? "live" : "off"}.`,
    `Tests: ${tests}${latest.length ? `, ${latest.filter((r) => r.status === "passed").length} of ${latest.length} passing` : ", never run"}.`,
    (await runningImprovement(agent.id)) ? "An improvement is running." : "",
    scan?.status === "running" ? "A security scan is running." : "",
    check?.status === "running" ? "A quality check is running." : "",
  ]
    .filter(Boolean)
    .join(" ");
}

const depthIn = (task: string): Depth => (/thorough|deep|careful/i.test(task) ? "thorough" : /quick|fast/i.test(task) ? "quick" : "balanced");

/** Asks the Copilot: the supervisor routes, the specialists work, and the conversation keeps both sides. */
export function askCopilot(agent: Agent, message: string, authorId?: string, thread = ""): Promise<BackstageMessage> {
  return metered({ workspaceId: agent.workspaceId, agentId: agent.id, kind: "backstage" }, () => run(agent, message, authorId, thread));
}

async function run(agent: Agent, message: string, authorId?: string, thread = ""): Promise<BackstageMessage> {
  const history = (await backstageMessages(agent.id, thread))
    .slice(-6)
    .map((m) => `${m.role === "user" ? "Builder" : "Copilot"}: ${m.content.slice(0, 600)}`)
    .join("\n");
  await addBackstageMessage(agent.id, "user", message, {}, thread);
  const base = `/app/agents/${agent.id}`;

  const supervisor = async (_state: CopilotFlow, config: LangGraphRunnableConfig): Promise<Partial<CopilotFlow>> => {
    const messages: AgentMessage[] = [
      {
        role: "system",
        content: [
          `You are Keel's Copilot for the customer-service agent "${agent.name}". Hand the builder's request to the specialist that can do it, with its transfer_to_ tool and a one-sentence task. When the request asks for several things, call several tools at once.`,
          "Start work (tests, an improvement, a security scan, a quality check) only when the builder asks for it. Questions such as what to fix, how good the agent is or why something failed go to the analyst.",
          "When the builder states a lasting preference about how Keel should work on this agent, save it with save_note (and hand over any request that comes with it).",
          "Answer yourself, in one or two friendly sentences, only greetings and questions about what you can do. Never answer questions about the agent yourself: the analyst has its report.",
          `Now: ${await status(agent)}`,
          ...(history ? [`Earlier in this chat:\n${history}`] : []),
        ].join("\n"),
      },
      { role: "user", content: message.slice(0, 4000) },
    ];
    const turn = await chatWithTools(ROLE_MODEL.writer, messages, [...HANDOFFS, SAVE_NOTE], { task: "copilot", temperature: 0, maxTokens: 800, reasoning: "low" });
    const notes: Report[] = [];
    for (const call of turn.toolCalls.filter((c) => c.name === SAVE_NOTE.name)) {
      const { subject, note } = JSON.parse(call.arguments || "{}") as { subject?: unknown; note?: unknown };
      if (typeof note !== "string" || !note.trim()) continue;
      await rememberNote(config.store!, agent.id, typeof subject === "string" && subject.trim() ? subject : note, note.trim());
      notes.push({ by: "copilot", text: `Noted: "${note.trim()}". The improvement agent and the Analyst will follow it from now on.`, links: [{ label: "See it in Improve › Memory", href: `${base}/improve` }] });
    }
    const handoffs = turn.toolCalls
      .filter((c) => c.name.startsWith("transfer_to_") && specialistOf(c.name) in SPECIALISTS)
      .map((c) => ({ to: specialistOf(c.name), task: String((JSON.parse(c.arguments || "{}") as { task?: unknown }).task ?? message) }))
      .map((h) => (askedFor(h.to, message) ? h : { to: "analyst" as const, task: message }))
      .concat((Object.keys(ASKED_PLAINLY) as Specialist[]).filter((to) => ASKED_PLAINLY[to]!.test(message)).map((to) => ({ to, task: message })))
      .filter((h, i, all) => all.findIndex((x) => x.to === h.to) === i);
    if (handoffs.length) return { handoffs, reports: notes };
    if (notes.length) return { reports: notes };
    // No handoff and nothing said: the Analyst answers, since most questions are about the agent.
    if (!turn.text.trim()) return { handoffs: [{ to: "analyst", task: message }] };
    return { reports: [{ by: "copilot", text: turn.text.trim() }] };
  };

  const analyst = async (): Promise<Partial<CopilotFlow>> => {
    const { answer, proposals } = await analystAnswer(agent, message, history);
    return { reports: [{ by: "analyst", text: answer, proposals }] };
  };

  const tester = async (): Promise<Partial<CopilotFlow>> => {
    let tests = await listTests(agent.id);
    const wrote = tests.length ? 0 : (tests = await generateTests(agent, 8)).length;
    if (!tests.length) return { reports: [{ by: "tester", text: "I couldn't write tests yet: the agent needs some knowledge first (Teach it › What it knows)." }] };
    await runTests(agent.id, tests.map((t) => t.id));
    return {
      reports: [
        {
          by: "tester",
          text: `${wrote ? `I wrote ${wrote} tests from what the agent knows and started` : "I started"} running all ${tests.length} with AI customers. Results appear in Tests as each one finishes.`,
          links: [{ label: "Open Tests", href: `${base}/tests` }],
        },
      ],
    };
  };

  const improver = async (input: { task?: string }): Promise<Partial<CopilotFlow>> => {
    const depth = depthIn(input.task ?? message);
    const started = await startImprovement(agent.id, { depth, ...(authorId ? { authorId } : {}) });
    if ("error" in started) return { reports: [{ by: "improver", text: started.error, links: [{ label: "Open Improve", href: `${base}/improve` }] }] };
    const s = DEPTHS[depth];
    return {
      reports: [
        {
          by: "improver",
          text: `I started the improvement agent (${depth}: each failing test ${s.repeats} times, ${s.rounds} round${s.rounds === 1 ? "" : "s"} of ${s.candidates} fixes). It changes nothing until you apply what it proves.`,
          links: [{ label: "Follow it in Improve", href: `${base}/improve` }],
        },
      ],
    };
  };

  const security = async (input: { task?: string }): Promise<Partial<CopilotFlow>> => {
    if (!garakInstalled()) return { reports: [{ by: "security", text: "NVIDIA garak isn't installed on this server, so I can't scan yet (uv tool install garak)." }] };
    const started = await startScan(agent.id, /thorough|deep|full/i.test(input.task ?? message) ? "thorough" : "quick", authorId);
    const links = [{ label: "Follow it in Tests › Security", href: `${base}/tests?tab=security` }];
    if (!("id" in started)) return { reports: [{ by: "security", text: started.error, links }] };
    return { reports: [{ by: "security", text: "I started a security scan: NVIDIA garak is attacking the agent the way attackers do. You'll see what got through and what NeMo Guardrails stopped.", links }] };
  };

  const quality = async (): Promise<Partial<CopilotFlow>> => {
    const started = await startQualityCheck(agent.id, authorId);
    const links = [{ label: "Follow it in Quality", href: `${base}/quality` }];
    if (!("id" in started)) return { reports: [{ by: "quality", text: started.error, links }] };
    return {
      reports: [
        {
          by: "quality",
          text: "I started a quality check: Keel asks the agent questions from what it knows and Nemotron 3 Ultra grades the answers blind, then it checks the tests and the judges. It takes a few minutes.",
          links,
        },
      ],
    };
  };

  const reader = async (): Promise<Partial<CopilotFlow>> => {
    const read = await analyzeConversations(agent.id, 100);
    await findGaps(agent.id);
    const to = new Date().toISOString();
    const topics = (await topicCounts(agent.id, { from: new Date(Date.now() - 30 * 86_400_000).toISOString(), to })).slice(0, 5);
    const gaps = (await listSuggestions(agent.id)).filter((s) => s.kind === "gap");
    const lines = [
      read ? `I read ${read} new conversation${read === 1 ? "" : "s"}.` : "There were no new finished conversations to read.",
      topics.length ? `What customers came for in the last 30 days: ${topics.map((t) => `${t.topic} (${t.count}${t.negative ? `, ${t.negative} unhappy` : ""})`).join(", ")}.` : "",
      gaps.length ? `${gaps.length} question${gaps.length === 1 ? "" : "s"} had no good answer; answer them in Answers to add and they become Q&As.` : "No unanswered questions so far.",
    ];
    return {
      reports: [{ by: "reader", text: lines.filter(Boolean).join("\n"), links: [{ label: "Open Activity", href: `${base}/activity` }, ...(gaps.length ? [{ label: "Open Suggestions", href: `${base}/suggestions` }] : [])] }],
    };
  };

  const graph = new StateGraph(CopilotState)
    .addNode("supervisor", supervisor)
    .addNode("analyst", analyst)
    .addNode("tester", tester)
    .addNode("improver", improver)
    .addNode("security", security)
    .addNode("quality", quality)
    .addNode("reader", reader)
    .addEdge(START, "supervisor")
    // Each handoff is a Send: the chosen specialists run in parallel, each with its own task.
    .addConditionalEdges("supervisor", (state) => (state.handoffs.length ? state.handoffs.map((h) => new Send(h.to, { task: h.task })) : END), ["analyst", "tester", "improver", "security", "quality", "reader", END])
    .addEdge("analyst", END)
    .addEdge("tester", END)
    .addEdge("improver", END)
    .addEdge("security", END)
    .addEdge("quality", END)
    .addEdge("reader", END)
    .compile({ store: memoryStore() });

  const done = await graph.invoke({});
  const reports = done.reports;
  return addBackstageMessage(agent.id, "assistant", reports.map((r) => r.text).join("\n\n"), {
    proposals: reports.flatMap((r) => r.proposals ?? []),
    by: reports.map((r) => (r.by === "copilot" ? "Copilot" : SPECIALISTS[r.by].name)),
    links: reports.flatMap((r) => r.links ?? []),
  }, thread);
}
