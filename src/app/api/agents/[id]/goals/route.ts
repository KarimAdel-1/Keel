import { z } from "zod";
import { GOAL_KEYS, GOALS } from "@/core/goals";
import { goalStatus, setGoal } from "@/platform/goals";
import { apiAgent } from "@/platform/session";
import { saveVersion } from "@/platform/versions";

/** What the agent does, as the owner would say it. */
export async function GET(_request: Request, { params }: RouteContext<"/api/agents/[id]/goals">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  return Response.json({ goals: await goalStatus(access.agent.id) });
}

/** Turns a goal on (setting up its actions and procedures) or off. */
export async function PATCH(request: Request, { params }: RouteContext<"/api/agents/[id]/goals">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  const parsed = z.object({ key: z.enum(GOAL_KEYS), on: z.boolean() }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "That isn't something the agent can do." }, { status: 400 });
  await setGoal(access.agent.id, parsed.data.key, parsed.data.on);
  await saveVersion(access.agent.id, { label: `${parsed.data.on ? "Turned on" : "Turned off"}: ${GOALS[parsed.data.key].title.toLowerCase()}`, origin: "change", authorId: access.user.id });
  return Response.json({ goals: await goalStatus(access.agent.id) });
}
