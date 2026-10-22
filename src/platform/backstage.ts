// Backstage: the builder's conversation with Keel's Copilot about their agent (src/platform/copilot.ts runs it).
// Here: the conversation's storage, the report of the agent the Analyst answers from (its settings, knowledge,
// actions, tests, weak answers and model use), the Analyst itself, and the changes it proposes, which are shown as
// cards and applied only when the builder approves them.

import { z } from "zod";
import type { Agent } from "@/core/agents";
import { qaText } from "@/core/agents";
import { db } from "@/lib/db";
import { chatJson } from "@/lib/llm";
import { ROLE_MODEL, tokenCount } from "@/lib/models";
import { json, now } from "@/lib/rows";
import { REFERENCE_RULE, reference } from "@/lib/untrusted";
import { listActions } from "./actions";
import { queueTraining } from "./knowledge/jobs";
import { summarizeAttempts } from "@/core/garak-suite";
import { lessonLines, notesOf, recentLessons } from "./memory";
import { listScans } from "./security";
import { listProcedures } from "./procedures";
import { addSource, agentActivity, sourceSummary, updateAgent } from "./store";
import { listSuggestions } from "./suggestions";
import { latestRuns, listTests } from "./tests";
import { agentTokens } from "./usage";
import { listQualityChecks, qualityLine } from "./quality";

export interface Proposal {
  /** "instructions_add" and "profile" come from new documents (knowledge/refresh.ts). */
  kind: "instructions" | "instructions_add" | "rules" | "fallback" | "qa" | "profile";
  title: string;
  why: string;
  /** The new text (or, for a Q&A, the answer; for a profile, the profile as the builder reads it). */
  value: string;
  /** For a Q&A: the question. */
  question?: string;
  /** For a profile: its fields, with the chat's greeting and suggested questions. */
  profile?: { summary: string; offerings: string[]; audience: string; tone: string; welcome: string; suggestions: string[] };
  applied?: boolean;
}

export interface BackstageMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  proposals: Proposal[];
  /** The Copilot's specialists that handled the request. */
  by: string[];
  /** Where to follow work they started. */
  links: { label: string; href: string }[];
  createdAt: string;
}

/**
 * The Copilot conversation one person sees: their own (`thread`, one for each signed-in browser) and Keel's messages
 * to everyone (proposals after new documents).
 */
export async function backstageMessages(agentId: string, thread = ""): Promise<BackstageMessage[]> {
  return ((await db().prepare("SELECT * FROM backstage WHERE agent_id = ? AND (thread = '' OR thread = ?) ORDER BY id DESC LIMIT 60").all(agentId, thread)) as { id: number; role: BackstageMessage["role"]; content: string; meta: string; created_at: string }[])
    .reverse()
    .map((r) => {
      const meta = json<{ proposals?: Proposal[]; by?: string[]; links?: BackstageMessage["links"] }>(r.meta, {});
      return { id: r.id, role: r.role, content: r.content, proposals: meta.proposals ?? [], by: meta.by ?? [], links: meta.links ?? [], createdAt: r.created_at };
    });
}

/** Adds a message to the Backstage conversation. */
export async function addBackstageMessage(agentId: string, role: BackstageMessage["role"], content: string, meta: { proposals?: Proposal[]; by?: string[]; links?: BackstageMessage["links"] } = {}, thread = ""): Promise<BackstageMessage> {
  const row = await db().prepare("INSERT INTO backstage (agent_id, role, content, meta, thread, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id").get<{ id: number }>(agentId, role, content.slice(0, 8000), JSON.stringify(meta), thread, now());
  return (await backstageMessages(agentId, thread)).find((m) => m.id === row!.id)!;
}

/** What the agent's numbers say, as findings anyone can act on. Computed, not written by a model. */
export async function findings(agent: Agent): Promise<string[]> {
  const out: string[] = [];
  const sources = await sourceSummary(agent.id);
  if (!sources.total) out.push("It has no knowledge yet, so it can only say it doesn't know. Add your website or documents in Teach it › What it knows.");
  else if (sources.chars < 3000) out.push(`It knows very little (${sources.total} source${sources.total === 1 ? "" : "s"}, ${sources.chars.toLocaleString("en-GB")} characters). Add your FAQs, policies and prices.`);
  if (!agent.config.profile.summary) out.push("It has no business profile. A few lines about what you do and who your customers are improve every answer (Teach it › How it behaves).");
  if (agent.config.instructions.length < 160) out.push("Its instructions are very short. Say what it helps with, how it should sound, and what it should never do.");
  const actions = (await listActions(agent.id)).filter((a) => a.enabled);
  if (!actions.some((a) => a.kind === "escalate" || a.kind === "handoff")) out.push("It can't hand a customer over to your team. Add the Create a ticket or Live handover action, so no one is left stuck.");
  if (!actions.some((a) => a.kind === "lead")) out.push("It doesn't collect leads. If people ask about buying, add the Collect leads action.");
  const tests = await listTests(agent.id);
  if (!tests.length) out.push("It has no tests. Generate a crowd of AI customers in Tests to find weak spots before real customers do.");
  else {
    const { ran, failed } = await testResults(agent.id);
    if (failed.length) out.push(`${failed.length} of its ${ran} tests failed the last time they ran. Open Tests to see why.`);
  }
  if (sources.total && !(await listQualityChecks(agent.id, 1)).length) out.push("It hasn't had a quality check. Run one in Quality to see how good its answers are, graded blind.");
  const gaps = (await listSuggestions(agent.id)).filter((s) => s.kind === "gap");
  if (gaps.length) out.push(`${gaps.length} question${gaps.length === 1 ? "" : "s"} visitors asked had no good answer. See Suggestions.`);
  if (!agent.config.protection.spam.enabled) out.push("Spam detection is off. Turn it on in Safety and limits if it's on a public website.");
  if (!agent.enabled) out.push("It's turned off, so visitors can't chat with it. Turn it on in Settings when it's ready.");
  return out;
}

/** Each test's latest finished result: how many have run, and the ones that failed with the judge's reasons. */
async function testResults(agentId: string): Promise<{ ran: number; failed: { name: string; reasons: string[]; testProblem?: string }[] }> {
  const names = new Map((await listTests(agentId)).map((t) => [t.id, t.name]));
  const finished = [...(await latestRuns(agentId)).values()].filter((r) => names.has(r.testId) && (r.status === "passed" || r.status === "failed"));
  return {
    ran: finished.length,
    failed: finished.filter((r) => r.status === "failed").map((r) => ({ name: names.get(r.testId)!, reasons: r.verdict?.reasons ?? [], ...(r.verdict?.testProblem ? { testProblem: r.verdict.testProblem } : {}) })),
  };
}

/** The latest security scan, in a sentence. */
async function scanLine(agentId: string): Promise<string> {
  const scan = (await listScans(agentId, 1))[0];
  if (!scan) return "never scanned.";
  if (scan.status === "running") return "a scan is running now.";
  const summary = summarizeAttempts(scan.attempts);
  if (!summary.attempts) return `the last scan (${scan.createdAt.slice(0, 10)}) ${scan.status === "failed" ? "stopped early" : "judged no attacks"}.`;
  const through = summary.rows.filter((r) => r.through).map((r) => `${r.label} (${r.through})`);
  return `the last scan (${scan.createdAt.slice(0, 10)}) sent ${summary.attempts} attacks; ${summary.through} got through${through.length ? `: ${through.join(", ")}` : ""}; NeMo Guardrails stopped ${summary.blocked}.`;
}

/** Everything the Analyst knows about the agent, as text. */
export async function report(agent: Agent): Promise<string> {
  const sources = await sourceSummary(agent.id);
  const activity = await agentActivity(agent.id, 30);
  const actions = await listActions(agent.id);
  const procedures = await listProcedures(agent.id);
  const results = await testResults(agent.id);
  const gaps = (await listSuggestions(agent.id)).filter((s) => s.kind === "gap").flatMap((s) => s.detail.questions?.slice(0, 2) ?? [s.title]).slice(0, 6);
  return [
    `Agent: ${agent.name}. Model: ${agent.config.model}. Answers only from its knowledge: ${agent.config.knowledgeOnly ? "yes" : "no"}. Live: ${agent.enabled ? "yes" : "no"}.`,
    `Business profile: ${agent.config.profile.summary || "(none)"}`,
    `Instructions: ${agent.config.instructions}`,
    `Rules: ${agent.config.guardrails || "(none)"}`,
    `What it says when it doesn't know: ${agent.config.fallback}`,
    `Knowledge: ${sources.total} sources (${sources.byKind.website} website pages, ${sources.byKind.file} files, ${sources.byKind.text} texts, ${sources.byKind.qa} Q&As), ${sources.chars} characters, ${sources.learning} still learning.`,
    `Actions: ${actions.map((a) => `${a.title} (${a.enabled ? "on" : "off"})`).join(", ") || "(none)"}. Procedures: ${procedures.map((p) => p.name).join(", ") || "(none)"}.`,
    `Last 30 days: ${activity.visitorConversations} visitor conversations, ${activity.messages} messages.`,
    `Model use this month: ${tokenCount(await agentTokens(agent.id))} by this agent (replies, tests, improvements and checks).`,
    `Tests: ${(await listTests(agent.id)).length}${results.ran ? `; latest results: ${results.ran - results.failed.length} passed, ${results.failed.length} failed` : "; never run"}.`,
    ...results.failed.map((f) => `- Failing test "${f.name}": ${f.reasons.join(" ")}${f.testProblem ? ` (The judge thinks the test itself may be wrong: ${f.testProblem})` : ""}`),
    `Questions visitors asked that it couldn't answer well: ${gaps.length ? gaps.map((q) => `"${q}"`).join("; ") : "(none found yet)"}.`,
    `Findings:\n${(await findings(agent)).map((f) => `- ${f}`).join("\n") || "- Nothing stands out."}`,
    `What the improvement agent has learned about it (newest first):\n${lessonLines(await recentLessons(agent.id, 8)).map((l) => `- ${l}`).join("\n") || "- Nothing yet: it hasn't run."}`,
    `The builder's standing preferences: ${(await notesOf(agent.id)).map((n) => n.text).join(" ") || "(none saved)"}`,
    `Security: ${await scanLine(agent.id)}`,
    `Quality: ${await qualityLine(agent.id)}`,
  ].join("\n");
}

const Answer = z.object({
  answer: z.string().max(4000),
  proposals: z
    .array(z.object({ kind: z.enum(["instructions", "rules", "fallback", "qa"]), title: z.string().max(120), why: z.string().max(300), value: z.string().max(6000), question: z.string().max(300).optional() }))
    .max(3),
});
const SCHEMA = "backstage_answer";

/**
 * The Analyst: answers the builder's question about their agent from the report, with up to three proposed changes.
 * `history` is the conversation so far, as text.
 */
export async function analystAnswer(agent: Agent, message: string, history: string): Promise<{ answer: string; proposals: Proposal[] }> {
  const result = await chatJson(
    ROLE_MODEL.writer,
    [
      {
        role: "system",
        content: [
          `You help a business owner run their customer-service agent, "${agent.name}", on Keel. Answer their message from the report below, in plain, friendly words, briefly; use short lists when listing things. Never invent numbers that aren't in the report.`,
          "Put first what customers would actually get wrong: failing tests (the judge's reasons say what went wrong), wrong or incomplete answers, questions it couldn't answer. Settings and housekeeping come after.",
          "When a change to what the agent says would help and they'd likely want it, propose it (up to 3): new instructions (the complete new text), one rule to add (a single sentence; it's added to the existing rules), the I-don't-know message (the complete new text), or a Q&A answer. Never propose facts about the business that aren't in the report; for a Q&A, only when the answer is in the report.",
          "The agent can only do what its actions in the report allow: never propose text that offers a ticket, a live handover, a callback or anything else it has no action for. A setting (adding an action, turning on spam detection, NeMo Guardrails, a channel) is never a proposal: tell the builder where to switch it on.",
          REFERENCE_RULE,
          reference("report", await report(agent)),
          ...(history ? [reference("earlier in this chat", history)] : []),
        ].join("\n"),
      },
      { role: "user", content: message.slice(0, 4000) },
    ],
    Answer,
    SCHEMA,
    { temperature: 0.3, maxTokens: 2500 },
  );
  return { answer: result.data.answer, proposals: result.data.proposals };
}

/** Applies a proposal the builder approved. */
export async function applyProposal(agent: Agent, messageId: number, index: number): Promise<{ ok: boolean; error?: string }> {
  const row = (await db().prepare("SELECT meta FROM backstage WHERE id = ? AND agent_id = ?").get(messageId, agent.id)) as { meta?: string } | undefined;
  const meta = json<{ proposals?: Proposal[] }>(row?.meta, {});
  const proposal = meta.proposals?.[index];
  if (!proposal) return { ok: false, error: "That suggestion no longer exists." };
  if (proposal.applied) return { ok: true };
  if (proposal.kind === "instructions") await updateAgent(agent.id, { config: { instructions: proposal.value } });
  else if (proposal.kind === "instructions_add") {
    // Added after the role, never put in its place, so the fixes in it stay word for word.
    const role = agent.config.instructions.trim();
    if (!role.includes(proposal.value.trim())) await updateAgent(agent.id, { config: { instructions: role ? `${role}\n\n${proposal.value.trim()}` : proposal.value.trim() } });
  } else if (proposal.kind === "profile" && proposal.profile) {
    const p = proposal.profile;
    const welcome = agent.config.appearance.welcome;
    await updateAgent(agent.id, {
      config: {
        profile: { summary: p.summary, offerings: p.offerings, audience: p.audience, tone: p.tone },
        appearance: { welcome: p.welcome ? [p.welcome, ...welcome.slice(1)] : welcome, suggestions: p.suggestions },
      },
    });
  } else if (proposal.kind === "rules") {
    // A rule is added to the agent's rules, never put in their place.
    const rules = agent.config.guardrails.trim();
    if (!rules.includes(proposal.value.trim())) await updateAgent(agent.id, { config: { guardrails: rules ? `${rules}\n${proposal.value.trim()}` : proposal.value.trim() } });
  }
  else if (proposal.kind === "fallback") await updateAgent(agent.id, { config: { fallback: proposal.value } });
  else if (proposal.kind === "qa" && proposal.question) await queueTraining((await addSource(agent.id, { kind: "qa", title: proposal.question, content: qaText(proposal.question, proposal.value) })).id);
  proposal.applied = true;
  await db().prepare("UPDATE backstage SET meta = ? WHERE id = ?").run(JSON.stringify(meta), messageId);
  return { ok: true };
}

/** Clears one person's conversation with the Copilot (Keel's messages to everyone stay). */
export async function clearBackstage(agentId: string, thread = ""): Promise<void> {
  await db().prepare("DELETE FROM backstage WHERE agent_id = ? AND thread = ?").run(agentId, thread);
}
