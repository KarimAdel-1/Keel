import { nameFromHost, normalUrl } from "@/core/agents";
import { firstProblem, newAgent } from "@/platform/agent-input";
import { startingGoals } from "@/platform/goals";
import { startSiteRead } from "@/platform/knowledge/jobs";
import { apiUser } from "@/platform/session";
import { createAgent, listAgents } from "@/platform/store";
import { LIMITS } from "@/core/limits";
import { saveVersion } from "@/platform/versions";

/**
 * Creates an agent. From a website, Keel starts reading it straight away and names the agent after the domain until
 * the business's profile is drafted; without one, the name and industry fill in a starting point.
 */
export async function POST(request: Request) {
  const who = await apiUser();
  if (who instanceof Response) return who;
  const parsed = newAgent.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: firstProblem(parsed.error) }, { status: 400 });
  const { website, name, industry, color } = parsed.data;
  if ((await listAgents(who.workspace.id)).length >= LIMITS.agents) return Response.json({ error: `A workspace can have ${LIMITS.agents} agents. Delete one to make another.` }, { status: 400 });
  const url = website ? normalUrl(website) : undefined;
  if (website && !url) return Response.json({ error: "That doesn't look like a website address. Try something like yourbusiness.com." }, { status: 400 });

  const agent = (await createAgent(who.workspace.id, name || nameFromHost(url!), {
    industry: industry ?? "other",
    config: { ...(color ? { appearance: { color } } : {}), ...(url ? { profile: { website: url } } : {}) },
  }));
  // What this kind of business usually needs, ready from the start: reaching a person above all.
  await startingGoals(agent.id, industry ?? "other");
  await saveVersion(agent.id, { label: "Created", origin: "created", authorId: who.user.id });
  const read = url ? await startSiteRead(agent.id, url) : undefined;
  return Response.json({ agent, read }, { status: 201 });
}
