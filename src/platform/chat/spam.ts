// Spam detection: after the visitor's 2nd, 4th, 8th and 16th message, a fast model reads the conversation against the
// agent's own definition of spam. Spam pauses the conversation; the agent stops answering it.

import { z } from "zod";
import { chatJson } from "@/lib/llm";
import { DATA_RULE, reference } from "@/lib/untrusted";

/** The visitor messages after which the check runs. */
export const SPAM_CHECKS = new Set([2, 4, 8, 16]);

const Verdict = z.object({ spam: z.boolean(), reason: z.string().max(200) });
const SCHEMA = "spam_check";

export async function checkSpam(definition: string, visitorMessages: string[]): Promise<{ spam: boolean; reason: string; costUsd: number }> {
  const result = await chatJson(
    "lightning",
    [
      { role: "system", content: [`Decide whether this conversation is spam, by this definition: ${definition}`, DATA_RULE, reference("visitor messages", visitorMessages.slice(-8).map((m, i) => `${i + 1}. ${m.slice(0, 300)}`).join("\n"))].join("\n") },
      { role: "user", content: "Is it spam?" },
    ],
    Verdict,
    SCHEMA,
    { temperature: 0, maxTokens: 80, reasoning: "none" },
  );
  return { ...result.data, costUsd: result.costUsd };
}
