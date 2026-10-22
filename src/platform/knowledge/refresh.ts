// When a builder adds documents to an agent that's already set up, Keel reads them and drafts what they change in the
// agent: its profile, greeting and suggested questions, and anything the role should add. The draft arrives as cards in
// Backstage, applied only when the builder approves. Fixes are kept: the role is only added to, never rewritten, and
// the rules, the "don't know" message, Q&As, actions and procedures aren't touched.

import { z } from "zod";
import { chatJson } from "@/lib/llm";
import { ROLE_MODEL } from "@/lib/models";
import { REFERENCE_RULE, reference } from "@/lib/untrusted";
import { addBackstageMessage, type Proposal } from "../backstage";
import { getAgent, getSource, sourceContent } from "../store";
import { currentTenant, withTenant } from "@/lib/tenant";
import { meteredForAgent } from "../usage";
import { inBackground } from "./jobs";

/** How much of the new documents the model reads. */
const READ_CHARS = 20_000;
const PER_SOURCE_CHARS = 6_000;

const Refresh = z.object({
  unrelated: z.boolean(),
  changed: z.boolean(),
  why: z.string().max(300),
  summary: z.string().max(1500),
  offerings: z.array(z.string().max(200)).max(8),
  audience: z.string().max(500),
  tone: z.string().max(300),
  welcome: z.string().max(400),
  suggestions: z.array(z.string().max(120)).max(4),
  roleAddition: z.string().max(800),
});
type Refresh = z.infer<typeof Refresh>;

const SCHEMA = "profile_refresh";

/** The profile, greeting and suggested questions as the builder reads them on a card. */
export function profileText(p: NonNullable<Proposal["profile"]>): string {
  return [
    `What you do: ${p.summary}`,
    `What you offer: ${p.offerings.join("; ")}`,
    `Your customers: ${p.audience}`,
    `How you talk to them: ${p.tone}`,
    `Greeting: ${p.welcome}`,
    `Suggested questions:\n${p.suggestions.map((s) => `- ${s}`).join("\n")}`,
  ].join("\n");
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Reads newly added documents and posts what they change to Backstage. Only for an agent that has a profile already:
 * during setup, the Learn step drafts the first one from everything.
 */
export async function refreshAfterDocuments(agentId: string, sourceIds: string[]): Promise<boolean> {
  const agent = await getAgent(agentId);
  if (!agent || !agent.config.profile.summary.trim() || !sourceIds.length) return false;
  const workspaceId = await currentTenant();
  void inBackground(withTenant(workspaceId, () => meteredForAgent(agentId, "knowledge", () => refreshNow(agentId, sourceIds)))).catch(() => {});
  return true;
}

async function refreshNow(agentId: string, sourceIds: string[]): Promise<{ costUsd: number }> {
  const agent = await getAgent(agentId);
  const sources = (await Promise.all(sourceIds.map((id) => getSource(id)))).filter((s) => s !== undefined);
  if (!agent || !sources.length) return { costUsd: 0 };
  const c = agent.config;
  const parts: string[] = [];
  let used = 0;
  for (const s of sources) {
    if (used >= READ_CHARS) break;
    const text = (await sourceContent(s.id)).slice(0, Math.min(PER_SOURCE_CHARS, READ_CHARS - used));
    parts.push(`### ${s.title}\n${text}`);
    used += text.length;
  }
  const current = [
    `What it does: ${c.profile.summary}`,
    `What it offers: ${c.profile.offerings.join("; ")}`,
    `Its customers: ${c.profile.audience}`,
    `How it talks to them: ${c.profile.tone}`,
    `Greeting: ${c.appearance.welcome[0] ?? ""}`,
    `Suggested questions: ${c.appearance.suggestions.join(" | ")}`,
  ].join("\n");

  const result = await chatJson(
    ROLE_MODEL.writer,
    [
      {
        role: "system",
        content: [
          `A business, "${agent.name}", just added documents to the knowledge of its customer-facing assistant. Update the assistant's profile so it reflects them too.`,
          "- unrelated: true when the documents aren't about this business (another company, a personal file). Then change nothing: copy the current profile as it is, leave roleAddition empty, and say in why what they seem to be about.",
          "- summary, offerings, audience, tone: the current profile, updated with what the documents add. Keep everything in it that's still true: the builder may have written it.",
          "- welcome: the greeting, updated only if the documents change what the assistant helps with.",
          "- suggestions: up to 4 questions customers would most likely ask, including ones the new documents answer.",
          "- roleAddition: only when the documents widen what the assistant helps with and its current role doesn't cover it: one or two sentences in the second person (\"You also help with…\"). It's added after the current role, so never restate, contradict or soften anything in it. Otherwise empty.",
          "- changed: false when the documents add nothing the profile should say.",
          "- why: one sentence for the builder on what the documents add.",
          "Use only what the text says. Never invent prices, policies or facts.",
          REFERENCE_RULE,
          reference("current profile", current),
          reference("current role", c.instructions),
          reference("new documents", parts.join("\n\n")),
        ].join("\n"),
      },
      { role: "user", content: `Update the profile from: ${sources.map((s) => s.title).join(", ")}.` },
    ],
    Refresh,
    SCHEMA,
    { temperature: 0.2, maxTokens: 1500 },
  );
  await post(agentId, sources.map((s) => s.title), result.data);
  return { costUsd: result.costUsd };
}

/** The Backstage message for a refresh: the cards worth applying, or a note when there are none. */
export async function post(agentId: string, titles: string[], r: Refresh): Promise<void> {
  const agent = await getAgent(agentId);
  if (!agent) return;
  const c = agent.config;
  const named = titles.map((t) => `“${t}”`).join(", ");
  if (r.unrelated) {
    await addBackstageMessage(agentId, "assistant", `I learned ${named}, but it doesn't look like it's about ${agent.name}: ${r.why} Customers can now get answers from it, so remove it from Knowledge if it was added by mistake.`);
    return;
  }
  const profile = { summary: r.summary.trim(), offerings: r.offerings.filter((o) => o.trim()), audience: r.audience.trim(), tone: r.tone.trim(), welcome: r.welcome.trim(), suggestions: r.suggestions.filter((s) => s.trim()).slice(0, 4) };
  const before = { summary: c.profile.summary, offerings: c.profile.offerings, audience: c.profile.audience, tone: c.profile.tone, welcome: c.appearance.welcome[0] ?? "", suggestions: c.appearance.suggestions };
  const proposals: Proposal[] = [];
  if (r.changed && profile.summary && norm(profileText(profile)) !== norm(profileText(before))) {
    proposals.push({ kind: "profile", title: "Your profile, greeting and suggested questions, updated", why: r.why, value: profileText(profile), profile });
  }
  const addition = r.roleAddition.trim();
  if (addition && !norm(c.instructions).includes(norm(addition))) {
    proposals.push({ kind: "instructions_add", title: "Added to the end of the role", why: "Added after the current role, which stays word for word.", value: addition });
  }
  if (!proposals.length) {
    await addBackstageMessage(agentId, "assistant", `I learned ${named}. Customers can get answers from it now, and nothing in the profile or the role needs to change.`);
    return;
  }
  await addBackstageMessage(
    agentId,
    "assistant",
    `I learned ${named}, and customers can get answers from it now. Here's what it changes in the agent. Applying these only adds to the role and never rewrites it. Your rules, Q&As, actions, procedures and earlier fixes stay as they are.`,
    { proposals },
  );
}
