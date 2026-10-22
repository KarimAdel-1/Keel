// Contact details the agent gave that the business never did (src/core/contact-details.ts), for the test judges and
// the quality grader: everything the business told Keel is read, not only the passages a judge was shown.

import type { Action } from "@/core/actions";
import type { Agent } from "@/core/agents";
import { inventedDetails } from "@/core/contact-details";
import { listActions } from "./actions";
import { aboutLines } from "./chat/answer";
import { agentChunks, type StoredChunk } from "./store";

/** Everything the business gave Keel that can name a contact detail: its knowledge, profile, settings and actions. */
export async function businessText(agent: Agent, draft: { chunks?: StoredChunk[]; actions?: Action[] } = {}): Promise<string> {
  const c = agent.config;
  const chunks = [...(await agentChunks(agent.id)), ...(draft.chunks ?? [])];
  const actions = draft.actions ?? (await listActions(agent.id));
  return [...chunks.map((ch) => `${ch.url ?? ""}\n${ch.text}`), ...aboutLines(agent), c.instructions, c.guardrails, c.fallback, ...c.appearance.welcome, ...actions.map((a) => JSON.stringify(a.config))].join("\n");
}

/** The details in the agent's words that neither the business nor the customer (`also`, their own words) gave. */
export const inventedIn = (said: string, business: string, also: string[] = []) => inventedDetails(said, [business, ...also].join("\n"));

/** How an invented detail is reported, the way the judges report a wrong fact. */
export const inventedReason = (detail: string) => `It gave "${detail}", which isn't in the business's information: a customer who uses it won't reach the business.`;
