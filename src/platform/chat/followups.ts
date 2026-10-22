// Questions a visitor might ask next, offered as one-tap buttons under an answer (when the agent has them turned on).
// A fast model writes them from the question, the answer and what the business offers.

import { z } from "zod";
import type { Agent } from "@/core/agents";
import { meaningWords } from "@/core/context";
import { chatJson } from "@/lib/llm";
import { DATA_RULE, reference } from "@/lib/untrusted";
import { agentChunks } from "../store";

const Followups = z.object({ questions: z.array(z.string().max(120)).max(5) });
const SCHEMA = "followup_questions";

/** The topics offered: those near the question first (the likeliest next questions), then the rest, up to 15. */
async function topicsFor(agentId: string, question: string): Promise<string> {
  const all = [...new Set((await agentChunks(agentId)).map((c) => c.section ?? c.title))];
  const words = meaningWords(question);
  const near = (t: string) => [...meaningWords(t)].filter((w) => words.has(w)).length;
  return all
    .map((t, i) => ({ t, i, n: near(t) }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .slice(0, 15)
    .map((x) => x.t)
    .join("; ");
}

export async function suggestFollowups(agent: Agent, question: string, answer: string, count: number): Promise<{ questions: string[]; costUsd: number }> {
  const topics = await topicsFor(agent.id, question);
  // The gist of the answer is enough to suggest what comes next; its citation marks are noise.
  const gist = answer.replace(/\s*\[\d{1,2}\]/g, "").slice(0, 400);
  const result = await chatJson(
    "lightning",
    [
      {
        role: "system",
        content: [
          `Suggest up to ${count} short questions the customer might ask next, in their language, each under 60 characters, each something this business's information can answer. No yes/no questions about the answer itself.`,
          DATA_RULE,
          reference("topics", topics || "(none)"),
          reference("exchange", `Customer: ${question.slice(0, 400)}\nAgent: ${gist}`),
        ].join("\n"),
      },
      { role: "user", content: "The questions." },
    ],
    Followups,
    SCHEMA,
    { temperature: 0.3, maxTokens: 150, reasoning: "none" },
  );
  return { questions: result.data.questions.map((q) => q.trim()).filter(Boolean).slice(0, count), costUsd: result.costUsd };
}
