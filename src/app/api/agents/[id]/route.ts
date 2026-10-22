import { agentChange, firstProblem } from "@/platform/agent-input";
import { startingGoals } from "@/platform/goals";
import { apiAgent } from "@/platform/session";
import { deleteAgent, getAgent, updateAgent } from "@/platform/store";
import { saveVersion } from "@/platform/versions";

/** The agent with all its settings, its brand included. */
export async function GET(_request: Request, { params }: RouteContext<"/api/agents/[id]">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  return Response.json({ agent: access.agent });
}

/** Saves changes to an agent's name, availability or settings. */
export async function PATCH(request: Request, { params }: RouteContext<"/api/agents/[id]">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  const parsed = agentChange.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: firstProblem(parsed.error) }, { status: 400 });
  let agent = await updateAgent(access.agent.id, parsed.data);
  // Once the business's industry is known (the profile Keel drafts from the website), it gets that kind of business's
  // usual goals too; nothing it has is taken away.
  if (agent && parsed.data.config?.industry && parsed.data.config.industry !== access.agent.config.industry) {
    await startingGoals(agent.id, agent.config.industry);
    agent = await getAgent(agent.id);
  }
  await saveVersion(access.agent.id, { label: changeLabel(parsed.data), origin: "change", authorId: access.user.id });
  return Response.json({ agent });
}

/** What a change touched, in words, for the version history. */
function changeLabel(change: { name?: string; enabled?: boolean; config?: Record<string, unknown> }): string {
  const words: Record<string, string> = { instructions: "instructions", guardrails: "rules", fallback: "\"don't know\" message", knowledgeOnly: "knowledge-only setting", model: "model", temperature: "creativity", profile: "business profile", protection: "guardrails", channels: "channel instructions", appearance: "look" };
  const touched = [...(change.name ? ["name"] : []), ...(change.enabled !== undefined ? ["availability"] : []), ...Object.keys(change.config ?? {}).map((k) => words[k]).filter(Boolean)];
  return touched.length ? `Changed ${[...new Set(touched)].join(", ")}` : "Changed settings";
}

export async function DELETE(_request: Request, { params }: RouteContext<"/api/agents/[id]">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  await deleteAgent(access.agent.id);
  return Response.json({ ok: true });
}
